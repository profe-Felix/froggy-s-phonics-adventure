import React from 'react';
import ElkoninCountActivity from '@/components/activities/ElkoninCountActivity';
import StepDoneBar from './StepDoneBar';

// Embedded student step for the counting-words activity with default items.
const DEFAULT_ITEMS = ['El gato come', 'Yo soy grande', 'La luna brilla en la noche'];

export default function ActivitiesStep({ onComplete, studentName }) {
  const config = { mode: 'counting_words', items: DEFAULT_ITEMS.map((t) => ({ text: t })) };
  return (
    <div className="relative h-full flex flex-col bg-[#f7f8fc]">
      <div className="flex-1 min-h-0 overflow-auto">
        <ElkoninCountActivity config={config} studentName={studentName || 'Estudiante'} />
      </div>
      <StepDoneBar onDone={onComplete} />
    </div>
  );
}