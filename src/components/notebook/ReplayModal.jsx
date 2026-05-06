import { useRef, useEffect, useState } from 'react';
import PdfPageRenderer from './PdfPageRenderer';

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
    data?.normalized === true ||
    (samplePt && samplePt.x <= 1.5 && samplePt.y <= 1.5);

  return {
    sx: alreadyNormalized ? w : (data?.canvasWidth ? w / data.canvasWidth : w),
    sy: alreadyNormalized ? h : (data?.canvasHeight ? h / data.canvasHeight : h),
  };
}

function getWidthScale(data, w, h, sx, sy) {
  if (data?.canvasWidth && data?.canvasHeight) {
    return Math.min(w / data.canvasWidth, h / data.canvasHeight);
  }
  return 1;
}

function buildTimeline(data) {
  const strokes = (data?.history || data?.events || data?.strokes || []).filter(s => s.pts && s.pts.length >= 1);
  const timeline = [];

  for (const s of strokes) {
    if (s.tool === 'eraser_object') {
      timeline.push({ type: 'eraser_object', s, i: 1 });
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

  if (s.tool === 'highlighter') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = s.color || '#4338ca';
    ctx.lineWidth = Math.max(1, (s.size || 4) * 2.5 * widthScale);
    ctx.globalAlpha = 0.35;
  } else if (s.tool === 'eraser_object') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(1, (s.size || 4) * 6 * widthScale);
    ctx.globalAlpha = 1;
  } else if (s.tool === 'eraser_pixel') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(1, (s.size || 4) * 1.5 * widthScale);
    ctx.globalAlpha = 1;
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = s.color || '#4338ca';
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

  for (let idx = 0; idx < upTo && idx < timeline.length; idx++) {
    const { type, s } = timeline[idx];

    if (type === 'eraser_object') {
      (s.erasedStrokeIds || []).forEach(id => hiddenStrokeIds.add(id));
    }
  }

  for (let idx = 0; idx < upTo && idx < timeline.length; idx++) {
    const { type, s, i } = timeline[idx];

    if (type === 'eraser_object') continue;
    if (s.id && hiddenStrokeIds.has(s.id)) continue;

    ctx.save();
    ctx.beginPath();
    applyStrokeStyle(ctx, s, widthScale);

    if (type === 'dot') {
      const p = s.pts[0];
      ctx.moveTo(p.x * sx, p.y * sy);
      ctx.lineTo((p.x * sx) + 0.01, (p.y * sy) + 0.01);
    } else {
      ctx.moveTo(s.pts[i - 1].x * sx, s.pts[i - 1].y * sy);
      ctx.lineTo(s.pts[i].x * sx, s.pts[i].y * sy);
    }

    ctx.stroke();
    ctx.restore();
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

function drawAllStrokes(canvas, strokesData, w, h) {
  const data = typeof strokesData === 'string' ? JSON.parse(strokesData) : strokesData;
  const { sx, sy } = getScale(data, w, h);
  const widthScale = getWidthScale(data, w, h, sx, sy);
  const timeline = buildTimeline(data);
  const ctx = setupCanvas(canvas, w, h);
  renderToFrame(ctx, timeline, timeline.length, sx, sy, widthScale);
}

export default function ReplayModal({ session, assignment, onClose, pageOverride }) {
  const overlayCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const [pdfSize, setPdfSize] = useState(null);
  const [playing, setPlaying] = useState(false);
  const animRef = useRef(null);
  const [activePage, setActivePage] = useState(pageOverride || session.current_page || 1);
  const [scrubPos, setScrubPos] = useState(0);
  const [totalPts, setTotalPts] = useState(0);
  const timelineRef = useRef([]);
  const ctxRef = useRef(null);
  const scaleRef = useRef({ sx: 1, sy: 1, widthScale: 1 });

  const allPages = Object.keys(session.strokes_by_page || {}).map(Number).sort((a, b) => a - b);
  const pageKey = String(activePage);
  const strokesData = session.strokes_by_page?.[pageKey];

  useEffect(() => {
    setPdfSize(null);
    setPlaying(false);
    clearTimeout(animRef.current);
  }, [activePage]);

  useEffect(() => {
    if (!pdfSize || !overlayCanvasRef.current || !strokesData) return;

    const data = typeof strokesData === 'string' ? JSON.parse(strokesData) : strokesData;
    const { sx, sy } = getScale(data, pdfSize.w, pdfSize.h);
    const widthScale = getWidthScale(data, pdfSize.w, pdfSize.h, sx, sy);
    const tl = buildTimeline(data);

    timelineRef.current = tl;
    scaleRef.current = { sx, sy, widthScale };
    setTotalPts(tl.length);

    const ctx = setupCanvas(overlayCanvasRef.current, pdfSize.w, pdfSize.h);
    ctxRef.current = ctx;

    const pos = tl.length;
    setScrubPos(pos);
    renderToFrame(ctx, tl, pos, sx, sy, widthScale);
  }, [pdfSize, strokesData]);

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

  useEffect(() => () => clearTimeout(animRef.current), []);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="rounded-2xl flex flex-col gap-3 max-w-2xl w-full max-h-[90vh]"
        style={{ background: '#1a1a2e', border: '1px solid #4338ca', padding: 16 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between shrink-0">
          <div>
            <p className="font-black text-white">Student #{session.student_number}</p>
            <p className="text-xs text-indigo-400">Page {activePage}</p>
          </div>
          <button onClick={onClose} className="text-indigo-300 hover:text-white text-xl">✕</button>
        </div>

        {allPages.length > 1 && (
          <div className="flex gap-2 flex-wrap shrink-0">
            {allPages.map(pg => (
              <button
                key={pg}
                onClick={() => setActivePage(pg)}
                className="px-3 py-1 rounded-lg text-xs font-bold transition-all"
                style={{ background: pg === activePage ? '#9333ea' : '#4338ca', color: 'white', opacity: pg === activePage ? 1 : 0.6 }}
              >
                Pg {pg}
              </button>
            ))}
          </div>
        )}

        <div
          ref={containerRef}
          className="relative overflow-auto rounded-xl flex-1"
          style={{ background: '#fff', minHeight: 200 }}
        >
          {assignment?.pdf_url ? (
            <PdfPageRenderer
              key={activePage}
              pdfUrl={assignment.pdf_url}
              pageNumber={activePage}
              onRendered={(w, h) => setPdfSize({ w, h })}
            />
          ) : (
            <div className="flex items-center justify-center h-40 text-gray-400">No PDF</div>
          )}

          {pdfSize && (
            <canvas
              ref={overlayCanvasRef}
              style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
            />
          )}
        </div>

        {totalPts > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-indigo-400 w-6">0</span>
            <input
              type="range"
              min={0}
              max={totalPts}
              value={scrubPos}
              onChange={e => handleScrub(e.target.value)}
              disabled={playing}
              className="flex-1 accent-purple-500"
            />
            <span className="text-xs text-indigo-400 w-8 text-right">{totalPts}</span>
          </div>
        )}

        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleReplay}
            disabled={playing || !strokesData}
            className="flex-1 py-2 rounded-xl font-bold text-white disabled:opacity-50 transition-all"
            style={{ background: '#9333ea' }}
          >
            {playing ? '▶ Playing…' : '▶ Play'}
          </button>

          <button
            onClick={() => {
              clearTimeout(animRef.current);
              setPlaying(false);
              setScrubPos(0);
              if (ctxRef.current && timelineRef.current.length) {
                renderToFrame(
                  ctxRef.current,
                  timelineRef.current,
                  0,
                  scaleRef.current.sx,
                  scaleRef.current.sy,
                  scaleRef.current.widthScale
                );
              }
            }}
            disabled={playing}
            className="px-4 py-2 rounded-xl font-bold text-white disabled:opacity-50"
            style={{ background: '#4338ca' }}
          >
            ↩ Reset
          </button>
        </div>
      </div>
    </div>
  );
}