import { useEffect, useRef } from 'react';

/**
 * LaserOverlay — renders the fading laser trail on a canvas overlay.
 * trailPoints: [{x, y, t}] where x/y are fractions (0-1) of container.
 * Uses rAF loop for smooth rendering. Matches LaserReplayOverlay approach.
 */
export default function LaserOverlay({ trailPoints, width, height }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const pointsRef = useRef([]);
  const FADE_MS = 600;

  // Keep pointsRef in sync without causing re-renders
  useEffect(() => {
    pointsRef.current = trailPoints || [];
  }, [trailPoints]);

  // Start rAF loop once on mount
  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, w, h);

      const now = Date.now();
      const points = pointsRef.current;
      const visible = points.filter(p => now - p.t < FADE_MS);

      for (let i = 0; i < visible.length; i++) {
        const p = visible[i];
        const age = now - p.t;
        const alpha = Math.max(0, 1 - age / FADE_MS);
        const px = p.x * w;
        const py = p.y * h;

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

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Sync canvas internal resolution to its CSS size (no DPR scaling — keep simple)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width || canvas.offsetWidth;
    canvas.height = height || canvas.offsetHeight;
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
      }}
    />
  );
}