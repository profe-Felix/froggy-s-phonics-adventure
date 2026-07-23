import { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause } from 'lucide-react';
import { PALETTE, paletteFill } from '@/lib/activities/palette';

// Canvas replay for the phoneme-manipulation activity. Reads the recorded
// gesture timeline (placements_data object: {palette, gestures, boxCount,
// finalPlaced}) and redraws the square boxes + colored tray + placed chips over
// time, so the teacher sees each chip clone/drop/move/remove at the pace the
// student dragged, in its color, synced to the voice recording.
const MIN_BOXES = 2, MAX_BOXES = 8, DEFAULT_BOXES = 4;
const colX = (i, n) => (i + 0.5) / n;
const trayXNorm = (c, n) => (c + 1) / (n + 1);

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

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

function drawChip(ctx, x, y, r, fill) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.14); ctx.strokeStyle = '#000'; ctx.stroke();
}

function layoutFor(w, h, n) {
  const s = w / n;
  const pad = s * 0.10;
  const boxY0 = pad;
  const boxY1 = pad + s;
  const boxCenterY = pad + s / 2;
  const chipR = s * 0.34;
  const trayY = boxY1 + s * 0.30 + chipR;
  return { s, boxY0, boxY1, boxCenterY, chipR, trayY, n };
}

export default function ManipulationReplay({ rec }) {
  const data = useMemo(() => {
    try {
      const d = JSON.parse(rec.placements_data || '{}');
      return d && typeof d === 'object' && Array.isArray(d.gestures) ? d : { gestures: [], boxCount: rec.tile_count, finalPlaced: [] };
    } catch { return { gestures: [], boxCount: rec.tile_count, finalPlaced: [] }; }
  }, [rec.placements_data]);
  const gestures = data.gestures || [];
  const boxCount = clamp(data.boxCount || rec.tile_count || DEFAULT_BOXES, MIN_BOXES, MAX_BOXES);
  const finalPlaced = Array.isArray(data.finalPlaced) ? data.finalPlaced : [];
  const hasTimeline = gestures.length > 0;
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
    layoutRef.current = layoutFor(w, h, boxCount);
    draw();
  }

  function chipStateAt(time) {
    const placed = Array(boxCount).fill(null);
    let moving = null;
    for (const g of gestures) {
      if (time < g.t0) break;
      if (time >= g.t1) {
        if (g.type === 'place') placed[g.toBox] = g.color;
        else if (g.type === 'move') { placed[g.fromBox] = null; placed[g.toBox] = g.color; }
        else if (g.type === 'remove') placed[g.fromBox] = null;
      } else {
        if (g.type === 'move' || g.type === 'remove') placed[g.fromBox] = null;
        const pt = interpPath(g.path, time);
        moving = { x: pt.x, y: pt.y, color: g.color };
      }
    }
    return { placed, moving };
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
    for (let c = 0; c < PALETTE.length; c++) {
      drawChip(ctx, trayXNorm(c, PALETTE.length) * w, L.trayY, L.chipR, PALETTE[c].fill);
    }
    let state;
    if (hasTimeline) {
      state = chipStateAt(tRef.current);
    } else {
      state = { placed: Array.from({ length: boxCount }, (_, i) => finalPlaced[i] || null), moving: null };
    }
    for (let i = 0; i < boxCount; i++) {
      if (state.placed[i]) drawChip(ctx, colX(i, boxCount) * w, L.boxCenterY, L.chipR, paletteFill(state.placed[i]));
    }
    if (state.moving) drawChip(ctx, state.moving.x * w, state.moving.y * h, L.chipR, paletteFill(state.moving.color));
  }

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ro = new ResizeObserver(() => { resize(); });
    ro.observe(canvas.parentElement);
    resize();
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        setPlaying(false); cancelAnimationFrame(tickRafRef.current);
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
    setPlaying(false); cancelAnimationFrame(tickRafRef.current);
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
      <div className="w-full" style={{ aspectRatio: `${(boxCount / 2.18).toFixed(2)} / 1` }}>
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