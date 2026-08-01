import React, { useMemo, useState } from 'react';
import { POWERFUL_WORD_PRESETS } from '@/components/workstations/powerfulWordPresets';
import { getPowerfulWordPreset } from '@/lib/presets';
import StepDoneBar from './StepDoneBar';

// Embedded student step for Powerful Word — bilingual flashcards. Uses the
// chosen preset's pairs if set, otherwise the first built-in preset.
export default function PowerfulWordStep({ onComplete, presetId }) {
  const preset = presetId ? getPowerfulWordPreset(presetId) : null;
  const fallback = POWERFUL_WORD_PRESETS[0];
  const pairs = useMemo(() => {
    const src = preset || fallback;
    return (src?.pairs || []).slice(0, src?.defaultCount || src?.pairs?.length || 3);
  }, [preset, fallback]);
  const [hidden, setHidden] = useState({});

  return (
    <div className="relative h-full flex flex-col bg-[#fafbff]">
      <div className="flex-1 min-h-0 overflow-auto p-6">
        <div
          className="max-w-5xl mx-auto grid gap-6"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
        >
          {pairs.map((pair, i) => (
            <div key={i} className="bg-white rounded-2xl p-10 border shadow flex flex-col gap-6 items-center text-center">
              <div className="font-bold" style={{ color: '#dc2626', fontSize: 'clamp(3rem,4vw,5rem)' }}>
                {pair.es}
              </div>
              <div
                className="rounded-xl p-5 flex items-center justify-center min-h-[3.2em]"
                style={{
                  fontSize: 'clamp(3rem,4vw,5rem)',
                  background: hidden[i] ? '#dbeafe' : '#f3f4f6',
                  color: hidden[i] ? '#1d4ed8' : 'transparent',
                  transition: 'background .15s, color .15s',
                }}
              >
                <span>{pair.en}</span>
              </div>
              <button
                onClick={() => setHidden((h) => ({ ...h, [i]: !h[i] }))}
                className="px-5 py-2 rounded-full text-white font-bold"
                style={{ fontSize: 'clamp(1.2rem,1.5vw,2rem)', background: '#2563eb' }}
              >
                {hidden[i] ? 'Hide' : 'Show'}
              </button>
            </div>
          ))}
        </div>
      </div>
      <StepDoneBar onDone={onComplete} />
    </div>
  );
}