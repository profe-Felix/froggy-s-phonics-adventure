import { useState, useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';
import LetterTracingCanvas from '@/components/game/LetterTracingCanvas';

// ---------------------------------------------------------------------------
// TRACING MASTERY SEQUENCE — identical to the Letter Tracing game.
// Three stages, three traces each = 9 successful traces to master a letter.
// Support fades: guided first, then independent at two smaller sizes.
//
// A stage advances only when the student finishes the required copies AND has
// at least 2 clean traces in a row. Each mistake resets the clean streak and
// adds one repair repetition (capped at +2 per stage).
//
// This component is self-contained / in-memory only — no student record, no
// coins, no prize wheel. The teacher controls which letter is active; the
// parent remounts via `key={letter}` so every new letter starts at stage 0.
// ---------------------------------------------------------------------------

const TRACING_STAGES = [
  { key: 'guided_huge', label: 'Guided Huge', shortLabel: 'Guided', sizeLevel: 0, repetitions: 3, showGuide: true },
  { key: 'independent_big', label: 'Independent Big', shortLabel: 'Big', sizeLevel: 1, repetitions: 3, showGuide: false },
  { key: 'independent_medium', label: 'Independent Medium', shortLabel: 'Medium', sizeLevel: 2, repetitions: 3, showGuide: false },
];

const SIZE_LEVELS = [
  { w: 1100, label: 'Huge' },
  { w: 1000, label: 'Big' },
  { w: 900, label: 'Medium' },
  { w: 800, label: 'Small' },
  { w: 720, label: 'Muscle Memory' },
];

const REQUIRED_CLEAN_STREAK = 2;
const MAX_REPAIR_REPS = 2;

function makeStageState() {
  return {
    stageIndex: 0,
    stageSuccesses: 0,
    cleanStreak: 0,
    repairReps: 0,
    mistakes: 0,
    totalSuccesses: 0,
    totalAttempts: 0,
    mastered: false,
  };
}

function getStage(p) {
  return TRACING_STAGES[Math.min(Math.max(p?.stageIndex || 0, 0), TRACING_STAGES.length - 1)];
}

function getRequiredForStage(p) {
  const s = getStage(p);
  return s.repetitions + Math.min(p?.repairReps || 0, MAX_REPAIR_REPS);
}

export default function LiveTracingProgression({ letter, letterData, lang = 'es', silent = false }) {
  const [progress, setProgress] = useState(makeStageState);
  const [lastAccuracy, setLastAccuracy] = useState(null);
  const [celebrate, setCelebrate] = useState(null);
  const [traceKey, setTraceKey] = useState(0);

  const strokes = letterData?.strokes;

  const stage = getStage(progress);
  const required = getRequiredForStage(progress);
  const practiceCopies = required;
  const activeCopy = Math.min(progress.stageSuccesses || 0, Math.max(0, practiceCopies - 1));
  const sizeLabel = SIZE_LEVELS[stage.sizeLevel]?.label || stage.label;

  const renderWidthFor = useMemo(() => {
    const targetWidth = SIZE_LEVELS[stage.sizeLevel]?.w || SIZE_LEVELS[0].w;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 800;
    const availableWidth = viewportWidth * 0.96;
    return Math.min(targetWidth, Math.max(320, availableWidth));
  }, [stage.sizeLevel]);

  // Mistake — wrong start, direction error, drift, incomplete lift, etc.
  const handleMistake = () => {
    setProgress(prev => {
      if (prev.mastered) return prev;
      return {
        ...prev,
        cleanStreak: 0,
        mistakes: prev.mistakes + 1,
        totalAttempts: prev.totalAttempts + 1,
        repairReps: Math.min(MAX_REPAIR_REPS, prev.repairReps + 1),
      };
    });
  };

  // Successful copy — advance stage / mastery using the same rules as the
  // Letter Tracing game. Reads current state synchronously so side effects fire.
  const handleComplete = () => {
    const acc = lastAccuracy;

    // A completed pathway below 80% is accepted by the canvas but is NOT
    // clean enough to count toward mastery — treat it as repair practice.
    if (acc != null && acc < 80) {
      setProgress(prev => ({
        ...prev,
        cleanStreak: 0,
        mistakes: prev.mistakes + 1,
        totalAttempts: prev.totalAttempts + 1,
        repairReps: Math.min(MAX_REPAIR_REPS, prev.repairReps + 1),
      }));
      setCelebrate({ type: 'repair', letter, message: 'Almost! One more practice trace.' });
      setTimeout(() => setCelebrate(null), 1000);
      setLastAccuracy(null);
      setTraceKey(k => k + 1);
      return;
    }

    const current = progress;
    if (current.mastered) return;

    const stg = TRACING_STAGES[current.stageIndex];
    const req = stg.repetitions + Math.min(current.repairReps || 0, MAX_REPAIR_REPS);
    const nextSuccesses = (current.stageSuccesses || 0) + 1;
    const nextClean = (current.cleanStreak || 0) + 1;
    const nextTotal = (current.totalSuccesses || 0) + 1;
    const stagePassed = nextSuccesses >= req && nextClean >= REQUIRED_CLEAN_STREAK;

    let masteredThisTurn = false;
    let advancedStage = false;
    let nextStageIndex = current.stageIndex;
    let next;

    if (!stagePassed) {
      next = {
        ...current,
        stageSuccesses: nextSuccesses,
        cleanStreak: nextClean,
        totalSuccesses: nextTotal,
        totalAttempts: (current.totalAttempts || 0) + 1,
      };
    } else if (current.stageIndex < TRACING_STAGES.length - 1) {
      advancedStage = true;
      nextStageIndex = current.stageIndex + 1;
      next = {
        ...current,
        stageIndex: current.stageIndex + 1,
        stageSuccesses: 0,
        cleanStreak: 0,
        repairReps: 0,
        totalSuccesses: nextTotal,
        totalAttempts: (current.totalAttempts || 0) + 1,
      };
    } else {
      masteredThisTurn = true;
      nextStageIndex = TRACING_STAGES.length;
      next = {
        ...current,
        stageSuccesses: nextSuccesses,
        cleanStreak: nextClean,
        totalSuccesses: nextTotal,
        totalAttempts: (current.totalAttempts || 0) + 1,
        mastered: true,
      };
    }

    setProgress(next);

    if (masteredThisTurn) {
      setCelebrate({ type: 'mastered', letter, message: 'Letter mastered!' });
      confetti({ particleCount: 100, spread: 75, origin: { y: 0.6 } });
      return;
    }

    if (advancedStage) {
      const ns = TRACING_STAGES[nextStageIndex];
      setCelebrate({
        type: 'stage',
        letter,
        message: ns.showGuide ? ns.label : `${ns.label} — no dots`,
      });
      setTimeout(() => {
        setCelebrate(null);
        setLastAccuracy(null);
        setTraceKey(k => k + 1);
      }, 900);
      return;
    }

    // Same stage, next copy.
    setTimeout(() => {
      setLastAccuracy(null);
      setTraceKey(k => k + 1);
    }, 450);
  };

  if (!strokes || !strokes.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
        <div className="text-4xl">✏️</div>
        <p>No tracing path is available for {letter}.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      {/* Header */}
      <div className="flex items-center justify-between w-full max-w-3xl px-1">
        <div className="flex flex-col items-center leading-tight">
          <div className="text-slate-800 font-black text-2xl">{letter}</div>
          <div className="text-[11px] text-slate-400 font-bold">{stage.label}</div>
        </div>
        <div className={`text-xs font-bold rounded-full px-3 py-1 border ${
          stage.showGuide
            ? 'text-amber-700 bg-amber-50 border-amber-200'
            : 'text-indigo-700 bg-indigo-50 border-indigo-100'
        }`}>
          {stage.showGuide ? '● Guided' : '✍️ Your turn'}
        </div>
      </div>

      {/* Current stage status */}
      <div className="flex items-center gap-2 flex-wrap justify-center">
        <div className="bg-white border border-slate-200 rounded-full px-3 py-1 text-xs font-bold text-slate-600">
          {sizeLabel}
        </div>
        <div className="bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1 text-xs font-bold text-indigo-700">
          Trace {Math.min(progress.stageSuccesses + 1, required)} of {required}
        </div>
        <div className={`rounded-full px-3 py-1 text-xs font-bold border ${
          progress.cleanStreak >= REQUIRED_CLEAN_STREAK
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-slate-50 border-slate-200 text-slate-500'
        }`}>
          Clean streak: {Math.min(progress.cleanStreak, REQUIRED_CLEAN_STREAK)}/{REQUIRED_CLEAN_STREAK}
        </div>
        {progress.repairReps > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-full px-3 py-1 text-xs font-bold text-amber-700">
            +{progress.repairReps} repair practice
          </div>
        )}
      </div>

      {letterData?.hint && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-1.5 text-indigo-700 text-sm text-center max-w-lg">
          {letterData.hint}
        </div>
      )}

      <LetterTracingCanvas
        key={`${traceKey}-${progress.stageIndex}-${activeCopy}-${practiceCopies}`}
        letter={letter}
        lang={lang}
        strokes={strokes}
        renderWidth={renderWidthFor}
        practiceCopies={practiceCopies}
        activeCopy={activeCopy}
        showGuide={stage.showGuide}
        silent={silent}
        onMistake={handleMistake}
        onComplete={handleComplete}
        onAccuracy={setLastAccuracy}
        onReset={() => {}}
      />

      {/* Stage / mastery celebration */}
      {celebrate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className={`rounded-3xl shadow-2xl px-8 py-6 flex flex-col items-center gap-2 ${
            celebrate.type === 'repair' ? 'bg-amber-50 border-4 border-amber-300' : 'bg-white'
          }`}>
            {celebrate.type === 'repair' ? (
              <div className="text-4xl">✏️</div>
            ) : (
              <Sparkles className="w-10 h-10 text-amber-400" />
            )}
            <div className="text-2xl font-black text-slate-800">
              {celebrate.type === 'mastered'
                ? `${celebrate.letter} mastered!`
                : celebrate.type === 'stage'
                  ? 'Level Up!'
                  : 'Keep practicing!'}
            </div>
            <div className="text-slate-500 text-sm font-bold">{celebrate.message}</div>
          </div>
        </div>
      )}
    </div>
  );
}