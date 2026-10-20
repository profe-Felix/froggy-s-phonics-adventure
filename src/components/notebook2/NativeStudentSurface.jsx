// Base44-only student surface. Uses NotebookStudentView unchanged.
import { useEffect, useMemo, useRef, useState } from "react";
import { NotebookStudentView } from "@/lib/external-notebook/NotebookStudentView";
import { useNativeInk } from "@/lib/notebook2/useNativeInk";
import { nativeImage } from "@/lib/notebook2/assets";
import { usePageBackground } from "@/lib/notebook2/pageBackground";
import { ACTIVE_SCHOOL_YEAR } from "@/lib/schoolYear";
import { Notice, Pill } from "./shared";

export default function NativeStudentSurface({ assignment, asset, className, number, variant = 2, schoolYear = ACTIVE_SCHOOL_YEAR, readOnly = false, initialPage = 1, live = null, onSaved, allowedPages = null, registerSave, onRetryAsset }) {
  const count = assignment.pdf_page_count;
  const allowed = Array.isArray(allowedPages) ? allowedPages.filter(p => Number.isInteger(p) && p >= 1 && p <= count) : null;
  const okPage = p => Number.isInteger(p) && p >= 1 && p <= count && (!allowed || allowed.includes(p));
  const [page, setPage] = useState(() => { const n = Number(initialPage); return okPage(n) ? n : (allowed?.[0] || 1); });
  const [target, setTarget] = useState(page);
  const [endedId, setEndedId] = useState(null);
  const [timing, setTiming] = useState("");
  const finishRef = useRef(null);
  const moving = useRef(false);

  const scope = useMemo(() => ({ className, assignmentId: assignment.id, schoolYear, channel: "ink", number, variant }),
    [className, assignment.id, number, variant, schoolYear]);
  const ink = useNativeInk({ scope, page, role: "student" });
  const flushRef = useRef(ink.flush); flushRef.current = ink.flush;
  const savedRef = useRef(onSaved); savedRef.current = onSaved;
  // Host lesson steps await this before navigating away.
  useEffect(() => {
    if (typeof registerSave !== "function") return undefined;
    registerSave(async () => {
      let ok = true;
      try { ok = (await finishRef.current?.()) !== false; } catch { ok = false; }
      try { ok = (await flushRef.current?.()) !== false && ok; } catch { ok = false; }
      return ok;
    });
    return () => registerSave(null);
  }, [registerSave]);

  // Terminal per session id: once ended, never re-follow that id.
  useEffect(() => { if (live?.ended && live.id) setEndedId(live.id); }, [live?.ended, live?.id]);
  const inSession = !!live && live.active && !live.ended && live.id !== endedId && live.engine === "native"
    && Array.isArray(live.students) && live.students.includes(number);
  const following = inSession && live.follow !== false;
  const pageCommand = useRef(null);
  useEffect(() => {
    if (inSession && live.pageCommand && live.pageCommand !== pageCommand.current) {
      pageCommand.current = live.pageCommand;
      if (okPage(live.page)) setTarget(live.page);
    }
  }, [inSession, live?.pageCommand, live?.page]);
  const teacherPage = following && okPage(live.page) ? live.page : null;
  useEffect(() => { if (teacherPage) setTarget(teacherPage); }, [teacherPage]);
  useEffect(() => {
    if (live?.engine === "current" || live?.ended) void finishRef.current?.();
  }, [live?.engine, live?.ended]);

  // Safe transition: finish gesture, try to flush, then move. Queued ops stay in device storage if flush times out.
  useEffect(() => {
    if (target === page || moving.current) return undefined;
    let cancelled = false;
    moving.current = true;
    (async () => {
      let finished = false;
      try { finished = (await finishRef.current?.()) !== false; } catch { /* keep failed gesture on this page */ }
      if (!finished) { if (!cancelled) setTarget(page); moving.current = false; return; }
      try { const ok = await flushRef.current?.(); if (ok) savedRef.current?.(); } catch { /* preserved locally */ }
      if (!cancelled) setPage(target);
      moving.current = false;
    })();
    return () => { cancelled = true; moving.current = false; };
  }, [target, page]);

  const background = usePageBackground(asset, page, variant);
  const image = background.image;
  const missingRetry = useRef(null);
  useEffect(() => {
    if (!nativeImage(asset, page) && onRetryAsset && missingRetry.current !== page) {
      missingRetry.current = page;
      onRetryAsset();
    }
  }, [page, !!image, onRetryAsset]);
  // Timing for comparison + neighbor preload (max 2).
  useEffect(() => {
    if (!image) return undefined;
    const t0 = performance.now(), probe = new Image();
    setTiming("");
    probe.onload = () => setTiming(`First image ${Math.round(performance.now() - t0)} ms`);
    probe.src = image.url;
    const near = [page - 1, page + 1].map(p => nativeImage(asset, p)).filter(i => i && i.kind !== "pdf").slice(0, 2).map(i => { const im = new Image(); im.src = i.url; return im; });
    return () => { probe.onload = null; probe.src = ""; near.forEach(im => { im.src = ""; }); };
  }, [image?.url, page, asset]);

  if (background.loading) return <p role="status">Rendering individual PDF page {page}…</p>;
  if (!image) {
    return <Notice tone="warn" data-testid="text-not-prepared">{background.error || `Page ${page} is not prepared for version ${variant} yet. Ask your teacher to prepare this page, then try again.`}
      <button type="button" className="nb2-btn" style={{ marginLeft: 8 }} onClick={() => { background.retry(); onRetryAsset?.(); }} data-testid="button-retry-prepared">Try again</button></Notice>;
  }

  const workbook = { id: `nb${variant}-${assignment.id}`, title: assignment.title, width: image.width, height: image.height, pageCount: count };
  const ended = !!endedId;
  const controls = {
    page: target, canDraw: !readOnly && (!inSession || live.canWrite !== false), canNavigate: !readOnly && !following, followTeacher: following, allowedPages: allowed,
    reason: inSession && live.canWrite === false ? "Your teacher paused writing." : null,
  };
  const syncState = {
    connection: { connected: ink.connected, connecting: !ink.connected, error: ink.error || null },
    save: { pendingCount: Number(ink.pending) || 0, error: null },
    failedLocalCount: 0,
  };
  const a = ink.actions;
  return (
    <div data-notebook-surface data-notebook-palette-root data-testid="surface-native-student">
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "0 0 4px" }}>
        <Pill tone="v2" data-testid="text-engine">Version {variant} notebook (Base44-only · {variant === 3 ? "individual PDF page" : "images"})</Pill>
        {inSession && <Pill tone="ok" data-testid="status-live">Live lesson{following ? " · following teacher" : ""}</Pill>}
        {ended && <Pill tone="warn" data-testid="status-live-ended">Live lesson ended · your work is kept</Pill>}
        {timing && <Pill data-testid="text-timing">{timing}</Pill>}
      </div>
      <NotebookStudentView
        workbook={workbook} page={page} imageUrl={image.url} strokes={ink.strokes} ready={ink.ready}
        controls={controls} syncState={syncState} canUndo={ink.canUndo} canRedo={ink.canRedo} canClear={ink.canClear}
        error={ink.error || ""} finishRef={finishRef}
        onStroke={a.onStroke} onErase={a.onErase} onPixelErase={a.onPixelErase}
        onUndo={() => a.undo()} onRedo={() => a.redo()} onClear={() => a.clear()}
        onChoosePage={p => { if (!following && okPage(p)) setTarget(p); return true; }}
        onRetry={async () => { ink.retry?.(); return (await ink.flush?.()) !== false; }}
      />
    </div>
  );
}
