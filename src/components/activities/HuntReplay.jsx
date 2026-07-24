import { useState, useEffect, useRef, useMemo } from 'react';
import HuntSegments from '@/components/activities/HuntSegments';
import { Play, Pause } from 'lucide-react';

// Teacher replay for "Caza en el texto". Renders the saved passage ranges and
// colors each tapped range at the moment the student tapped it (green/red), then
// reveals the missed correct targets in amber at the end — synced to the voice
// recording, same playback pattern as the other activities.
export default function HuntReplay({ rec }) {
  const data = useMemo(() => {
    try { return JSON.parse(rec.placements_data || '{}'); } catch { return {}; }
  }, [rec.placements_data]);
  const segments = Array.isArray(data.segments) ? data.segments : [];
  const taps = Array.isArray(data.taps) ? data.taps : [];
  const missed = Array.isArray(data.missed) ? data.missed : [];
  const hasTimeline = taps.length > 0;
  const maxT = hasTimeline ? Math.max(0, ...taps.map((t) => t.t || 0)) : 0;

  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [duration, setDuration] = useState(maxT + 600);
  const tRef = useRef(0);
  const audioRef = useRef(null);
  const rafRef = useRef(0);
  const startWall = useRef(0);

  function marksAt(time) {
    const m = {};
    for (const tap of taps) { if (time >= tap.t) m[tap.index] = tap.correct ? 'correct' : 'wrong'; }
    if (!hasTimeline || time >= maxT) {
      for (const idx of missed) { if (!(idx in m)) m[idx] = 'missed'; }
    }
    return m;
  }
  const shownTime = hasTimeline ? t : (maxT + 1);
  const marks = marksAt(shownTime);

  useEffect(() => {
    if (!playing) return;
    startWall.current = performance.now() - tRef.current;
    if (audioRef.current && rec.audio_url) {
      try { audioRef.current.currentTime = tRef.current / 1000; void audioRef.current.play(); } catch { /* best-effort */ }
    }
    const frame = () => {
      const now = performance.now() - startWall.current;
      tRef.current = now; setT(now);
      if (now >= duration) {
        setPlaying(false); cancelAnimationFrame(rafRef.current);
        if (audioRef.current) audioRef.current.pause();
        tRef.current = duration; setT(duration);
        return;
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(rafRef.current); if (audioRef.current) audioRef.current.pause(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  function onMeta() { if (audioRef.current && Number.isFinite(audioRef.current.duration)) setDuration((d) => Math.max(d, audioRef.current.duration * 1000)); }
  function toggle() {
    if (playing) { setPlaying(false); cancelAnimationFrame(rafRef.current); if (audioRef.current) audioRef.current.pause(); return; }
    if (tRef.current >= duration) { tRef.current = 0; setT(0); }
    setPlaying(true);
  }
  function scrub(e) {
    setPlaying(false); cancelAnimationFrame(rafRef.current);
    if (audioRef.current) audioRef.current.pause();
    const v = Number(e.target.value); tRef.current = v; setT(v);
    if (audioRef.current) { try { audioRef.current.currentTime = v / 1000; } catch { /* best-effort */ } }
  }

  return (
    <div className="mt-2">
      {rec.audio_url && <audio ref={audioRef} src={rec.audio_url} onLoadedMetadata={onMeta} onEnded={() => setPlaying(false)} className="hidden" />}
      <p className="text-lg sm:text-2xl font-bold text-slate-800 leading-relaxed">
        <HuntSegments segments={segments} marks={marks} isSpaceHunt={data.huntType === 'space'} />
      </p>
      {hasTimeline ? (
        <div className="flex items-center gap-2 mt-2">
          <button onClick={toggle} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-bold flex items-center gap-1.5">
            {playing ? <><Pause className="w-4 h-4" /> Pausa</> : <><Play className="w-4 h-4" /> Reproducir</>}
          </button>
          <span className="text-xs text-slate-500 tabular-nums">{(t / 1000).toFixed(1)}s / {(duration / 1000).toFixed(1)}s</span>
          <input type="range" min={0} max={duration} value={Math.min(t, duration)} onChange={scrub} className="flex-1" />
        </div>
      ) : (
        rec.audio_url && <audio controls src={rec.audio_url} className="mt-2 w-full" />
      )}
    </div>
  );
}