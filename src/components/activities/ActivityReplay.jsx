import { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause } from 'lucide-react';

// Canvas replay of a student's Elkonin drag. Reads the recorded gesture
// timeline (placements_data) and redraws the 8 square touching boxes + chips
// over time so the teacher sees each chip actually RISE from its home slot into
// its box at the pace the student dragged, synced to the voice recording.
const BOX_COUNT_DEFAULT = 8;
const colX = (i, n) => (i + 0.5) / n;
const ASPECT = '3.5 / 1';

function interpPath(path, time) {
  if (!path || !path.length) return { x: 0, y: 0 };
  if (time <= path[0].t) return path[0];
  if (time >= path[path.length - 1].t) return path[path.length - 1];
  for (let i = 1; i < path.length; i++) {
    if (path[i].t >= time) {
      const a = path[i - 1], b = path[i];
      const span = (b.t - a.t) || 1;
      const f = (time - a.t) / span;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  return path[path.length - 1];
}

function drawChip(ctx, x, y, r) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#4DA6FF'; ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.14); ctx.strokeStyle = '#000'; ctx.stroke();
}

// px geometry from a canvas width (mirrors the student activity exactly).
function layoutFor(w, h) {
  const s = w / BOX_COUNT_DEFAULT;
  const pad = s * 0.10;
  const boxY0 = pad;
  const boxY1 = boxY0 + s;
  const boxCenterY = boxY0 + s / 2;
  const chipR = s * 0.34;
  const homeY = boxY1 + s * 0.30 + chipR;
  return {
    s, boxY0, boxY1, boxCenterY, chipR, homeY,
    boxCenterYNorm: boxCenterY / h,
    homeYNorm: homeY / h,
  };
}

export default function ActivityReplay({ rec }) {
  const boxCount = rec.tile_count || BOX_COUNT_DEFAULT;
  const gestures = useMemo(() => {
    try { return JSON.parse(rec.placements_data || '[]'); } catch { return []; }
  }, [rec.placements_data]);
  const hasTimeline = Array.isArray(gestures) && gestures.length > 0;
  const maxT = hasTimeline ? Math.max(...gestures.map((g) => g.t1 || 0)) : 0;

  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [duration, setDuration] = useState(maxT + 600);
  const canvasRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const layoutRef = useRef(null);
  const tickRafRef = useRef(0);
  const tRef = useRef(0);
  const startWallRef = useRef(0);
  const audioRef = useRef(null);

  function resize() {
    const canvas = canvasRef.current; if (!canvas) return;
    const parent = canvas.parentElement;
    const w = parent.clientWidth, h = parent.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    sizeRef.current = { w, h, dpr };
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    layoutRef.current = layoutFor(w, h);
    draw();
  }

  function chipStateAt(time) {
    const L = layoutRef.current;
    const placed = Array(boxCount).fill(false);
    const boxCY = L ? L.boxCenterYNorm : 0.2625;
    const homeYn = L ? L.homeYNorm : 0.761;
    const pos = Array.from({ length: boxCount }, (_, i) => ({ x: colX(i, boxCount), y: homeYn, moving: false }));
    for (const g of gestures) {
      if (time < g.t0) break;
      if (time >= g.t1) {
        placed[g.chip] = !!g.placedAfter;
        pos[g.chip] = { x: colX(g.chip, boxCount), y: g.placedAfter ? boxCY : homeYn, moving: false };
      } else {
        const pt = interpPath(g.path, time);
        pos[g.chip] = { x: pt.x, y: pt.y, moving: true };
      }
    }
    return { placed, pos };
  }

  function draw() {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h, dpr } = sizeRef.current;
    const L = layoutRef.current;
    if (!w || !h || !L) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = Math.max(2, L.s * 0.05);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(0, L.boxY0, L.s * boxCount, L.s);
    for (let i = 1; i < boxCount; i++) {
      const lx = i * L.s;
      ctx.beginPath(); ctx.moveTo(lx, L.boxY0); ctx.lineTo(lx, L.boxY1); ctx.stroke();
    }
    let state;
    if (hasTimeline) {
      state = chipStateAt(tRef.current);
    } else {
      const pc = rec.placed_count || 0;
      state = {
        placed: Array.from({ length: boxCount }, (_, i) => i < pc),
        pos: Array.from({ length: boxCount }, (_, i) => ({ x: colX(i, boxCount), y: i < pc ? L.boxCenterY : L.homeY, moving: false })),
      };
    }
    for (let i = 0; i < boxCount; i++) {
      const s = state.pos[i];
      drawChip(ctx, s.x * w, s.y * h, L.chipR);
    }
  }

  // resize + initial draw
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ro = new ResizeObserver(() => { resize(); });
    ro.observe(canvas.parentElement);
    resize();
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // playback time advance + draw
  useEffect(() => {
    if (!playing) return;
    startWallRef.current = performance.now() - tRef.current;
    if (audioRef.current && rec.audio_url) {
      try { audioRef.current.currentTime = tRef.current / 1000; void audioRef.current.play(); } catch { /* best-effort */ }
    }
    const frame = () => {
      const now = performance.now() - startWallRef.current;
      tRef.current = now; setT(now);
      draw();
      if (now >= duration) {
        setPlaying(false);
        cancelAnimationFrame(tickRafRef.current);
        if (audioRef.current) audioRef.current.pause();
        tRef.current = duration; setT(duration);
        return;
      }
      tickRafRef.current = requestAnimationFrame(frame);
    };
    tickRafRef.current = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(tickRafRef.current); if (audioRef.current) audioRef.current.pause(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  function onLoadedMeta() {
    if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
      setDuration((d) => Math.max(d, audioRef.current.duration * 1000));
    }
  }

  function togglePlay() {
    if (playing) { setPlaying(false); cancelAnimationFrame(tickRafRef.current); if (audioRef.current) audioRef.current.pause(); return; }
    if (tRef.current >= duration) { tRef.current = 0; setT(0); }
    setPlaying(true);
  }

  function onScrub(e) {
    setPlaying(false);
    cancelAnimationFrame(tickRafRef.current);
    if (audioRef.current) audioRef.current.pause();
    const v = Number(e.target.value);
    tRef.current = v; setT(v);
    if (audioRef.current) { try { audioRef.current.currentTime = v / 1000; } catch { /* best-effort */ } }
    draw();
  }

  return (
    <div className="mt-2">
      {rec.audio_url && (
        <audio ref={audioRef} src={rec.audio_url} onLoadedMetadata={onLoadedMeta} onEnded={() => setPlaying(false)} className="hidden" />
      )}
      <div className="w-full" style={{ aspectRatio: ASPECT }}>
        <canvas ref={canvasRef} className="w-full h-full" style={{ touchAction: 'none' }} />
      </div>
      {hasTimeline ? (
        <div className="flex items-center gap-2 mt-2">
          <button onClick={togglePlay} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-bold flex items-center gap-1.5">
            {playing ? <><Pause className="w-4 h-4" /> Pausa</> : <><Play className="w-4 h-4" /> Reproducir</>}
          </button>
          <span className="text-xs text-slate-500 tabular-nums">{(t / 1000).toFixed(1)}s / {(duration / 1000).toFixed(1)}s</span>
          <input type="range" min={0} max={duration} value={Math.min(t, duration)} onChange={onScrub} className="flex-1" />
        </div>
      ) : (
        rec.audio_url && <audio controls src={rec.audio_url} className="mt-2 w-full" />
      )}
    </div>
  );
}