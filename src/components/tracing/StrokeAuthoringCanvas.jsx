import { useRef, useState, useEffect } from 'react';
import { Undo2, Trash2, Image as ImageIcon, Move, X, Wand2 } from 'lucide-react';
import { CANVAS_W, CANVAS_H, smoothPoints, pointAtLength } from './strokeMath';

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

export default function StrokeAuthoringCanvas({ rawStrokes, setRawStrokes }) {
  const [current, setCurrent] = useState([]);
  const svgRef = useRef(null);
  const currentRef = useRef([]);
  const drawingRef = useRef(false);

  // Traceable background image — a temporary tracing aid, never saved with strokes.
  const [bg, setBg] = useState(null); // { url, aspect }
  const [bgScale, setBgScale] = useState(1);
  const [bgX, setBgX] = useState(0);
  const [bgY, setBgY] = useState(0);
  const [bgOpacity, setBgOpacity] = useState(0.4);
  const [moveMode, setMoveMode] = useState(false);
  const moveStartRef = useRef(null);
  const fileRef = useRef(null);

  // Latest bg scale/position in refs so the scale slider can anchor to the
  // bottom-left corner without going stale across rapid drag events.
  const bgScaleRef = useRef(bgScale);
  const bgYRef = useRef(bgY);
  useEffect(() => { bgScaleRef.current = bgScale; }, [bgScale]);
  useEffect(() => { bgYRef.current = bgY; }, [bgY]);

  const [snapStrength, setSnapStrength] = useState(0.6);

  // Revoke object URLs when the image is replaced/removed/unmounted.
  useEffect(() => {
    if (!bg) return;
    return () => URL.revokeObjectURL(bg.url);
  }, [bg]);

  const getPos = (e) => {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * CANVAS_W) / rect.width,
      y: ((e.clientY - rect.top) * CANVAS_H) / rect.height,
    };
  };

  const finishStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (currentRef.current.length > 1) {
      const stroke = currentRef.current;
      setRawStrokes((prev) => [...prev, stroke]);
    }
    currentRef.current = [];
    setCurrent([]);
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
    currentRef.current = [pos];
    setCurrent([pos]);
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
    if (!drawingRef.current) return;
    e.preventDefault();
    const pos = getPos(e);
    const last = currentRef.current[currentRef.current.length - 1];
    if (last && Math.hypot(pos.x - last.x, pos.y - last.y) < 2) return;
    currentRef.current = [...currentRef.current, pos];
    setCurrent(currentRef.current);
  };

  const up = (e) => {
    e.preventDefault();
    try { svgRef.current.releasePointerCapture(e.pointerId); } catch {}
    moveStartRef.current = null;
    if (drawingRef.current) finishStroke();
  };

  const loadImage = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setBg({ url, aspect: img.naturalWidth / img.naturalHeight || 1, img });
      setBgScale(1);
      setBgX(0);
      setBgY(0);
    };
    img.src = url;
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
  const snapToLetter = () => {
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
      const l = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
      return l < 120 ? (120 - l) / 120 : 0;
    };
    const L = 30; // half-width of the perpendicular cross-section sample
    const LOCAL = 12; // local half-width: ignore joined strokes beyond this
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
      return sw > 0 ? st / sw : chosen.st / chosen.sw;
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
      // grow straight runs: consecutive points whose tangent stays within THETA
      const segId = new Array(n).fill(-1);
      const segs = [];
      let i = 0;
      while (i < n) {
        if (!tan[i]) { i++; continue; }
        let j = i + 1;
        while (j < n && tan[j] && turn(tan[i], tan[j]) < THETA) j++;
        if (j - i >= MIN_LINE) {
          const id = segs.length;
          segs.push({ start: i, end: j - 1 });
          for (let k = i; k < j; k++) segId[k] = id;
        }
        i = j;
      }
      return stroke.map((p, idx) => {
        const t = tan[idx];
        if (!t) return p;
        const nx = -t.y, ny = t.x;
        if (segId[idx] < 0) {
          // curve: center each point on its local ink (perpendicular only)
          const off = centerOffset(p, nx, ny);
          const dx = off * nx * snapStrength, dy = off * ny * snapStrength;
          return { x: cl(p.x + dx, CANVAS_W), y: cl(p.y + dy, CANVAS_H) };
        }
        // straight run: fit one line at the centered offset so it can't bow
        const seg = segs[segId[idx]];
        const sa = stroke[seg.start], sb = stroke[seg.end];
        const ll = Math.hypot(sb.x - sa.x, sb.y - sa.y);
        if (ll < 1e-6) {
          const off = centerOffset(p, nx, ny);
          return { x: cl(p.x + off * nx * snapStrength, CANVAS_W), y: cl(p.y + off * ny * snapStrength, CANVAS_H) };
        }
        const lnx = -(sb.y - sa.y) / ll, lny = (sb.x - sa.x) / ll; // line normal
        const perp = (q) => q.x * lnx + q.y * lny;
        // stem center = median ink-center coordinate over the run's middle
        // (skip the ends, which sit closest to junctions and would bias it)
        const centers = [];
        for (let k = seg.start + 1; k < seg.end; k++) {
          centers.push(perp(stroke[k]) + centerOffset(stroke[k], lnx, lny));
        }
        if (!centers.length) centers.push(perp(p) + centerOffset(p, lnx, lny));
        centers.sort((a, b) => a - b);
        const S = centers[Math.floor(centers.length / 2)];
        const shift = (S - perp(p)) * snapStrength;
        return { x: cl(p.x + shift * lnx, CANVAS_W), y: cl(p.y + shift * lny, CANVAS_H) };
      });
    });
    setRawStrokes(newStrokes);
  };

  const undo = () => setRawStrokes((prev) => prev.slice(0, -1));
  const clear = () => setRawStrokes([]);

  const dispH = CANVAS_H * bgScale;
  const dispW = dispH * (bg?.aspect || 1);

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        className="w-72 max-w-full rounded-2xl border-4 border-indigo-300 bg-white touch-none aspect-[4/5] shadow-sm"
        style={{ cursor: moveMode && bg ? 'move' : 'crosshair', touchAction: 'none' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {/* Traceable background image */}
        {bg && (
          <image href={bg.url} x={bgX} y={bgY} width={dispW} height={dispH} opacity={bgOpacity} />
        )}

        {/* Writing lines: T=0.10, M=0.42, B=0.72, D=0.92 */}
        <line x1="0" y1={0.1 * CANVAS_H} x2={CANVAS_W} y2={0.1 * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={0.42 * CANVAS_H} x2={CANVAS_W} y2={0.42 * CANVAS_H} stroke="#93c5fd" strokeWidth="1" strokeDasharray="8 6" opacity="0.7" />
        <line x1="0" y1={0.72 * CANVAS_H} x2={CANVAS_W} y2={0.72 * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={0.92 * CANVAS_H} x2={CANVAS_W} y2={0.92 * CANVAS_H} stroke="#fca5a5" strokeWidth="1" strokeDasharray="4 6" opacity="0.6" />

        {/* Smoothed strokes with direction arrows */}
        {rawStrokes.map((s, i) => {
          const sm = smoothPoints(s, 3);
          const color = STROKE_COLORS[i % STROKE_COLORS.length];
          return (
            <g key={i}>
              <path d={pathD(sm)} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
              <Arrow pos={pointAtLength(sm, 0.4)} color={color} />
              <Arrow pos={pointAtLength(sm, 0.75)} color={color} />
              <circle cx={sm[0].x} cy={sm[0].y} r="10" fill={color} />
              <text x={sm[0].x} y={sm[0].y + 4} textAnchor="middle" fontSize="11" fill="white" fontWeight="bold">
                {i + 1}
              </text>
            </g>
          );
        })}

        {/* Current in-progress stroke (raw) */}
        {current.length > 1 && (
          <path d={pathD(current)} fill="none" stroke="#94a3b8" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        )}
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
              onClick={() => { setBg(null); setMoveMode(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
            >
              <X className="w-4 h-4" /> Remove
            </button>
            <button
              onClick={snapToLetter}
              disabled={!rawStrokes.length}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white border border-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Wand2 className="w-4 h-4" /> Snap to letter
            </button>
          </>
        )}
      </div>

      {bg && (
        <div className="flex flex-col gap-2 w-full max-w-xs px-2">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span className="w-14 shrink-0">Scale</span>
            <input
              type="range" min="0.2" max="3" step="0.01" value={bgScale}
              onChange={(e) => {
                const ns = parseFloat(e.target.value);
                // grow from the bottom-left: keep the bottom edge pinned
                const bottomY = bgYRef.current + CANVAS_H * bgScaleRef.current;
                setBgScale(ns);
                setBgY(bottomY - CANVAS_H * ns);
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
      </p>
    </div>
  );
}