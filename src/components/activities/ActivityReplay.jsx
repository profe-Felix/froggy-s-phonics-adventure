import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';

// Replays a student's drag timeline (placements_data) synced to their voice
// recording. Tiles animate from the tray into the Elkonin row (and back) at the
// exact pace the student dragged them, so the teacher sees the behavior, not
// just the final count.
function applyEvent(ev, r, tr) {
  if (ev.type === 'place') {
    const i = tr.indexOf(ev.tile);
    if (i >= 0) tr.splice(i, 1);
    const idx = Math.min(ev.boxIndex == null ? r.length : ev.boxIndex, r.length);
    r.splice(idx, 0, ev.tile);
  } else if (ev.type === 'remove') {
    let i = r.indexOf(ev.tile);
    if (i < 0 && ev.boxIndex != null && r[ev.boxIndex] === ev.tile) i = ev.boxIndex;
    if (i >= 0) r.splice(i, 1);
    tr.push(ev.tile);
  }
}

export default function ActivityReplay({ rec }) {
  const events = useMemo(() => {
    try { return JSON.parse(rec.placements_data || '[]'); } catch { return []; }
  }, [rec.placements_data]);
  const tileCount = rec.tile_count || rec.placed_count || 0;
  const hasEvents = events.length > 0;
  const maxT = hasEvents ? Math.max(...events.map((e) => e.t || 0)) : 0;

  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [duration, setDuration] = useState(maxT + 600);
  const [row, setRow] = useState([]);
  const [tray, setTray] = useState(() => Array.from({ length: tileCount }, (_, i) => i));
  const audioRef = useRef(null);
  const rafRef = useRef(0);
  const startWallRef = useRef(0);
  const appliedRef = useRef(0);
  const rowRef = useRef([]);
  const trayRef = useRef([]);

  const rebuildTo = useCallback((time) => {
    rowRef.current = [];
    trayRef.current = Array.from({ length: tileCount }, (_, i) => i);
    let count = 0;
    for (const ev of events) {
      if ((ev.t || 0) > time) break;
      applyEvent(ev, rowRef.current, trayRef.current);
      count++;
    }
    appliedRef.current = count;
    setRow([...rowRef.current]);
    setTray([...trayRef.current]);
    setT(time);
  }, [events, tileCount]);

  useEffect(() => { rebuildTo(0); }, [rebuildTo]);

  function finish() {
    setPlaying(false);
    cancelAnimationFrame(rafRef.current);
    if (audioRef.current) audioRef.current.pause();
    setT(duration);
  }

  useEffect(() => {
    if (!playing) return;
    startWallRef.current = performance.now() - t;
    if (audioRef.current && rec.audio_url) {
      try { audioRef.current.currentTime = t / 1000; void audioRef.current.play(); } catch { /* best-effort */ }
    }
    const tick = () => {
      const now = performance.now() - startWallRef.current;
      let count = appliedRef.current;
      while (count < events.length && (events[count].t || 0) <= now) {
        applyEvent(events[count], rowRef.current, trayRef.current);
        count++;
      }
      appliedRef.current = count;
      setRow([...rowRef.current]);
      setTray([...trayRef.current]);
      setT(now);
      if (now >= duration) { finish(); return; }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(rafRef.current); if (audioRef.current) audioRef.current.pause(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  function togglePlay() {
    if (playing) { setPlaying(false); if (audioRef.current) audioRef.current.pause(); return; }
    if (t >= duration) { rebuildTo(0); setT(0); }
    setPlaying(true);
  }

  function onScrub(e) {
    setPlaying(false);
    if (audioRef.current) audioRef.current.pause();
    const v = Number(e.target.value);
    rebuildTo(v);
    if (audioRef.current) { try { audioRef.current.currentTime = v / 1000; } catch { /* best-effort */ } }
  }

  function onLoadedMeta() {
    if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
      setDuration((d) => Math.max(d, audioRef.current.duration * 1000));
    }
  }

  // No timeline (e.g. recording failed): show the final static state.
  if (!hasEvents) {
    const placed = Math.max(0, rec.placed_count || 0);
    const remaining = Math.max(0, tileCount - placed);
    return (
      <div className="mt-2">
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: placed }, (_, i) => (
            <div key={`p${i}`} className="w-9 h-9 rounded-md border-2 border-indigo-400 bg-indigo-500 flex items-center justify-center text-white text-sm">●</div>
          ))}
          {Array.from({ length: remaining }, (_, i) => (
            <div key={`r${i}`} className="w-9 h-9 rounded-md border-2 border-dashed border-slate-300" />
          ))}
        </div>
        {rec.audio_url && <audio controls src={rec.audio_url} className="mt-2 w-full" />}
      </div>
    );
  }

  return (
    <div className="mt-2">
      {rec.audio_url && (
        <audio ref={audioRef} src={rec.audio_url} onLoadedMetadata={onLoadedMeta} onEnded={finish} className="hidden" />
      )}
      <div className="font-bold text-slate-600 text-xs mb-1">Cajas</div>
      <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-indigo-50/70 border-2 border-indigo-200 border-dashed min-h-[56px]">
        {row.map((tile) => (
          <div key={`r-${tile}`} className="w-9 h-9 rounded-md border-2 border-indigo-400 bg-indigo-500 flex items-center justify-center text-white text-sm">●</div>
        ))}
        {row.length === 0 && <div className="text-slate-400 text-xs self-center">—</div>}
      </div>
      <div className="font-bold text-slate-600 text-xs mt-2 mb-1">Fichas</div>
      <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-white border-2 border-dashed border-slate-300 min-h-[48px]">
        {tray.map((tile) => (
          <div key={`t-${tile}`} className="w-9 h-9 rounded-md border-2 border-indigo-300 bg-indigo-400 flex items-center justify-center text-white text-sm">●</div>
        ))}
        {tray.length === 0 && <div className="text-slate-400 text-xs self-center">—</div>}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <button onClick={togglePlay} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-bold flex items-center gap-1.5">
          {playing ? <><Pause className="w-4 h-4" /> Pausa</> : <><Play className="w-4 h-4" /> Reproducir</>}
        </button>
        <span className="text-xs text-slate-500 tabular-nums">{(t / 1000).toFixed(1)}s / {(duration / 1000).toFixed(1)}s</span>
        <input type="range" min={0} max={duration} value={Math.min(t, duration)} onChange={onScrub} className="flex-1" />
      </div>
    </div>
  );
}