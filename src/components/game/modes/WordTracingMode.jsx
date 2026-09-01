import { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { LETTER_WAYPOINTS } from '../../data/letterWaypoints';
import WordTracingCanvas from '../WordTracingCanvas';
import { getLanguage } from '@/lib/language';
import { computeWordLayout } from '@/lib/tracingCore';
import { base44 } from '@/api/base44Client';
import PrizeWheel from '../PrizeWheel';

export default function WordTracingMode({
  studentData,
  onUpdateProgress,
  onStudentPatch,
  targets,
  freeSpinEnabled = true,
}) {
  const [waypoints, setWaypoints] = useState(LETTER_WAYPOINTS);
  const [wordIndex, setWordIndex] = useState(0);
  const [traceKey, setTraceKey] = useState(0);
  const [currentRep, setCurrentRep] = useState(1);
  const [celebrate, setCelebrate] = useState(null);
  const [scrollLetterIndex, setScrollLetterIndex] = useState(0);
  const traceCountRef = useRef(0);
  const scrollRef = useRef(null);

  // A word becomes mastered after completing its full 3-copy tracing run
  // with at least 80% accuracy.
  const [masteredWords, setMasteredWords] = useState(new Set());

  // First full word-tracing mastery earns one free spin.
  // LessonModeRouter disables this on a replay and awards 8 coins instead.
  const [showWheel, setShowWheel] = useState(false);
  const [freeSpinReady, setFreeSpinReady] = useState(false);
  const [redeemedPrizes, setRedeemedPrizes] = useState(
    () => studentData?.redeemed_prizes || []
  );

  const freeSpinAwardedRef = useRef(false);

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

  // IMPORTANT: these layout params MUST match WordTracingCanvas's internal
  // constants (X_SCALE=600, LETTER_GAP=45, PADDING=30, REPETITIONS=3,
  // WORD_GAP=80). The auto-scroll below uses this layout to center the current
  // letter; if the gap differs from the canvas, the scroll targets the wrong
  // x-position and clips the letter being traced.
  const currentWord = words[wordIndex] || '';
  const { totalW, letters: wordLetters, layout: letterLayout } = computeWordLayout(currentWord, waypoints, 600, 45, 30, 3, 80);

  // Auto-scroll the tracing canvas so the current letter is always centered and
  // large enough for accurate tracing. The canvas renders at full width inside a
  // scroll container; students never scroll manually (touch is captured for drawing).
  useEffect(() => {
    if (!scrollRef.current) return;
    const lay = letterLayout[scrollLetterIndex];
    if (!lay) return;
    const containerW = scrollRef.current.clientWidth;
    // The SVG now renders at a height that fits the container, so its rendered
    // width is NOT the viewBox totalW — scale letter positions from viewBox
    // coords to rendered px before scrolling, or the scroll targets the wrong
    // x-position and clips the letter being traced.
    const svg = scrollRef.current.querySelector('svg');
    const renderedW = svg ? svg.getBoundingClientRect().width : totalW;
    const scale = renderedW / totalW;
    const letterLeft = lay.offset * scale;
    const letterWidth = (lay.width || 360) * scale;
    const letterCenter = letterLeft + letterWidth / 2;
    // Try to center the letter in the container.
    let target = letterCenter - containerW / 2;
    // Never push the letter's left edge off-screen — keep at least 20px of
    // left margin so the student can always reach the first waypoint.
    target = Math.min(target, letterLeft - 20);
    // Clamp to valid scroll range.
    target = Math.max(0, target);
    const maxScroll = Math.max(0, renderedW - containerW);
    target = Math.min(target, maxScroll);
    scrollRef.current.scrollTo({ left: target, behavior: 'smooth' });
  }, [scrollLetterIndex, letterLayout, totalW]);

  const handleProgress = ({ currentRep: rep, letterIndex: li }) => {
    setCurrentRep(rep);
    if (li != null) setScrollLetterIndex(li);
  };

  const handleWordComplete = (accuracy) => {
    traceCountRef.current += 1;

    const passed =
      accuracy == null ||
      accuracy >= 80;

    const nextMastered =
      new Set(masteredWords);

    if (passed) {
      nextMastered.add(currentWord);
      setMasteredWords(nextMastered);
    }

    if (onUpdateProgress) {
      onUpdateProgress('word_tracing', {
        mastered_items: Array.from(nextMastered),

        // LessonModeRouter treats tracing total_attempts as the number
        // of fully mastered targets, not raw tracing attempts.
        total_attempts: nextMastered.size,

        // Preserve the actual number of completed 3-copy word runs
        // separately for analytics.
        raw_trace_attempts: traceCountRef.current,

        total_correct: nextMastered.size,

        learning_items: words.filter(
          word => !nextMastered.has(word)
        ),
      });
    }

    if (passed) {
      setCelebrate({
        wordComplete: true,
        word: currentWord,
        accuracy,
      });

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } else {
      setCelebrate({
        wordComplete: false,
        word: currentWord,
        accuracy,
      });
    }

    const allNowMastered =
      words.length > 0 &&
      words.every(
        word => nextMastered.has(word)
      );

    if (
      allNowMastered &&
      freeSpinEnabled &&
      !freeSpinAwardedRef.current
    ) {
      freeSpinAwardedRef.current = true;
      setFreeSpinReady(true);

      setTimeout(() => {
        setCelebrate(null);
        setShowWheel(true);
      }, 2200);

      return;
    }

    const nextWordIndex =
      (wordIndex + 1) %
      words.length;

    setTimeout(() => {
      setCelebrate(null);
      setWordIndex(nextWordIndex);
      setCurrentRep(1);
      setScrollLetterIndex(0);
      setTraceKey(k => k + 1);
    }, 2200);
  };

  const handleClaimPrize = (prize) => {
    setShowWheel(false);
    setFreeSpinReady(false);

    if (
      prize?.oneTime &&
      !redeemedPrizes.includes(prize.id)
    ) {
      const updated = [
        ...redeemedPrizes,
        prize.id,
      ];

      setRedeemedPrizes(updated);

      if (studentData?.id) {
        base44.entities.Student.update(
          studentData.id,
          {
            redeemed_prizes: updated,
          }
        ).catch(() => {});
      }
    }
  };

  const handleCloseWheel = () => {
    setShowWheel(false);
    setFreeSpinReady(false);
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
    <div className="h-full bg-slate-50 flex flex-col items-center py-4 px-4 gap-3">
      {/* Word + repetition indicator — one compact row so the canvas stays tall */}
      <div className="flex items-center justify-center gap-3 shrink-0">
        <div className="flex items-end gap-0.5">
          {currentWord.split('').map((ch, i) => (
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
            Word {currentRep} of 3
          </span>
        </div>
      </div>

      {/* Word tracing canvas — 3 repetitions with spaces on one connected canvas.
          Rendered at full width inside a horizontally scrollable container so each
          letter is large; auto-scrolls to the current letter. */}
      <div ref={scrollRef} className="flex-1 min-h-0 w-full overflow-x-auto overflow-y-hidden pb-2 -mx-2 px-2">
        <WordTracingCanvas
          key={traceKey}
          word={currentWord}
          waypoints={waypoints}
          lang={lang}
          renderWidth={totalW}
          fillHeight
          onComplete={handleWordComplete}
          onProgress={handleProgress}
        />
      </div>

      {/* Celebration overlay */}
      {celebrate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-3xl shadow-2xl px-8 py-6 flex flex-col items-center gap-2">
            <div className="text-4xl">
              {celebrate.wordComplete ? '🎉' : '✏️'}
            </div>

            <div className="text-xl font-black text-slate-800">
              {celebrate.wordComplete
                ? `"${celebrate.word}" mastered!`
                : `Practice "${celebrate.word}" again`}
            </div>

            {celebrate.accuracy != null && (
              <div className={`text-sm font-bold ${celebrate.accuracy >= 80 ? 'text-green-600' : 'text-amber-600'}`}>
                🎯 {celebrate.accuracy}% accuracy
              </div>
            )}

            {!celebrate.wordComplete && (
              <div className="text-sm font-bold text-amber-600">
                Reach 80% accuracy to master this word.
              </div>
            )}
          </div>
        </div>
      )}

      {/* First full word-tracing mastery earns a free spin. */}
      {showWheel && (
        <div className="fixed inset-0 z-[150]">
          <div className="absolute top-4 inset-x-0 z-[151] flex justify-center pointer-events-none">
            <div className="bg-violet-600 text-white rounded-full px-6 py-2 font-black shadow-xl">
              🎉 Word tracing complete — FREE SPIN! 🎡
            </div>
          </div>

          <PrizeWheel
            key={`word-tracing-wheel-${studentData?.id || 'guest'}`}
            studentData={studentData}
            onStudentPatch={onStudentPatch}
            redeemedPrizes={redeemedPrizes}
            onClaim={handleClaimPrize}
            onClose={handleCloseWheel}
            freeSpin={true}
            source="word-tracing"
          />
        </div>
      )}

      {freeSpinReady && !showWheel && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-violet-600 text-white rounded-full px-5 py-2 font-black shadow-xl z-40">
          🎡 Free spin earned!
        </div>
      )}
    </div>
  );
}