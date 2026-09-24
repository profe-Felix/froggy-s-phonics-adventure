import React from 'react';
import WordSentenceBuilder from '@/pages/WordSentenceBuilder';
import StepDoneBar from './StepDoneBar';
import { getWordBuilderPreset } from '@/lib/presets';
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
  const preset = presetId
    ? getWordBuilderPreset(presetId)
    : null;

  const awardCoins = useCoinAward(studentData, onStudentPatch);

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