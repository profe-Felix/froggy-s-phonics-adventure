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

function scalePoint(p, sx, sy) { return { x: p.x * sx, y: p.y * sy }; }

function drawAllStrokes(canvas, strokesData, w, h) {
  const data = typeof strokesData === 'string' ? JSON.parse(strokesData) : strokesData;
  const strokes = data?.strokes || [];
  const sx = data?.canvasWidth ? w / data.canvasWidth : 1;
  const sy = data?.canvasHeight ? h / data.canvasHeight : 1;
  const ctx = setupCanvas(canvas, w, h);
  for (const s of strokes) {
    if (!s.pts || s.pts.length < 2) continue;
    ctx.beginPath();
    ctx.strokeStyle = s.color || '#4338ca';
    ctx.lineWidth = Math.max(1, (s.size || 4));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = s.tool === 'highlighter' ? 0.35 : 1;
    const p0 = scalePoint(s.pts[0], sx, sy);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < s.pts.length; i++) {
      const p = scalePoint(s.pts[i], sx, sy);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
}

export default function ReplayModal({ session, assignment, onClose, pageOverride }) {
  const overlayCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const [pdfSize, setPdfSize] = useState(null);
  const [playing, setPlaying] = useState(false);
  const animRef = useRef(null);
  const [activePage, setActivePage] = useState(pageOverride || session.current_page || 1);

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
    drawAllStrokes(overlayCanvasRef.current, strokesData, pdfSize.w, pdfSize.h);
  }, [pdfSize, strokesData]);

  const handleReplay = () => {
    if (playing || !overlayCanvasRef.current || !strokesData || !pdfSize) return;
    const data = typeof strokesData === 'string' ? JSON.parse(strokesData) : strokesData;
    const strokes = (data?.strokes || []).filter(s => s.pts && s.pts.length >= 2);

    const ctx = setupCanvas(overlayCanvasRef.current, pdfSize.w, pdfSize.h);
    const sx = data?.canvasWidth ? pdfSize.w / data.canvasWidth : 1;
    const sy = data?.canvasHeight ? pdfSize.h / data.canvasHeight : 1;
    setPlaying(true);

    // Build timeline: each entry is one segment to draw
    const timeline = [];
    for (const s of strokes) {
      for (let i = 1; i < s.pts.length; i++) {
        timeline.push({ s, i });
      }
    }

    let idx = 0;
    const step = () => {
      if (idx >= timeline.length) { setPlaying(false); return; }
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
      idx++;
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

        <button
          onClick={handleReplay}
          disabled={playing || !strokesData}
          className="py-2 rounded-xl font-bold text-white shrink-0 disabled:opacity-50 transition-all"
          style={{ background: '#9333ea' }}
        >
          {playing ? '▶ Playing…' : '▶ Replay Strokes'}
        </button>
      </div>
    </div>
  );
}