import React from 'react';
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from 'framer-motion';
import { Undo2, Check, X } from 'lucide-react';

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
}) {
  return (
    <div className="absolute bottom-8 left-8 bg-white/95 rounded-3xl shadow-2xl p-6 w-96 max-w-[90vw] z-10">
      <div className="text-center mb-4">
        <p className="text-gray-600 text-sm mb-2">Build the word:</p>
        <div className="flex justify-center gap-2 min-h-[80px] flex-wrap">
          <AnimatePresence>
            {builtWord.map((letter, index) => (
              <motion.div
                key={index}
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, rotate: 180 }}
                className="w-12 h-12 bg-gradient-to-br from-green-400 to-green-600 rounded-lg shadow-lg flex items-center justify-center"
              >
                <span className="text-2xl font-bold text-white">{letter}</span>
              </motion.div>
            ))}
          </AnimatePresence>
          {builtWord.length === 0 && (
            <div className="text-gray-400 text-xl">Click letters above...</div>
          )}
        </div>
      </div>

      <div className="flex gap-2 justify-center">
        <Button
          onClick={onUndo}
          disabled={builtWord.length === 0}
          variant="outline"
          className="px-4 py-2 text-sm"
        >
          <Undo2 className="w-4 h-4 mr-1" />
          Undo
        </Button>
        <Button
          onClick={onClear}
          disabled={builtWord.length === 0}
          variant="outline"
          className="px-4 py-2 text-sm"
        >
          <X className="w-4 h-4 mr-1" />
          Clear
        </Button>
        <Button
          onClick={onSubmit}
          disabled={builtWord.length === 0 || showResult}
          className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600"
        >
          <Check className="w-4 h-4 mr-1" />
          Submit
        </Button>
      </div>

      {showResult && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4"
        >
          {isCorrect ? (
            <div className="flex flex-col items-center gap-2">
              <div className="text-center text-xl font-bold text-green-600">✅ Correct! {pointsEarned != null ? `+${pointsEarned} pts` : ''}</div>
              {onNext && <button onClick={onNext} className="mt-1 px-6 py-2 bg-green-500 text-white font-bold rounded-xl shadow hover:bg-green-600">Next →</button>}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="text-center text-sm font-bold text-red-500 mb-1">❌ Not quite! Here's the correct answer:</div>
              {/* Student's attempt vs correct answer — letter by letter */}
              <div className="flex flex-col gap-1 items-center">
                {/* Student row */}
                <div className="flex gap-1 items-start flex-wrap">
                  <span className="text-xs text-gray-400 w-14 text-right mr-1 mt-1">You:</span>
                  <div className="flex gap-1 flex-wrap">
                    {targetWord.split('').map((correctLetter, i) => {
                      const studentLetter = builtWord[i];
                      const match = studentLetter === correctLetter;
                      return (
                        <div key={i} className={`w-8 h-8 rounded flex items-center justify-center font-bold text-sm border-2 ${
                          !studentLetter ? 'bg-gray-100 border-gray-200 text-gray-300' :
                          match ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-600'
                        }`}>
                          {studentLetter || '–'}
                        </div>
                      );
                    })}
                    {/* Extra letters the student typed beyond the word length */}
                    {builtWord.slice(targetWord.length).map((l, i) => (
                      <div key={`extra-${i}`} className="w-8 h-8 rounded flex items-center justify-center font-bold text-sm border-2 bg-red-100 border-red-400 text-red-600">{l}</div>
                    ))}
                  </div>
                </div>
                {/* Correct row */}
                <div className="flex gap-1 items-start flex-wrap">
                  <span className="text-xs text-gray-400 w-14 text-right mr-1 mt-1">Correct:</span>
                  <div className="flex gap-1 flex-wrap">
                    {targetWord.split('').map((letter, i) => {
                      const match = builtWord[i] === letter;
                      return (
                        <div key={i} className={`w-8 h-8 rounded flex items-center justify-center font-bold text-sm border-2 ${
                          match ? 'bg-green-100 border-green-400 text-green-700' : 'bg-green-200 border-green-500 text-green-800'
                        }`}>
                          {letter}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              {onNext && <button onClick={onNext} className="mt-2 px-6 py-2 bg-indigo-500 text-white font-bold rounded-xl shadow hover:bg-indigo-600">Next →</button>}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}