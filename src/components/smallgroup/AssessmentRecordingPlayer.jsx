import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

// Replay component for a sight-words assessment recording.
//
// Props:
//   recordingUrl: string — audio file URL
//   timeline: array of { item, shown_at (ms), marked_at (ms), correct (bool), note }
//   onNoteChange: (index, note) => void
//
// The timeline markers are positioned on the scrub bar at the timestamp
// each word was shown. Clicking a marker seeks the audio to that point.
// Each marker is colored green (correct) or red (incorrect).
export default function AssessmentRecordingPlayer({ recordingUrl, timeline, onNoteChange }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Load duration when metadata is ready
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoaded = () => setDuration(audio.duration || 0);
    audio.addEventListener('loadedmetadata', onLoaded);
    return () => audio.removeEventListener('loadedmetadata', onLoaded);
  }, [recordingUrl]);

  // Track current time for scrub bar + active marker
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      // Find the active marker (last marker whose shown_at <= currentTime)
      const tMs = audio.currentTime * 1000;
      let active = -1;
      for (let i = 0; i < timeline.length; i++) {
        if (timeline[i].shown_at <= tMs) active = i;
        else break;
      }
      setActiveIndex(active);
    };
    audio.addEventListener('timeupdate', onTimeUpdate);
    return () => audio.removeEventListener('timeupdate', onTimeUpdate);
  }, [timeline]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  }, [playing]);

  const seekTo = useCallback((ms) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = ms / 1000;
    setCurrentTime(ms / 1000);
  }, []);

  const seekToMarker = useCallback((index) => {
    const entry = timeline[index];
    if (entry) seekTo(entry.shown_at);
  }, [timeline, seekTo]);

  // Keyboard shortcuts: space = play/pause, left/right = prev/next marker
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'ArrowLeft' && activeIndex > 0) { e.preventDefault(); seekToMarker(activeIndex - 1); }
      else if (e.key === 'ArrowRight' && activeIndex < timeline.length - 1) { e.preventDefault(); seekToMarker(activeIndex + 1); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlay, activeIndex, timeline.length, seekToMarker]);

  const formatTime = (s) => {
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${String(sec).padStart(2, '0')}`;
  };

  if (!recordingUrl) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
        <Clock className="w-4 h-4" />
        <span>No recording available for this session.</span>
      </div>
    );
  }

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-slate-800 rounded-xl p-4 space-y-3">
      {/* Audio element (hidden) */}
      <audio ref={audioRef} src={recordingUrl} preload="metadata" />

      {/* Controls row */}
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="w-10 h-10 rounded-full bg-indigo-500 hover:bg-indigo-600 flex items-center justify-center text-white transition-colors"
        >
          {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
        </button>
        <span className="text-slate-300 text-sm font-mono">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <button
          onClick={() => seekToMarker(activeIndex > 0 ? activeIndex - 1 : 0)}
          disabled={activeIndex <= 0}
          className="text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
          title="Previous word"
        >
          <SkipBack className="w-5 h-5" />
        </button>
        <button
          onClick={() => seekToMarker(Math.min(activeIndex + 1, timeline.length - 1))}
          disabled={activeIndex >= timeline.length - 1}
          className="text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
          title="Next word"
        >
          <SkipForward className="w-5 h-5" />
        </button>
      </div>

      {/* Scrub bar with markers */}
      <div className="relative h-12 bg-slate-700 rounded-lg cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          seekTo(pct * duration * 1000);
        }}
      >
        {/* Progress fill */}
        <div
          className="absolute inset-y-0 left-0 bg-indigo-500/30 rounded-l-lg"
          style={{ width: `${progressPct}%` }}
        />
        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-indigo-400 pointer-events-none"
          style={{ left: `${progressPct}%` }}
        />
        {/* Timeline markers */}
        {timeline.map((entry, i) => {
          const leftPct = duration > 0 ? (entry.shown_at / 1000 / duration) * 100 : 0;
          return (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                seekToMarker(i);
              }}
              className={cn(
                'absolute top-1 bottom-1 w-1.5 rounded-full transition-all hover:scale-150',
                entry.correct ? 'bg-green-400' : 'bg-red-400',
                i === activeIndex && 'ring-2 ring-white scale-150'
              )}
              style={{ left: `${leftPct}%` }}
              title={entry.item}
            />
          );
        })}
      </div>

      {/* Active item display + note input */}
      {activeIndex >= 0 && timeline[activeIndex] && (
        <div className="bg-slate-700/50 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-white">{timeline[activeIndex].item}</span>
            <span className={cn(
              'text-sm font-medium px-2 py-0.5 rounded',
              timeline[activeIndex].correct ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            )}>
              {timeline[activeIndex].correct ? '✓ Correct' : '✗ Incorrect'}
            </span>
            <span className="text-slate-400 text-xs ml-auto">
              Word {activeIndex + 1} of {timeline.length}
            </span>
          </div>
          <input
            type="text"
            value={timeline[activeIndex].note || ''}
            onChange={(e) => onNoteChange?.(activeIndex, e.target.value)}
            placeholder="Add a note about how they read this word..."
            className="w-full bg-slate-900 text-white text-sm rounded-md px-3 py-2 border border-slate-600 focus:border-indigo-400 focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}