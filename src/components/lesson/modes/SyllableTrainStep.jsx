import React from 'react';
import SyllableTrain from '@/pages/workstations/SyllableTrain';
import StepDoneBar from './StepDoneBar';

// Embedded student step for Syllable Train. Renders the standalone page in
// embedded mode (hides its own back button) so the student stays in the lesson.
export default function SyllableTrainStep({ onComplete }) {
  return (
    <div className="relative h-full flex flex-col bg-white">
      <div className="flex-1 min-h-0 overflow-auto">
        <SyllableTrain embedded />
      </div>
      <StepDoneBar onDone={onComplete} />
    </div>
  );
}