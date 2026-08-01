import React, { useMemo } from 'react';
import LetterSortActivity from '@/components/lettersort/LetterSortActivity';
import { configForPreset } from '@/lib/lettersort/presetConfig';
import { getLetterSortPreset } from '@/lib/presets';
import { buildConfig } from '@/lib/lettersort/rounds';
import StepDoneBar from './StepDoneBar';

// Embedded student step for Letter Sort. When the teacher assigned a preset, the
// activity runs that preset's config directly (no Supabase lookup). Otherwise it
// falls back to a sensible initial-letters sort.
const DEFAULT_VALS = { letters: 'a,e,i,o,u,m,p,s,t', per: 4 };

export default function LetterSortStep({ onComplete, presetId }) {
  const config = useMemo(() => {
    if (presetId) {
      const c = configForPreset(getLetterSortPreset(presetId));
      if (c) return c;
    }
    return buildConfig('letters', null, DEFAULT_VALS);
  }, [presetId]);

  return (
    <div className="relative h-full flex flex-col bg-[#f7f8fc]">
      <div className="flex-1 min-h-0 overflow-auto">
        <LetterSortActivity config={config} isTeacher={false} />
      </div>
      <StepDoneBar onDone={onComplete} />
    </div>
  );
}