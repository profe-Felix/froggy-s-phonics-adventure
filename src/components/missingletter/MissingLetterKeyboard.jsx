import { getKeyboardRows } from '@/lib/missingLetterProgression';

// Alphabetical keyboard for the Missing Letter activity. Letters that have
// been introduced (from the curriculum) are highlighted green; letters not
// yet introduced are greyed out but still visible — students can see the
// full alphabet but are guided toward what they've learned. Tapping a
// greyed-out letter still works (the student can try it), but the green
// highlight shows them where to start.
//
// This builds keyboarding skills (pressing keys to spell) while keeping
// the letter pool from being overwhelming.
export default function MissingLetterKeyboard({ introducedSet, onKeyPress, disabled = false, wrongLetter = null }) {
  const rows = getKeyboardRows();

  return (
    <div className="flex flex-col items-center gap-1.5 select-none">
      {rows.map((row, ri) => (
        <div key={ri} className="flex gap-1.5 justify-center">
          {row.map((letter) => {
            const introduced = introducedSet?.has(letter);
            const isWrong = wrongLetter === letter;
            return (
              <button
                key={letter}
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (!disabled) onKeyPress?.(letter);
                }}
                disabled={disabled}
                className={`w-11 h-11 rounded-xl text-2xl font-black lowercase flex items-center justify-center transition-all
                  ${isWrong
                    ? 'bg-red-100 border-2 border-red-400 text-red-500 scale-90'
                    : introduced
                      ? 'bg-green-100 border-2 border-green-400 text-green-700 hover:scale-105 active:scale-95'
                      : 'bg-gray-100 border-2 border-gray-200 text-gray-300 hover:scale-105 active:scale-95'
                  }
                  disabled:opacity-40 disabled:pointer-events-none`}
                style={{ touchAction: 'none' }}
              >
                {letter}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}