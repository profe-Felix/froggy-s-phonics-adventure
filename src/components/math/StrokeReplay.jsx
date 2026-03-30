import React, { useRef, useEffect, useState, useMemo } from 'react';

const CANVAS_W = 280;
const CANVAS_H = 320;

function drawLines(ctx) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#f8fbff';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  [0, 1].forEach(set => {
    const top  = 40  + set * 140;
    const mid  = top + 50;
    const base = top + 100;
    const desc = top + 130;
    ctx.strokeStyle = '#aac4e0';
    ctx.lineWidth = 1;
    [top, desc].forEach(y => { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke(); });
    // dashed midline
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(CANVAS_W, mid); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, base); ctx.lineTo(CANVAS_W, base); ctx.stroke();
  });
}

function replayStrokes(ctx, strokes, upToPointIndex) {
  let count = 0;
  ctx.strokeStyle = '#4338ca';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of strokes) {
    if (stroke.length === 0) continue;
    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);
    for (let i = 1; i < stroke.length; i++) {
      count++;
      if (count > upToPointIndex) return;
      const prev = stroke[i - 1];
      const curr = stroke[i];
      const midX = (prev.x + curr.x) / 2;
      const midY = (prev.y + curr.y) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(midX, midY);
    }
  }
}

export default function StrokeReplay({ strokesData }) {
  const canvasRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const animRef = useRef(null);

  const strokes = useMemo(() => {
    try { return JSON.parse(strokesData); } catch { return null; }
  }, [strokesData]);

  const totalPoints = useMemo(() => {
    if (!strokes) return 0;
    return strokes.reduce((sum, s) => sum + Math.max(0, s.length - 1), 0);
  }, [strokes]);

  // Draw static final image on mount
  useEffect(() => {
    if (!canvasRef.current || !strokes) return;
    const ctx = canvasRef.current.getContext('2d');
    drawLines(ctx);
    replayStrokes(ctx, strokes, Infinity);
  }, [strokes]);

  const play = () => {
    if (!canvasRef.current || !strokes || playing) return;
    setPlaying(true);
    let point = 0;
    const step = () => {
      const ctx = canvasRef.current.getContext('2d');
      drawLines(ctx);
      replayStrokes(ctx, strokes, point);
      point++;
      if (point <= totalPoints) {
        animRef.current = requestAnimationFrame(step);
      } else {
        setPlaying(false);
      }
    };
    animRef.current = requestAnimationFrame(step);
  };

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  if (!strokes) return null;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative rounded-xl overflow-hidden border border-gray-200">
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} style={{ width: '100%', display: 'block' }} />
      </div>
      <button
        onClick={play}
        disabled={playing}
        className="px-5 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-indigo-700 transition-colors"
      >
        {playing ? '▶ Playing…' : '▶ Replay Strokes'}
      </button>
    </div>
  );
}