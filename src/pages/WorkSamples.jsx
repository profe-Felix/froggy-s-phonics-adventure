import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, Printer, FileText, Book, MessageSquare } from 'lucide-react';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { printWithPage } from '@/lib/printWithPage';
import { useClassNames } from '@/hooks/useClassNames';
import DictadoPrintSheet from '@/components/worksamples/DictadoPrintSheet';
import NotebookPrintSheet from '@/components/worksamples/NotebookPrintSheet';
import SentencePrintSheet from '@/components/worksamples/SentencePrintSheet';

const WORK_TYPES = [
  { id: 'dictado', label: 'Dictados', icon: FileText },
  { id: 'notebook', label: 'Digital Notebook', icon: Book },
  { id: 'sentence', label: 'Creando Oraciones', icon: MessageSquare },
];

const SELECTION_MODES = [
  { id: 'single', label: 'Single student' },
  { id: 'multiple', label: 'Multiple students' },
  { id: 'class', label: 'Whole class' },
];

export default function WorkSamples() {
  const { classList: CLASSES } = useClassNames();
  const [className, setClassName] = useState('');
  const [workType, setWorkType] = useState('dictado');
  const [selectionMode, setSelectionMode] = useState('single');
  const [pickedStudents, setPickedStudents] = useState([]);
  const [assignmentId, setAssignmentId] = useState('');

  // ── Students ──
  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ['ws-students', className],
    queryFn: () => base44.entities.Student.filter({ class_name: className, school_year: ACTIVE_SCHOOL_YEAR }),
    enabled: !!className,
  });

  // ── Assignments / sessions for the picker ──
  const { data: dictadoSessions = [] } = useQuery({
    queryKey: ['ws-dictado-sessions', className],
    queryFn: () => base44.entities.LiveDictationSession.filter(
      { class_name: className, school_year: ACTIVE_SCHOOL_YEAR },
      '-started_at',
    ),
    enabled: !!className && workType === 'dictado',
  });

  const { data: notebookAssignments = [] } = useQuery({
    queryKey: ['ws-notebook-assignments', className],
    queryFn: () => base44.entities.DigitalNotebookAssignment.filter({ class_name: className }),
    enabled: !!className && workType === 'notebook',
  });

  const selectedDictadoSession = dictadoSessions.find(s => s.id === assignmentId);
  const selectedNotebookAssignment = notebookAssignments.find(a => a.id === assignmentId);

  // ── Batch-load work data ──
  const dictadoAssignmentId = selectedDictadoSession?.assignment_id;
  const { data: dictadoSubmissions = [] } = useQuery({
    queryKey: ['ws-dictado-subs', dictadoAssignmentId, className],
    queryFn: () => base44.entities.DictationSubmission.filter({
      assignment_id: dictadoAssignmentId,
      class_name: className,
      school_year: ACTIVE_SCHOOL_YEAR,
    }),
    enabled: !!dictadoAssignmentId && workType === 'dictado',
  });

  const { data: notebookSessions = [] } = useQuery({
    queryKey: ['ws-notebook-sessions', assignmentId, className],
    queryFn: () => base44.entities.NotebookSession.filter({
      assignment_id: assignmentId,
      class_name: className,
      school_year: ACTIVE_SCHOOL_YEAR,
    }),
    enabled: !!assignmentId && workType === 'notebook',
  });

  const { data: sentenceSessions = [] } = useQuery({
    queryKey: ['ws-sentence-sessions', className],
    queryFn: () => base44.entities.SentenceActivitySession.filter({
      class_name: className,
      school_year: ACTIVE_SCHOOL_YEAR,
    }),
    enabled: !!className && workType === 'sentence',
  });

  // ── Which students to print ──
  const studentsToPrint = useMemo(() => {
    if (selectionMode === 'class') return students;
    return pickedStudents
      .map(num => students.find(s => s.student_number === num))
      .filter(Boolean);
  }, [selectionMode, students, pickedStudents]);

  // ── Match work data to students, filter out empty ──
  const printData = useMemo(() => {
    if (workType === 'dictado') {
      return studentsToPrint
        .map(st => ({
          student: st,
          session: selectedDictadoSession,
          submission: dictadoSubmissions.find(s => s.student_number === st.student_number),
        }))
        .filter(d => d.submission && d.submission.stroke_count > 0);
    }
    if (workType === 'notebook') {
      return studentsToPrint
        .map(st => ({
          student: st,
          assignment: selectedNotebookAssignment,
          session: notebookSessions.find(s => s.student_number === st.student_number),
        }))
        .filter(d => d.session?.strokes_by_page && Object.keys(d.session.strokes_by_page).length > 0);
    }
    if (workType === 'sentence') {
      // Latest page per student
      const latest = {};
      for (const s of sentenceSessions) {
        if (!latest[s.student_number] || (s.page_number || 1) > (latest[s.student_number].page_number || 1)) {
          latest[s.student_number] = s;
        }
      }
      return studentsToPrint
        .map(st => ({ student: st, session: latest[st.student_number] }))
        .filter(d => d.session);
    }
    return [];
  }, [workType, studentsToPrint, dictadoSubmissions, selectedDictadoSession,
      notebookSessions, selectedNotebookAssignment, sentenceSessions]);

  const toggleStudent = (num) => {
    setPickedStudents(prev =>
      prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]
    );
  };

  const handlePrint = () => {
    printWithPage('size: letter portrait; margin: 0.5in');
  };

  const needsAssignment = workType === 'dictado' || workType === 'notebook';
  const ready = className &&
    (!needsAssignment || assignmentId) &&
    (selectionMode === 'class' || pickedStudents.length > 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b px-4 py-3 flex items-center gap-3">
        <Link to="/Dashboard" className="text-slate-400 hover:text-slate-700">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="font-black text-lg text-slate-800">Work Samples</h1>
        <div className="flex-1" />
        {printData.length > 0 && (
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow"
          >
            <Printer className="w-4 h-4" /> Print / Save PDF
          </button>
        )}
      </div>

      <div className="max-w-5xl mx-auto p-4 space-y-4">
        {/* Config panel */}
        <div className="bg-white rounded-xl shadow-sm border p-4 space-y-4">
          {/* Class */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">1. Class</label>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {CLASSES.map(c => (
                <button
                  key={c}
                  onClick={() => { setClassName(c); setAssignmentId(''); setPickedStudents([]); }}
                  className={`px-3 py-2 rounded-lg text-sm font-bold border-2 transition ${
                    className === c
                      ? 'bg-indigo-500 text-white border-indigo-500'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Work type */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">2. Work type</label>
            <div className="grid grid-cols-3 gap-2">
              {WORK_TYPES.map(wt => {
                const Icon = wt.icon;
                return (
                  <button
                    key={wt.id}
                    onClick={() => { setWorkType(wt.id); setAssignmentId(''); }}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-bold border-2 transition ${
                      workType === wt.id
                        ? 'bg-indigo-500 text-white border-indigo-500'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" /> {wt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selection mode */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">3. Selection</label>
            <div className="grid grid-cols-3 gap-2">
              {SELECTION_MODES.map(sm => (
                <button
                  key={sm.id}
                  onClick={() => setSelectionMode(sm.id)}
                  className={`px-3 py-2.5 rounded-lg text-sm font-bold border-2 transition ${
                    selectionMode === sm.id
                      ? 'bg-indigo-500 text-white border-indigo-500'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  {sm.label}
                </button>
              ))}
            </div>
          </div>

          {/* Assignment picker (dictado / notebook) */}
          {className && needsAssignment && (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                4. {workType === 'dictado' ? 'Dictado session' : 'Notebook assignment'}
              </label>
              <select
                value={assignmentId}
                onChange={e => setAssignmentId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium"
              >
                <option value="">Select…</option>
                {workType === 'dictado'
                  ? dictadoSessions.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.assignment_title || 'Dictado'} · {s.lines?.length || 0} lines
                      {s.started_at ? ` · ${new Date(s.started_at).toLocaleDateString()}` : ''}
                    </option>
                  ))
                  : notebookAssignments.map(a => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))
                }
              </select>
            </div>
          )}

          {/* Student picker (single / multiple) */}
          {className && selectionMode !== 'class' && (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                {workType === 'sentence' ? '4. Students' : '5. Students'}
              </label>
              <div className="grid grid-cols-6 sm:grid-cols-10 gap-2">
                {students.map(s => {
                  const picked = pickedStudents.includes(s.student_number);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleStudent(s.student_number)}
                      className={`h-10 rounded-lg font-bold text-sm border-2 transition ${
                        picked
                          ? 'bg-indigo-500 text-white border-indigo-500'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      {s.student_number}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-400 mt-2">{pickedStudents.length} student(s) selected</p>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm text-slate-700">Preview</h2>
            <span className="text-xs text-slate-400">
              {printData.length} student(s) with work
            </span>
          </div>

          {!ready ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              {!className
                ? 'Pick a class to start'
                : needsAssignment && !assignmentId
                  ? `Pick a ${workType === 'dictado' ? 'dictado session' : 'notebook assignment'}`
                  : selectionMode !== 'class' && pickedStudents.length === 0
                    ? 'Pick students or switch to whole class'
                    : 'Loading…'}
            </div>
          ) : printData.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              {studentsLoading
                ? 'Loading students…'
                : 'No work found for the selected students'}
            </div>
          ) : (
            <div className="ws-printable space-y-6">
              {printData.map((d, i) => (
                <React.Fragment key={i}>
                  {workType === 'dictado' && (
                    <DictadoPrintSheet student={d.student} session={d.session} submission={d.submission} />
                  )}
                  {workType === 'notebook' && (
                    <NotebookPrintSheet student={d.student} assignment={d.assignment} session={d.session} />
                  )}
                  {workType === 'sentence' && (
                    <SentencePrintSheet student={d.student} session={d.session} />
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}