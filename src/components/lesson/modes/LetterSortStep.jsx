import React, { useMemo } from 'react';
import LetterSortActivity from '@/components/lettersort/LetterSortActivity';
import { buildConfig } from '@/lib/lettersort/rounds';
import StepDoneBar from './StepDoneBar';

// Embedded student step for Letter Sort. Uses a sensible default
// initial-letters sort so no teacher config bar is needed inside the lesson.
const DEFAULT_VALS = { letters: 'a,e,i,o,u,m,p,s,t', per: 4 };

export default function LetterSortStep({ onComplete }) {
  const config = useMemo(() => buildConfig('letters', null, DEFAULT_VALS), []);
  const query = useMemo(
    () => `letters=${encodeURIComponent(DEFAULT_VALS.letters)}&per=${DEFAULT_VALS.per}`,
    []
  );

  return (
    <div className="relative h-full flex flex-col bg-[#f7f8fc]">
      <div className="flex-1 min-h-0 overflow-auto">
        <LetterSortActivity config={config} query={query} isTeacher={false} />
      </div>
      <StepDoneBar onDone={onComplete} />
    </div>
  );
}