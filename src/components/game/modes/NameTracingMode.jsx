import { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { LETTER_WAYPOINTS } from '../../data/letterWaypoints';
import WordTracingCanvas from '../WordTracingCanvas';
import { getLanguage } from '@/lib/language';
import { computeWordLayout } from '@/lib/tracingCore';
import { base44 } from '@/api/base44Client';

// Name Tracing — like Word Tracing, but the target word is the student's own
// name pulled from the roster (Student.name for their class + number).
// Case is preserved so the capital letter at the start traces correctly.
export default function NameTracingMode({
  studentData,
  onUpdateProgress,
  onBack,
}) {
  const [waypoints, setWaypoints] = useState(LETTER_WAYPOINTS);
  const [traceKey, setTraceKey] = useState(0);
  const [currentRep, setCurrentRep] = useState(1);
  const [celebrate, setCelebrate] = useState(null);
  const [scrollLetterIndex, setScrollLetterIndex] = useState(0);
  const scrollRef = useRef(null);
  const prevNameRef = useRef(null);

  const lang = getLanguage(studentData);
  // Preserve case — names start with a capital. Strip spaces so the name
  // traces as one connected unit (WordTracingCanvas lays out letters side
  // by side; a space would render as a gap with no guide).
  const name = (studentData?.name || '').trim();

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

  // WordTracingCanvas layout constants — must match the canvas internals
  // (X_SCALE=600, LETTER_GAP=45, PADDING=30, REPETITIONS=3, WORD_GAP=80).
  const { totalW, letters: nameLetters, layout: letterLayout } = computeWordLayout(name, waypoints, 600, 45, 30, 3, 80);

  // Auto-scroll to keep the current letter in view (same logic as WordTracingMode).
  useEffect(() => {
    if (!scrollRef.current) return;
    if (prevNameRef.current !== name) {
      prevNameRef.current = name;
      scrollRef.current.scrollTo({ left: 0, behavior: 'auto' });
      return;
    }
    const lay = letterLayout[scrollLetterIndex];
    if (!lay) return;
    const containerW = scrollRef.current.clientWidth;
    const svg = scrollRef.current.querySelector('svg');
    const renderedW = svg ? svg.getBoundingClientRect().width : totalW;
    const scale = renderedW / totalW;
    const letterLeft = lay.offset * scale;
    const letterWidth = (lay.width || 360) * scale;
    const letterRight = letterLeft + letterWidth;
    const currentScroll = scrollRef.current.scrollLeft;
    const viewportRight = currentScroll + containerW;
    if (letterRight <= viewportRight - containerW * 0.25 && letterLeft >= currentScroll) return;
    const letterCenter = letterLeft + letterWidth / 2;
    let target = letterCenter - containerW / 2;
    target = Math.min(target, letterLeft - 20);
    target = Math.max(0, target);
    const maxScroll = Math.max(0, renderedW - containerW);
    target = Math.min(target, maxScroll);
    scrollRef.current.scrollTo({ left: target, behavior: 'smooth' });
  }, [scrollLetterIndex, letterLayout, totalW, name]);

  const handleProgress = ({ currentRep: rep, letterIndex: li }) => {
    setCurrentRep(rep);
    if (li != null) setScrollLetterIndex(li);
  };

  const handleComplete = (accuracy) => {
    const passed = accuracy == null || accuracy >= 80;
    setCelebrate({ name, accuracy, passed });

    if (passed) {
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    }

    if (onUpdateProgress) {
      // Record name-tracing as a mastered item under word_tracing progress
      // so it shows up in the student's progress, keyed by their name.
      const existing = studentData?.mode_progress?.word_tracing || {
        mastered_items: [], learning_items: [], item_attempts: {}, total_correct: 0, total_attempts: 0, unlocked: true,
      };
      const mastered = new Set(existing.mastered_items || []);
      if (passed) mastered.add(name);
      onUpdateProgress('word_tracing', {
        mastered_items: Array.from(mastered),
        total_attempts: mastered.size,
        total_correct: mastered.size,
        learning_items: [],
      });
    }

    setTimeout(() => {
      setCelebrate(null);
      setTraceKey(k => k + 1);
      setCurrentRep(1);
      setScrollLetterIndex(0);
    }, 2400);
  };

  if (!name) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-3">✏️</div>
          <h2 className="text-xl font-bold text-slate-700 mb-2">No name set yet</h2>
          <p className="text-slate-500 text-sm mb-6">
            Ask your teacher to add your name in the roster, then come back to practice writing it!
          </p>
          {onBack && (
            <button onClick={onBack} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700">
              Back
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!nameLetters.length) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-3">✏️</div>
          <p className="text-slate-500">No traceable letters in your name yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-50 flex flex-col items-center py-4 px-4 gap-3">
      {/* Name + repetition indicator */}
      <div className="flex items-center justify-center gap-3 shrink-0">
        <div className="flex items-end gap-0.5">
          {name.split('').map((ch, i) => (
            <span key={i} className={`text-2xl font-bold leading-none ${waypoints[ch] ? 'text-slate-700' : 'text-slate-300'}`}>
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
            Time {currentRep} of 3
          </span>
        </div>
      </div>

      {/* Name tracing canvas — 3 repetitions on one connected canvas */}
      <div ref={scrollRef} className="flex-1 min-h-0 w-full overflow-x-auto overflow-y-hidden pb-2 -mx-2 px-2">
        <WordTracingCanvas
          key={traceKey}
          word={name}
          waypoints={waypoints}
          lang={lang}
          renderWidth={totalW}
          fillHeight
          onComplete={handleComplete}
          onProgress={handleProgress}
        />
      </div>

      {/* Celebration overlay */}
      {celebrate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-3xl shadow-2xl px-8 py-6 flex flex-col items-center gap-2">
            <div className="text-4xl">{celebrate.passed ? '🎉' : '✏️'}</div>
            <div className="text-xl font-black text-slate-800">
              {celebrate.passed ? `Great job writing "${celebrate.name}"!` : `Try writing "${celebrate.name}" again`}
            </div>
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