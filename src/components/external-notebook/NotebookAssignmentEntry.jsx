import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ACTIVE_SCHOOL_YEAR } from "@/lib/schoolYear";
import ExternalNotebookSlot from "./ExternalNotebookSlot";
import { assessmentContext } from "@/lib/external-notebook/context";
import { EXTERNAL_NOTEBOOK_CONFIG } from "@/lib/external-notebook/config";
import { lessonStepPages } from "@/lib/external-notebook/lesson-pages";
import { notebookLibrary, resolveNotebookAssignment } from "@/lib/notebook-library.mjs";

// Class/picture entry stays with Base44. Only the selected writing surface is
// replaced; the old component is never mounted (or downloading a PDF) first.
export default function NotebookAssignmentEntry({ LegacyView, ...props }) {
  const { className, studentNumber, directAssignmentId, directAssignmentName,
    assignmentOverride, onBack, teacherMode, directPage = null, registerSave, onComplete } = props;
  const [selected, setSelected] = useState(assignmentOverride || null);
  const [archive, setArchive] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const save = useRef(null);
  const register = useCallback(value => { save.current = value; registerSave?.(value); }, [registerSave]);
  async function leave(action) {
    if (save.current?.close && await save.current.close() !== true) {
      setLeaveError("Waiting for your drawing to finish saving. Keep this notebook open and retry.");
      return;
    }
    action?.();
  }
  const queries = useQueryClient();
  const enabled = !teacherMode && EXTERNAL_NOTEBOOK_CONFIG.catalogClasses.includes(className);
  const roster = useQuery({
    queryKey: ["image-notebook-seat", className, studentNumber],
    queryFn: () => base44.entities.Student.filter({
      class_name: className, student_number: Number(studentNumber), school_year: ACTIVE_SCHOOL_YEAR,
    }), enabled, staleTime: 30000,
  });
  const books = useQuery({
    queryKey: ["image-notebook-assignments"],
    queryFn: () => base44.entities.DigitalNotebookAssignment.list("-created_date", 500),
    enabled, staleTime: 30000,
  });
  const live = useQuery({
    queryKey: ["image-notebook-live", className],
    queryFn: () => base44.entities.LiveNotebookAssessment.filter({
      class_name: className, school_year: ACTIVE_SCHOOL_YEAR, active: true,
    }, "-updated_date", 100),
    enabled, staleTime: 10000,
  });
  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = base44.entities.LiveNotebookAssessment.subscribe(event => {
      const record = event.data;
      if (!record || record.class_name === className) {
        void queries.invalidateQueries({ queryKey: ["image-notebook-live", className] });
      }
    });
    return () => unsubscribe?.();
  }, [enabled, className, queries]);
  const assignments = notebookLibrary(books.data || [], className);
  const requestedId = directAssignmentId || props.stepConfig?.assignmentId;
  const requestedTitle = directAssignmentName || props.stepConfig?.assignmentTitle;
  const linkedBook = resolveNotebookAssignment(books.data || [], {
    className, id: requestedId, title: requestedTitle, allowDraft: !!props.stepConfig,
  });
  const eligibleBroadcast = (live.data || []).find(record =>
    (!record.target_students?.length || record.target_students.some(seat =>
      seat.class_name === className && Number(seat.student_number) === Number(studentNumber))) &&
    !record.finished_students?.some(seat =>
      seat.class_name === className && Number(seat.student_number) === Number(studentNumber)));
  const broadcastBook = (books.data || []).find(book => book.id === eligibleBroadcast?.assignment_id &&
    ["active", "draft"].includes(book.status) && (book.class_name === className || book.shared_across_classes));
  const assignment = broadcastBook || linkedBook ||
    (!requestedId && !requestedTitle ? selected : null);
  const student = roster.data?.length === 1 ? roster.data[0] : null;
  const context = useMemo(() => {
    if (!student || !assignment) return null;
    const seat = entry => entry.class_name === className && Number(entry.student_number) === Number(studentNumber);
    const active = (live.data || []).find(record => record.assignment_id === assignment.id &&
      (!record.target_students?.length || record.target_students.some(seat)) && !record.finished_students?.some(seat));
    if (active) return assessmentContext({ assessment: active, student, selectedStudent: {
      number: Number(studentNumber), class_name: className,
    } });
    const selection = props.stepConfig ? lessonStepPages({
      ...props.stepConfig, assignmentPageCount: assignment.pdf_page_count,
    }) : {
      // Missing page links keep the existing resume behavior. An explicit
      // one-based page is navigation intent, never additional page authority.
      page: directPage == null || directPage === '' ? undefined : Math.max(1, Number(directPage) || 1),
      allowedPages: props.pageLock || null,
    };
    return {
      role: "student", kind: "assignment", active: true, sourceId: assignment.id,
      assignmentId: assignment.id, className, schoolYear: student.school_year,
      page: selection.page, allowedPages: selection.allowedPages,
      targetStudents: [], finishedStudents: [],
      student: { id: student.id, number: Number(studentNumber), className, schoolYear: student.school_year },
    };
  }, [student, assignment, live.data, className, studentNumber, directPage, props.stepConfig, props.pageLock]);
  if (!enabled || archive) return <LegacyView {...props} onBack={archive ? () => setArchive(false) : onBack} />;
  if (roster.error || books.error || live.error) return <div role="alert" className="p-6">
    Could not load the notebook assignment. Your saved work was not changed.
    <button className="ml-3 underline" onClick={() => { void roster.refetch(); void books.refetch(); void live.refetch(); }}>Retry</button>
  </div>;
  if (roster.isPending || books.isPending || live.isPending) return <div role="status" className="p-6">Opening notebook…</div>;
  if (!student) return <div role="alert" className="p-6">Choose your class picture again. Your notebook work was not changed.</div>;
  if (!assignment && (requestedId || requestedTitle)) return <div role="alert" className="p-6">
    The notebook linked to this lesson is unavailable. Its saved link and student work were not changed.
    <button className="ml-3 underline" onClick={() => { void books.refetch(); }}>Retry notebook</button>
  </div>;
  if (!assignment) return <main className="p-5 max-w-5xl mx-auto">
    <button onClick={onBack} className="underline mb-4">Back</button>
    <h1 className="text-2xl font-bold mb-5">Choose your notebook</h1>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{assignments.map(book =>
      <button key={book.id} onClick={() => setSelected(book)}
        className="p-5 text-left rounded-2xl border bg-white shadow-sm">
        <strong>{book.title}</strong><p className="text-sm mt-2">{book.pdf_page_count} pages · Shared library</p>
      </button>)}</div>
    {!assignments.length && <p>No active assignments are available.</p>}
  </main>;
  return <section className="flex flex-col w-full bg-slate-50" style={{ minHeight: 400 }}>
    <header className="flex flex-wrap items-center gap-3 px-4 py-2 border-b bg-white text-slate-900">
      <button onClick={() => { void leave(onBack); }} className="underline">Back</button>
      <strong className="flex-1">{assignment.title}</strong>
      <span className="text-sm">{className} · #{studentNumber}</span>
      <button title="Preserved work from the previous notebook engine"
        className="text-xs underline" onClick={() => { void leave(() => setArchive(true)); }}>Previous notebook</button>
    </header>
    <div className="flex-1 min-h-0">
      {leaveError && <p role="alert" className="p-3 text-amber-900">{leaveError}</p>}
      <ExternalNotebookSlot context={context} registerSave={register} onComplete={onComplete}>
        <div role="status" className="p-6">This notebook is preparing its image-based connection. Your existing work is retained.</div>
      </ExternalNotebookSlot>
    </div>
  </section>;
}
