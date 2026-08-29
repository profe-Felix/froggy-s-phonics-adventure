import { useRef, useState, useEffect } from 'react';
import { Undo2, Trash2, Image as ImageIcon, Move, X, Wand2, Magnet, Edit3 } from 'lucide-react';
import { CANVAS_W, CANVAS_H, smoothPoints, pointAtLength, catmullRom, splinePathD } from './strokeMath';

const STROKE_COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6'];

function Arrow({ pos, color }) {
  const size = 7;
  const a1 = pos.angle + Math.PI - 0.45;
  const a2 = pos.angle + Math.PI + 0.45;
  const p1 = `${(pos.x + size * Math.cos(a1)).toFixed(1)},${(pos.y + size * Math.sin(a1)).toFixed(1)}`;
  const p2 = `${(pos.x + size * Math.cos(a2)).toFixed(1)},${(pos.y + size * Math.sin(a2)).toFixed(1)}`;
  return <polygon points={`${pos.x.toFixed(1)},${pos.y.toFixed(1)} ${p1} ${p2}`} fill={color} />;
}

const pathD = (pts) =>
  pts.length < 2 ? '' : pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

export default function StrokeAuthoringCanvas({ rawStrokes, setRawStrokes, bg, bgScale, bgX, bgY, setBgScale, setBgX, setBgY, setBg, loadImage }) {
  const [current, setCurrent] = useState([]);
  const svgRef = useRef(null);
  const currentRef = useRef([]);
  const drawingRef = useRef(false);

  // rawStrokes ref kept in sync synchronously so the chain-start lookup in
  // `down` always sees the latest committed stroke — even when a D-segment
  // commit (pen-up) and the next D-segment start (pen-down) happen before
  // React re-renders. Without this, chaining a second D line off the first
  // one reads a stale rawStrokes and chains off the PREVIOUS stroke's end.
  const rawStrokesRef = useRef(rawStrokes);
  rawStrokesRef.current = rawStrokes;

  // Image display opacity + drag mode are local UI state (the image itself and
  // its transform live in the parent so they persist across the Snap↔Thin toggle).
  const [bgOpacity, setBgOpacity] = useState(0.4);
  const [moveMode, setMoveMode] = useState(false);
  const moveStartRef = useRef(null);
  const fileRef = useRef(null);

  // Structured-stroke tools (held keys), layered on top of freehand drawing:
  //  D = line:  pen-down = start, drag = dashed preview, pen-up = commit one
  //             straight segment. Pen must lift after (segment ends on up).
  //  S = curve: pen-down = start, drag = chord preview, pen-up = fix END. Then
  //             tap to add control points between start↔end (curve previews
  //             through them); release S to commit. Auto-snaps to ink when
  //             "Center on ink" is on.
  //  A = chain: hold to make the next segment START at the previous stroke's
  //             endpoint (piggyback into one continuous stroke) instead of a
  //             new stroke. Release A (pen up) to finish the chained stroke.
  const dHeldRef = useRef(false);
  const sHeldRef = useRef(false);
  const aHeldRef = useRef(false);
  const gestureRef = useRef(null);     // { type:'line'|'curve', start, end, ctrls:[], phase }
  const [preview, setPreview] = useState(null);

  // Latest bg scale/position in refs so the scale slider can anchor to the
  // bottom-left corner without going stale across rapid drag events.
  const bgScaleRef = useRef(bgScale);
  const bgYRef = useRef(bgY);
  useEffect(() => { bgScaleRef.current = bgScale; }, [bgScale]);
  useEffect(() => { bgYRef.current = bgY; }, [bgY]);

  const [snapStrength, setSnapStrength] = useState(0.6);
  const [snapHistory, setSnapHistory] = useState([]);

  // Auto-center: while drawing, each point snaps to the centroid of nearby ink
  // in the loaded trace image, so the stroke rides the black line live.
  const [autoCenter, setAutoCenter] = useState(false);
  const inkMapRef = useRef(null);

  // Edit mode: drag any stroke point to fine-tune, or tap a segment to insert
  // a new point between its neighbors. Lets you fix a curve after committing.
  const [editMode, setEditMode] = useState(false);
  const dragRef = useRef(null); // { strokeIdx, pointIdx } while dragging



  // Writing guide lines — fixed at the confirmed positions (10/37/63/90).
  // Locked so they can't drift; align the trace image to them via Move/Scale.
  const lineTop = 0.10;
  const lineMid = 0.367;
  const lineBase = 0.633;
  const lineDesc = 0.90;

  // Build a per-pixel ink-weight map (0=white, 1=solid black) of the trace image
  // in its current canvas transform — only while auto-center is on, so moving
  // the image or sliding scale never pays for it when the magnet is off.
  useEffect(() => {
    if (!autoCenter || !bg?.img) { inkMapRef.current = null; return; }
    const W = Math.round(CANVAS_W), H = Math.round(CANVAS_H);
    const dh = CANVAS_H * bgScale;
    const dw = dh * (bg?.aspect || 1);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const cx = c.getContext('2d');
    cx.fillStyle = '#ffffff';
    cx.fillRect(0, 0, W, H);
    cx.drawImage(bg.img, bgX, bgY, dw, dh);
    let imgData;
    try { imgData = cx.getImageData(0, 0, W, H); } catch { inkMapRef.current = null; return; }
    const src = imgData.data;
    const data = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const o = i * 4;
      // Only BLACK ink counts (all RGB channels low) — pink/colored marks are
      // ignored so the magnet follows only the black letter line.
      const r = src[o], g = src[o + 1], b = src[o + 2];
      const dark = Math.max(r, g, b);
      data[i] = r < 120 && g < 120 && b < 120 ? (120 - dark) / 120 : 0;
    }
    inkMapRef.current = { data, W, H };
  }, [autoCenter, bg, bgScale, bgX, bgY]);

  // Hold-key listeners for the structured-stroke tools (D/S/A). Only active
  // when not typing in a text field, so the hint/letter inputs still work.
  useEffect(() => {
    const isInput = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    const onKeyDown = (e) => {
      if (isInput(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'd') dHeldRef.current = true;
      else if (k === 's') sHeldRef.current = true;
      else if (k === 'a') aHeldRef.current = true;
      else if (k === 'e') { setEditMode(m => !m); gestureRef.current = null; setPreview(null); drawingRef.current = false; }
      else if (k === 'escape') {
        // cancel any active structured gesture
        gestureRef.current = null; setPreview(null); drawingRef.current = false;
      }
    };
    const onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'd') {
        dHeldRef.current = false;
        // releasing D mid-line-gesture cancels the preview (no commit)
        if (gestureRef.current && gestureRef.current.type === 'line' && drawingRef.current) {
          gestureRef.current = null; setPreview(null); drawingRef.current = false;
        }
      } else if (k === 's') {
        sHeldRef.current = false;
        // releasing S commits the active curve (if any)
        if (gestureRef.current && gestureRef.current.type === 'curve') {
          commitCurve(gestureRef.current);
          gestureRef.current = null; setPreview(null); drawingRef.current = false;
        }
      } else if (k === 'a') {
        aHeldRef.current = false;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [autoCenter, rawStrokes]);

  const getPos = (e) => {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * CANVAS_W) / rect.width,
      y: ((e.clientY - rect.top) * CANVAS_H) / rect.height,
    };
  };

  // Live auto-center: snap a point onto the CENTER LINE of the black stroke
  // under the cursor. We take a slice PERPENDICULAR to the direction of travel
  // and find the ink's centroid along it — the arc's center on a curve, the
  // stem's center on a straight part. Ink is GAUSSIAN-WEIGHTED by its distance
  // from the cursor along the slice, so the stroke right under the pen
  // dominates and a crossing/merged stroke a few widths away barely counts.
  // That is what keeps the stem of an 'a' straight through the junction where
  // the bowl joins it: the bowl ink sits off to the side and is suppressed, so
  // the centroid stays on the stem instead of dipping toward the bowl.
  const snapToInk = (pos, prev) => {
    const m = inkMapRef.current;
    if (!m) return pos;
    const inkW = (x, y) => {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= m.W || yi >= m.H) return 0;
      return m.data[yi * m.W + xi];
    };
    const SIG = 6;            // ~stroke half-width: full stroke is sampled, a
                              // neighboring/merged stroke a few widths out is not
    const g = (t) => Math.exp(-(t * t) / (2 * SIG * SIG));
    const MAX_PULL = 22;
    // perpendicular to recent travel; first point of a stroke has none yet
    let nx, ny;
    if (prev) {
      const dx = pos.x - prev.x, dy = pos.y - prev.y;
      const dl = Math.hypot(dx, dy);
      if (dl > 1e-3) { nx = -dy / dl; ny = dx / dl; }
    }
    if (nx === undefined) {
      // first point: Gaussian-weighted centroid over a local disc — centers on
      // the stroke under the cursor, ignoring a neighboring/merged stroke
      const R = 22, xi = Math.round(pos.x), yi = Math.round(pos.y);
      const x0 = Math.max(0, xi - R), x1 = Math.min(m.W - 1, xi + R);
      const y0 = Math.max(0, yi - R), y1 = Math.min(m.H - 1, yi + R);
      let sw = 0, sx = 0, sy = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const w = m.data[y * m.W + x];
        if (!w) continue;
        const gw = w * g(Math.hypot(x - xi, y - yi));
        sw += gw; sx += x * gw; sy += y * gw;
      }
      return sw === 0 ? pos : { x: sx / sw, y: sy / sw };
    }
    // perpendicular slice, Gaussian-weighted centroid
    const L = 24;
    let sw = 0, st = 0;
    for (let t = -L; t <= L; t++) {
      const w = inkW(pos.x + t * nx, pos.y + t * ny);
      if (!w) continue;
      const gw = w * g(t);
      sw += gw; st += t * gw;
    }
    if (sw === 0) return pos;
    const off = Math.max(-MAX_PULL, Math.min(MAX_PULL, st / sw));
    return { x: pos.x + off * nx, y: pos.y + off * ny };
  };

  const finishStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (currentRef.current.length > 1) {
      // Store the stroke RAW as drawn. The ink-snap tools (Ease/Pin/Round) work
      // on these raw points — that's what centers them cleanly on the trace
      // image. The display smooths for preview only; saving is a pure scale of
      // these raw points, so reload shows identical pixels.
      const newStroke = currentRef.current.slice();
      setRawStrokes((prev) => [...prev, newStroke]);
      rawStrokesRef.current = [...rawStrokesRef.current, newStroke];
    }
    currentRef.current = [];
    setCurrent([]);
  };

  // ---- Structured-stroke tools (D=line, S=curve, A=chain) ----
  // Build the live preview object from the active gesture.
  const buildPreview = (g) => {
    if (!g) return null;
    if (g.type === 'line') return { kind: 'line', start: g.start, end: g.end };
    const ctrls = [g.start, ...g.ctrls, g.end];
    return { kind: 'curve', start: g.start, end: g.end, ctrls: g.ctrls.slice(), spline: catmullRom(ctrls, 16) };
  };
  // Append a committed segment to the strokes — chained onto the previous
  // stroke's endpoint when A is held, otherwise a fresh stroke.
  const commitSegment = (pts) => {
    if (!pts || pts.length < 2) return;
    if (aHeldRef.current && rawStrokesRef.current.length > 0) {
      const tail = pts.slice(1); // start equals the last point — skip duplicate
      setRawStrokes((prev) => {
        const copy = prev.slice();
        copy[copy.length - 1] = [...copy[copy.length - 1], ...tail];
        return copy;
      });
      // Optimistically update the ref so the very next pen-down sees the new
      // endpoint even before React re-renders.
      const copy = rawStrokesRef.current.slice();
      copy[copy.length - 1] = [...copy[copy.length - 1], ...tail];
      rawStrokesRef.current = copy;
    } else {
      setRawStrokes((prev) => [...prev, pts]);
      rawStrokesRef.current = [...rawStrokesRef.current, pts];
    }
  };
  // Snap a dense point list onto the ink centerline (perpendicular-slice), so a
  // curve drops onto the black line when "Center on ink" is on.
  const snapCurveToInk = (pts) => {
    const out = [];
    let prev = null;
    for (const p of pts) { const sp = snapToInk(p, prev); out.push(sp); prev = sp; }
    return out;
  };
  const commitCurve = (g) => {
    // Store the CONTROL POINTS (skeleton), not dense catmullRom samples.
    // The display renders a smooth curve through them; edit mode shows
    // exactly the points the user placed. Saving densifies via catmullRom.
    let pts = [g.start, ...g.ctrls, g.end];
    if (autoCenter && inkMapRef.current) pts = snapCurveToInk(pts);
    commitSegment(pts);
  };

  // ---- Edit mode: the stroke IS the skeleton (the points the user placed).
  // Every point is a handle — drag any one and only that point moves. The
  // display re-renders a smooth catmullRom curve through the updated skeleton.
  const getHandleIndices = (stroke) => stroke.map((_, i) => i);
  const findNearestHandle = (pos, threshold) => {
    let best = null, bestD = threshold;
    for (let si = 0; si < rawStrokes.length; si++) {
      for (const pi of getHandleIndices(rawStrokes[si])) {
        const p = rawStrokes[si][pi];
        const d = Math.hypot(p.x - pos.x, p.y - pos.y);
        if (d < bestD) { bestD = d; best = { strokeIdx: si, pointIdx: pi }; }
      }
    }
    return best;
  };
  // Move a single skeleton point — nothing else moves. The display
  // re-renders a smooth catmullRom curve through the updated skeleton.
  const dragHandlePoint = (strokeIdx, pointIdx, newPos) => {
    setRawStrokes(prev => {
      const copy = prev.slice();
      const stroke = copy[strokeIdx].slice();
      stroke[pointIdx] = newPos;
      copy[strokeIdx] = stroke;
      return copy;
    });
  };

  // Pointer Events unify mouse, touch, and pen. setPointerCapture keeps events
  // flowing to the canvas even if the finger/cursor leaves it mid-stroke.
  const down = (e) => {
    e.preventDefault();
    if (e.button != null && e.button !== 0) return; // left mouse / touch / pen only
    try { svgRef.current.setPointerCapture(e.pointerId); } catch {}
    const pos = getPos(e);
    if (moveMode && bg) {
      moveStartRef.current = { x: pos.x, y: pos.y, bgX, bgY };
      return;
    }
    // Edit mode: drag an existing handle. No auto-insert — tapping empty
    // space does nothing, so you never accidentally create points.
    if (editMode) {
      const hit = findNearestHandle(pos, 22);
      if (hit) { dragRef.current = hit; drawingRef.current = true; }
      return;
    }
    // Adding a control point to an active curve (S still held): each tap bends it.
    if (gestureRef.current && gestureRef.current.type === 'curve' && gestureRef.current.phase === 'add-ctrls' && sHeldRef.current) {
      gestureRef.current.ctrls.push(pos);
      setPreview(buildPreview(gestureRef.current));
      drawingRef.current = true;
      return;
    }
    // Chain: A held → the new segment starts at the previous stroke's endpoint.
    // Read from the ref (not the closure) so a just-committed D segment's end
    // point is visible immediately — no stale-closure retrace to the old end.
    const rs = rawStrokesRef.current;
    const chainStart = (aHeldRef.current && rs.length > 0)
      ? { ...rs[rs.length - 1][rs[rs.length - 1].length - 1] }
      : null;
    if (dHeldRef.current) {
      const start = chainStart || pos;
      gestureRef.current = { type: 'line', start, end: pos };
      setPreview(buildPreview(gestureRef.current));
      drawingRef.current = true;
      return;
    }
    if (sHeldRef.current) {
      const start = chainStart || pos;
      gestureRef.current = { type: 'curve', start, end: pos, ctrls: [], phase: 'drag-end' };
      setPreview(buildPreview(gestureRef.current));
      drawingRef.current = true;
      return;
    }
    // Starting freehand without a tool key → drop any lingering gesture.
    if (gestureRef.current) { gestureRef.current = null; setPreview(null); }
    const start = autoCenter ? snapToInk(pos) : pos;
    currentRef.current = [start];
    setCurrent([start]);
    drawingRef.current = true;
  };

  const move = (e) => {
    if (moveMode && moveStartRef.current) {
      e.preventDefault();
      const pos = getPos(e);
      const s = moveStartRef.current;
      setBgX(s.bgX + (pos.x - s.x));
      setBgY(s.bgY + (pos.y - s.y));
      return;
    }
    if (editMode && dragRef.current) {
      e.preventDefault();
      const pos = getPos(e);
      const { strokeIdx, pointIdx } = dragRef.current;
      // Edit mode: always follow the cursor exactly — no ink snapping.
      // The user is fine-tuning a point, not tracing a line.
      dragHandlePoint(strokeIdx, pointIdx, pos);
      return;
    }
    if (!drawingRef.current) return;
    e.preventDefault();
    const pos = getPos(e);
    if (gestureRef.current) {
      const g = gestureRef.current;
      if (g.type === 'line') g.end = pos;
      else if (g.type === 'curve') {
        if (g.phase === 'drag-end') g.end = pos;
        else if (g.ctrls.length) g.ctrls[g.ctrls.length - 1] = pos; // live control point
      }
      setPreview(buildPreview(g));
      return;
    }
    const last = currentRef.current[currentRef.current.length - 1];
    const p = autoCenter ? snapToInk(pos, last) : pos;
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
    currentRef.current = [...currentRef.current, p];
    setCurrent(currentRef.current);
  };

  const up = (e) => {
    e.preventDefault();
    try { svgRef.current.releasePointerCapture(e.pointerId); } catch {}
    moveStartRef.current = null;
    if (editMode) { dragRef.current = null; drawingRef.current = false; return; }
    if (moveMode) return;
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (gestureRef.current) {
      const g = gestureRef.current;
      if (g.type === 'line') {
        if (dHeldRef.current) {
          // Store just the 2 endpoints — the skeleton. Display and save
          // densify via catmullRom, so the line stays straight and the
          // student gets smooth waypoints.
          commitSegment([g.start, g.end]);
        }
        gestureRef.current = null; setPreview(null);
        return;
      }
      if (g.type === 'curve') {
        if (g.phase === 'drag-end') { g.end = getPos(e); g.phase = 'add-ctrls'; }
        // else: control point already set by move; stay in add-ctrls
        setPreview(buildPreview(g));
        return; // S release commits
      }
    }
    finishStroke();
  };

  const onPickImage = (e) => {
    loadImage(e.target.files?.[0]);
    e.target.value = ''; // allow re-picking the same file
  };

  const onDrop = (e) => {
    e.preventDefault();
    loadImage(e.dataTransfer.files?.[0]);
  };

  // "Snap to letter": center each stroke point laterally on the ink. Curved
  // parts are centered per-point on the nearest ink run along a perpendicular
  // slice (a local window keeps an overlapping stroke from pulling it
  // sideways). Straight parts are detected by constant tangent direction and
  // fit to a single line at the run's centered offset — so the stem of an 'a'
  // stays straight even where the bowl meets it, instead of bowing toward the
  // junction. All moves are purely perpendicular, so nothing shrinks (the stem
  // still reaches the top line) and re-snapping is stable. Strength scales the
  // move; click repeatedly to converge.
  const applySnap = (mode) => {
    if (!bg?.img || !rawStrokes.length) return;
    const W = Math.round(CANVAS_W), H = Math.round(CANVAS_H);
    const dh = CANVAS_H * bgScale;
    const dw = dh * (bg?.aspect || 1);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const cx = c.getContext('2d');
    cx.fillStyle = '#ffffff';
    cx.fillRect(0, 0, W, H);
    cx.drawImage(bg.img, bgX, bgY, dw, dh);
    let imgData;
    try { imgData = cx.getImageData(0, 0, W, H); } catch { return; }
    const data = imgData.data;
    // ink weight at a canvas point: 0 = white, 1 = solid black (soft for AA edges)
    const inkW = (x, y) => {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0;
      const o = (yi * W + xi) * 4;
      const r = data[o], g = data[o + 1], b = data[o + 2];
      const dark = Math.max(r, g, b);
      return r < 120 && g < 120 && b < 120 ? (120 - dark) / 120 : 0;
    };
    const L = 30; // half-width of the perpendicular cross-section sample
    const LOCAL = 10; // local half-width: ignore joined strokes beyond this
    const MAX_PULL = 16; // cap on perpendicular move so a point can't jump to a neighboring stroke
    const cl = (v, hi) => Math.max(0, Math.min(hi, v));
    // offset from p to the ink center along (nx,ny), using the nearest ink run
    // and a local window so an overlapping stroke can't pull the center over
    const centerOffset = (p, nx, ny) => {
      const runs = [];
      let cur = null;
      for (let t = -L; t <= L; t++) {
        const w = inkW(p.x + t * nx, p.y + t * ny);
        if (w > 0) {
          if (!cur) cur = { start: t, end: t, sw: 0, st: 0 };
          cur.end = t; cur.sw += w; cur.st += t * w;
        } else if (cur) { runs.push(cur); cur = null; }
      }
      if (cur) runs.push(cur);
      if (!runs.length) return 0;
      let chosen = runs[0], bestD = Infinity;
      for (const r of runs) {
        const d = r.start <= 0 && r.end >= 0 ? 0 : (r.end < 0 ? -r.end : r.start);
        if (d < bestD) { bestD = d; chosen = r; }
      }
      const lo = Math.max(chosen.start, -LOCAL), hi = Math.min(chosen.end, LOCAL);
      let sw = 0, st = 0;
      for (let t = lo; t <= hi; t++) {
        const w = inkW(p.x + t * nx, p.y + t * ny);
        if (w > 0) { sw += w; st += t * w; }
      }
      const raw = sw > 0 ? st / sw : chosen.st / chosen.sw;
      return Math.max(-MAX_PULL, Math.min(MAX_PULL, raw));
    };
    const THETA = 10 * Math.PI / 180; // tangent drift allowed inside a straight run
    const MIN_LINE = 5; // points needed to treat a run as a straight line
    const turn = (a, b) => Math.abs(Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y));
    const newStrokes = rawStrokes.map((stroke) => {
      const n = stroke.length;
      if (n < 2) return stroke;
      // windowed tangents (fallback to immediate neighbors at the ends)
      const tan = stroke.map((_, i) => {
        const a = stroke[Math.max(0, i - 2)], b = stroke[Math.min(n - 1, i + 2)];
        let tx = b.x - a.x, ty = b.y - a.y;
        const tl = Math.hypot(tx, ty);
        if (tl < 1e-6) {
          const a2 = stroke[Math.max(0, i - 1)], b2 = stroke[Math.min(n - 1, i + 1)];
          tx = b2.x - a2.x; ty = b2.y - a2.y;
          const tl2 = Math.hypot(tx, ty);
          if (tl2 < 1e-6) return null;
          return { x: tx / tl2, y: ty / tl2 };
        }
        return { x: tx / tl, y: ty / tl };
      });
      // grow straight runs (constant tangent) and fit each to one centered line
      const segId = new Array(n).fill(-1);
      const segs = [];
      let i = 0;
      while (i < n) {
        if (!tan[i]) { i++; continue; }
        let j = i + 1;
        while (j < n && tan[j] && turn(tan[i], tan[j]) < THETA) j++;
        if (j - i >= MIN_LINE) {
          const a = stroke[i], b = stroke[j - 1];
          const dl = Math.hypot(b.x - a.x, b.y - a.y);
          if (dl >= 1e-6) {
            const lnx = -(b.y - a.y) / dl, lny = (b.x - a.x) / dl;
            const perp = (q) => q.x * lnx + q.y * lny;
            const centers = [];
            for (let k = i + 1; k < j - 1; k++) centers.push(perp(stroke[k]) + centerOffset(stroke[k], lnx, lny));
            if (!centers.length) centers.push(perp(a) + centerOffset(a, lnx, lny));
            centers.sort((u, v) => u - v);
            const S = centers[Math.floor(centers.length / 2)];
            const id = segs.length;
            segs.push({ start: i, end: j - 1, lnx, lny, S });
            for (let k = i; k < j; k++) segId[k] = id;
          }
        }
        i = j;
      }
      // per-point targets computed on the ORIGINAL stroke (pre-snap)
      const curveTarget = stroke.map((p, idx) => {
        const t = tan[idx];
        if (!t) return p;
        const nx = -t.y, ny = t.x;
        const off = centerOffset(p, nx, ny);
        return { x: cl(p.x + off * nx * snapStrength, CANVAS_W), y: cl(p.y + off * ny * snapStrength, CANVAS_H) };
      });
      const lineTarget = stroke.map((p, idx) => {
        if (segId[idx] < 0) return null;
        const seg = segs[segId[idx]];
        const perp = (q) => q.x * seg.lnx + q.y * seg.lny;
        const shift = (seg.S - perp(p)) * snapStrength;
        return { x: cl(p.x + shift * seg.lnx, CANVAS_W), y: cl(p.y + shift * seg.lny, CANVAS_H) };
      });
      const base = stroke.map((p, idx) => (segId[idx] >= 0 && lineTarget[idx]) ? lineTarget[idx] : curveTarget[idx]);

      if (mode === 'ease') {
        // glide from the curve onto the line over the run's first/last ~2 points,
        // so the corner where stem meets bowl isn't a hard kink
        return stroke.map((p, idx) => {
          if (segId[idx] < 0) return curveTarget[idx];
          const seg = segs[segId[idx]];
          const edge = Math.min(idx - seg.start, seg.end - idx);
          const w = Math.min(1, edge / 2);
          const lt = lineTarget[idx], ct = curveTarget[idx];
          return { x: cl(ct.x + (lt.x - ct.x) * w, CANVAS_W), y: cl(ct.y + (lt.y - ct.y) * w, CANVAS_H) };
        });
      }
      if (mode === 'pin') {
        // move the single curve point next to each run onto the run's line end,
        // closing the gap where the bowl meets the stem (move capped to avoid jumps)
        const out = base.slice();
        const maxMove = 18;
        const clampMove = (from, to) => {
          const dx = to.x - from.x, dy = to.y - from.y;
          const d = Math.hypot(dx, dy);
          if (d <= maxMove) return to;
          const f = maxMove / d;
          return { x: cl(from.x + dx * f, CANVAS_W), y: cl(from.y + dy * f, CANVAS_H) };
        };
        for (const seg of segs) {
          if (seg.start - 1 >= 0 && segId[seg.start - 1] < 0)
            out[seg.start - 1] = clampMove(stroke[seg.start - 1], lineTarget[seg.start]);
          if (seg.end + 1 < n && segId[seg.end + 1] < 0)
            out[seg.end + 1] = clampMove(stroke[seg.end + 1], lineTarget[seg.end]);
        }
        return out;
      }
      if (mode === 'round') {
        // lightly average the 2 points on each side of every line/curve boundary
        const out = base.slice();
        const smooth = (idx) => {
          if (idx <= 0 || idx >= n - 1) return;
          const a = out[idx - 1], b = out[idx], c = out[idx + 1];
          if (!a || !b || !c) return;
          out[idx] = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
        };
        for (const seg of segs) {
          for (let k = 1; k <= 2; k++) {
            smooth(seg.start - k); smooth(seg.start + k);
            smooth(seg.end - k); smooth(seg.end + k);
          }
        }
        return out;
      }
      return base;
    });
    setSnapHistory((h) => [...h, rawStrokes]);
    setRawStrokes(newStrokes);
  };

  const undoSnap = () => {
    setSnapHistory((h) => {
      if (!h.length) return h;
      setRawStrokes(h[h.length - 1]);
      return h.slice(0, -1);
    });
  };

  const undo = () => setRawStrokes((prev) => prev.slice(0, -1));
  const clear = () => { setRawStrokes([]); setSnapHistory([]); gestureRef.current = null; setPreview(null); };

  const dispH = CANVAS_H * bgScale;
  const dispW = dispH * (bg?.aspect || 1);

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        className="w-72 max-w-full rounded-2xl border-4 border-indigo-300 bg-white touch-none aspect-[4/5] shadow-sm"
        style={{ cursor: moveMode && bg ? 'move' : (editMode ? 'pointer' : 'crosshair'), touchAction: 'none' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        onContextMenu={(e) => e.preventDefault()}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {/* Traceable background image */}
        {bg && (
          <image href={bg.url} x={bgX} y={bgY} width={dispW} height={dispH} opacity={bgOpacity} />
        )}

        {/* Writing guide lines (adjustable — match to your trace image) */}
        <line x1="0" y1={lineTop * CANVAS_H} x2={CANVAS_W} y2={lineTop * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={lineMid * CANVAS_H} x2={CANVAS_W} y2={lineMid * CANVAS_H} stroke="#93c5fd" strokeWidth="1" strokeDasharray="8 6" opacity="0.7" />
        <line x1="0" y1={lineBase * CANVAS_H} x2={CANVAS_W} y2={lineBase * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={lineDesc * CANVAS_H} x2={CANVAS_W} y2={lineDesc * CANVAS_H} stroke="#fca5a5" strokeWidth="1.5" strokeDasharray="6 6" opacity="0.85" />

        {/* Smooth strokes (catmullRom through skeleton points) with direction arrows */}
        {rawStrokes.map((s, i) => {
          const sm = catmullRom(s, 16);
          const color = STROKE_COLORS[i % STROKE_COLORS.length];
          return (
            <g key={i}>
              <path d={splinePathD(s)} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
              <Arrow pos={pointAtLength(sm, 0.4)} color={color} />
              <Arrow pos={pointAtLength(sm, 0.75)} color={color} />
              <circle cx={sm[0].x} cy={sm[0].y} r="10" fill={color} />
              <text x={sm[0].x} y={sm[0].y + 4} textAnchor="middle" fontSize="11" fill="white" fontWeight="bold">
                {i + 1}
              </text>
            </g>
          );
        })}

        {/* Structured-stroke tool preview (D line / S curve) */}
        {preview && preview.kind === 'line' && (
          <line x1={preview.start.x} y1={preview.start.y} x2={preview.end.x} y2={preview.end.y}
            stroke="#6366f1" strokeWidth="6" strokeLinecap="round" strokeDasharray="4 7" opacity="0.75" />
        )}
        {preview && preview.kind === 'curve' && (
          <g>
            <path d={splinePathD([preview.start, ...preview.ctrls, preview.end])} fill="none" stroke="#6366f1" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
            <line x1={preview.start.x} y1={preview.start.y} x2={preview.end.x} y2={preview.end.y} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 5" opacity="0.5" />
            <circle cx={preview.start.x} cy={preview.start.y} r="6" fill="#22c55e" />
            <circle cx={preview.end.x} cy={preview.end.y} r="6" fill="#ef4444" />
            {preview.ctrls.map((c, i) => (
              <circle key={i} cx={c.x} cy={c.y} r="5" fill="#6366f1" stroke="white" strokeWidth="2" />
            ))}
          </g>
        )}

        {/* Current in-progress stroke — shown with the same smoothing as committed strokes, so lift has no snap */}
        {current.length > 1 && (
          <path d={pathD(smoothPoints(current, 3))} fill="none" stroke="#94a3b8" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* Edit-mode handles — every skeleton point the user placed */}
        {editMode && rawStrokes.map((s, i) => {
          const color = STROKE_COLORS[i % STROKE_COLORS.length];
          const handles = getHandleIndices(s);
          return handles.map((pi, j) => (
            <circle key={`pt-${i}-${j}`} cx={s[pi].x} cy={s[pi].y} r="7" fill="white" stroke={color} strokeWidth="2.5" style={{ pointerEvents: 'all' }} />
          ));
        })}
      </svg>

      {/* Background image toolbar */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
      <div className="flex flex-wrap items-center gap-2 justify-center">
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100"
        >
          <ImageIcon className="w-4 h-4" /> {bg ? 'Change image' : 'Add trace image'}
        </button>
        {bg && (
          <>
            <button
              onClick={() => setMoveMode((m) => !m)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border ${
                moveMode
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-violet-700 border-violet-200 hover:bg-violet-50'
              }`}
            >
              <Move className="w-4 h-4" /> {moveMode ? 'Dragging image' : 'Move image'}
            </button>
            <button
              onClick={() => setAutoCenter((a) => !a)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border ${
                autoCenter
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
              }`}
            >
              <Magnet className="w-4 h-4" /> {autoCenter ? 'Centering on ink' : 'Center on ink'}
            </button>
            <button
              onClick={() => { setBg(null); setMoveMode(false); setAutoCenter(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
            >
              <X className="w-4 h-4" /> Remove
            </button>
            <button
              onClick={() => applySnap('ease')}
              disabled={!rawStrokes.length}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white border border-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Wand2 className="w-4 h-4" /> Ease
            </button>
            <button
              onClick={() => applySnap('pin')}
              disabled={!rawStrokes.length}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white border border-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Wand2 className="w-4 h-4" /> Pin
            </button>
            <button
              onClick={() => applySnap('round')}
              disabled={!rawStrokes.length}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white border border-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Wand2 className="w-4 h-4" /> Round
            </button>
            <button
              onClick={undoSnap}
              disabled={!snapHistory.length}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Undo2 className="w-4 h-4" /> Undo snap
            </button>
          </>
        )}
      </div>

      {bg && (
        <div className="flex flex-col gap-2 w-full max-w-xs px-2">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span className="w-14 shrink-0">Scale</span>
            <input
              type="range" min="0.2" max="40" step="0.1" value={bgScale}
              onChange={(e) => {
                const ns = parseFloat(e.target.value);
                // re-center on the canvas as it scales (instead of growing to a corner)
                const dh = CANVAS_H * ns;
                const dw = dh * (bg?.aspect || 1);
                setBgScale(ns);
                setBgX((CANVAS_W - dw) / 2);
                setBgY((CANVAS_H - dh) / 2);
              }}
              className="flex-1"
            />
            <span className="w-8 text-right tabular-nums">{bgScale.toFixed(2)}×</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span className="w-14 shrink-0">Opacity</span>
            <input
              type="range" min="0.1" max="1" step="0.05" value={bgOpacity}
              onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
              className="flex-1"
            />
            <span className="w-8 text-right tabular-nums">{Math.round(bgOpacity * 100)}%</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span className="w-14 shrink-0">Snap</span>
            <input
              type="range" min="0.2" max="1" step="0.05" value={snapStrength}
              onChange={(e) => setSnapStrength(parseFloat(e.target.value))}
              className="flex-1"
            />
            <span className="w-8 text-right tabular-nums">{Math.round(snapStrength * 100)}%</span>
          </label>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => { setEditMode(m => !m); gestureRef.current = null; setPreview(null); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border ${
            editMode
              ? 'bg-amber-500 text-white border-amber-500'
              : 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50'
          }`}
        >
          <Edit3 className="w-4 h-4" /> {editMode ? 'Done editing' : 'Edit points'}
        </button>
        <button
          onClick={undo}
          disabled={!rawStrokes.length}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Undo2 className="w-4 h-4" /> Undo stroke
        </button>
        <button
          onClick={clear}
          disabled={!rawStrokes.length}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" /> Clear all
        </button>
      </div>

      <p className="text-xs text-gray-500 text-center max-w-xs">
        Draw each stroke in order, in the correct direction. Lift between strokes — the number shows the stroke order.
        {bg && ' Toggle "Move image" to reposition the trace image.'}
        <br />Hold <b>D</b> = line (pen-down start, drag preview, pen-up commit). Hold <b>S</b> = curve (set start+end, then tap to add control points; release S to commit, auto-snaps to ink). Hold <b>A</b> to chain a segment onto the previous stroke. <b>Esc</b> cancels.
        <br />Toggle <b>Center on ink</b> to snap each point to the black line of your trace image as you draw.
        <br />Press <b>E</b> or tap "Edit points" to fine-tune: drag any point to move it — only that point moves, the rest stay put. Dragged points snap to ink when "Center on ink" is on.
      </p>
    </div>
  );
}