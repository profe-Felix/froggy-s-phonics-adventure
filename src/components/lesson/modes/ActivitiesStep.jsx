import React, { useMemo } from 'react';
import ElkoninCountActivity from '@/components/activities/ElkoninCountActivity';
import PhonemeManipulationActivity from '@/components/activities/PhonemeManipulationActivity';
import HuntActivity from '@/components/activities/HuntActivity';
import RhymeActivity from '@/components/activities/RhymeActivity';
import { useActivityPresets } from '@/hooks/useActivityPresets';
import StepDoneBar from './StepDoneBar';

// Parse a textarea string into activity items based on the mode.
function parseItems(mode, text) {
  const lines = String(text || '').split(/\n/).map(s => s.trim()).filter(Boolean);
  if (mode === 'rhyme_identification') {
    return lines.map(l => {
      const parts = l.split(',').map(x => x.trim());
      if (parts.length < 2) return null;
      return { word1: parts[0], word2: parts[1], answer: /sí|si|true/i.test(parts[2] || '') };
    }).filter(Boolean);
  }
  return lines.map(t => ({ text: t }));
}

// Embedded student step for counting / phoneme / hunt / rhyme activities.
// The teacher picks an activity type and enters examples in the Lesson Editor;
// we build the activity config here and render the matching component.
const DEFAULT_CONFIG = {
  mode: 'counting_words',
  items: ['El gato come', 'Yo soy grande', 'La luna brilla en la noche'].map(t => ({ text: t })),
};

export default function ActivitiesStep({ onComplete, studentName, stepConfig }) {
  const { presets: PRESETS, isLoading } = useActivityPresets();
  const config = useMemo(() => {
    const cfg = stepConfig || {};
    // If a preset is selected, use it as the base.
    if (cfg.preset && PRESETS[cfg.preset]) {
      const p = PRESETS[cfg.preset];
      let out = { ...p };
      if (p.mode === 'text_hunt') {
        out = { ...out, huntType: cfg.huntType || p.huntType, target: cfg.huntTarget || p.target };
      }
      return out;
    }
    // Otherwise build from the teacher's custom activity type + examples.
    const mode = cfg.activityMode || 'counting_words';
    if (cfg.itemsText && cfg.itemsText.trim()) {
      const items = parseItems(mode, cfg.itemsText);
      let out = { mode, items };
      if (mode === 'text_hunt') {
        out.huntType = cfg.huntType || 'phoneme';
        if (cfg.huntTarget) out.target = cfg.huntTarget;
      }
      return out;
    }
    // Fall back to default counting words.
    return DEFAULT_CONFIG;
  }, [stepConfig]);

  const mode = config.mode || 'counting_words';
  const name = studentName || 'Estudiante';

  if (isLoading && stepConfig?.preset && !PRESETS[stepConfig.preset]) {
    return <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Loading activity…</div>;
  }

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