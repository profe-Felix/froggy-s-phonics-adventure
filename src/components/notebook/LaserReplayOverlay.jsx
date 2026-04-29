import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * LaserReplayOverlay — replays laser trail synced to an audio element.
 * laserData: [{x_pct, y_pct, t}] where t is ms offset from recording start
 * audioRef: ref to <audio> element being played
 * containerWidth/containerHeight: size of the page container in px
 */
export default function LaserReplayOverlay({ laserData = [], audioRef, containerWidth, containerHeight }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const TRAIL_WINDOW_MS = 400;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioRef?.current) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const currentMs = (audioRef.current.currentTime || 0) * 1000;

    // Find points within the trail window
    const visible = laserData.filter(p => p.t <= currentMs && p.t >= currentMs - TRAIL_WINDOW_MS);

    for (let i = 0; i < visible.length; i++) {
      const p = visible[i];
      const age = currentMs - p.t;
      const alpha = Math.max(0, 1 - age / TRAIL_WINDOW_MS);
      const px = p.x_pct * canvas.offsetWidth;
      const py = p.y_pct * canvas.offsetHeight;

      // Glow
      const grad = ctx.createRadialGradient(px, py, 0, px, py, 18);
      grad.addColorStop(0, `rgba(255,80,80,${alpha * 0.85})`);
      grad.addColorStop(1, `rgba(255,0,0,0)`);
      ctx.beginPath();
      ctx.arc(px, py, 18, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Core
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
      setIsPlaying(true);
      rafRef.current = requestAnimationFrame(draw);
    };
    const onPause = () => {
      setIsPlaying(false);
      cancelAnimationFrame(rafRef.current);
    };
    const onEnded = () => {
      setIsPlaying(false);
      cancelAnimationFrame(rafRef.current);
      // Clear canvas
      const canvas = canvasRef.current;
      if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      cancelAnimationFrame(rafRef.current);
    };
  }, [audioRef, draw]);

  // Sync canvas size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = containerWidth || canvas.offsetWidth;
    const h = containerHeight || canvas.offsetHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
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