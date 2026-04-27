import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Undo2, Check, X, Camera } from 'lucide-react';

// Count correct letters in sequence (partial credit)
export function countCorrectLetters(builtWord, targetWord) {
  let correct = 0;
  for (let i = 0; i < Math.min(builtWord.length, targetWord.length); i++) {
    if (builtWord[i] === targetWord[i]) correct++;
  }
  return correct;
}

export default function SpellingBuildArea({ 
  builtWord, 
  targetWord, 
  onUndo, 
  onSubmit, 
  onClear,
  showResult,
  isCorrect,
  onNext,
  pointsEarned,
  bonusPoints,
  onRetry,
  onCamera,
  clozeIndices, // array of indices that are blanks (cloze mode only)
}) {
  const isCloze = clozeIndices && clozeIndices.length > 0;

  // For cloze: render the full word with blanks filled in order as student clicks
  const renderClozeDisplay = () => {
    const letters = targetWord.split('');
    let blanksFilled = 0;
    return letters.map((letter, i) => {
      const isBlank = clozeIndices.includes(i);
      if (!isBlank) {
        // Fixed letter tile
        return (
          <div key={i} className="w-10 h-10 bg-gradient-to-br from-gray-300 to-gray-400 rounded-lg shadow flex items-center justify-center">
            <span className="text-xl font-bold text-white">{letter}</span>
          </div>
        );
      }
      // This is a blank slot
      const slotIdx = blanksFilled++;
      const filled = builtWord[slotIdx];
      let tileClass = 'border-2 border-dashed border-indigo-400 bg-indigo-50';
      if (filled) {
        tileClass = showResult
          ? (filled === letter ? 'bg-gradient-to-br from-green-400 to-green-600' : 'bg-gradient-to-br from-red-400 to-red-600')
          : 'bg-gradient-to-br from-indigo-400 to-indigo-600';
      }
      return (
        <motion.div
          key={i}
          initial={filled ? { scale: 0.7 } : false}
          animate={{ scale: 1 }}
          className={`w-10 h-10 ${tileClass} rounded-lg shadow flex items-center justify-center`}
        >
          {filled
            ? <span className="text-xl font-bold text-white">{filled}</span>
            : <span className="text-lg text-indigo-300 font-bold">_</span>
          }
        </motion.div>
      );
    });
  };

  // For spell mode: render each clicked letter
  const renderSpellDisplay = () => (
    <>
      <AnimatePresence>
        {builtWord.map((letter, index) => {
          const targetLetter = targetWord[index];
          let tileClass = 'bg-gradient-to-br from-green-400 to-green-600';
          if (showResult) {
            tileClass = letter === targetLetter
              ? 'bg-gradient-to-br from-green-400 to-green-600'
              : 'bg-gradient-to-br from-red-400 to-red-600';
          }
          return (
            <motion.div
              key={index}
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180 }}
              className={`w-10 h-10 ${tileClass} rounded-lg shadow-lg flex items-center justify-center`}
            >
              <span className="text-xl font-bold text-white">{letter}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {builtWord.length === 0 && (
        <div className="text-gray-400 text-base">Click letters above...</div>
      )}
    </>
  );

  return (
    <div className="absolute bottom-4 left-4 bg-white/95 rounded-3xl shadow-2xl p-4 z-10"
      style={{ width: 'min(680px, calc(100vw - 2rem))' }}>

      {/* Word display */}
      <div className="text-center mb-3">
        <p className="text-gray-500 text-xs mb-1.5">
          {isCloze ? 'Fill in the blanks:' : 'Build the word:'}
        </p>
        <div className="flex justify-center gap-1.5 min-h-[52px] flex-wrap items-center">
          {isCloze ? renderClozeDisplay() : renderSpellDisplay()}
        </div>

        {/* Show correct word underneath when wrong */}
        {showResult && !isCorrect && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-2">
            <p className="text-xs text-gray-400 mb-1">Correct:</p>
            <div className="flex justify-center gap-1.5 flex-wrap">
              {targetWord.split('').map((letter, i) => (
                <div key={i} className="w-10 h-10 bg-gradient-to-br from-green-400 to-green-600 rounded-lg shadow flex items-center justify-center">
                  <span className="text-xl font-bold text-white">{letter}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Controls — hidden after submit */}
      {!showResult && (
        <div className="flex gap-1.5 justify-center mb-2">
          <button
            onClick={onUndo}
            disabled={builtWord.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            <Undo2 className="w-3.5 h-3.5" /> Undo
          </button>
          <button
            onClick={onClear}
            disabled={builtWord.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
          <button
            onClick={onSubmit}
            disabled={isCloze ? builtWord.length < clozeIndices.length : builtWord.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-500 text-white text-sm font-bold hover:bg-blue-600 disabled:opacity-40 shadow"
          >
            <Check className="w-3.5 h-3.5" /> Submit
          </button>
          {onCamera && (
            <button
              onClick={onCamera}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-purple-200 text-purple-600 text-sm font-bold hover:bg-purple-50"
              title="Mental image — hide word"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Result feedback */}
      {showResult && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-2">
          {isCorrect ? (
            <>
              <div className="text-center font-bold text-green-600 text-base">
                ✅ Correct!{' '}
                {pointsEarned > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-yellow-600">
                    {Array.from({ length: Math.min(pointsEarned, 8) }).map((_, i) => (
                      <span key={i} className="text-base">🏆</span>
                    ))}
                    <span className="text-sm font-black ml-1">+{pointsEarned}</span>
                  </span>
                )}
              </div>
              {bonusPoints > 0 && (
                <div className="text-xs font-black text-orange-500 animate-bounce">🔥 Streak Bonus! +{bonusPoints}pts!</div>
              )}
            </>
          ) : (
            <div className="text-center text-sm font-bold text-red-500">❌ Not quite!</div>
          )}

          <div className="flex gap-2 mt-1">
            {!isCorrect && onRetry && (
              <button onClick={onRetry} className="px-4 py-1.5 bg-orange-100 text-orange-700 font-bold rounded-xl border border-orange-300 text-sm hover:bg-orange-200">
                🔄 Retry
              </button>
            )}
            {onNext && (
              <button onClick={onNext} className={`px-5 py-1.5 font-bold rounded-xl shadow text-sm text-white ${isCorrect ? 'bg-green-500 hover:bg-green-600' : 'bg-indigo-500 hover:bg-indigo-600'}`}>
                Next →
              </button>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}