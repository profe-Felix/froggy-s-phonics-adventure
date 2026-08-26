import React, { useMemo, useState } from 'react';
import { Check, AlertCircle } from 'lucide-react';
import LetterSortActivity from '@/components/lettersort/LetterSortActivity';
import { configForPreset } from '@/lib/lettersort/presetConfig';
import { buildConfig } from '@/lib/lettersort/rounds';
import { useLetterSortPresets } from '@/hooks/useLetterSortPresets';
import { useClassColors } from '@/hooks/useClassColors';

// Embedded student step for Letter Sort. When the teacher assigned a preset, the
// activity runs that preset's config directly (no Supabase lookup). Otherwise it
// falls back to a sensible initial-letters sort.
const DEFAULT_VALS = { letters: 'a,e,i,o,u,m,p,s,t', per: 4 };

export default function LetterSortStep({ onComplete, presetId, studentNumber, studentClass }) {
  const { presets, isLoading } = useLetterSortPresets();
  const { colorFor } = useClassColors();
  // Track the fewest mistakes across completed rounds so the step's coin
  // reward reflects the student's best performance.
  const [bestMistakes, setBestMistakes] = useState(null);
  // Most recent completed-round result, used to gate "Done" and show feedback.
  const [lastResult, setLastResult] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const config = useMemo(() => {
    if (presetId && presets[presetId]) {
      const c = configForPreset(presets[presetId]);
      if (c) return c;
    }
    return buildConfig('letters', null, DEFAULT_VALS);
  }, [presetId, presets]);

  if (isLoading && presetId && !presets[presetId]) {
    return (
      <div className="relative h-full flex flex-col bg-[#f7f8fc] items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-400 rounded-full animate-spin"></div>
      </div>
    );
  }

  const color = colorFor(studentClass);

  // "Done" only awards coins after a round was actually finished (all cards
  // placed + verified correct). Before that, it shows a "not finished" nudge
  // instead of completing — so tapping Done without doing the work no longer
  // pays out coins.
  const handleDone = () => {
    if (lastResult === null) {
      setFeedback({ type: 'incomplete' });
      return;
    }
    setFeedback({ type: 'complete', ...lastResult });
  };

  const handleFinish = () => {
    onComplete({ mistakes: bestMistakes === null ? 99 : bestMistakes });
  };

  return (
    <div className="relative h-full flex flex-col bg-[#f7f8fc]">
      {/* Student identity bar — colored by class so children can confirm their
          account is the one signed in, even mid-lesson. */}
      <div
        className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-white border-b"
        style={{ borderLeft: `6px solid ${color.to}` }}
      >
        <div
          className="rounded-full w-7 h-7 flex items-center justify-center text-white font-black text-sm"
          style={{ background: color.to }}
        >
          {studentNumber ?? '?'}
        </div>
        <span className="text-sm font-bold text-slate-700">
          Student {studentNumber ?? ''}
        </span>
        <span className="text-xs text-slate-400">{studentClass}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <LetterSortActivity
          config={config}
          isTeacher={false}
          onRoundComplete={({ mistakes, correct, wrong }) => {
            setBestMistakes((prev) => (prev === null ? mistakes : Math.min(prev, mistakes)));
            setLastResult({ mistakes: mistakes ?? 0, correct: correct ?? 0, wrong: wrong ?? 0 });
            setFeedback(null);
          }}
        />
      </div>

      {/* Done / feedback bar */}
      <div className="shrink-0 flex flex-col items-center gap-1 py-2 bg-white border-t">
        {feedback?.type === 'incomplete' && (
          <div className="flex items-center gap-1.5 text-amber-700 text-sm font-bold">
            <AlertCircle className="w-4 h-4" />
            ¡Ordena todas las cartas y toca Verificar primero!
          </div>
        )}
        {feedback?.type === 'complete' && (
          <div className="flex items-center gap-3 text-sm font-bold">
            <span className="text-green-700">✅ {feedback.correct} correctas</span>
            <span className="text-red-600">❌ {feedback.wrong} errores</span>
          </div>
        )}
        {feedback?.type === 'complete' ? (
          <button
            onClick={handleFinish}
            className="px-6 py-2 bg-green-500 text-white font-black rounded-2xl shadow hover:bg-green-600 inline-flex items-center gap-2"
          >
            <Check className="w-5 h-5" /> Finish
          </button>
        ) : (
          <button
            onClick={handleDone}
            className="px-6 py-2 bg-green-500 text-white font-black rounded-2xl shadow hover:bg-green-600 inline-flex items-center gap-2"
          >
            <Check className="w-5 h-5" /> Done
          </button>
        )}
      </div>
    </div>
  );
}