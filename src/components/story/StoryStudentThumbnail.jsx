import { useRef, useEffect, useState } from 'react';
import PageBackground from './StoryPageBackground';

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
  const alreadyNormalized = data?.normalized === true || (samplePt && samplePt.x <= 1.5 && samplePt.y <= 1.5);
  const sx = alreadyNormalized ? w : (data?.canvasWidth ? w / data.canvasWidth : w);
  const sy = alreadyNormalized ? h : (data?.canvasHeight ? h / data.canvasHeight : h);

  for (const s of strokes) {
    if (!s.pts || s.pts.length < 2) continue;
    ctx.save();
    ctx.beginPath();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (s.tool === 'highlighter') {
      ctx.strokeStyle = s.color || '#4338ca'; ctx.lineWidth = Math.max(1, (s.size || 4) * 1.6); ctx.globalAlpha = 0.35;
    } else if (s.tool === 'eraser_object' || s.tool === 'eraser_pixel') {
      ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1, (s.size || 4) * 1.5); ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = s.color || '#1e3a8a'; ctx.lineWidth = Math.max(1, (s.size || 4) * 0.7); ctx.globalAlpha = 1;
    }
    ctx.moveTo(s.pts[0].x * sx, s.pts[0].y * sy);
    for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x * sx, s.pts[i].y * sy);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

const THUMB_W = 120;
const THUMB_H = 156; // ~1.3 ratio

export default function StoryStudentThumbnail({ story, pageIdx, onClick }) {
  const canvasRef = useRef(null);
  const page = story.pages?.[pageIdx];
  const strokesData = page?.strokes_data;

  useEffect(() => {
    if (canvasRef.current) {
      drawStrokes(canvasRef.current, strokesData, THUMB_W, THUMB_H);
    }
  }, [strokesData, pageIdx]);

  const hasMics = (() => {
    try { return page?.mics && JSON.parse(page.mics).length > 0; }
    catch { return false; }
  })();

  return (
    <div
      className="rounded-xl overflow-hidden cursor-pointer flex flex-col"
      style={{ background: '#1a1a2e', border: '1px solid #7c3aed', width: THUMB_W + 32 }}
      onClick={onClick}
    >
      <div className="flex items-center justify-between px-2 py-1 shrink-0" style={{ background: '#0f0f1a' }}>
        <span className="text-violet-300 text-xs font-bold">#{story.student_number}</span>
        <span className="text-violet-500 text-xs">p{pageIdx + 1}</span>
        {hasMics && <span className="text-xs">🎙</span>}
      </div>
      <div style={{ position: 'relative', width: THUMB_W, height: THUMB_H, background: 'white', margin: '0 auto' }}>
        {page && <PageBackground template={page.template} width={THUMB_W} height={THUMB_H} />}
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      </div>
    </div>
  );
}