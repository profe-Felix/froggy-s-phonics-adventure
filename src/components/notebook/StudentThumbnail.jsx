import { useRef, useEffect, useState } from 'react';
import PdfPageRenderer from './PdfPageRenderer';

function drawStrokes(canvas, strokesData, w, h) {
  if (!canvas || !strokesData) return;
  const data = typeof strokesData === 'string' ? JSON.parse(strokesData) : strokesData;
  const strokes = data?.strokes || [];
  const sx = data?.canvasWidth ? w / data.canvasWidth : 1;
  const sy = data?.canvasHeight ? h / data.canvasHeight : 1;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  for (const s of strokes) {
    if (!s.pts || s.pts.length < 2) continue;
    ctx.beginPath();
    ctx.strokeStyle = s.color || '#4338ca';
    ctx.lineWidth = Math.max(1, (s.size || 4) * 0.6);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = s.tool === 'highlighter' ? 0.35 : 1;
    ctx.moveTo(s.pts[0].x * sx, s.pts[0].y * sy);
    for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x * sx, s.pts[i].y * sy);
    ctx.stroke();
  }
}

export default function StudentThumbnail({ session, assignment, onOpen }) {
  const overlayRef = useRef(null);
  const [pdfSize, setPdfSize] = useState(null);
  const page = session.current_page || 1;
  const strokesData = session.strokes_by_page?.[String(page)];
  const hasWork = session.strokes_by_page && Object.keys(session.strokes_by_page).length > 0;

  useEffect(() => {
    if (pdfSize && overlayRef.current) {
      drawStrokes(overlayRef.current, strokesData, pdfSize.w, pdfSize.h);
    }
  }, [pdfSize, strokesData]);

  return (
    <div
      className="rounded-2xl overflow-hidden cursor-pointer flex flex-col"
      style={{ background: '#1a1a2e', border: '1px solid #4338ca' }}
      onClick={() => onOpen(session, page)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 shrink-0" style={{ background: '#0f0f1a' }}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-white text-sm" style={{ background: '#4338ca' }}>
          {session.student_number}
        </div>
        <span className="text-xs text-indigo-300 font-bold">Pg {page}</span>
        {!hasWork && <span className="text-xs text-indigo-500 italic">No work</span>}
      </div>

      {/* Thumbnail */}
      <div style={{ position: 'relative', background: '#fff', width: '100%' }}>
        {assignment?.pdf_url ? (
          <>
            <PdfPageRenderer
              pdfUrl={assignment.pdf_url}
              pageNumber={page}
              onRendered={(w, h) => setPdfSize({ w, h })}
            />
            {pdfSize && (
              <canvas
                ref={overlayRef}
                style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
              />
            )}
          </>
        ) : (
          <div className="h-20 flex items-center justify-center text-gray-400 text-xs">No PDF</div>
        )}
      </div>

      {/* Page dots */}
      {hasWork && (
        <div className="flex flex-wrap gap-1 px-2 py-1.5">
          {Object.keys(session.strokes_by_page || {}).map(pg => (
            <button
              key={pg}
              onClick={e => { e.stopPropagation(); onOpen(session, parseInt(pg)); }}
              className="px-1.5 py-0.5 rounded text-xs font-bold text-white"
              style={{ background: parseInt(pg) === page ? '#9333ea' : '#4338ca' }}
            >
              {pg}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}