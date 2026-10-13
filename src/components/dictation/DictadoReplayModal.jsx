import { useRef, useEffect, useState, useCallback } from 'react';
import LinedPaper from './LinedPaper';
import { smoothPoints } from '@/components/tracing/strokeMath';

// Large, animated replay modal for the per-line dictado submission format
// (data.lines[i].attempt.strokes + data.lines[i].trace.paths). Mirrors the
// digital-notebook replay UX: click a student thumbnail → see their work big,
// press Play to watch the ink form stroke-by-stroke.
const LINE_HEIGHT = 115; // matches the shrunk DictadoLinesCanvas
const MAX_W = 680;

function setupCanvas(canvas, w, h) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  return ctx;
}

function drawSmooth(ctx, pts) {
  if (!pts || pts.length === 0) return;
  if (pts.length === 1) {
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[0].x + 0.01, pts[0].y + 0.01);
    return;
  }
  const s = pts.length >= 3 ? smoothPoints(pts, 3) : pts;
  ctx.moveTo(s[0].x, s[0].y);
  for (let i = 0; i < s.length - 1; i++) {
    const p0 = s[i - 1] || s[i];
    const p1 = s[i];
    const p2 = s[i + 1];
    const p3 = s[i + 2] || p2;
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
      p2.x, p2.y
    );
  }
}

export default function DictadoReplayModal({ submission, studentName, lines = [], onClose }) {
  const overlayRef = useRef(null);
  const [displayW, setDisplayW] = useState(MAX_W);
  const [playing, setPlaying] = useState(false);
  const [scrubPos, setScrubPos] = useState(0);
  const [totalSegs, setTotalSegs] = useState(0);
  const animRef = useRef(null);
  const timelineRef = useRef([]);
  const ctxRef = useRef(null);
  const dimsRef = useRef({ w: MAX_W, lineIds: [], bandH: 0 });

  // Parse the per-line submission into a flat timeline of stroke segments.
  const parsed = useRef({ lineIds: [], traceByLine: {}, accByLine: {} });
  useEffect(() => {
    if (!submission?.strokes_data) { parsed.current = { lineIds: [], traceByLine: {}, accByLine: {} }; return; }
    let data;
    try { data = JSON.parse(submission.strokes_data); } catch { return; }
    const linesData = data?.lines || {};
    const lineIds = Object.keys(linesData).map(Number).sort((a, b) => a - b);
    const traceByLine = {};
    const accByLine = {};
    const tl = [];
    for (const id of lineIds) {
      const ld = linesData[id] || {};
      const strokes = ld?.attempt?.strokes || ld?.strokes || [];
      for (const s of strokes) {
        if (!s.pts || s.pts.length < 1) continue;
        if (s.pts.length === 1) { tl.push({ lineId: id, s, i: 0, type: 'dot' }); continue; }
        for (let k = 1; k < s.pts.length; k++) tl.push({ lineId: id, s, i: k, type: 'seg' });
      }
      if (ld?.trace?.paths) traceByLine[id] = ld.trace.paths;
      const accs = ld?.trace?.accuracies || [];
      accByLine[id] = ld?.trace?.accuracy ?? (accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : null);
    }
    parsed.current = { lineIds, traceByLine, accByLine };
    timelineRef.current = tl;
    setTotalSegs(tl.length);
  }, [submission?.strokes_data]);

  const lineCount = parsed.current.lineIds.length || (lines.length || 1);
  const displayH = LINE_HEIGHT * lineCount;

  // Fit width to viewport
  useEffect(() => {
    const update = () => setDisplayW(Math.min(MAX_W, window.innerWidth - 80));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Render a given frame (up to `upto` segments in the timeline).
  const renderFrame = useCallback((upto) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const { w, lineIds, bandH } = dimsRef.current;
    ctx.clearRect(0, 0, w, displayH);

    // Trace paths (red model) — always visible on the right half of each line.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const id of lineIds) {
      const paths = parsed.current.traceByLine[id];
      if (!paths) continue;
      const top = lineIds.indexOf(id) * bandH;
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = Math.max(1.2, w / 220);
      for (const letterPaths of Object.values(paths)) {
        for (const pts of letterPaths) {
          if (!pts || pts.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(w / 2 + pts[0].x * (w / 2), top + pts[0].y * bandH);
          for (let k = 1; k < pts.length; k++) ctx.lineTo(w / 2 + pts[k].x * (w / 2), top + pts[k].y * bandH);
          ctx.stroke();
        }
      }
    }

    // Attempt ink — progressively revealed up to `upto`.
    const strokePts = new Map();
    for (let idx = 0; idx < upto && idx < timelineRef.current.length; idx++) {
      const { lineId, s, i, type } = timelineRef.current[idx];
      const top = lineIds.indexOf(lineId) * bandH;
      let arr = strokePts.get(s);
      if (!arr) { arr = []; strokePts.set(s, arr); }
      if (type === 'dot') {
        arr.push({ x: s.pts[0].x * w, y: top + s.pts[0].y * bandH });
      } else if (s.pts[i - 1] && s.pts[i]) {
        if (arr.length === 0) arr.push({ x: s.pts[i - 1].x * w, y: top + s.pts[i - 1].y * bandH });
        arr.push({ x: s.pts[i].x * w, y: top + s.pts[i].y * bandH });
      }
    }
    for (const [s, pts] of strokePts) {
      if (!pts.length) continue;
      ctx.save();
      ctx.beginPath();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = s.color || '#1e293b';
      ctx.lineWidth = Math.max(1, (s.size || 4) * (w / 740));
      drawSmooth(ctx, pts);
      ctx.stroke();
      ctx.restore();
    }
  }, [displayH]);

  // Setup canvas + initial full render
  useEffect(() => {
    if (!displayW || !overlayRef.current) return;
    const lineIds = parsed.current.lineIds;
    const bandH = LINE_HEIGHT;
    dimsRef.current = { w: displayW, lineIds, bandH };
    const ctx = setupCanvas(overlayRef.current, displayW, displayH);
    ctxRef.current = ctx;
    const pos = timelineRef.current.length;
    setScrubPos(pos);
    renderFrame(pos);
  }, [displayW, displayH, renderFrame]);

  const handleScrub = (val) => {
    const pos = parseInt(val, 10);
    setScrubPos(pos);
    renderFrame(pos);
  };

  const handlePlay = () => {
    if (playing || !ctxRef.current) return;
    clearTimeout(animRef.current);
    const tl = timelineRef.current;
    let idx = scrubPos >= tl.length ? 0 : scrubPos;
    if (idx === 0) renderFrame(0);
    setPlaying(true);
    const step = () => {
      if (idx >= tl.length) { setPlaying(false); setScrubPos(tl.length); return; }
      idx += Math.min(3, tl.length - idx);
      renderFrame(idx);
      setScrubPos(idx);
      animRef.current = setTimeout(() => requestAnimationFrame(step), 8);
    };
    requestAnimationFrame(step);
  };

  const handleReset = () => {
    clearTimeout(animRef.current);
    setPlaying(false);
    setScrubPos(0);
    renderFrame(0);
  };

  useEffect(() => () => clearTimeout(animRef.current), []);

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="rounded-2xl flex flex-col gap-3 max-w-3xl w-full max-h-[92vh] bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between shrink-0 px-5 pt-4">
          <div>
            <p className="font-black text-slate-800 text-lg">{studentName || `#${submission?.student_number}`}</p>
            <p className="text-xs text-slate-400">{submission?.stroke_count || 0} strokes · {lineCount} line{lineCount === 1 ? '' : 's'}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">✕</button>
        </div>

        <div className="flex justify-center px-5 overflow-auto">
          <div className="relative rounded-xl shadow-lg shrink-0" style={{ width: displayW, height: displayH }}>
            <LinedPaper width={displayW} height={displayH} lineCount={lineCount} />
            <canvas ref={overlayRef} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 2 }} />
          </div>
        </div>

        {totalSegs > 0 && (
          <div className="flex items-center gap-2 px-5 shrink-0">
            <span className="text-xs text-slate-400 w-6">0</span>
            <input
              type="range" min={0} max={totalSegs} value={scrubPos}
              onChange={(e) => handleScrub(e.target.value)} disabled={playing}
              className="flex-1 accent-indigo-500"
            />
            <span className="text-xs text-slate-400 w-8 text-right">{totalSegs}</span>
          </div>
        )}

        <div className="flex gap-2 px-5 pb-4 shrink-0">
          <button
            onClick={handlePlay}
            disabled={playing || !submission?.strokes_data}
            className="flex-1 py-2.5 rounded-xl font-bold text-white disabled:opacity-50 bg-indigo-600 hover:bg-indigo-700"
          >
            {playing ? '▶ Playing…' : '▶ Play from start'}
          </button>
          <button
            onClick={handleReset}
            disabled={playing}
            className="px-5 py-2.5 rounded-xl font-bold text-slate-600 disabled:opacity-50 border border-slate-200 hover:bg-slate-50"
          >
            ↩ Reset
          </button>
        </div>
      </div>
    </div>
  );
}