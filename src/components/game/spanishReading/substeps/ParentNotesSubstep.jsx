import React from 'react';
import { Volume2 } from 'lucide-react';
import { playLetterSound, stopAllAudio } from '@/lib/audio';
import { SUBSTEP_COLORS as C } from './substepTheme';

// Play the phoneme sound for the given letter using the Supabase fonemas files.
// Falls back to TTS only if no audioLetter is set (shouldn't happen with auto-built substeps).
function playSound(audioLetter, fallbackWord) {
  stopAllAudio();
  if (audioLetter) {
    playLetterSound(audioLetter, 'es');
  } else if (fallbackWord) {
    // Fallback: play the whole word as TTS (rare — only for manually configured substeps)
    import('@/lib/audio').then(({ playTts }) => playTts(fallbackWord, 'es', 0.85));
  }
}

export default function ParentNotesSubstep({ substep }) {
  const { word, prompts = [], hint } = substep;

  return (
    <div className="flex flex-col items-center gap-3 sm:gap-4 px-4 py-2 w-full max-w-lg mx-auto">
      {/* "What to say" prompts — speech bubble card directly under the title */}
      {prompts.length > 0 && (
        <div
          className="w-full rounded-2xl shadow-lg p-3 sm:p-4 flex flex-col gap-2 sm:gap-3 relative"
          style={{ background: '#ffffff' }}
        >
          {/* Speech bubble tail pointing up toward the title */}
          <div
            className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rotate-45"
            style={{ background: '#ffffff' }}
          />
          {prompts.map((p, i) => (
            <div key={i} className="flex items-center gap-2 sm:gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold" style={{ color: C.muted }}>
                  {p.question}
                </p>
                <p className="text-base sm:text-lg font-black" style={{ color: C.text }}>
                  Respuesta: {p.answer}
                </p>
              </div>
              <button
                onClick={() => playSound(p.audioLetter, p.answer)}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border-2 flex items-center justify-center shrink-0 active:scale-95 transition"
                style={{ borderColor: C.text, color: C.text }}
                title="Escucha el fonema"
              >
                <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Word display — below the prompts */}
      {word && (
        <div
          className="text-6xl sm:text-8xl font-black leading-none"
          style={{ color: C.text }}
        >
          {word}
        </div>
      )}

      {/* Hint */}
      {hint && (
        <p className="text-sm text-center" style={{ color: C.muted }}>
          <span className="font-bold">Pista:</span> {hint}
        </p>
      )}
    </div>
  );
}