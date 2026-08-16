import { useMemo } from 'react';
import { useActivityPresets } from '@/hooks/useActivityPresets';
import { buildActivity } from '@/lib/activities/engine';
import { DEFAULT_PALETTE } from '@/lib/activities/palette';
import VideoModelPlayer from './VideoModelPlayer';
import CountingModelCanvas from './CountingModelCanvas';
import ManipulationModelCanvas from './ManipulationModelCanvas';
import HuntModelPanel from './HuntModelPanel';
import TracingModelCanvas from './TracingModelCanvas';
import LetterSoundsModelCanvas from './LetterSoundsModelCanvas';
import SoundWallModelCanvas from './SoundWallModelCanvas';
import GoogleSlidesModelPanel from './GoogleSlidesModelPanel';
import { Eye } from 'lucide-react';

// Teacher's side: renders the model panel for the current step so the teacher
// can drive/preview the activity during the "I do" phase. Video, Elkonin
// counting, phoneme manipulation, text hunt, and letter tracing all broadcast
// live to student iPads; other activity types show a "model on the board"
// prompt (mirroring for those is added next).
function parseItems(text) {
  return String(text || '').split(/\n/).map(s => s.trim()).filter(Boolean).map(t => ({ text: t }));
}

export default function TeacherModelPanel({ step, send }) {
  const { presets: PRESETS, isLoading } = useActivityPresets();

  const { config, activity } = useMemo(() => {
    if (step?.mode !== 'activities') return { config: null, activity: null };
    const cfg = step?.config || {};
    let c;
    if (cfg.preset && PRESETS[cfg.preset]) {
      const p = PRESETS[cfg.preset];
      c = { ...p };
      if (p.mode === 'text_hunt') {
        c.huntType = cfg.huntType || p.huntType;
        c.target = cfg.huntTarget || p.target;
      }
    } else {
      const mode = cfg.activityMode || 'counting_words';
      if (cfg.itemsText && cfg.itemsText.trim()) {
        c = { mode, items: parseItems(cfg.itemsText) };
        if (mode === 'text_hunt') { c.huntType = cfg.huntType || 'phoneme'; if (cfg.huntTarget) c.target = cfg.huntTarget; }
      } else {
        c = { mode: 'counting_words', items: [{ text: 'El gato come' }] };
      }
    }
    try { return { config: c, activity: buildActivity(c) }; } catch { return { config: c, activity: null }; }
  }, [step, PRESETS]);

  if (step?.mode === 'video') {
    return <VideoModelPlayer videoUrl={step?.config?.videoUrl} title={step.title} send={send} />;
  }

  if (step?.mode === 'letter_tracing') {
    return <TracingModelCanvas step={step} send={send} />;
  }

  if (step?.mode === 'letter_sounds') {
    return <LetterSoundsModelCanvas step={step} send={send} />;
  }

  if (step?.mode === 'soundwall') {
    return <SoundWallModelCanvas step={step} send={send} />;
  }

  if (step?.mode === 'google_slides') {
    return <GoogleSlidesModelPanel step={step} send={send} />;
  }

  if (step?.mode === 'activities') {
    if (isLoading) return <div className="p-10 text-center text-slate-400">Loading activity…</div>;
    const mode = activity?.mode || '';
    if (mode === 'counting_words' || mode === 'counting_phonemes') {
      return <CountingModelCanvas items={activity.items || []} modeDef={activity.modeDef} send={send} />;
    }
    if (mode === 'phoneme_manipulation') {
      const palette = (Array.isArray(config?.palette) && config.palette.length) ? config.palette : DEFAULT_PALETTE;
      return <ManipulationModelCanvas items={activity.items || []} modeDef={activity.modeDef} palette={palette} send={send} />;
    }
    if (mode === 'text_hunt') {
      return <HuntModelPanel items={activity.items || []} huntType={config?.huntType || 'phoneme'} target={config?.target || ''} send={send} />;
    }
    return <ModelOnBoardPlaceholder step={step} />;
  }

  return <ModelOnBoardPlaceholder step={step} />;
}

function ModelOnBoardPlaceholder({ step }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-300 p-8 text-center">
      <Eye className="w-12 h-12 opacity-50" />
      <p className="text-lg font-bold text-slate-200">Model "{step?.title}" on the board</p>
      <p className="text-sm text-slate-400 max-w-md">
        Run this activity on your main screen for the class. Live iPad mirroring for this activity type is coming soon — students see a "watch the board" message for now.
      </p>
    </div>
  );
}