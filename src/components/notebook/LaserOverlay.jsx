import { useEffect, useRef } from 'react';

/**
 * LaserOverlay — renders a tapered laser trail (fat head, thin fading tail).
 * trailPoints: [{x, y, t}] where x/y are fractions (0-1) of container.
 * Uses rAF loop for smooth rendering.
 */
export default function LaserOverlay({ trailPoints, width, height }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const pointsRef = useRef([]);
  const FADE_MS = 500;

  useEffect(() => {
    pointsRef.current = trailPoints || [];
  }, [trailPoints]);

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
      if (visible.length === 0) { rafRef.current = requestAnimationFrame(draw); return; }

      // Draw tapered trail: each point gets a radius based on recency
      // Newest = fattest, oldest = thinnest
      const MAX_R = 7;   // ~2/3 of original 10
      const MIN_R = 1;

      for (let i = 0; i < visible.length; i++) {
        const p = visible[i];
        const age = now - p.t;
        const alpha = Math.max(0, 1 - age / FADE_MS);
        // radius tapers from fat (new) to thin (old)
        const r = MIN_R + (MAX_R - MIN_R) * alpha;
        const px = p.x * w;
        const py = p.y * h;

        // Glow (soft outer)
        const grad = ctx.createRadialGradient(px, py, 0, px, py, r * 2.5);
        grad.addColorStop(0, `rgba(255,50,50,${alpha * 0.6})`);
        grad.addColorStop(1, `rgba(255,0,0,0)`);
        ctx.beginPath();
        ctx.arc(px, py, r * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.95})`;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

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