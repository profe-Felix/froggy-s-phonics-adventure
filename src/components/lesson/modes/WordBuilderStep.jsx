import React from 'react';
import WordSentenceBuilder from '@/pages/WordSentenceBuilder';
import StepDoneBar from './StepDoneBar';
import { useWordBuilderPresets } from '@/hooks/useWordBuilderPresets';
import { useCoinAward } from '@/hooks/useCoinAward';
import { syllabifyEs } from '@/lib/spanishSyllables';

// Embedded student step for the Word/Sentence Builder.
//
// studentData is passed through so the adaptive Build → Trace → Write
// activity can use the student's Letter Tracing progression as its
// eligibility gate.
export default function WordBuilderStep({
  onComplete,
  studentNumber,
  className,
  studentData,
  onStudentPatch,
  presetId,
  curriculumPosition,
}) {
  const { presets: wbPresets, isLoading: wbLoading } = useWordBuilderPresets();
  const preset = presetId
    ? wbPresets[presetId] || null
    : null;

  const awardCoins = useCoinAward(studentData, onStudentPatch);

  // While DB presets are loading and a preset was requested but not yet
  // resolved, show a spinner instead of flashing the default config.
  if (wbLoading && presetId && !preset) {
    return (
      <div className="relative h-full flex flex-col bg-blue-50 items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  const handleWordComplete = (result) => {
    if (!result?.target) return;
    const syllableCount =
      result.type === 'syllable'
        ? 1
        : syllabifyEs(result.target).length;
    awardCoins(syllableCount * 2);
  };

  return (
    <div className="relative h-full flex flex-col bg-blue-50">
      <div className="flex-1 min-h-0 overflow-auto">
        <WordSentenceBuilder
          embedStudent={studentNumber}
          embedClass={className}
          embedStudentData={studentData}
          embedPresetObject={preset}
          embedCurriculumPosition={
            curriculumPosition
          }
          onWordComplete={handleWordComplete}
        />
      </div>

      <StepDoneBar onDone={onComplete} />
    </div>
  );
}