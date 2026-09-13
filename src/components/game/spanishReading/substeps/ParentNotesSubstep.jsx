import React from 'react';
import { Volume2 } from 'lucide-react';
import { playLetterSound, stopAllAudio } from '@/lib/audio';
import { SUBSTEP_COLORS as C } from './substepTheme';

// Play the phoneme sound for the given letter using the Supabase fonemas files.
function playSound(audioLetter, fallbackWord) {
  stopAllAudio();
  if (audioLetter) {
    playLetterSound(audioLetter, 'es');
  } else if (fallbackWord) {
    import('@/lib/audio').then(({ playTts }) => playTts(fallbackWord, 'es', 0.85));
  }
}

export default function ParentNotesSubstep({ substep }) {
  const { word, prompts = [] } = substep;

  return (
    <div className="flex flex-col items-center gap-4 sm:gap-6 px-4 py-2 w-full max-w-lg mx-auto">
      {/* Compact prompts card — one line per prompt, answer + speaker inline */}
      {prompts.length > 0 && (
        <div
          className="w-full rounded-2xl shadow-lg px-4 py-3 flex flex-col gap-2 relative"
          style={{ background: '#ffffff' }}
        >
          {/* Speech bubble tail pointing up toward the title */}
          <div
            className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rotate-45"
            style={{ background: '#ffffff' }}
          />
          {prompts.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <p className="flex-1 text-sm sm:text-base leading-snug" style={{ color: C.text }}>
                {p.question}{' '}
                <span className="font-black" style={{ color: C.text }}>
                  Respuesta: {p.answer}
                </span>
              </p>
              <button
                onClick={() => playSound(p.audioLetter, p.answer)}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white border-2 flex items-center justify-center shrink-0 active:scale-95 transition"
                style={{ borderColor: C.text, color: C.text }}
                title="Escucha el fonema"
              >
                <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Word display — much bigger */}
      {word && (
        <div
          className="text-7xl sm:text-9xl font-black leading-none tracking-tight"
          style={{ color: C.text }}
        >
          {word}
        </div>
      )}
    </div>
  );
}