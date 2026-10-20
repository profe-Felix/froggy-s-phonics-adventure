import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import NativeStudentSurface from "@/components/notebook2/NativeStudentSurface";
import { useNativeAsset } from "@/components/notebook2/PrepareImages";
import { NB2_CSS, Notice, useNativeLive } from "@/components/notebook2/shared";
import { ACTIVE_SCHOOL_YEAR } from "@/lib/schoolYear";
import { lessonStepPages } from "@/lib/external-notebook/lesson-pages";

function NativeStep({ assignment, className, number, config, variant, registerSave, onComplete }) {
  const { asset, loading, error, reload } = useNativeAsset(assignment, variant);
  const save = useRef(null), [busy, setBusy] = useState(false), [finishError, setFinishError] = useState("");
  const selection = lessonStepPages({ ...config, assignmentPageCount: assignment.pdf_page_count });
  const live = useNativeLive({ className, assignmentId: assignment.id, schoolYear: ACTIVE_SCHOOL_YEAR, variant, studentNumber: number }, "student");
  const register = useCallback(fn => { save.current = fn; registerSave?.(fn); }, [registerSave]);
  if (loading) return <p role="status">Loading Base44-only worksheet images…</p>;
  if (error || !asset) return <Notice tone="warn">{error || "Prepare this assignment once from LiveLesson2 before students use it."}
    <button type="button" className="nb2-btn" onClick={reload}>Retry images</button></Notice>;
  return <div className="nb2"><style>{NB2_CSS}</style>
    <NativeStudentSurface assignment={assignment} asset={asset} className={className} number={number} variant={variant}
      allowedPages={selection.allowedPages} initialPage={selection.page} live={live.live} registerSave={register} onRetryAsset={reload} />
    {finishError && <Notice tone="warn">{finishError}</Notice>}
    <button type="button" className="nb2-btn" disabled={busy} onClick={async () => {
      setBusy(true); setFinishError("");
      try {
        if (!save.current || await save.current() !== true) throw new Error("Work is still waiting to save. Keep this step open and retry.");
        onComplete?.();
      } catch (reason) { setFinishError(reason.message); }
      finally { setBusy(false); }
    }}>{busy ? "Saving…" : "Finish notebook step"}</button>
  </div>;
}
export default function DigitalNotebook2Step({ stepConfig = {}, className, studentNumber, variant = 2, registerSave, onComplete }) {
  const number = Number(studentNumber), id = stepConfig.assignmentId;
  const query = useQuery({
    queryKey: ["nb2-step-assignment", id],
    queryFn: () => base44.entities.DigitalNotebookAssignment.get(id),
    enabled: !!id,
  });
  if (!id) return <p role="alert">Select a notebook assignment in this Digital Notebook 2 step.</p>;
  if (query.isLoading) return <p role="status">Loading notebook assignment…</p>;
  if (query.error) return <p role="alert">The assignment could not load. <button onClick={() => query.refetch()}>Retry</button></p>;
  if (!className || !Number.isInteger(number) || number < 1 || number > 30 || !query.data) return <p role="alert">Choose your class and student number before opening this notebook.</p>;
  return <NativeStep key={`${variant}:${className}:${id}:${number}`} assignment={query.data} config={stepConfig}
    className={className} number={number} variant={variant} registerSave={registerSave} onComplete={onComplete} />;
}
