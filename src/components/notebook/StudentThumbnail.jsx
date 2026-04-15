import { useRef, useEffect, useState } from 'react';
import PdfPageRenderer from './PdfPageRenderer';

function drawStrokes(canvas, strokesData, w, h) {
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  if (!strokesData) return;

  const data = typeof strokesData === 'string' ? JSON.parse(strokesData) : strokesData;
  const strokes = data?.strokes || [];

  const sx = data?.canvasWidth ? w / data.canvasWidth : w;
  const sy = data?.canvasHeight ? h / data.canvasHeight : h;

  // 🔥 key fix: only scale width for OLD saves
  const widthScale = data?.canvasWidth ? Math.min(sx, sy) : 1;

  for (const s of strokes) {
    if (!s.pts || s.pts.length < 2) continue;

    ctx.save();
    ctx.beginPath();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 🔥 match ReplayModal logic
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

    ctx.moveTo(s.pts[0].x * sx, s.pts[0].y * sy);
    for (let i = 1; i < s.pts.length; i++) {
      ctx.lineTo(s.pts[i].x * sx, s.pts[i].y * sy);
    }

    ctx.stroke();
    ctx.restore();
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

export default function StudentThumbnail({ session, assignment, viewPage, onOpen }) {
  const overlayRef = useRef(null);
  const [pdfSize, setPdfSize] = useState(null);
  const displayPage = viewPage || session.current_page || 1;
  const studentPage = session.current_page || 1;
  const strokesData = session.strokes_by_page?.[String(displayPage)];
  const hasWork = session.strokes_by_page && Object.keys(session.strokes_by_page).length > 0;
  const voiceNoteUrl = session.voice_notes_by_page?.[String(displayPage)];
  const recordingUrl = session.recordings_by_page?.[String(displayPage)];

  // Reset pdfSize when page changes so PdfPageRenderer re-renders
  useEffect(() => { setPdfSize(null); }, [displayPage]);

  // Always call drawStrokes when pdfSize or strokesData changes — clears canvas even if no strokes
  useEffect(() => {
    if (pdfSize && overlayRef.current) {
      drawStrokes(overlayRef.current, strokesData, pdfSize.w, pdfSize.h);
    }
  }, [pdfSize, strokesData]);

  return (
    <div
      className="rounded-2xl overflow-hidden cursor-pointer flex flex-col"
      style={{ background: '#1a1a2e', border: '1px solid #4338ca' }}
      onClick={() => onOpen(session, displayPage)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 shrink-0" style={{ background: '#0f0f1a' }}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-white text-sm" style={{ background: '#4338ca' }}>
          {session.student_number}
        </div>
        <div className="flex items-center gap-1">
          {viewPage && displayPage !== studentPage && (
            <span className="text-xs text-yellow-400" title={`Student is on pg ${studentPage}`}>✦{studentPage}</span>
          )}
          <span className="text-xs text-indigo-300 font-bold">Pg {displayPage}</span>
        </div>
        {!hasWork && <span className="text-xs text-indigo-500 italic">No work</span>}
      </div>

      {/* Thumbnail */}
      <div style={{ position: 'relative', background: '#fff', width: '100%' }}>
        {assignment?.pdf_url ? (
          <>
            <PdfPageRenderer
              pdfUrl={assignment.pdf_url}
              pageNumber={displayPage}
              onRendered={(w, h) => setPdfSize({ w, h })}
            />
            {/* Overlay canvas always rendered so it can be cleared */}
            <canvas
              ref={overlayRef}
              style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
            />
          </>
        ) : (
          <div className="h-20 flex items-center justify-center text-gray-400 text-xs">No PDF</div>
        )}
      </div>

      {/* Voice note player */}
      {voiceNoteUrl && (
        <div className="px-2 py-1" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <span className="text-xs text-purple-300">🎙</span>
            <audio controls src={voiceNoteUrl} className="w-full h-7" style={{ minWidth: 0 }} />
          </div>
        </div>
      )}

      {/* Video recording player */}
      {recordingUrl && (
        <div className="px-2 py-1" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1 mb-1">
            <span className="text-xs text-green-300">🎥 Recording</span>
          </div>
          <video controls src={recordingUrl} className="w-full rounded" style={{ maxHeight: 80 }} />
        </div>
      )}

      {/* Page dots */}
      {hasWork && (
        <div className="flex flex-wrap gap-1 px-2 py-1.5">
          {Object.keys(session.strokes_by_page || {}).map(pg => (
            <button
              key={pg}
              onClick={e => { e.stopPropagation(); onOpen(session, parseInt(pg)); }}
              className="px-1.5 py-0.5 rounded text-xs font-bold text-white"
              style={{ background: parseInt(pg) === displayPage ? '#9333ea' : '#4338ca' }}
            >
              {pg}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}