import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Primary pool: 10–20. Support pool: 0–9 (added if student struggles with a teen)
const PRIMARY_NUMBERS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const SUPPORT_NUMBERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

// If accuracy for a teen number is below this after MIN_ATTEMPTS, add its unit digit as support
const STRUGGLE_THRESHOLD = 0.5;
const MIN_ATTEMPTS = 3;

export default function NumberBuildingMode({ onBack }) {
  const [pool, setPool] = useState(PRIMARY_NUMBERS); // active practice pool
  const [currentNumber, setCurrentNumber] = useState(null);
  const [builtDigits, setBuiltDigits] = useState([]);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState({}); // { num: { correct, total } }
  const lastNumberRef = useRef(null);
  const audioRef = useRef(null);
  const audioCache = useRef({});

  const playSound = (num) => {
    const path = `/numbers-audio/${num}.mp3`;
    if (!audioCache.current[path]) {
      audioCache.current[path] = new Audio(path);
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    audioRef.current = audioCache.current[path];
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
  };

  const pickNext = (currentPool, currentAttempts, lastNum) => {
    const available = currentPool.length > 1
      ? currentPool.filter(n => n !== lastNum)
      : currentPool;

    // Weight: fewer correct attempts = higher weight
    const weights = available.map(n => {
      const s = currentAttempts[n] || { correct: 0, total: 0 };
      return Math.max(1, 5 - s.correct);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * total;
    let picked = available[0];
    for (let i = 0; i < available.length; i++) {
      rand -= weights[i];
      if (rand <= 0) { picked = available[i]; break; }
    }
    return picked;
  };

  const updatePool = (num, newAttempts) => {
    // Check if this teen number is struggling → add its unit digit
    if (num >= 10 && num <= 19) {
      const unitDigit = num - 10;
      const stats = newAttempts[num] || { correct: 0, total: 0 };
      if (stats.total >= MIN_ATTEMPTS && stats.correct / stats.total < STRUGGLE_THRESHOLD) {
        setPool(prev => prev.includes(unitDigit) ? prev : [...prev, unitDigit]);
      }
    }
    // If a support number is now well-mastered, remove it
    if (SUPPORT_NUMBERS.includes(num)) {
      const stats = newAttempts[num] || { correct: 0, total: 0 };
      if (stats.total >= MIN_ATTEMPTS && stats.correct / stats.total >= 0.8) {
        setPool(prev => prev.filter(n => n !== num));
      }
    }
  };

  const startRound = (currentPool, currentAttempts) => {
    const num = pickNext(currentPool, currentAttempts, lastNumberRef.current);
    lastNumberRef.current = num;
    setCurrentNumber(num);
    setBuiltDigits([]);
    setShowResult(false);
    playSound(num);
  };

  useEffect(() => {
    startRound(pool, attempts);
  }, []);

  const handleDigitTap = (digit) => {
    if (showResult) return;
    const target = String(currentNumber);
    const next = [...builtDigits, String(digit)];
    setBuiltDigits(next);

    // Auto-submit when enough digits entered
    if (next.length === target.length) {
      const correct = next.join('') === target;
      setIsCorrect(correct);
      setShowResult(true);
      if (correct) setScore(s => s + 1);

      setAttempts(prev => {
        const s = prev[currentNumber] || { correct: 0, total: 0 };
        const updated = {
          ...prev,
          [currentNumber]: { correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }
        };
        updatePool(currentNumber, updated);
        return updated;
      });

      setTimeout(() => {
        setPool(p => {
          startRound(p, attempts);
          return p;
        });
      }, 1500);
    }
  };

  const handleUndo = () => {
    if (showResult) return;
    setBuiltDigits(prev => prev.slice(0, -1));
  };

  const handlePlayAgain = () => {
    playSound(currentNumber);
  };

  if (currentNumber === null) return null;

  const target = String(currentNumber);
  const targetLen = target.length;
  const filled = builtDigits.length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-300 via-sky-200 to-green-200 flex flex-col items-center justify-between py-6 px-4">
      {/* Header */}
      <div className="w-full flex items-center justify-between max-w-sm">
        <button onClick={onBack} className="text-gray-600 hover:text-gray-800 font-bold text-lg">← Back</button>
        <div className="text-2xl font-bold text-green-700">⭐ {score}</div>
      </div>

      {/* Prompt */}
      <div className="flex flex-col items-center gap-4 mt-4">
        <p className="text-gray-600 text-lg font-medium">Listen and build the number:</p>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={handlePlayAgain}
          className="w-24 h-24 rounded-full bg-white shadow-xl flex items-center justify-center text-5xl border-4 border-sky-300 hover:border-sky-500 transition-colors"
        >
          🔊
        </motion.button>
      </div>

      {/* Build display */}
      <div className="flex gap-4 my-6">
        {Array.from({ length: targetLen }).map((_, i) => {
          const digit = builtDigits[i];
          const isCurrent = i === filled;
          return (
            <motion.div
              key={i}
              animate={showResult ? { scale: [1, 1.15, 1] } : {}}
              className={`w-20 h-24 rounded-2xl border-4 flex items-center justify-center text-5xl font-bold shadow-md
                ${digit !== undefined
                  ? showResult
                    ? isCorrect ? 'border-green-400 bg-green-50 text-green-700' : 'border-red-400 bg-red-50 text-red-600'
                    : 'border-sky-400 bg-white text-sky-700'
                  : isCurrent
                    ? 'border-dashed border-sky-400 bg-sky-50 text-sky-300'
                    : 'border-dashed border-gray-300 bg-gray-50'
                }`}
            >
              {digit ?? ''}
            </motion.div>
          );
        })}
      </div>

      {/* Feedback */}
      <AnimatePresence>
        {showResult && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`text-3xl font-bold ${isCorrect ? 'text-green-600' : 'text-red-500'}`}
          >
            {isCorrect ? '🎉 ¡Correcto!' : `❌ Era el ${currentNumber}`}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Digit pad */}
      <div className="w-full max-w-xs mt-4">
        <div className="grid grid-cols-5 gap-3 mb-3">
          {DIGITS.map(d => (
            <motion.button
              key={d}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleDigitTap(d)}
              disabled={showResult || filled >= targetLen}
              className="h-16 rounded-2xl bg-white shadow-md text-3xl font-bold text-indigo-700 border-2 border-indigo-200 hover:border-indigo-400 disabled:opacity-40 transition-colors"
            >
              {d}
            </motion.button>
          ))}
        </div>
        <button
          onClick={handleUndo}
          disabled={showResult || builtDigits.length === 0}
          className="w-full py-3 rounded-2xl bg-white/70 text-gray-600 font-bold shadow disabled:opacity-30"
        >
          ⌫ Borrar
        </button>
      </div>
    </div>
  );
}