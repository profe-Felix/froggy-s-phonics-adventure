// Portable drawing surface.
// No fetches, storage, image authorization, microphone, laser or toolbar.
// Callbacks may return Promises. finishRef.current() finishes the active gesture,
// retries (once) every commit that failed BEFORE this call, waits for all commits,
// and resolves true only when nothing failed or lacked a handler. True means a
// LOCAL commit, not a server acknowledgement. Retries reuse original arguments
// (same stroke/path IDs and eraser group ID) so handlers can be idempotent.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { eraserCrosses, inkPath } from "@/lib/external-notebook/ink-model";
import { NotebookTouch } from "@/lib/external-notebook/touch";

const W = 1000;
const ERASE_DELAY = 180;
let seq = 0;
const newId = () => `s_${Date.now().toString(36)}_${(seq++).toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const groupUuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : newId());
const validDim = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;
const isEraser = (t) => t === "eraser" || t === "pixel-eraser";

function StrokePath({ s, h, extra }) {
  const maskId = `ink-mask-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const own = s.erasures || [];
  const ids = new Set(own.map(c => c.id));
  const cuts = extra?.length ? [...own, ...extra.filter(c => !ids.has(c.id))] : own;
  return (
    <g data-stroke-id={s.id}>
      {!!cuts.length && <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={h} style={{ maskType: "luminance" }}>
          <rect width={W} height={h} fill="white" />
          {cuts.map(cut => <path key={cut.id} d={inkPath(cut.points, h, false)} fill="none" stroke="black"
            strokeWidth={cut.width * W} strokeLinecap="round" strokeLinejoin="round" />)}
        </mask>
      </defs>}
      <path d={inkPath(s.points, h)} mask={cuts.length ? `url(#${maskId})` : undefined} fill="none"
        stroke={s.color} strokeWidth={s.width * W} strokeLinecap="round" strokeLinejoin="round"
        opacity={s.tool === "highlighter" ? 0.38 : 1}
        style={s.tool === "highlighter" ? { mixBlendMode: "multiply" } : undefined} />
    </g>
  );
}

const overlayStyle = { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center",
  justifyContent: "center", gap: 8, fontSize: 14, color: "hsl(200 15% 40%)", pointerEvents: "none", textAlign: "center", padding: 16 };

export function NotebookCanvas({ workbook, page, imageUrl, strokes = [], canDraw = false, tool = "pen", color = "#1d3a46",
  width = 0.004, eraserWidth = 0.035, onStroke, onErase, onPixelErase, onPan, onDrawStart, onError, finishRef, className }) {
  const validGeometry = validDim(workbook?.width) && validDim(workbook?.height);
  const ratio = validGeometry ? workbook.height / workbook.width : 1;
  const H = W * ratio;
  const scope = `${workbook?.id}|${page}|${imageUrl || ""}|${workbook?.width}x${workbook?.height}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  const svgRef = useRef(null);
  const surfaceRef = useRef(null);
  const imgRef = useRef(null);
  const [image, setImage] = useState({ scope: null, status: "loading" });
  const imageStatus = !imageUrl ? "error" : image.scope === scope ? image.status : "loading";
  const [active, setActive] = useState(null);
  const [pending, setPending] = useState([]);
  const [hidden, setHidden] = useState([]);
  const [cuts, setCuts] = useState([]);
  const [livePreview, setLivePreview] = useState(null);
  const [hover, setHover] = useState(null);
  const [failure, setFailure] = useState(null);
  const failedRef = useRef(null);
  const failedTasks = useRef(new Map());
  const inflight = useRef(new Set());
  const activeRef = useRef(null);
  const gesture = useRef(null);
  const eraseGesture = useRef(null);
  const eraseTimer = useRef(null);
  const pointerId = useRef(null);
  const gestureClock = useRef(0);
  const strokePointerType = useRef("");
  const touch = useRef(new NotebookTouch());
  const latest = useRef({});
  latest.current = { onStroke, onErase, onPixelErase, onDrawStart, onError, strokes };
  const writable = canDraw && validGeometry && imageStatus === "ok" && !failure;
  const writableRef = useRef(writable);
  writableRef.current = writable;

  const fail = (err) => {
    const error = err instanceof Error ? err : new Error(String(err));
    failedRef.current = error;
    setFailure(error);
    try { latest.current.onError?.(error); } catch { /* parent handler failure ignored */ }
  };
  const runTask = (task) => {
    let p;
    if (typeof task.fn !== "function") p = Promise.reject(new Error(`No ${task.kind} handler was provided; this mark is not saved.`));
    else { try { p = Promise.resolve(task.fn(...task.args)); } catch (e) { p = Promise.reject(e); } }
    const tracked = p.then(r => {
      if (r === false) throw new Error(`The ${task.kind} could not be stored on this device.`);
      failedTasks.current.delete(task.id);
    }).catch(e => { failedTasks.current.set(task.id, task); fail(e); })
      .finally(() => inflight.current.delete(tracked));
    inflight.current.add(tracked);
  };
  const commit = (kind, fn, args) => runTask({ id: newId(), kind, fn, args });

  const finish = () => {
    if (eraseTimer.current) clearTimeout(eraseTimer.current);
    eraseTimer.current = null;
    const s = activeRef.current, eraser = eraseGesture.current, g = gesture.current;
    eraseGesture.current = null; activeRef.current = null; pointerId.current = null; gesture.current = null;
    setLivePreview(null); setActive(null);
    if (s && s.points.length > 0 && g) {
      const last = s.points[s.points.length - 1];
      const t = Math.min(3600000, Math.max(last.t ?? 0, Math.round(performance.now() - gestureClock.current)));
      const done = { ...s, points: [...s.points, { ...last, t }] };
      setPending(list => [...list, { stroke: done, scope: g.scope }]);
      commit("stroke", g.onStroke, [done]);
    }
    if (eraser?.allowed && eraser.pixel && eraser.targets.size) {
      const targets = [...eraser.targets];
      setCuts(list => [...list, { path: eraser.path, targets, scope: eraser.scope }]);
      commit("pixel erase", eraser.commit, [eraser.path, targets]);
    }
  };
  const finishLatest = useRef(finish);
  finishLatest.current = finish;

  useEffect(() => {
    if (!finishRef) return;
    finishRef.current = async () => {
      const drain = async () => { while (inflight.current.size) await Promise.allSettled([...inflight.current]); };
      const prior = [...failedTasks.current.values()];
      finishLatest.current();
      await drain();
      for (const task of prior) {
        if (!failedTasks.current.has(task.id)) continue;
        failedTasks.current.delete(task.id);
        runTask(task);
      }
      await drain();
      const ok = failedTasks.current.size === 0;
      if (ok && failedRef.current) { failedRef.current = null; setFailure(null); }
      return ok;
    };
  });

  // Remove optimistic marks only after the parent's strokes reflect them.
  useEffect(() => {
    const byId = new Map(strokes.map(s => [s.id, s]));
    setPending(list => {
      const next = list.filter(p => p.scope !== scope || !byId.has(p.stroke.id));
      return next.length === list.length ? list : next;
    });
    setHidden(list => {
      const next = list.filter(h => h.scope !== scope || byId.has(h.id));
      return next.length === list.length ? list : next;
    });
    setCuts(list => {
      let changed = false;
      const next = [];
      for (const c of list) {
        if (c.scope !== scope) { next.push(c); continue; }
        const targets = c.targets.filter(id => { const s = byId.get(id); return s && !(s.erasures || []).some(e => e.id === c.path.id); });
        if (targets.length !== c.targets.length) changed = true;
        if (targets.length) next.push(targets.length === c.targets.length ? c : { ...c, targets });
      }
      return changed ? next : list;
    });
  }, [strokes, scope]);

  // Cached images may already be complete before their load event.
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (img && imageUrl && img.complete) setImage({ scope, status: img.naturalWidth > 0 ? "ok" : "error" });
  }, [scope, imageUrl]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !writable) return;
    const prevent = (e) => { if (e.cancelable) e.preventDefault(); };
    surface.addEventListener("touchstart", prevent, { passive: false });
    surface.addEventListener("touchmove", prevent, { passive: false });
    surface.addEventListener("gesturestart", prevent);
    return () => {
      surface.removeEventListener("touchstart", prevent);
      surface.removeEventListener("touchmove", prevent);
      surface.removeEventListener("gesturestart", prevent);
    };
  }, [writable]);

  // Finish with the original callbacks before a new page paints or unmounts.
  useLayoutEffect(() => () => { finishLatest.current(); touch.current.reset(); }, [scope]);
  useLayoutEffect(() => { if (!writable) { finishLatest.current(); setHover(null); } }, [writable]);
  useEffect(() => { setHover(null); }, [tool, scope]);

  // Finish current ink before changing coordinate systems.
  useEffect(() => {
    const svg = svgRef.current;
    const reset = () => { finishLatest.current(); touch.current.reset(); };
    if (svg && typeof ResizeObserver !== "undefined") {
      let previous = null;
      const observer = new ResizeObserver(([entry]) => {
        if (!entry) return;
        const { width: w, height: h } = entry.contentRect;
        if (previous && (Math.abs(w - previous.w) > 0.5 || Math.abs(h - previous.h) > 0.5)) reset();
        previous = { w, h };
      });
      observer.observe(svg);
      return () => observer.disconnect();
    }
    if (typeof window === "undefined") return;
    window.addEventListener("resize", reset);
    window.addEventListener("orientationchange", reset);
    return () => { window.removeEventListener("resize", reset); window.removeEventListener("orientationchange", reset); };
  }, [scope]);

  const toPoint = (e, r = ratio) => {
    const svg = svgRef.current;
    const matrix = svg.getScreenCTM();
    const point = matrix ? new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse()) : null;
    const rect = svg.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, point ? point.x / W : (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, point ? point.y / (W * r) : (e.clientY - rect.top) / rect.height)),
      t: Math.min(3600000, Math.max(0, Math.round(performance.now() - gestureClock.current))),
    };
  };

  const processErase = () => {
    const g = eraseGesture.current;
    if (!g?.allowed) return;
    for (let i = g.processed; i < g.path.points.length; i++) {
      const to = g.path.points[i], from = g.path.points[Math.max(0, i - 1)];
      for (const stroke of g.strokes) {
        if (!g.targets.has(stroke.id) && eraserCrosses(stroke, from, to, g.path.width, g.ratio)) {
          g.targets.add(stroke.id);
          if (!g.pixel) {
            setHidden(list => [...list, { id: stroke.id, scope: g.scope }]);
            commit("erase", g.erase, [stroke.id, g.groupId]);
          }
        }
      }
    }
    g.processed = g.path.points.length;
    if (g.pixel) setLivePreview({ path: g.path, targets: new Set(g.targets), scope: g.scope });
  };
  const moveEraser = (pt) => {
    const g = eraseGesture.current;
    if (!g || g.path.points.length >= 2900) return;
    const last = g.path.points[g.path.points.length - 1];
    if (Math.hypot(pt.x - last.x, (pt.y - last.y) * g.ratio) > 0.0005) g.path = { ...g.path, points: [...g.path.points, pt] };
    if (g.scope === scopeRef.current) g.strokes = latest.current.strokes;
    processErase();
  };

  const down = (e) => {
    if (!writableRef.current || failedRef.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (e.pointerType === "touch") {
      if (touch.current.start(e.pointerId, e.clientX, e.clientY)) {
        const s = activeRef.current;
        if ((s && (strokePointerType.current !== "touch" || (s.points.length > 1 && performance.now() - touch.current.startedAt > ERASE_DELAY))) ||
            (eraseGesture.current?.allowed && performance.now() - touch.current.startedAt > ERASE_DELAY)) finish();
        else {
          if (eraseTimer.current) clearTimeout(eraseTimer.current);
          eraseTimer.current = null; activeRef.current = null; pointerId.current = null; gesture.current = null;
          eraseGesture.current = null; setActive(null); setLivePreview(null);
        }
        setHover(null);
      }
      if (touch.current.panning) return;
    }
    if (pointerId.current !== null) return;
    pointerId.current = e.pointerId;
    gestureClock.current = performance.now();
    strokePointerType.current = e.pointerType;
    const l = latest.current;
    gesture.current = { tool, scope, ratio, onStroke: l.onStroke };
    try { l.onDrawStart?.(); } catch { /* dismissal only; never cancels the stroke */ }
    const pt = toPoint(e);
    if (isEraser(tool)) {
      setHover(pt);
      eraseGesture.current = { path: { id: newId(), points: [pt], width: eraserWidth, startedAt: Date.now() }, groupId: groupUuid(),
        targets: new Set(), processed: 0, allowed: e.pointerType !== "touch", pixel: tool === "pixel-eraser", scope, ratio,
        strokes: l.strokes, erase: l.onErase, commit: l.onPixelErase };
      if (e.pointerType === "touch") {
        const id = e.pointerId;
        eraseTimer.current = setTimeout(() => {
          eraseTimer.current = null;
          if (!touch.current.panning && pointerId.current === id && eraseGesture.current) { eraseGesture.current.allowed = true; processErase(); }
        }, ERASE_DELAY);
      } else processErase();
      return;
    }
    const s = { id: newId(), startedAt: Date.now(), color, width: tool === "highlighter" ? Math.min(0.1, width * 4) : width, tool, points: [pt] };
    activeRef.current = s;
    setActive({ stroke: s, scope });
  };
  const move = (e) => {
    if (writable && !failedRef.current && isEraser(tool) && !touch.current.panning) setHover(toPoint(e));
    if (e.pointerType === "touch") {
      const delta = touch.current.move(e.pointerId, e.clientX, e.clientY);
      if (touch.current.panning) { if (e.cancelable) e.preventDefault(); if (delta) onPan?.(delta.x, delta.y); return; }
    }
    const g = gesture.current;
    if (pointerId.current !== e.pointerId || !g || g.scope !== scopeRef.current) return;
    if (!writableRef.current || failedRef.current) { finish(); return; }
    if (e.cancelable) e.preventDefault();
    const pt = toPoint(e, g.ratio);
    if (isEraser(g.tool)) { moveEraser(pt); return; }
    const s = activeRef.current;
    if (!s || s.points.length >= 2900) return;
    const last = s.points[s.points.length - 1];
    if (Math.hypot(pt.x - last.x, pt.y - last.y) < 0.0015) return;
    const next = { ...s, points: [...s.points, pt] };
    activeRef.current = next;
    setActive({ stroke: next, scope: g.scope });
  };
  const up = (e) => {
    if (e.pointerType === "touch") {
      const wasPanning = touch.current.panning;
      touch.current.end(e.pointerId);
      if (wasPanning) return;
    }
    if (pointerId.current !== e.pointerId) return;
    if (e.cancelable) e.preventDefault();
    const g = gesture.current;
    if (g && isEraser(g.tool)) {
      if (eraseTimer.current) {
        clearTimeout(eraseTimer.current); eraseTimer.current = null;
        if (e.type === "pointerup" && eraseGesture.current) eraseGesture.current.allowed = true;
      }
      if (e.type === "pointerup" && g.scope === scopeRef.current) moveEraser(toPoint(e, g.ratio));
      finish();
      if (e.pointerType === "touch") setHover(null);
      return;
    }
    finish();
  };

  if (!validGeometry) {
    return <div role="alert" className={className} data-testid="canvas-notebook-invalid"
      style={{ padding: 16, borderRadius: 6, background: "hsl(44 60% 96%)", color: "hsl(0 60% 38%)", fontSize: 14 }}>
      This workbook has no valid page size, so the page cannot be shown.</div>;
  }
  const shownIds = new Set(strokes.map(s => s.id));
  const hiddenIds = new Set(hidden.filter(h => h.scope === scope).map(h => h.id));
  const extraCuts = new Map();
  const addCut = (id, path) => extraCuts.set(id, [...(extraCuts.get(id) || []), path]);
  for (const c of cuts) if (c.scope === scope) c.targets.forEach(id => addCut(id, c.path));
  if (livePreview?.scope === scope) livePreview.targets.forEach(id => addCut(id, livePreview.path));
  const pendingShown = pending.filter(p => p.scope === scope && !shownIds.has(p.stroke.id));
  const eraserCursor = writable && hover && isEraser(tool);

  return (
    <div ref={surfaceRef} className={className} data-testid="surface-notebook"
      style={{ position: "relative", width: "100%", overflow: "hidden", borderRadius: 6, background: "hsl(44 60% 98%)",
        boxShadow: "0 1px 0 hsl(38 20% 80%), 0 18px 40px -20px hsl(200 40% 20% / .35)",
        aspectRatio: `${workbook.width} / ${workbook.height}`, touchAction: writable ? "none" : "pan-x pan-y",
        userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: writable ? "none" : "default" }}
      onContextMenu={(e) => { if (writable) e.preventDefault(); }}>
      {imageUrl && <img key={scope} ref={imgRef} src={imageUrl} alt={`${workbook.title || "Workbook"}, page ${page}`} draggable={false}
        onLoad={() => setImage({ scope, status: "ok" })} onError={() => setImage({ scope, status: "error" })} data-testid="img-workbook-page"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", userSelect: "none" }} />}
      {imageStatus === "loading" && <div role="status" style={overlayStyle} data-testid="status-page-loading">Loading page {page}...</div>}
      {imageStatus === "error" && <div role="alert" style={overlayStyle} data-testid="status-page-error">
        Page {page} could not load. Writing is paused until the page appears.</div>}
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: writable ? "none" : "pan-x pan-y",
          cursor: writable ? (isEraser(tool) ? "none" : "crosshair") : "default" }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
        onPointerLeave={() => { if (pointerId.current === null) setHover(null); }}
        data-testid="canvas-notebook" role="img" aria-label={`Drawing layer with ${strokes.length} strokes`}>
        <rect width={W} height={H} fill="transparent" pointerEvents="all" />
        <g pointerEvents="none">
          {strokes.filter(s => !hiddenIds.has(s.id)).map(s => <StrokePath key={s.id} s={s} h={H} extra={extraCuts.get(s.id)} />)}
          {pendingShown.map(p => <StrokePath key={`p-${p.stroke.id}`} s={p.stroke} h={H} />)}
          {active && active.scope === scope && <StrokePath s={active.stroke} h={H} />}
          {eraserCursor && <circle data-testid="eraser-preview" data-tool={tool} cx={hover.x * W} cy={hover.y * H} r={eraserWidth * W / 2}
            fill={tool === "eraser" ? "#ef4444" : "#6b7280"} fillOpacity={0.27}
            stroke={tool === "eraser" ? "#dc2626" : "#4b5563"} strokeOpacity={0.7} strokeWidth={1.5} />}
        </g>
      </svg>
      {failure && <div role="alert" data-testid="status-ink-error"
        style={{ position: "absolute", left: 12, right: 12, bottom: 12, padding: "10px 12px", borderRadius: 6, fontSize: 13,
          background: "hsl(0 70% 96%)", color: "hsl(0 60% 34%)", border: "1px solid hsl(0 55% 80%)" }}>
        Writing is paused: some marks are not saved yet. Keep this page open so they can be saved again. {failure.message}</div>}
    </div>
  );
}
