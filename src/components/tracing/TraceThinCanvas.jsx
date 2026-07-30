import { useRef, useState, useEffect } from 'react';
import { Undo2, Trash2, Image as ImageIcon, Move, X, PenLine } from 'lucide-react';
import { CANVAS_W, CANVAS_H, smoothPoints, pointAtLength } from './strokeMath';

// "Trace thin" authoring mode — image-based.
// You load a black-letter trace image. The thick black ink is SKELETONIZED
// (Zhang-Suen thinning erodes the ink evenly from its outer and inner walls
// down to a 1px-wide centerline) and that thin line is drawn over the letter.
// You then trace over it; your pen is magnetically held to the nearest skeleton
// point, so you only steer the direction. The colored trace (with direction
// arrows + stroke numbers) becomes the saved waypoints.
const STROKE_COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6'];
const SNAP_CORRIDOR = 36; // px — pen is held to the thin line within this distance

const pathD = (pts) =>
  pts.length < 2 ? '' : pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

function Arrow({ pos, color }) {
  const size = 7;
  const a1 = pos.angle + Math.PI - 0.45;
  const a2 = pos.angle + Math.PI + 0.45;
  const p1 = `${(pos.x + size * Math.cos(a1)).toFixed(1)},${(pos.y + size * Math.sin(a1)).toFixed(1)}`;
  const p2 = `${(pos.x + size * Math.cos(a2)).toFixed(1)},${(pos.y + size * Math.sin(a2)).toFixed(1)}`;
  return <polygon points={`${pos.x.toFixed(1)},${pos.y.toFixed(1)} ${p1} ${p2}`} fill={color} />;
}


export default function TraceThinCanvas({ rawStrokes, setRawStrokes, bg, bgScale, bgX, bgY, setBgScale, setBgX, setBgY, setBg, loadImage }) {
  // Committed strokes are owned by the parent (rawStrokes); only the in-progress
  // stroke is local. Using the parent state directly avoids the two-way sync
  // loop (the old traced↔rawStrokes effects) that flickered while drawing.
  const traced = rawStrokes;
  const setTraced = setRawStrokes;
  const [current, setCurrent] = useState([]);

  // Image display opacity + drag mode are local UI state (the image itself and
  // its transform live in the parent so they persist across the Snap↔Thin toggle).
  const [bgOpacity, setBgOpacity] = useState(0.35);
  const [moveMode, setMoveMode] = useState(false);
  // Trace view: hide the photo and show ONLY the thinned centerline for the
  // current letter (computed on demand, not in the background).
  const [traceView, setTraceView] = useState(false);
  const moveStartRef = useRef(null);
  const fileRef = useRef(null);

  const svgRef = useRef(null);
  const currentRef = useRef([]);
  const drawingRef = useRef(false);

  // Skeleton of the image ink (in canvas coords) + its rendered thin-line image.
  const skeletonRef = useRef(null);
  const [skeletonUrl, setSkeletonUrl] = useState(null);

  // Rasterize the trace image at its current transform, build the centerline
  // from ink cross-section centroids, and render it. Only runs in Trace view —
  // no work in the background otherwise.
  useEffect(() => {
    if (!traceView || !bg?.img) { skeletonRef.current = null; setSkeletonUrl(null); return; }
    const W = Math.round(CANVAS_W), H = Math.round(CANVAS_H);
    const dh = CANVAS_H * bgScale;
    const dw = dh * (bg.aspect || 1);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const cx = c.getContext('2d');
    cx.fillStyle = '#ffffff';
    cx.fillRect(0, 0, W, H);
    cx.drawImage(bg.img, bgX, bgY, dw, dh);
    let imgData;
    try { imgData = cx.getImageData(0, 0, W, H); } catch { return; }
    const src = imgData.data;
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const o = i * 4;
      // Only truly BLACK ink counts (all RGB channels low) — pink/colored marks
      // in the image are ignored so the thin line follows only the black letter.
      const r = src[o], g = src[o + 1], b = src[o + 2];
      mask[i] = r < 120 && g < 120 && b < 120 ? 1 : 0;
    }
    // Centerline via cross-section centroids: the midpoint of each ink run in
    // every row and column is a point on the stroke's true midline. This yields
    // a single, centered, smooth line per stroke — no Zhang-Suen spurs at sharp
    // corners (an A apex) and no jogs at junctions (legs crossing a crossbar),
    // because every point is the center of its own ink cross-section.
    const pts = [];
    for (let y = 0; y < H; y++) {
      let s = -1;
      for (let x = 0; x <= W; x++) {
        const ink = x < W && mask[y * W + x] === 1;
        if (ink && s < 0) s = x;
        else if (!ink && s >= 0) { pts.push({ x: (s + x - 1) / 2, y }); s = -1; }
      }
    }
    for (let x = 0; x < W; x++) {
      let s = -1;
      for (let y = 0; y <= H; y++) {
        const ink = y < H && mask[y * W + x] === 1;
        if (ink && s < 0) s = y;
        else if (!ink && s >= 0) { pts.push({ x, y: (s + y - 1) / 2 }); s = -1; }
      }
    }
    skeletonRef.current = { pts };
    const sc = document.createElement('canvas');
    sc.width = W; sc.height = H;
    const scx = sc.getContext('2d');
    scx.clearRect(0, 0, W, H);
    scx.fillStyle = '#1e293b';
    scx.beginPath();
    for (const p of pts) { scx.moveTo(p.x + 1.2, p.y); scx.arc(p.x, p.y, 1.2, 0, Math.PI * 2); }
    scx.fill();
    setSkeletonUrl(sc.toDataURL());
  }, [bg, bgScale, bgX, bgY, traceView]);

  const lineTop = 0.10, lineMid = 0.367, lineBase = 0.633, lineDesc = 0.90;

  const getPos = (e) => {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * CANVAS_W) / rect.width,
      y: ((e.clientY - rect.top) * CANVAS_H) / rect.height,
    };
  };

  // Hold the pen to the thin line: snap to the nearest skeleton pixel when the
  // pen is within the corridor. Outside it, draw freely (so you can lift and
  // start a fresh stroke elsewhere without teleporting).
  const snapToSkeleton = (pos) => {
    const s = skeletonRef.current;
    if (!s || !s.pts.length) return pos;
    let best = null, bd = Infinity;
    for (const p of s.pts) {
      const d = (pos.x - p.x) * (pos.x - p.x) + (pos.y - p.y) * (pos.y - p.y);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best || bd > SNAP_CORRIDOR * SNAP_CORRIDOR) return pos;
    return { x: best.x, y: best.y };
  };

  const down = (e) => {
    e.preventDefault();
    if (e.button != null && e.button !== 0) return;
    try { svgRef.current.setPointerCapture(e.pointerId); } catch {}
    const pos = getPos(e);
    if (moveMode && bg) {
      moveStartRef.current = { x: pos.x, y: pos.y, bgX, bgY };
      return;
    }
    const start = snapToSkeleton(pos);
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
    if (!drawingRef.current) return;
    e.preventDefault();
    const pos = snapToSkeleton(getPos(e));
    const last = currentRef.current[currentRef.current.length - 1];
    if (last && Math.hypot(pos.x - last.x, pos.y - last.y) < 2) return;
    currentRef.current = [...currentRef.current, pos];
    setCurrent(currentRef.current);
  };

  const up = (e) => {
    e.preventDefault();
    try { svgRef.current.releasePointerCapture(e.pointerId); } catch {}
    moveStartRef.current = null;
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (currentRef.current.length > 1) {
      const stroke = currentRef.current.slice();
      setTraced((t) => [...t, stroke]);
    }
    currentRef.current = [];
    setCurrent([]);
  };

  const onPickImage = (e) => { loadImage(e.target.files?.[0]); e.target.value = ''; };
  const onDrop = (e) => { e.preventDefault(); loadImage(e.dataTransfer.files?.[0]); };

  const undo = () => setTraced((t) => t.slice(0, -1));
  const clear = () => setTraced([]);

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
        {/* Trace image (faint) — hidden once you enter Trace view so only the
            thin centerline shows (no faded photo bleeding through as a "double"). */}
        {bg && !traceView && (
          <image href={bg.url} x={bgX} y={bgY} width={dispW} height={dispH} opacity={bgOpacity} />
        )}

        {/* Writing guide lines */}
        <line x1="0" y1={lineTop * CANVAS_H} x2={CANVAS_W} y2={lineTop * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={lineMid * CANVAS_H} x2={CANVAS_W} y2={lineMid * CANVAS_H} stroke="#93c5fd" strokeWidth="1" strokeDasharray="8 6" opacity="0.7" />
        <line x1="0" y1={lineBase * CANVAS_H} x2={CANVAS_W} y2={lineBase * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={lineDesc * CANVAS_H} x2={CANVAS_W} y2={lineDesc * CANVAS_H} stroke="#fca5a5" strokeWidth="1.5" strokeDasharray="6 6" opacity="0.85" />

        {/* Inferred thin centerline (the skeletonized image ink) */}
        {skeletonUrl && (
          <image href={skeletonUrl} x={0} y={0} width={CANVAS_W} height={CANVAS_H} opacity={0.85} />
        )}

        {/* Traced strokes — clean, directed waypoints */}
        {traced.map((s, i) => {
          const sm = smoothPoints(s, 3);
          const color = STROKE_COLORS[i % STROKE_COLORS.length];
          return (
            <g key={'t' + i}>
              <path d={pathD(sm)} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
              <Arrow pos={pointAtLength(sm, 0.4)} color={color} />
              <Arrow pos={pointAtLength(sm, 0.75)} color={color} />
              <circle cx={sm[0].x} cy={sm[0].y} r="10" fill={color} />
              <text x={sm[0].x} y={sm[0].y + 4} textAnchor="middle" fontSize="11" fill="white" fontWeight="bold">{i + 1}</text>
            </g>
          );
        })}

        {/* Current in-progress stroke */}
        {current.length > 1 && (
          <path d={pathD(smoothPoints(current, 3))} fill="none" stroke={STROKE_COLORS[traced.length % STROKE_COLORS.length]} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        )}
      </svg>

      {/* Image toolbar */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
      <div className="flex flex-wrap items-center gap-2 justify-center">
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100"
        >
          <ImageIcon className="w-4 h-4" /> {bg ? 'Change image' : 'Add letter image'}
        </button>
        {bg && (
          <>
            <button
              onClick={() => setTraceView((t) => !t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border ${traceView ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'}`}
            >
              <PenLine className="w-4 h-4" /> {traceView ? 'Show image' : 'Trace'}
            </button>
            <button
              onClick={() => setMoveMode((m) => !m)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border ${moveMode ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-violet-700 border-violet-200 hover:bg-violet-50'}`}
            >
              <Move className="w-4 h-4" /> {moveMode ? 'Dragging image' : 'Move image'}
            </button>
            <button
              onClick={() => { setBg(null); setMoveMode(false); setSkeletonUrl(null); skeletonRef.current = null; }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
            >
              <X className="w-4 h-4" /> Remove
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
            <span className="w-14 shrink-0">Photo</span>
            <input type="range" min="0" max="1" step="0.05" value={bgOpacity} onChange={(e) => setBgOpacity(parseFloat(e.target.value))} className="flex-1" />
            <span className="w-8 text-right tabular-nums">{Math.round(bgOpacity * 100)}%</span>
          </label>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={undo}
          disabled={!traced.length}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Undo2 className="w-4 h-4" /> Undo stroke
        </button>
        <button
          onClick={clear}
          disabled={!traced.length}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" /> Clear traced
        </button>
      </div>

      <p className="text-xs text-gray-500 text-center max-w-xs">
        {bg
          ? (traceView
            ? 'Thinned centerline only — trace over it; your pen is held to the line, so just steer the direction. The colored trace is what gets saved.'
            : 'Move/scale the image to align it to the guide lines, then press Trace to thin the black letter into a centerline you can follow.')
          : 'Add a black-letter image, then press Trace to thin its black ink into a centerline you can trace.'}
      </p>
    </div>
  );
}