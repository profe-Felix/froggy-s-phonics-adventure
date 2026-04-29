import { useEffect, useRef } from 'react';

/**
 * LaserOverlay — renders the fading laser trail on a canvas overlay.
 * Accepts trailPoints: [{x, y, t}] where x/y are fractions (0-1) of container size.
 * Renders imperatively on a canvas for performance.
 */
export default function LaserOverlay({ trailPoints, width, height, style = {} }) {
  const canvasRef = useRef(null);
  const FADE_MS = 600;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!trailPoints || trailPoints.length === 0) return;

    const now = Date.now();
    const visible = trailPoints.filter(p => now - p.t < FADE_MS);
    if (visible.length === 0) return;

    // Draw trail segments with fading alpha
    for (let i = 0; i < visible.length; i++) {
      const p = visible[i];
      const age = now - p.t;
      const alpha = Math.max(0, 1 - age / FADE_MS);
      const px = p.x * canvas.width;
      const py = p.y * canvas.height;

      // Outer glow
      const grad = ctx.createRadialGradient(px, py, 0, px, py, 16);
      grad.addColorStop(0, `rgba(255,50,50,${alpha * 0.8})`);
      grad.addColorStop(1, `rgba(255,0,0,0)`);
      ctx.beginPath();
      ctx.arc(px, py, 16, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Core dot
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fill();
    }
  }, [trailPoints]);

  // Resize canvas when dimensions change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = (width || canvas.offsetWidth) * dpr;
    canvas.height = (height || canvas.offsetHeight) * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        width: width ? `${width}px` : '100%',
        height: height ? `${height}px` : '100%',
        zIndex: 20,
        ...style,
      }}
    />
  );
}