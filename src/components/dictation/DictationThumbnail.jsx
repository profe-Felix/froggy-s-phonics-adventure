import { useRef, useEffect, useState } from 'react';
import LinedPaper from './LinedPaper';

const LINE_COUNT = 6;
const THUMB_W = 200;
const PAGE_ASPECT = (140 * LINE_COUNT) / 740;

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
  const samplePt = strokes?.[0]?.pts?.[0];
  const alreadyNormalized =
    data?.normalized === true || (samplePt && samplePt.x <= 1.5 && samplePt.y <= 1.5);
  const sx = alreadyNormalized ? w : data?.canvasWidth ? w / data.canvasWidth : w;
  const sy = alreadyNormalized ? h : data?.canvasHeight ? h / data.canvasHeight : h;
  const widthScale = data?.canvasWidth && data?.canvasHeight ? Math.min(w / data.canvasWidth, h / data.canvasHeight) : 1;

  for (const s of strokes) {
    if (!s.pts || s.pts.length < 2) continue;
    if (s.tool === 'eraser_object' || s.tool === 'eraser_pixel') continue;
    ctx.save();
    ctx.beginPath();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = s.color || '#1e293b';
    ctx.lineWidth = Math.max(1, (s.size || 4) * widthScale);
    ctx.globalAlpha = 1;
    ctx.moveTo(s.pts[0].x * sx, s.pts[0].y * sy);
    for (let i = 1; i < s.pts.length; i++) {
      ctx.lineTo(s.pts[i].x * sx, s.pts[i].y * sy);
    }
    ctx.stroke();
    ctx.restore();
  }
}

export default function DictationThumbnail({ submission, studentNumber, onOpen }) {
  const canvasRef = useRef(null);
  const thumbH = THUMB_W * PAGE_ASPECT;
  const hasWork = submission && (submission.stroke_count || 0) > 0;

  useEffect(() => {
    if (canvasRef.current && submission?.strokes_data) {
      drawStrokes(canvasRef.current, submission.strokes_data, THUMB_W, thumbH);
    }
  }, [submission?.strokes_data, thumbH]);

  return (
    <button
      onClick={() => onOpen?.(submission)}
      className="rounded-2xl overflow-hidden flex flex-col border-2 border-slate-200 hover:border-indigo-400 transition-all hover:shadow-lg bg-white"
    >
      <div className="flex items-center justify-between px-2 py-1.5 bg-slate-50 border-b border-slate-200">
        <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-white text-sm bg-indigo-500">
          {studentNumber}
        </div>
        {hasWork ? (
          <span className="text-xs font-bold text-green-600">✓ {submission.stroke_count} strokes</span>
        ) : (
          <span className="text-xs text-slate-400 italic">No work yet</span>
        )}
      </div>
      <div className="relative" style={{ width: THUMB_W, height: thumbH }}>
        <LinedPaper width={THUMB_W} height={thumbH} lineCount={LINE_COUNT} />
        {hasWork && (
          <canvas
            ref={canvasRef}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 2 }}
          />
        )}
      </div>
    </button>
  );
}