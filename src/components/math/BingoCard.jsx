import { useState } from 'react';
import TenFrame from './TenFrame';

export default function BingoCard({ studentNumber, className, minNumber, maxNumber, calledNumbers, currentNumber }) {
  const [covered, setCovered] = useState(new Set());

  const allNums = [];
  for (let n = minNumber; n <= maxNumber; n++) allNums.push(n);

  // Unique shuffle per student using a unique seed
  function uniqueShuffle(arr, seed) {
    const a = [...arr];
    let s = seed;
    for (let i = a.length - 1; i > 0; i--) {
      s = ((s ^ (s << 13)) ^ (s >> 7) ^ (s << 17)) >>> 0;
      const j = s % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Use student number + class + a large prime to ensure uniqueness
  const classSeed = (className || '').split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 7), 0);
  const seed = ((studentNumber || 1) * 999983 + classSeed * 31337 + 1234567) >>> 0;
  const shuffled = uniqueShuffle(allNums, seed);
  const cells = shuffled.slice(0, 9); // 3x3 = 9 cells

  const toggleCover = (idx) => {
    setCovered(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {/* Current number - ten frame only, no digit */}
      <div className="bg-white rounded-2xl shadow-lg p-5 flex flex-col items-center gap-2 min-h-[120px] justify-center">
        {currentNumber ? (
          <TenFrame value={currentNumber} size="md" />
        ) : (
          <div className="text-gray-400 text-lg">Waiting for teacher...</div>
        )}
      </div>

      {/* 3x3 Bingo card */}
      <div className="grid grid-cols-3 gap-2">
        {cells.map((num, idx) => {
          const isCovered = covered.has(idx);
          return (
            <button
              key={idx}
              onClick={() => toggleCover(idx)}
              className="relative w-20 h-20 sm:w-24 sm:h-24 border-2 border-gray-700 rounded-lg bg-white flex items-center justify-center font-bold text-2xl sm:text-3xl text-gray-800 shadow select-none"
            >
              {num}
              {isCovered && (
                <div className="absolute inset-1 rounded-md bg-yellow-400/60 border-2 border-yellow-500 pointer-events-none" />
              )}
            </button>
          );
        })}
      </div>

      <div className="text-xs text-white/70">Tap a square to place/remove a counter</div>
    </div>
  );
}