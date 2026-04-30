import { useEffect, useRef, useCallback } from 'react';

/**
 * LaserReplayOverlay — replays laser trail synced to an audio element.
 * laserData: [{x_pct, y_pct, t}] where t is ms offset from recording start.
 * Draws using offsetWidth/offsetHeight so coordinates always match CSS layout.
 */
export default function LaserReplayOverlay({ laserData = [], audioRef, containerWidth, containerHeight }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const TRAIL_WINDOW_MS = 400;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioRef?.current) return;

    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    const currentMs = (audioRef.current.currentTime || 0) * 1000;
    const visible = laserData.filter(p => p.t <= currentMs && p.t >= currentMs - TRAIL_WINDOW_MS);

    for (let i = 0; i < visible.length; i++) {
      const p = visible[i];
      const age = currentMs - p.t;
      const alpha = Math.max(0, 1 - age / TRAIL_WINDOW_MS);
      const px = p.x_pct * w;
      const py = p.y_pct * h;

      const grad = ctx.createRadialGradient(px, py, 0, px, py, 18);
      grad.addColorStop(0, `rgba(255,80,80,${alpha * 0.85})`);
      grad.addColorStop(1, `rgba(255,0,0,0)`);
      ctx.beginPath();
      ctx.arc(px, py, 18, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fill();
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [laserData, audioRef]);

  useEffect(() => {
    const audio = audioRef?.current;
    if (!audio) return;

    const onPlay = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    };
    const onPause = () => cancelAnimationFrame(rafRef.current);
    const onEnded = () => {
      cancelAnimationFrame(rafRef.current);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    // If already playing when mounted, start immediately
    if (!audio.paused) {
      rafRef.current = requestAnimationFrame(draw);
    }

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      cancelAnimationFrame(rafRef.current);
    };
  }, [audioRef, draw]);

  // Sync canvas internal resolution to its actual rendered CSS size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sync = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    sync();
    const obs = new ResizeObserver(sync);
    obs.observe(canvas);
    return () => obs.disconnect();
  }, [containerWidth, containerHeight]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        width: '100%',
        height: '100%',
        zIndex: 25,
      }}
    />
  );
}