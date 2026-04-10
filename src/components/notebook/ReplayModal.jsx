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
  // old saves: canvasWidth present, coords are absolute pixels
  // new saves: no canvasWidth, coords are normalized 0-1
  return {
    sx: data?.canvasWidth ? w / data.canvasWidth : w,
    sy: data?.canvasHeight ? h / data.canvasHeight : h,
  };
}

function buildTimeline(data) {
  const strokes = (data?.strokes || []).filter(s => s.pts && s.pts.length >= 2);
  const timeline = [];
  for (const s of strokes) {
    for (let i = 1; i < s.pts.length; i++) timeline.push({ s, i });
  }
  return timeline;
}

function renderToFrame(ctx, timeline, upTo, sx, sy) {
  const dpr = window.devicePixelRatio || 1;
  // clear
  const c = ctx.canvas;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.restore();
  for (let idx = 0; idx < upTo && idx < timeline.length; idx++) {
    const { s, i } = timeline[idx];
    ctx.beginPath();
    ctx.strokeStyle = s.color || '#4338ca';
    ctx.lineWidth = Math.max(1, s.size || 4);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = s.tool === 'highlighter' ? 0.35 : 1;
    ctx.moveTo(s.pts[i - 1].x * sx, s.pts[i - 1].y * sy);
    ctx.lineTo(s.pts[i].x * sx, s.pts[i].y * sy);
    ctx.stroke();
  }
}

function drawAllStrokes(canvas, strokesData, w, h) {
  const data = typeof strokesData === 'string' ? JSON.parse(strokesData) : strokesData;
  const { sx, sy } = getScale(data, w, h);
  const timeline = buildTimeline(data);
  const ctx = setupCanvas(canvas, w, h);
  renderToFrame(ctx, timeline, timeline.length, sx, sy);
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
  const scaleRef = useRef({ sx: 1, sy: 1 });

  const allPages = Object.keys(session.strokes_by_page || {}).map(Number).sort((a, b) => a - b);
  const pageKey = String(activePage);
  const strokesData = session.strokes_by_page?.[pageKey];

  // Reset pdf size when page changes so PdfPageRenderer re-triggers onRendered
  useEffect(() => {
    setPdfSize(null);
    setPlaying(false);
    clearTimeout(animRef.current);
  }, [activePage]);

  // Draw all strokes statically once PDF is sized
  useEffect(() => {
    if (!pdfSize || !overlayCanvasRef.current || !strokesData) return;
    const data = typeof strokesData === 'string' ? JSON.parse(strokesData) : strokesData;
    const { sx, sy } = getScale(data, pdfSize.w, pdfSize.h);
    const tl = buildTimeline(data);
    timelineRef.current = tl;
    scaleRef.current = { sx, sy };
    setTotalPts(tl.length);
    const ctx = setupCanvas(overlayCanvasRef.current, pdfSize.w, pdfSize.h);
    ctxRef.current = ctx;
    const pos = tl.length;
    setScrubPos(pos);
    renderToFrame(ctx, tl, pos, sx, sy);
  }, [pdfSize, strokesData]);

  const handleScrub = (val) => {
    const pos = parseInt(val);
    setScrubPos(pos);
    if (ctxRef.current && timelineRef.current.length > 0) {
      const { sx, sy } = scaleRef.current;
      renderToFrame(ctxRef.current, timelineRef.current, pos, sx, sy);
    }
  };

  const handleReplay = () => {
    if (playing || !ctxRef.current || timelineRef.current.length === 0) return;
    clearTimeout(animRef.current);
    const tl = timelineRef.current;
    const { sx, sy } = scaleRef.current;
    let idx = scrubPos >= tl.length ? 0 : scrubPos;
    if (idx === 0) renderToFrame(ctxRef.current, tl, 0, sx, sy);
    setPlaying(true);
    const step = () => {
      if (idx >= tl.length) { setPlaying(false); setScrubPos(tl.length); return; }
      const batch = Math.min(3, tl.length - idx);
      for (let b = 0; b < batch; b++) {
        const { s, i } = tl[idx + b];
        ctxRef.current.beginPath();
        ctxRef.current.strokeStyle = s.color || '#4338ca';
        ctxRef.current.lineWidth = Math.max(1, s.size || 4);
        ctxRef.current.lineCap = 'round';
        ctxRef.current.lineJoin = 'round';
        ctxRef.current.globalAlpha = s.tool === 'highlighter' ? 0.35 : 1;
        ctxRef.current.moveTo(s.pts[i - 1].x * sx, s.pts[i - 1].y * sy);
        ctxRef.current.lineTo(s.pts[i].x * sx, s.pts[i].y * sy);
        ctxRef.current.stroke();
      }
      idx += batch;
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

        {/* Page switcher */}
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

        {/* PDF + stroke overlay */}
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

        {/* Scrub slider */}
        {totalPts > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-indigo-400 w-6">0</span>
            <input
              type="range" min={0} max={totalPts} value={scrubPos}
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
            onClick={() => { clearTimeout(animRef.current); setPlaying(false); setScrubPos(0); if (ctxRef.current && timelineRef.current.length) renderToFrame(ctxRef.current, timelineRef.current, 0, scaleRef.current.sx, scaleRef.current.sy); }}
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