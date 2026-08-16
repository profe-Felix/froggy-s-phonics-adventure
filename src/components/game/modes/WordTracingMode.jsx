import { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { LETTER_WAYPOINTS } from '../../data/letterWaypoints';
import LetterTracingCanvas from '../LetterTracingCanvas';
import { getLanguage } from '@/lib/language';
import { base44 } from '@/api/base44Client';

// How many times each word is traced before moving to the next one.
const TRACES_PER_WORD = 2;

export default function WordTracingMode({ studentData, onUpdateProgress, targets }) {
  const [waypoints, setWaypoints] = useState(LETTER_WAYPOINTS);
  const [wordIndex, setWordIndex] = useState(0);
  const [letterIndex, setLetterIndex] = useState(0);
  const [traceRound, setTraceRound] = useState(0);
  const [traceKey, setTraceKey] = useState(0);
  const [celebrate, setCelebrate] = useState(null);
  const traceCountRef = useRef(0);
  const advanceRef = useRef(false);

  const lang = getLanguage(studentData);

  // Load custom waypoints from the DB (teacher-authored stroke overrides).
  useEffect(() => {
    let cancelled = false;
    base44.entities.LetterWaypoint.list()
      .then((records) => {
        if (cancelled || !Array.isArray(records) || records.length === 0) return;
        setWaypoints((prev) => {
          const merged = { ...prev };
          for (const r of records) {
            if (!r.letter || !r.strokes_data) continue;
            try {
              const strokes = JSON.parse(r.strokes_data);
              if (Array.isArray(strokes) && strokes.length) {
                merged[r.letter] = { strokes, hint: r.hint || prev[r.letter]?.hint || '' };
              }
            } catch { /* ignore malformed */ }
          }
          return merged;
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const words = (targets && targets.length > 0 ? targets : ['el', 'la', 'un'])
    .map(w => w.toLowerCase().trim())
    .filter(Boolean);

  const currentWord = words[wordIndex] || '';
  const wordLetters = currentWord.split('').filter(l => waypoints[l]);
  const currentLetter = wordLetters[letterIndex];
  const letterData = currentLetter ? waypoints[currentLetter] : null;

  const doAdvance = () => {
    traceCountRef.current += 1;
    if (onUpdateProgress) {
      onUpdateProgress('word_tracing', { total_attempts: traceCountRef.current });
    }

    const nextLetterIndex = letterIndex + 1;
    if (nextLetterIndex < wordLetters.length) {
      // Next letter in the current word.
      setTimeout(() => {
        setLetterIndex(nextLetterIndex);
        setTraceKey(k => k + 1);
      }, 500);
    } else {
      // All letters in this word traced once.
      const nextRound = traceRound + 1;
      if (nextRound < TRACES_PER_WORD) {
        setCelebrate({ round: nextRound + 1, total: TRACES_PER_WORD });
        setTimeout(() => {
          setCelebrate(null);
          setLetterIndex(0);
          setTraceRound(nextRound);
          setTraceKey(k => k + 1);
        }, 1200);
      } else {
        // Word fully complete — celebrate and move to the next word.
        setCelebrate({ wordComplete: true, word: currentWord });
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        const nextWordIndex = (wordIndex + 1) % words.length;
        setTimeout(() => {
          setCelebrate(null);
          setWordIndex(nextWordIndex);
          setLetterIndex(0);
          setTraceRound(0);
          setTraceKey(k => k + 1);
        }, 1800);
      }
    }
  };

  // Auto-advance ~1.2s after the letter is traced cleanly, so young students
  // don't have to find and click the "Next" button — but if they do click it,
  // advance immediately. Either path fires doAdvance exactly once.
  const handleAccuracy = (acc) => {
    if (acc != null && !advanceRef.current) {
      advanceRef.current = true;
      setTimeout(() => {
        if (advanceRef.current) {
          advanceRef.current = false;
          doAdvance();
        }
      }, 1200);
    }
  };

  const handleComplete = () => {
    if (advanceRef.current) return; // auto-advance already scheduled
    advanceRef.current = false;
    doAdvance();
  };

  if (!currentLetter || !letterData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-2">✏️</div>
          <p className="text-slate-500">No words to trace yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-4 px-4 gap-3">
      {/* Word header with per-letter progress */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-end gap-0.5">
          {currentWord.split('').map((ch, i) => {
            const hasWp = !!waypoints[ch];
            const isDone = hasWp && i < letterIndex;
            const isCurrent = i === letterIndex;
            return (
              <span
                key={i}
                className={`text-4xl font-bold transition-all ${
                  !hasWp ? 'text-slate-300' :
                  isDone ? 'text-green-500' :
                  isCurrent ? 'text-indigo-600 scale-110' :
                  'text-slate-300'
                }`}
              >
                {ch}
              </span>
            );
          })}
        </div>
        {/* Round dots */}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: TRACES_PER_WORD }).map((_, i) => (
            <div key={i} className={`w-2.5 h-2.5 rounded-full transition-colors ${
              i < traceRound ? 'bg-green-400' : i === traceRound ? 'bg-indigo-500' : 'bg-slate-200'
            }`} />
          ))}
          <span className="text-xs text-slate-400 font-bold ml-1">
            Trace {traceRound + 1} of {TRACES_PER_WORD}
          </span>
        </div>
      </div>

      {/* Current letter label */}
      <div className="text-sm font-bold text-slate-500">
        Tracing: <span className="text-indigo-600 text-lg">{currentLetter.toUpperCase()}</span>
      </div>

      {/* Tracing canvas — reuses the same validation as letter tracing */}
      <LetterTracingCanvas
        key={`${wordIndex}-${letterIndex}-${traceRound}-${traceKey}`}
        letter={currentLetter}
        lang={lang}
        strokes={letterData.strokes}
        renderWidth={Math.min(360, Math.max(220, (typeof window !== 'undefined' ? window.innerWidth : 800) * 0.85))}
        onComplete={handleComplete}
        onAccuracy={handleAccuracy}
        onReset={() => {}}
      />

      {/* Celebration overlay */}
      {celebrate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-3xl shadow-2xl px-8 py-6 flex flex-col items-center gap-2">
            {celebrate.wordComplete ? (
              <>
                <div className="text-4xl">🎉</div>
                <div className="text-xl font-black text-slate-800">"{celebrate.word}" complete!</div>
              </>
            ) : (
              <>
                <div className="text-3xl">⭐</div>
                <div className="text-lg font-bold text-slate-700">Round {celebrate.round} of {celebrate.total}</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}