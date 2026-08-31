import { useMemo } from 'react';
import {
  getStage, getRequiredForStage, makeStageState, hasStarted,
  sectionProgressFor,
} from '@/lib/tracingStages';

// The Letter Tracing selection screen, generated on the spot from the
// teacher's session letters. Green = mastered, yellow = practicing, white =
// not started. Includes a progression bar but NO prize wheel — not all
// teachers have the prize system.
export default function LiveTracingGrid({ letters, letterProgress, completedLetters, onPick }) {
  const sectionProgress = useMemo(
    () => sectionProgressFor(letters, letterProgress, completedLetters),
    [letters, letterProgress, completedLetters]
  );

  const masteredCount = letters.filter(
    l => completedLetters.has(l) || letterProgress[l]?.mastered
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-6 px-4 gap-4">
      <div className="text-center">
        <div className="text-4xl mb-1">✏️</div>
        <h1 className="text-2xl font-bold text-slate-800">Letter Tracing</h1>
        <p className="text-slate-500 text-sm mt-1">Practice big, then get smaller and more independent.</p>
      </div>

      {/* Progress dashboard — no wheel/spins */}
      <div className="w-full max-w-md bg-white rounded-2xl border-2 border-violet-200 shadow-sm px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-black uppercase tracking-wide text-violet-700">✏️ Tracing Mission</span>
          <span className="text-xs font-black text-violet-700">{sectionProgress}%</span>
        </div>
        <div className="w-full h-4 rounded-full bg-violet-100 overflow-hidden border border-violet-200">
          <div
            className="h-full bg-violet-500 rounded-full transition-all duration-500"
            style={{ width: `${sectionProgress}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[11px] font-bold text-slate-400">
            {masteredCount}/{letters.length} letters mastered
          </span>
          <span className="text-[11px] font-bold text-violet-500">
            {sectionProgress >= 100 ? '🎉 All letters mastered!' : 'Keep tracing!'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 w-full max-w-md">
        {letters.map(letter => {
          const p = letterProgress[letter] || makeStageState();
          const stage = getStage(p);
          const done = completedLetters.has(letter) || p.mastered;
          const started = hasStarted(p);
          const required = getRequiredForStage(p);
          return (
            <button
              key={letter}
              onClick={() => { if (!done) onPick(letter); }}
              className={`h-16 rounded-xl font-bold shadow-sm transition-transform active:scale-95 flex flex-col items-center justify-center border ${
                done
                  ? 'bg-green-500 border-green-600 text-white'
                  : started
                    ? 'bg-yellow-100 border-yellow-400 text-yellow-900 hover:bg-yellow-200'
                    : 'bg-white text-indigo-700 border-indigo-100 hover:bg-indigo-50'
              }`}
            >
              <span className="text-xl">{letter}</span>
              {done ? (
                <span className="text-[9px] font-black">✓ MASTERED</span>
              ) : started ? (
                <span className="text-[9px] font-black">
                  {stage.shortLabel} {Math.min(p.stageSuccesses, required)}/{required}
                </span>
              ) : (
                <span className="text-[9px] font-bold opacity-60">NOT STARTED</span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-slate-400 text-xs">Yellow = practicing · Green = mastered</p>
    </div>
  );
}