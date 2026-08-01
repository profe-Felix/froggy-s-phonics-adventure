import React from 'react';
import WordSentenceBuilder from '@/pages/WordSentenceBuilder';
import StepDoneBar from './StepDoneBar';

// Embedded student step for the Word/Sentence Builder. Passes the logged-in
// student's number + class so the builder runs in student mode (no separate
// login). Uses default letter tiles unless a preset is wired in later.
export default function WordBuilderStep({ onComplete, studentNumber, className }) {
  return (
    <div className="relative h-full flex flex-col bg-blue-50">
      <div className="flex-1 min-h-0 overflow-auto">
        <WordSentenceBuilder embedStudent={studentNumber} embedClass={className} />
      </div>
      <StepDoneBar onDone={onComplete} />
    </div>
  );
}