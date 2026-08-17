import { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { LETTER_WAYPOINTS } from '../../data/letterWaypoints';
import WordTracingCanvas from '../WordTracingCanvas';
import { getLanguage } from '@/lib/language';
import { computeWordLayout } from '@/lib/tracingCore';
import { base44 } from '@/api/base44Client';

export default function WordTracingMode({ studentData, onUpdateProgress, targets }) {
  const [waypoints, setWaypoints] = useState(LETTER_WAYPOINTS);
  const [wordIndex, setWordIndex] = useState(0);
  const [traceKey, setTraceKey] = useState(0);
  const [currentRep, setCurrentRep] = useState(1);
  const [celebrate, setCelebrate] = useState(null);
  const [scrollLetterIndex, setScrollLetterIndex] = useState(0);
  const traceCountRef = useRef(0);
  const scrollRef = useRef(null);

  const lang = getLanguage(studentData);

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
  const { totalW, letters: wordLetters, layout: letterLayout } = computeWordLayout(currentWord, waypoints, 360, 20, 30, 3, 80);

  // Auto-scroll the tracing canvas so the current letter is always centered and
  // large enough for accurate tracing. The canvas renders at full width inside a
  // scroll container; students never scroll manually (touch is captured for drawing).
  useEffect(() => {
    if (!scrollRef.current) return;
    const lay = letterLayout[scrollLetterIndex];
    if (!lay) return;
    const containerW = scrollRef.current.clientWidth;
    const target = Math.max(0, lay.offset + (lay.width || 360) / 2 - containerW / 2);
    scrollRef.current.scrollTo({ left: target, behavior: 'smooth' });
  }, [scrollLetterIndex, letterLayout]);

  const handleProgress = ({ currentRep: rep, letterIndex: li }) => {
    setCurrentRep(rep);
    if (li != null) setScrollLetterIndex(li);
  };

  const handleWordComplete = (accuracy) => {
    traceCountRef.current += 1;
    if (onUpdateProgress) {
      onUpdateProgress('word_tracing', { total_attempts: traceCountRef.current });
    }
    setCelebrate({ wordComplete: true, word: currentWord, accuracy });
    confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    const nextWordIndex = (wordIndex + 1) % words.length;
    setTimeout(() => {
      setCelebrate(null);
      setWordIndex(nextWordIndex);
      setCurrentRep(1);
      setTraceKey(k => k + 1);
    }, 2200);
  };

  if (!currentWord || !wordLetters.length) {
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
      {/* Word + repetition indicator */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-end gap-0.5">
          {currentWord.split('').map((ch, i) => (
            <span key={i} className={`text-3xl font-bold ${waypoints[ch] ? 'text-slate-700' : 'text-slate-300'}`}>
              {ch}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {[1, 2, 3].map((rep) => (
            <div key={rep} className={`w-2.5 h-2.5 rounded-full transition-colors ${
              rep < currentRep ? 'bg-green-400' : rep === currentRep ? 'bg-indigo-500' : 'bg-slate-200'
            }`} />
          ))}
          <span className="text-xs text-slate-400 font-bold ml-1">
            Word {currentRep} of 3
          </span>
        </div>
      </div>

      {/* Word tracing canvas — 3 repetitions with spaces on one connected canvas.
          Rendered at full width inside a horizontally scrollable container so each
          letter is large; auto-scrolls to the current letter. */}
      <div ref={scrollRef} className="w-full overflow-x-auto overflow-y-hidden pb-2 -mx-2 px-2">
        <WordTracingCanvas
          key={traceKey}
          word={currentWord}
          waypoints={waypoints}
          lang={lang}
          renderWidth={totalW}
          onComplete={handleWordComplete}
          onProgress={handleProgress}
        />
      </div>

      {/* Celebration overlay */}
      {celebrate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-3xl shadow-2xl px-8 py-6 flex flex-col items-center gap-2">
            <div className="text-4xl">🎉</div>
            <div className="text-xl font-black text-slate-800">"{celebrate.word}" complete!</div>
            {celebrate.accuracy != null && (
              <div className={`text-sm font-bold ${celebrate.accuracy >= 80 ? 'text-green-600' : 'text-amber-600'}`}>
                🎯 {celebrate.accuracy}% accuracy
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}