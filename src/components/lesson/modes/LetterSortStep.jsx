import React, { useMemo, useState } from 'react';
import { Check, AlertCircle } from 'lucide-react';
import LetterSortActivity from '@/components/lettersort/LetterSortActivity';
import { configForPreset, presetModeKey } from '@/lib/lettersort/presetConfig';
import { buildConfig } from '@/lib/lettersort/rounds';
import { useLetterSortPresets } from '@/hooks/useLetterSortPresets';
import { useClassColors } from '@/hooks/useClassColors';
import { buildLetterSortLetters, parseCurriculumKey } from '@/lib/literacy/curriculumContentBuilder';

// Embedded student step for Letter Sort. When the teacher assigned a preset, the
// activity runs that preset's config directly (no Supabase lookup). Otherwise it
// falls back to a sensible initial-letters sort. When a curriculum position is
// provided, letters are auto-built from the grapheme progression with spiral
// review.
const DEFAULT_VALS = { letters: 'a,e,i,o,u,m,p,s,t', per: 4 };

export default function LetterSortStep({ onComplete, presetId, curriculumPosition, curriculumPositionOverride, studentNumber, studentClass }) {
  const { presets, isLoading } = useLetterSortPresets();
  const { colorFor } = useClassColors();
  const [bestMistakes, setBestMistakes] = useState(null);
  const [bestFirstTryCorrect, setBestFirstTryCorrect] = useState(null);
  const [totalCards, setTotalCards] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const config = useMemo(() => {
    // A teacher-assigned custom preset (anything other than the plain
    // "letters" type) wins over curriculum auto-build.
    if (presetId && presets[presetId]) {
      const pk = presetModeKey(presets[presetId]);
      if (pk && pk !== 'letters') {
        const c = configForPreset(presets[presetId]);
        if (c) return c;
      }
    }
    // Curriculum-driven mode: build letters from M#.L# grapheme progression
    if (curriculumPosition) {
      const pos = curriculumPositionOverride
        ? parseCurriculumKey(curriculumPositionOverride)
        : curriculumPosition;
      const moduleNumber = Number(pos?.module_number);
      const lessonNumber = Number(pos?.curriculum_lesson_number);
      if (moduleNumber > 0 && lessonNumber > 0) {
        const letters = buildLetterSortLetters({ moduleNumber, lessonNumber });
        if (letters.length > 0) {
          return buildConfig('letters', null, { letters: letters.join(','), per: 4 });
        }
      }
    }
    if (presetId && presets[presetId]) {
      const c = configForPreset(presets[presetId]);
      if (c) return c;
    }
    return buildConfig('letters', null, DEFAULT_VALS);
  }, [presetId, presets, curriculumPosition, curriculumPositionOverride]);

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
    const total = totalCards ?? 0;
    const firstTryCorrect = bestFirstTryCorrect ?? 0;
    onComplete({
      mistakes: bestMistakes === null ? 99 : bestMistakes,
      firstTryCorrect,
      total,
    });
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
          onRoundComplete={({ mistakes, correct, wrong, firstTryCorrect, total }) => {
            setBestMistakes((prev) => (prev === null ? mistakes : Math.min(prev, mistakes)));
            setBestFirstTryCorrect((prev) => {
              const cur = firstTryCorrect ?? 0;
              return prev === null ? cur : Math.max(prev, cur);
            });
            setTotalCards((prev) => prev ?? total ?? null);
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