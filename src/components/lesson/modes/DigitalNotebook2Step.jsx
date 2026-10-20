import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import NativeStudentSurface from "@/components/notebook2/NativeStudentSurface";
import { useNativeAsset } from "@/components/notebook2/PrepareImages";
import { NB2_CSS, Notice, useNativeLive } from "@/components/notebook2/shared";
import { ACTIVE_SCHOOL_YEAR } from "@/lib/schoolYear";
import { lessonStepPages } from "@/lib/external-notebook/lesson-pages";
import { nativeStepKey, stepLiveState } from "@/lib/notebook2/lessonStep.mjs";

function NativeStep({ assignment, className, number, config, variant, schoolYear, liveSession, registerSave, onComplete }) {
  const { asset, loading, error, reload } = useNativeAsset(assignment, variant);
  const save = useRef(null), [busy, setBusy] = useState(false), [finishError, setFinishError] = useState("");
  const selection = lessonStepPages({ ...config, assignmentPageCount: assignment.pdf_page_count });
  const live = useNativeLive({ className, assignmentId: assignment.id, schoolYear, variant, studentNumber: number }, "student");
  const controls = stepLiveState(live.live, liveSession, number, selection);
  const register = useCallback(fn => { save.current = fn; registerSave?.(fn); }, [registerSave]);
  if (loading) return <p role="status">Loading Base44-only worksheet images…</p>;
  if (error || !asset) return <Notice tone="warn">{error || `Prepare this assignment once from LiveLesson${variant} before students use it.`}
    <button type="button" className="nb2-btn" onClick={reload}>Retry images</button></Notice>;
  return <div className="nb2"><style>{NB2_CSS}</style>
    {live.error && <Notice tone="warn">{live.error} <button type="button" className="nb2-btn" onClick={live.retry}>Retry live controls</button></Notice>}
    <NativeStudentSurface assignment={assignment} asset={asset} className={className} number={number} variant={variant} schoolYear={schoolYear}
      readOnly={!!liveSession && controls?.canWrite !== true}
      allowedPages={selection.allowedPages} initialPage={selection.page} live={controls} registerSave={register} onRetryAsset={reload} />
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
export default function DigitalNotebook2Step({ stepConfig = {}, className, studentNumber, variant = 2, schoolYear = ACTIVE_SCHOOL_YEAR, liveSession, stepIndex, registerSave, onComplete }) {
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
  return <NativeStep key={nativeStepKey({ variant, className, id, number, schoolYear, config: stepConfig, stepIndex, liveSession })}
    assignment={query.data} config={stepConfig} schoolYear={schoolYear} liveSession={liveSession}
    className={className} number={number} variant={variant} registerSave={registerSave} onComplete={onComplete} />;
}
