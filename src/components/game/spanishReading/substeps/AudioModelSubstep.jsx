import React, { useRef, useState } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';
import { SUBSTEP_COLORS as C } from './substepTheme';

// Audio model substep for Blending Letters.
// Shows the word + phoneme cards and plays the teacher's recorded audio demo.
export default function AudioModelSubstep({ substep }) {
  const { word, audioUrl } = substep;
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); }
    else { a.pause(); setPlaying(false); }
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

      {/* Phoneme cards */}
      {word && (
        <div className="flex gap-2 flex-wrap justify-center">
          {word.split('').map((letter, i) => (
            <div
              key={i}
              className="rounded-2xl px-4 py-3 shadow-md"
              style={{ background: C.card }}
            >
              <span className="text-3xl font-black" style={{ color: C.text }}>
                {letter}
              </span>
            </div>
          ))}
        </div>
      )}

      {audioUrl ? (
        <div
          className="w-full rounded-3xl shadow-lg p-6 flex flex-col items-center gap-3"
          style={{ background: C.card }}
        >
          <button
            onClick={togglePlay}
            className="w-16 h-16 rounded-full bg-white shadow-md flex items-center justify-center active:scale-95 transition"
          >
            {playing ? (
              <Pause className="w-7 h-7" style={{ color: C.text }} fill={C.text} />
            ) : (
              <Play className="w-7 h-7 ml-1" style={{ color: C.text }} fill={C.text} />
            )}
          </button>
          <p className="text-sm font-bold" style={{ color: C.muted }}>
            Toca para escuchar el modelo
          </p>
          <audio
            ref={audioRef}
            src={audioUrl}
            onEnded={() => setPlaying(false)}
            className="hidden"
          />
        </div>
      ) : (
        <div
          className="w-full rounded-3xl shadow-lg p-10 text-center"
          style={{ background: C.card, color: C.muted }}
        >
          <Volume2 className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-bold">No hay demo grabado para esta palabra.</p>
          <p className="text-xs mt-1">Graba un demo en el editor de lecciones.</p>
        </div>
      )}
    </div>
  );
}