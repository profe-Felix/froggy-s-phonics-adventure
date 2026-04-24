import { useState, useEffect, useRef } from 'react';
import TenFrame from './TenFrame';
import { base44 } from '@/api/base44Client';

export default function BingoCard({ studentNumber, className, minNumber, maxNumber, calledNumbers, currentNumber, freeSpace, gameId, tenFrameSeed }) {
  const [covered, setCovered] = useState(new Set());
  const [respondedNumber, setRespondedNumber] = useState(null);
  const calledAtRef = useRef(null);
  const lastRecordedRef = useRef(null);

  // Reset covered tiles and response state when game resets
  useEffect(() => {
    if (calledNumbers.length === 0) {
      setCovered(new Set());
      setRespondedNumber(null);
    }
  }, [calledNumbers.length]);

  // Track when a new number is called
  useEffect(() => {
    if (currentNumber) {
      calledAtRef.current = Date.now();
      lastRecordedRef.current = null;
      setRespondedNumber(null);
    }
  }, [currentNumber]);

  const allNums = [];
  for (let n = minNumber; n <= maxNumber; n++) allNums.push(n);

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

  const classSeed = (className || '').split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 7), 0);
  const seed = ((studentNumber || 1) * 999983 + classSeed * 31337 + 1234567) >>> 0;
  const shuffled = uniqueShuffle(allNums, seed);

  let cells;
  if (freeSpace) {
    const eight = shuffled.slice(0, 8);
    cells = [...eight.slice(0, 4), 'FREE', ...eight.slice(4)];
  } else {
    cells = shuffled.slice(0, 9);
  }

  const handleNotOnCard = async () => {
    if (!currentNumber || !gameId || respondedNumber === currentNumber) return;
    setRespondedNumber(currentNumber); // set immediately to block spam before await
    lastRecordedRef.current = currentNumber;
    const responseTimeMs = calledAtRef.current ? Date.now() - calledAtRef.current : null;
    await base44.entities.MathBingoResponse.create({
      game_id: gameId,
      class_name: className,
      student_number: studentNumber,
      called_number: currentNumber,
      clicked_number: null,
      is_correct: false,
      response_time_ms: responseTimeMs,
      free_space_click: false,
      not_on_card: true,
    });
  };

  const handleTileClick = async (num, idx) => {
    setCovered(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });

    if (!currentNumber || !gameId) return;
    const isFree = num === 'FREE';
    const responseTimeMs = calledAtRef.current ? Date.now() - calledAtRef.current : null;
    const isCorrect = !isFree && num === currentNumber;

    if (lastRecordedRef.current === currentNumber && !isFree) return;
    lastRecordedRef.current = currentNumber;
    if (!isFree) setRespondedNumber(currentNumber);

    await base44.entities.MathBingoResponse.create({
      game_id: gameId,
      class_name: className,
      student_number: studentNumber,
      called_number: currentNumber,
      clicked_number: isFree ? null : num,
      is_correct: isFree ? null : isCorrect,
      response_time_ms: responseTimeMs,
      free_space_click: isFree,
      not_on_card: false,
    });
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {/* Calling card — ten frame */}
      <div className="bg-white rounded-2xl shadow-lg p-5 flex flex-col items-center gap-3 min-h-[120px] justify-center w-full max-w-xs">
        {currentNumber ? (
          <>
            <TenFrame value={currentNumber} size="md" seed={tenFrameSeed} />
            {respondedNumber !== currentNumber && (
              <button
                onClick={handleNotOnCard}
                className="text-sm bg-orange-100 hover:bg-orange-200 text-orange-700 border border-orange-300 rounded-full px-4 py-1 font-medium transition-colors"
              >
                Not on my card
              </button>
            )}
            {respondedNumber === currentNumber && (
              <div className="text-xs text-green-600 font-medium">✓ Responded</div>
            )}
          </>
        ) : (
          <div className="text-gray-400 text-lg">Waiting for teacher...</div>
        )}
      </div>

      {/* 3x3 Bingo card */}
      <div className="grid grid-cols-3 gap-2">
        {cells.map((num, idx) => {
          const isCovered = covered.has(idx);
          const isFree = num === 'FREE';
          return (
            <button
              key={idx}
              onClick={() => handleTileClick(num, idx)}
              className="relative w-20 h-20 sm:w-24 sm:h-24 border-2 border-gray-700 rounded-lg bg-white flex items-center justify-center font-bold text-2xl sm:text-3xl text-gray-800 shadow select-none"
            >
              {isFree ? <span className="text-sm font-bold text-green-600">FREE</span> : num}
              {isCovered && (
                <div className="absolute inset-1 rounded-md bg-yellow-400/60 border-2 border-yellow-500 pointer-events-none" />
              )}
              {isFree && !isCovered && (
                <div className="absolute inset-0 rounded-md bg-green-100/60 pointer-events-none" />
              )}
            </button>
          );
        })}
      </div>

      <div className="text-xs text-white/70">Tap a square to place/remove a counter</div>
    </div>
  );
}