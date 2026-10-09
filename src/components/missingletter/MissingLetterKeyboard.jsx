import { getKeyboardRows, KEYBOARD_VOWELS } from '@/lib/missingLetterProgression';

const VOWEL_SET = new Set(KEYBOARD_VOWELS);

// QWERTY keyboard for the Missing Letter activity. Letters that have been
// introduced (from the curriculum) are highlighted green; letters not yet
// introduced are greyed out but still tappable.
//
// Vowels get a small green dot underneath so students can easily spot them
// and ensure they include a vowel when spelling. Non-vowels have a blank
// spacer of the same size to keep keys aligned.
export default function MissingLetterKeyboard({ introducedSet, onKeyPress, disabled = false, wrongLetter = null, showSpaceBar = false }) {
  const rows = getKeyboardRows();

  return (
    <div
      className="flex flex-col items-center gap-1.5 select-none mx-auto"
      style={{
        padding: '14px 16px',
        background: '#f7fbf5',
        border: '1px solid #d8e6d2',
        borderRadius: '18px',
        boxShadow: '0 5px 14px rgba(43,78,36,.11), 0 2px 0 #e5efdf',
        width: 'max-content',
        maxWidth: '100%',
      }}
    >
      {rows.map((row, ri) => (
        <div key={ri} className="flex justify-center gap-1.5">
          {row.map((letter) => {
            const introduced = introducedSet?.has(letter);
            const isVowel = VOWEL_SET.has(letter);
            const isWrong = wrongLetter === letter;
            return (
              <button
                key={letter}
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (!disabled) onKeyPress?.(letter);
                }}
                disabled={disabled}
                className="box-border flex flex-col items-center justify-center gap-px rounded-xl transition-all disabled:opacity-40 disabled:pointer-events-none"
                style={{
                  width: '44px',
                  height: '50px',
                  padding: '3px 0 2px',
                  borderWidth: '1.5px',
                  borderStyle: 'solid',
                  touchAction: 'none',
                  fontSize: '23px',
                  fontWeight: 800,
                  lineHeight: 1,
                  ...(isWrong
                    ? {
                        borderColor: '#f87171',
                        background: '#fee2e2',
                        color: '#ef4444',
                        boxShadow: '0 2px 0 #fca5a5',
                        transform: 'scale(0.9)',
                      }
                    : introduced
                      ? {
                          borderColor: '#a9c9a2',
                          background: 'linear-gradient(180deg,#eef7eb,#e4f0df)',
                          color: '#39713d',
                          boxShadow: '0 2px 0 #c9ddc3',
                        }
                      : {
                          borderColor: '#d1d5db',
                          background: '#f3f4f6',
                          color: '#9ca3af',
                          boxShadow: 'none',
                        }),
                }}
                onMouseEnter={(e) => {
                  if (disabled || isWrong) return;
                  if (introduced) {
                    e.currentTarget.style.background = '#e0efdb';
                    e.currentTarget.style.borderColor = '#83b67d';
                    e.currentTarget.style.boxShadow = '0 3px 0 #bdd7b6';
                  }
                }}
                onMouseLeave={(e) => {
                  if (disabled || isWrong) return;
                  if (introduced) {
                    e.currentTarget.style.background = 'linear-gradient(180deg,#eef7eb,#e4f0df)';
                    e.currentTarget.style.borderColor = '#a9c9a2';
                    e.currentTarget.style.boxShadow = '0 2px 0 #c9ddc3';
                  }
                }}
                onPointerDownCapture={(e) => {
                  if (disabled || isWrong) return;
                  if (introduced) {
                    e.currentTarget.style.transform = 'translateY(1px)';
                    e.currentTarget.style.boxShadow = '0 1px 0 #bdd7b6';
                  }
                }}
                onPointerUpCapture={(e) => {
                  if (disabled || isWrong) return;
                  if (introduced) {
                    e.currentTarget.style.transform = '';
                    e.currentTarget.style.boxShadow = '0 2px 0 #c9ddc3';
                  }
                }}
              >
                <span className="lowercase">{letter}</span>
                {isVowel ? (
                  <span
                    className="rounded-full"
                    style={{
                      width: '5px',
                      height: '5px',
                      flex: '0 0 5px',
                      background: isWrong ? '#ef4444' : introduced ? '#5e9459' : '#9ca3af',
                      boxShadow: introduced ? '0 0 0 1px rgba(67,119,62,.08)' : 'none',
                    }}
                  />
                ) : (
                  <span style={{ width: '5px', height: '5px', flex: '0 0 5px' }} />
                )}
              </button>
            );
          })}
        </div>
      ))}
      {showSpaceBar && (
        <div className="flex justify-center gap-1.5 mt-1.5">
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              if (!disabled) onKeyPress?.(' ');
            }}
            disabled={disabled}
            className="box-border rounded-xl transition-all disabled:opacity-40 disabled:pointer-events-none"
            style={{
              width: '220px',
              height: '50px',
              borderWidth: '1.5px',
              borderStyle: 'solid',
              ...(wrongLetter === ' '
                ? {
                    borderColor: '#f87171',
                    background: '#fee2e2',
                    boxShadow: '0 2px 0 #fca5a5',
                    transform: 'scale(0.95)',
                  }
                : {
                    borderColor: '#a9c9a2',
                    background: 'linear-gradient(180deg,#eef7eb,#e4f0df)',
                    boxShadow: '0 2px 0 #c9ddc3',
                  }),
              color: '#39713d',
              fontSize: '20px',
              fontWeight: 700,
              lineHeight: 1,
              touchAction: 'none',
            }}
            onPointerDownCapture={(e) => {
              if (disabled || wrongLetter === ' ') return;
              e.currentTarget.style.transform = 'translateY(1px)';
              e.currentTarget.style.boxShadow = '0 1px 0 #bdd7b6';
            }}
            onPointerUpCapture={(e) => {
              if (disabled || wrongLetter === ' ') return;
              e.currentTarget.style.transform = '';
              e.currentTarget.style.boxShadow = '0 2px 0 #c9ddc3';
            }}
          >
            espacio
          </button>
        </div>
      )}
    </div>
  );
}