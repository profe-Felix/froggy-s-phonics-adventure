import React, { useMemo } from 'react';
import ElkoninCountActivity from '@/components/activities/ElkoninCountActivity';
import PhonemeManipulationActivity from '@/components/activities/PhonemeManipulationActivity';
import HuntActivity from '@/components/activities/HuntActivity';
import RhymeActivity from '@/components/activities/RhymeActivity';
import { PRESETS } from '@/lib/activities/presets';
import StepDoneBar from './StepDoneBar';

// Embedded student step for counting / phoneme activities. The teacher picks a
// preset in the Lesson Editor; we resolve it here and render the matching
// activity component based on the preset's mode.
const DEFAULT_CONFIG = {
  mode: 'counting_words',
  items: ['El gato come', 'Yo soy grande', 'La luna brilla en la noche'].map((t) => ({ text: t })),
};

export default function ActivitiesStep({ onComplete, studentName, presetId }) {
  const config = useMemo(() => {
    if (presetId && PRESETS[presetId]) return PRESETS[presetId];
    return DEFAULT_CONFIG;
  }, [presetId]);

  const mode = config.mode || 'counting_words';
  const name = studentName || 'Estudiante';

  return (
    <div className="relative h-full flex flex-col bg-[#f7f8fc]">
      <div className="flex-1 min-h-0 overflow-auto">
        {mode === 'phoneme_manipulation' ? (
          <PhonemeManipulationActivity config={config} studentName={name} />
        ) : mode === 'text_hunt' ? (
          <HuntActivity config={config} studentName={name} />
        ) : mode === 'rhyme_identification' ? (
          <RhymeActivity config={config} studentName={name} />
        ) : (
          <ElkoninCountActivity config={config} studentName={name} />
        )}
      </div>
      <StepDoneBar onDone={onComplete} />
    </div>
  );
}