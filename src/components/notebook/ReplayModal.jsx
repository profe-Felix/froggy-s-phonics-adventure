import { useRef, useEffect, useState } from 'react';
import PdfPageRenderer from './PdfPageRenderer';

function drawAllStrokes(canvas, strokesData) {
  const data = typeof strokesData === 'string' ? JSON.parse(strokesData) : strokesData;
  const strokes = data?.strokes || [];
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(dpr, dpr);
  for (const s of strokes) {
    if (!s.pts || s.pts.length < 2) continue;
    ctx.beginPath();
    ctx.strokeStyle = s.color || '#4338ca';
    ctx.lineWidth = Math.max(1, (s.size || 4));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = s.tool === 'highlighter' ? 0.35 : 1;
    ctx.moveTo(s.pts[0].x, s.pts[0].y);
    for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x, s.pts[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

export default function ReplayModal({ session, assignment, onClose }) {
  const overlayCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const [pdfSize, setPdfSize] = useState(null);
  const [playing, setPlaying] = useState(false);
  const animRef = useRef(null);

  const pageKey = String(session.current_page || 1);
  const strokesData = session.strokes_by_page?.[pageKey];

  // Draw all strokes statically once PDF is sized
  useEffect(() => {
    if (!pdfSize || !overlayCanvasRef.current || !strokesData) return;
    const c = overlayCanvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    c.width = pdfSize.w * dpr;
    c.height = pdfSize.h * dpr;
    c.style.width = pdfSize.w + 'px';
    c.style.height = pdfSize.h + 'px';
    drawAllStrokes(c, strokesData);
  }, [pdfSize, strokesData]);

  const handleReplay = () => {
    if (playing || !overlayCanvasRef.current || !strokesData || !pdfSize) return;
    const data = typeof strokesData === 'string' ? JSON.parse(strokesData) : strokesData;
    const strokes = data?.strokes || [];

    // Build flat list of points with stroke metadata
    const timeline = [];
    for (const s of strokes) {
      if (!s.pts || s.pts.length < 2) continue;
      for (let i = 0; i < s.pts.length; i++) {
        timeline.push({ stroke: s, ptIdx: i });
      }
    }

    const c = overlayCanvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const ctx = c.getContext('2d');

    // Clear
    ctx.clearRect(0, 0, c.width, c.height);

    setPlaying(true);
    let i = 0;

    const step = () => {
      if (i >= timeline.length) { setPlaying(false); return; }

      const { stroke: s, ptIdx } = timeline[i];

      if (ptIdx === 0) {
        // Begin new stroke
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = s.color || '#4338ca';
        ctx.lineWidth = Math.max(1, s.size || 4) * dpr;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = s.tool === 'highlighter' ? 0.35 : 1;
        ctx.scale(dpr, dpr);
        ctx.moveTo(s.pts[0].x, s.pts[0].y);
        ctx.restore();
      } else {
        // Continue stroke
        const prev = s.pts[ptIdx - 1];
        const curr = s.pts[ptIdx];
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = s.color || '#4338ca';
        ctx.lineWidth = Math.max(1, s.size || 4);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = s.tool === 'highlighter' ? 0.35 : 1;
        ctx.scale(dpr, dpr);
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.stroke();
        ctx.restore();
      }

      i++;
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
            <p className="font-black text-white">Replay — Student #{session.student_number}</p>
            <p className="text-xs text-indigo-400">Page {session.current_page}</p>
          </div>
          <button onClick={onClose} className="text-indigo-300 hover:text-white text-xl">✕</button>
        </div>

        {/* PDF + stroke overlay */}
        <div
          ref={containerRef}
          className="relative overflow-auto rounded-xl flex-1"
          style={{ background: '#fff', minHeight: 200 }}
        >
          {assignment?.pdf_url ? (
            <PdfPageRenderer
              pdfUrl={assignment.pdf_url}
              pageNumber={session.current_page || 1}
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