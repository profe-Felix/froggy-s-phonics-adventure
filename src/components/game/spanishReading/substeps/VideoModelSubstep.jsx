import React, { useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { SUBSTEP_COLORS as C } from './substepTheme';

function formatTime(s) {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function VideoModelSubstep({ substep }) {
  const { videoUrl, word } = substep;
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  return (
    <div className="flex flex-col items-center gap-4 px-4 py-2 w-full max-w-lg mx-auto">
      {word && (
        <div
          className="text-6xl sm:text-8xl font-black leading-none tracking-tight"
          style={{ color: C.text }}
        >
          {word}
        </div>
      )}

      {/* Video tile — styled like the reference: mint card with play button + duration */}
      {videoUrl ? (
        <div
          className="w-full rounded-3xl shadow-lg relative overflow-hidden"
          style={{ background: C.card }}
        >
          <video
            ref={videoRef}
            src={videoUrl}
            onLoadedMetadata={(e) => setDuration(e.target.duration)}
            onEnded={() => setPlaying(false)}
            className="w-full max-h-[55vh] object-contain"
          />
          {/* Play/pause button — bottom left */}
          <button
            onClick={togglePlay}
            className="absolute bottom-3 left-3 w-12 h-12 rounded-full bg-white shadow-md flex items-center justify-center active:scale-95 transition"
          >
            {playing ? (
              <Pause className="w-5 h-5" style={{ color: C.text }} fill={C.text} />
            ) : (
              <Play className="w-5 h-5 ml-0.5" style={{ color: C.text }} fill={C.text} />
            )}
          </button>
          {/* Duration badge — bottom right */}
          <div
            className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full text-xs font-bold text-white"
            style={{ background: 'rgba(107, 122, 135, 0.85)' }}
          >
            {formatTime(duration)}
          </div>
        </div>
      ) : (
        <div
          className="w-full rounded-3xl shadow-lg p-10 text-center"
          style={{ background: C.card, color: C.muted }}
        >
          <p className="text-sm font-bold">No hay video configurado para este paso.</p>
          <p className="text-xs mt-1">Agrega un video en el editor de lecciones.</p>
        </div>
      )}
    </div>
  );
}