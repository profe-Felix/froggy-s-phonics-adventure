import { useState } from 'react';
import TenFrame from './TenFrame';

function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function BingoCard({ studentNumber, className, minNumber, maxNumber, calledNumbers, currentNumber }) {
  const [covered, setCovered] = useState(new Set());
  const [showTenFrame, setShowTenFrame] = useState(false);

  const allNums = [];
  for (let n = minNumber; n <= maxNumber; n++) allNums.push(n);

  const seed = (studentNumber || 1) + (className || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const shuffled = seededShuffle(allNums, seed);

  // Fill a 4-col grid: use all available numbers, pad with FREE if needed
  const cols = 4;
  const rows = Math.ceil(shuffled.length / cols);
  const cells = [...shuffled];
  while (cells.length < cols * rows) cells.push('FREE');

  const toggleCover = (idx) => {
    setCovered(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Current number display */}
      <div className="bg-white rounded-2xl shadow-lg p-4 flex flex-col items-center gap-2 cursor-pointer"
        onClick={() => setShowTenFrame(v => !v)}>
        {currentNumber ? (
          <>
            <div className="text-5xl font-bold text-indigo-700">{currentNumber}</div>
            {showTenFrame && <TenFrame value={currentNumber} size="md" />}
            <div className="text-xs text-gray-400">tap to {showTenFrame ? 'hide' : 'show'} ten frame</div>
          </>
        ) : (
          <div className="text-gray-400 text-lg">Waiting for teacher...</div>
        )}
      </div>

      {/* Bingo card grid */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {cells.map((num, idx) => {
          const isCalled = num !== 'FREE' && calledNumbers?.includes(num);
          const isCovered = covered.has(idx);
          return (
            <button
              key={idx}
              onClick={() => toggleCover(idx)}
              className="relative w-16 h-16 sm:w-20 sm:h-20 border-2 border-gray-700 rounded-lg bg-white flex items-center justify-center font-bold text-xl sm:text-2xl text-gray-800 shadow select-none"
            >
              {num === 'FREE' ? <span className="text-xs font-bold text-green-600">FREE</span> : num}
              {isCovered && (
                <div className="absolute inset-1 rounded-md bg-yellow-400/60 border-2 border-yellow-500 pointer-events-none" />
              )}
              {isCalled && !isCovered && (
                <div className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full bg-green-500" />
              )}
            </button>
          );
        })}
      </div>

      <div className="text-xs text-gray-500">Tap a square to place/remove a counter</div>
    </div>
  );
}