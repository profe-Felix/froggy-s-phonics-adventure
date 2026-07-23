import { useMemo } from 'react';
import FluencyGrid from '@/components/workstations/FluencyGrid';
import ElkoninActivity from '@/components/workstations/ElkoninActivity';
import { markersToPretty } from '@/lib/markers';
import { shuffleInPlace } from '@/lib/seededShuffle';

const DEFAULT_MEDIA = {
  images: { bucket: 'lettersort-images', prefix: '' },
  syllableAudio: { bucket: 'syllable-audio', prefix: '' },
  wordAudio: { bucket: 'audio', prefix: 'es/words' },
};

// Renders whichever activity the teacher has made live, driven by the shared
// session (preset / seed / per-activity settings). Teacher-only controls
// (e.g. advancing the Syllable Blender word) call back into onUpdate.
export default function LiveActivityView({ session, presets, isTeacher, onUpdate }) {
  const sbPreset = presets.syllable_blender?.[session.preset_id];

  const words = useMemo(() => {
    if (session.activity !== 'syllable_blender' || !sbPreset) return [];
    let list = sbPreset.content?.words?.length ? sbPreset.content.words.map((w) => markersToPretty(w)) : [];
    const b = sbPreset.behavior || {};
    if (b.shuffle && list.length > 1) shuffleInPlace(list, String(session.seed));
    return list;
  }, [session.activity, sbPreset, session.seed]);

  const media = useMemo(() => {
    const m = sbPreset?.media || {};
    return {
      images: { ...DEFAULT_MEDIA.images, ...(m.images || {}) },
      syllableAudio: { ...DEFAULT_MEDIA.syllableAudio, ...(m.syllableAudio || {}) },
      wordAudio: { ...DEFAULT_MEDIA.wordAudio, ...(m.wordAudio || {}) },
    };
  }, [sbPreset]);

  if (session.activity === 'fluency_table') {
    const list = presets.fluency_table;
    const preset = list.find((p) => p.id === session.preset_id) || list[0];
    if (!preset) return <div className="flex-1 flex items-center justify-center text-gray-500 p-6">No fluency presets loaded.</div>;
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <FluencyGrid
          preset={preset}
          seed={session.seed}
          activeRow={session.settings?.active_row || 0}
          sweepStartAt={session.settings?.sweep_start_at || ''}
          onPlayRow={(r) => onUpdate({ settings: { ...session.settings, active_row: r, sweep_start_at: new Date().toISOString() } })}
        />
      </div>
    );
  }

  if (!sbPreset) return <div className="flex-1 flex items-center justify-center text-gray-500 p-6">No preset loaded.</div>;
  return (
    <ElkoninActivity
      words={words}
      behavior={sbPreset.behavior || {}}
      media={media}
      index={session.settings?.current_word || 0}
      onIndexChange={isTeacher ? (i) => onUpdate({ settings: { ...session.settings, current_word: i } }) : null}
    />
  );
}