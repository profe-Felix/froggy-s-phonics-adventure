import { useRef, useEffect, useState } from 'react';
import LinedPaper from './LinedPaper';

const LINE_HEIGHT = 140;
const LINE_COUNT = 6;
const PAGE_ASPECT = (LINE_HEIGHT * LINE_COUNT) / 740; // height/width

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

function getScale(data, w, h) {
  const samplePt = data?.strokes?.[0]?.pts?.[0];
  const alreadyNormalized =
    data?.normalized === true || (samplePt && samplePt.x <= 1.5 && samplePt.y <= 1.5);
  return {
    sx: alreadyNormalized ? w : data?.canvasWidth ? w / data.canvasWidth : w,
    sy: alreadyNormalized ? h : data?.canvasHeight ? h / data.canvasHeight : h,
  };
}

function getWidthScale(data, w, h, sx, sy) {
  if (data?.canvasWidth && data?.canvasHeight) {
    return Math.min(w / data.canvasWidth, h / data.canvasHeight);
  }
  return 1;
}

function buildTimeline(data) {
  const strokes = (data?.history || data?.events || data?.strokes || []).filter(
    (s) => s.pts && s.pts.length >= 1
  );
  const timeline = [];
  for (const s of strokes) {
    if (s.tool === 'clear_page') {
      timeline.push({ type: 'clear_page', s, i: 0 });
      continue;
    }
    if (s.tool === 'eraser_object') {
      timeline.push({ type: 'eraser_object', s, i: 1 });
      continue;
    }
    if (s.tool === 'eraser_pixel') {
      timeline.push({ type: 'eraser_pixel', s, i: 0 });
      continue;
    }
    if (s.pts.length === 1) {
      timeline.push({ type: 'dot', s, i: 0 });
      continue;
    }
    for (let i = 1; i < s.pts.length; i++) {
      timeline.push({ type: 'segment', s, i });
    }
  }
  return timeline;
}

function applyStrokeStyle(ctx, s, widthScale) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (s.tool === 'eraser_object') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(1, (s.size || 4) * 6 * widthScale);
    ctx.globalAlpha = 1;
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = s.color || '#1e293b';
    ctx.lineWidth = Math.max(1, (s.size || 4) * widthScale);
    ctx.globalAlpha = 1;
  }
}

function renderToFrame(ctx, timeline, upTo, sx, sy, widthScale = 1) {
  const c = ctx.canvas;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.restore();

  const hiddenStrokeIds = new Set();
  let lastClearIndex = -1;

  for (let idx = 0; idx < upTo && idx < timeline.length; idx++) {
    const { type, s } = timeline[idx];
    if (type === 'clear_page') {
      lastClearIndex = idx;
      hiddenStrokeIds.clear();
      continue;
    }
    if (type === 'eraser_object') {
      (s.erasedStrokeIds || []).forEach((id) => hiddenStrokeIds.add(id));
    }
  }

  for (let idx = 0; idx < upTo && idx < timeline.length; idx++) {
    if (idx <= lastClearIndex) continue;
    const { type, s, i } = timeline[idx];
    if (type === 'clear_page' || type === 'eraser_object') continue;
    if (s.id && hiddenStrokeIds.has(s.id)) continue;

    ctx.save();
    ctx.beginPath();
    applyStrokeStyle(ctx, s, widthScale);

    if (type === 'dot') {
      const p = s.pts[0];
      ctx.moveTo(p.x * sx, p.y * sy);
      ctx.lineTo(p.x * sx + 0.01, p.y * sy + 0.01);
    } else if (s.pts[i - 1] && s.pts[i]) {
      ctx.moveTo(s.pts[i - 1].x * sx, s.pts[i - 1].y * sy);
      ctx.lineTo(s.pts[i].x * sx, s.pts[i].y * sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

export default function DictationReplay({ submission, onClose }) {
  const overlayRef = useRef(null);
  const [displayW, setDisplayW] = useState(600);
  const [playing, setPlaying] = useState(false);
  const [scrubPos, setScrubPos] = useState(0);
  const [totalPts, setTotalPts] = useState(0);
  const animRef = useRef(null);
  const timelineRef = useRef([]);
  const ctxRef = useRef(null);
  const scaleRef = useRef({ sx: 1, sy: 1, widthScale: 1 });

  const displayH = displayW * PAGE_ASPECT;

  // Fit display width to viewport
  useEffect(() => {
    const update = () => setDisplayW(Math.min(600, window.innerWidth - 64));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Parse strokes and build timeline
  useEffect(() => {
    if (!displayW || !overlayRef.current || !submission?.strokes_data) return;
    const data = JSON.parse(submission.strokes_data);
    const { sx, sy } = getScale(data, displayW, displayH);
    const widthScale = getWidthScale(data, displayW, displayH, sx, sy);
    const tl = buildTimeline(data);

    timelineRef.current = tl;
    scaleRef.current = { sx, sy, widthScale };
    setTotalPts(tl.length);

    const ctx = setupCanvas(overlayRef.current, displayW, displayH);
    ctxRef.current = ctx;

    const pos = tl.length;
    setScrubPos(pos);
    setPlaying(false);
    renderToFrame(ctx, tl, pos, sx, sy, widthScale);
  }, [displayW, submission?.strokes_data]);

  const handleScrub = (val) => {
    const pos = parseInt(val, 10);
    setScrubPos(pos);
    if (ctxRef.current && timelineRef.current.length > 0) {
      const { sx, sy, widthScale } = scaleRef.current;
      renderToFrame(ctxRef.current, timelineRef.current, pos, sx, sy, widthScale);
    }
  };

  const handleReplay = () => {
    if (playing || !ctxRef.current || timelineRef.current.length === 0) return;
    clearTimeout(animRef.current);
    const tl = timelineRef.current;
    const { sx, sy, widthScale } = scaleRef.current;
    let idx = scrubPos >= tl.length ? 0 : scrubPos;
    if (idx === 0) renderToFrame(ctxRef.current, tl, 0, sx, sy, widthScale);
    setPlaying(true);

    const step = () => {
      if (idx >= tl.length) {
        setPlaying(false);
        setScrubPos(tl.length);
        return;
      }
      const batch = Math.min(3, tl.length - idx);
      idx += batch;
      renderToFrame(ctxRef.current, tl, idx, sx, sy, widthScale);
      setScrubPos(idx);
      animRef.current = setTimeout(() => requestAnimationFrame(step), 8);
    };
    requestAnimationFrame(step);
  };

  const handleReset = () => {
    clearTimeout(animRef.current);
    setPlaying(false);
    setScrubPos(0);
    if (ctxRef.current && timelineRef.current.length) {
      renderToFrame(ctxRef.current, timelineRef.current, 0, scaleRef.current.sx, scaleRef.current.sy, scaleRef.current.widthScale);
    }
  };

  useEffect(() => () => clearTimeout(animRef.current), []);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="rounded-2xl flex flex-col gap-3 max-w-2xl w-full max-h-[90vh] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between shrink-0 px-4 pt-4">
          <div>
            <p className="font-black text-slate-800 text-lg">Student #{submission.student_number}</p>
            <p className="text-xs text-slate-400">
              {submission.stroke_count || 0} strokes
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl">✕</button>
        </div>

        <div className="flex justify-center px-4 overflow-auto">
          <div className="relative rounded-xl shadow-lg" style={{ width: displayW, height: displayH }}>
            <LinedPaper width={displayW} height={displayH} lineCount={LINE_COUNT} />
            <canvas
              ref={overlayRef}
              style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 2 }}
            />
          </div>
        </div>

        {totalPts > 0 && (
          <div className="flex items-center gap-2 px-4 shrink-0">
            <span className="text-xs text-slate-400 w-6">0</span>
            <input
              type="range"
              min={0}
              max={totalPts}
              value={scrubPos}
              onChange={(e) => handleScrub(e.target.value)}
              disabled={playing}
              className="flex-1 accent-indigo-500"
            />
            <span className="text-xs text-slate-400 w-8 text-right">{totalPts}</span>
          </div>
        )}

        <div className="flex gap-2 px-4 pb-4 shrink-0">
          <button
            onClick={handleReplay}
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