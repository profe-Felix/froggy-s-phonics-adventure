import React from 'react';
import { Volume2 } from 'lucide-react';
import { playLetterSound, playTts, stopAllAudio } from '@/lib/audio';
import { SUBSTEP_COLORS as C } from './substepTheme';

function playSound(audioLetter, fallbackWord) {
  stopAllAudio();
  if (audioLetter) {
    playLetterSound(audioLetter, 'es');
  } else if (fallbackWord) {
    playTts(fallbackWord, 'es', 0.85);
  }
}

export default function ParentNotesSubstep({ substep }) {
  const { word, prompts = [], hint } = substep;

  return (
    <div className="flex flex-col items-center gap-4 sm:gap-6 px-4 py-2 w-full max-w-lg mx-auto">
      {/* Word display */}
      {word && (
        <div
          className="text-6xl sm:text-8xl font-black leading-none"
          style={{ color: C.text }}
        >
          {word}
        </div>
      )}

      {/* "What to say" prompts */}
      {prompts.length > 0 && (
        <div
          className="w-full rounded-2xl shadow-lg p-4 flex flex-col gap-3"
          style={{ background: '#ffffff' }}
        >
          {prompts.map((p, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold" style={{ color: C.muted }}>
                  {p.question}
                </p>
                <p className="text-lg font-black" style={{ color: C.text }}>
                  Answer: {p.answer}
                </p>
              </div>
              <button
                onClick={() => playSound(p.audioLetter, p.answer)}
                className="w-10 h-10 rounded-full bg-white border-2 flex items-center justify-center shrink-0 active:scale-95 transition"
                style={{ borderColor: C.text, color: C.text }}
              >
                <Volume2 className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Hint */}
      {hint && (
        <p className="text-sm text-center" style={{ color: C.muted }}>
          <span className="font-bold">Hint:</span> {hint}
        </p>
      )}
    </div>
  );
}