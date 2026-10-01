import { useEffect, useRef } from 'react';

// Read-only mini renderer for the new per-line dictado submission format.
// Draws each line's strokes (normalized 0-1) into a horizontal band.
export default function DictadoThumbnail({ submission, width = 120, height = 150 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = height * dpr;
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);

    // Faint guide lines so empty sheets are recognizable
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    const n = 4;
    for (let i = 0; i <= n; i++) {
      const y = (i / n) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (!submission?.strokes_data) return;
    let data;
    try {
      data = JSON.parse(submission.strokes_data);
    } catch {
      return;
    }
    const linesData = data?.lines;
    if (!linesData) return;
    const lineIds = Object.keys(linesData).map(Number).sort((a, b) => a - b);
    const bands = lineIds.length || 1;
    const bandH = height / bands;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const id of lineIds) {
      const ld = linesData[id];
      const strokes = ld?.strokes || [];
      const top = (lineIds.indexOf(id)) * bandH;
      for (const s of strokes) {
        if (!s.pts || s.pts.length < 2) continue;
        ctx.strokeStyle = s.color || '#1e293b';
        ctx.lineWidth = Math.max(0.8, (s.size || 4) * (width / 1200) * 1.5);
        ctx.beginPath();
        ctx.moveTo(s.pts[0].x * width, top + s.pts[0].y * bandH);
        for (let i = 1; i < s.pts.length; i++) {
          ctx.lineTo(s.pts[i].x * width, top + s.pts[i].y * bandH);
        }
        ctx.stroke();
      }
    }
  }, [submission, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, background: '#fff', borderRadius: 6, display: 'block' }}
    />
  );
}