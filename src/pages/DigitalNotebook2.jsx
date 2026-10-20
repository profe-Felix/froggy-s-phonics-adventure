// Isolated Base44-only notebook trial. Does not touch /DigitalNotebook or its data.
import { useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { StudentLogin } from "@/pages/DigitalNotebook";
import { NATIVE_CLASSES } from "@/lib/notebook2/model.mjs";
import { ACTIVE_SCHOOL_YEAR } from "@/lib/schoolYear";
import NativeStudentSurface from "@/components/notebook2/NativeStudentSurface";
import { useNativeAsset } from "@/components/notebook2/PrepareImages";
import { NB2_CSS, Pill, Notice, IsolationNotice, Catalog, useNotebookAssignments, resolveAssignment, useNativeLive, currentNotebookUrl } from "@/components/notebook2/shared";

function Shell({ children, right }) {
  return (
    <div className="nb2"><style>{NB2_CSS}</style>
      <div className="nb2-bar"><span className="nb2-title">Notebook <Pill tone="v2">Version 2 test</Pill></span>{right}</div>
      {children}
    </div>
  );
}

function StudentRoom({ assignment, className, number, page }) {
  const { asset, loading, error, reload } = useNativeAsset(assignment);
  const scope = { className, assignmentId: assignment.id, schoolYear: ACTIVE_SCHOOL_YEAR };
  const live = useNativeLive(scope, "student");
  const L = live.live;
  const selected = L && L.active && !L.ended && L.students?.includes(number);
  const current = selected && L.engine === "current";
  const currentView = current ? (<>
      <Notice tone="warn" data-testid="text-engine-current">Your teacher switched to the current notebook (Replit-assisted). Version 2 work is kept on this device and server.</Notice>
      <iframe title="Current notebook" src={currentNotebookUrl({ className, number, assignmentId: assignment.id, page: L.page || page })}
        style={{ width: "100%", height: "85dvh", border: 0, borderRadius: 14 }} data-testid="iframe-current-notebook" />
    </>) : null;
  if (loading) return <div className="nb2-skel" style={{ height: "70dvh" }} />;
  if (error) return <Notice tone="bad">{error} <button type="button" className="nb2-btn" onClick={reload} data-testid="button-retry-asset">Try again</button></Notice>;
  if (!asset) return currentView || <Notice tone="warn" data-testid="text-not-prepared">This notebook is not prepared for version 2 yet. Ask your teacher to prepare images. <button type="button" className="nb2-btn" onClick={reload} data-testid="button-retry-asset">Try again</button></Notice>;
  return (<>
    {live.error && <Notice tone="warn">{live.error}</Notice>}
    {currentView}
    <div hidden={current}>
      <NativeStudentSurface assignment={assignment} asset={asset} className={className} number={number} initialPage={page} live={L} onRetryAsset={reload} />
    </div>
  </>);
}

export default function DigitalNotebook2() {
  const [params, setParams] = useSearchParams();
  const set = useCallback(patch => { const n = new URLSearchParams(params); Object.entries(patch).forEach(([k, v]) => v == null ? n.delete(k) : n.set(k, v)); setParams(n); }, [params, setParams]);
  const className = params.get("class"), number = Number(params.get("number")), page = Number(params.get("page")) || 1;
  const { data: records, isLoading, error, refetch } = useNotebookAssignments();

  if (params.get("mode") === "teacher") {
    return <Shell><IsolationNotice />
      <div className="nb2-card"><h2>Teacher</h2>
        <p style={{ fontSize: 14 }}>Class, assignment, image preparation, student links and live controls are all in one place.</p>
        <Link className="nb2-btn" data-kind="primary" to={`/LiveLesson2${className ? `?class=${encodeURIComponent(className)}` : ""}`} data-testid="link-livelesson2">Open Live Lesson 2</Link>
      </div></Shell>;
  }
  const classOk = NATIVE_CLASSES.includes(className), numOk = Number.isInteger(number) && number >= 1 && number <= 30;
  if (!classOk || !numOk) {
    return <Shell><IsolationNotice />
      {className && !classOk && <Notice tone="warn">Version 2 is enabled only for {NATIVE_CLASSES.join(", ")}.</Notice>}
      <StudentLogin preselectedClass={classOk ? className : null} classList={NATIVE_CLASSES}
        onEnter={(c, n) => NATIVE_CLASSES.includes(c) ? set({ class: c, number: String(n) }) : set({ class: c, number: null })} onBack={() => set({ class: null, number: null })} />
    </Shell>;
  }
  const right = <><Pill data-testid="text-student">{className} · #{number}</Pill>
    <button type="button" className="nb2-btn" onClick={() => set({ class: null, number: null, assignment: null, page: null })} data-testid="button-switch-student">Switch</button></>;
  if (isLoading) return <Shell right={right}><div className="nb2-skel" style={{ height: 240 }} /></Shell>;
  if (error) return <Shell right={right}><Notice tone="bad">Notebooks could not load. <button type="button" className="nb2-btn" onClick={() => refetch()} data-testid="button-retry-list">Try again</button></Notice></Shell>;
  const assignment = resolveAssignment(records, params.get("assignment") || params.get("assignmentId"));
  if (!assignment) {
    return <Shell right={right}><IsolationNotice /><div className="nb2-card">
      <Catalog records={records} className={className} selectedId={null} onPick={id => set({ assignment: id, page: "1" })} /></div></Shell>;
  }
  return <Shell right={<><Pill>{assignment.title}</Pill>{right}
    <button type="button" className="nb2-btn" onClick={() => set({ assignment: null, page: null })} data-testid="button-change-notebook">Notebooks</button></>}>
    <StudentRoom key={assignment.id} assignment={assignment} className={className} number={number} page={page} />
  </Shell>;
}
