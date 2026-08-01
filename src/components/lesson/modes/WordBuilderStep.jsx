import React from 'react';
import WordSentenceBuilder from '@/pages/WordSentenceBuilder';
import StepDoneBar from './StepDoneBar';
import { getWordBuilderPreset } from '@/lib/presets';

// Embedded student step for the Word/Sentence Builder. Looks up the chosen
// preset from the in-app registry (no Supabase fetch) and runs the builder in
// student mode using the logged-in student's number + class.
export default function WordBuilderStep({ onComplete, studentNumber, className, presetId }) {
  const preset = presetId ? getWordBuilderPreset(presetId) : null;
  return (
    <div className="relative h-full flex flex-col bg-blue-50">
      <div className="flex-1 min-h-0 overflow-auto">
        <WordSentenceBuilder embedStudent={studentNumber} embedClass={className} embedPresetObject={preset} />
      </div>
      <StepDoneBar onDone={onComplete} />
    </div>
  );
}