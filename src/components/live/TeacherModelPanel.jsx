import { useMemo } from 'react';
import { useActivityPresets } from '@/hooks/useActivityPresets';
import { buildActivity } from '@/lib/activities/engine';
import VideoModelPlayer from './VideoModelPlayer';
import CountingModelCanvas from './CountingModelCanvas';
import { Eye } from 'lucide-react';

// Teacher's side: renders the model panel for the current step so the teacher
// can drive/preview the activity during the "I do" phase. Video and the Elkonin
// counting activities broadcast live to student iPads; other activity types
// show a "model on the board" prompt (mirroring for those is added next).
function parseItems(text) {
  return String(text || '').split(/\n/).map(s => s.trim()).filter(Boolean).map(t => ({ text: t }));
}

export default function TeacherModelPanel({ step, send }) {
  const { presets: PRESETS, isLoading } = useActivityPresets();

  const activity = useMemo(() => {
    if (step?.mode !== 'activities') return null;
    const cfg = step?.config || {};
    let config;
    if (cfg.preset && PRESETS[cfg.preset]) {
      const p = PRESETS[cfg.preset];
      config = { ...p };
      if (p.mode === 'text_hunt') {
        config.huntType = cfg.huntType || p.huntType;
        config.target = cfg.huntTarget || p.target;
      }
    } else {
      const mode = cfg.activityMode || 'counting_words';
      if (cfg.itemsText && cfg.itemsText.trim()) {
        config = { mode, items: parseItems(cfg.itemsText) };
        if (mode === 'text_hunt') { config.huntType = cfg.huntType || 'phoneme'; if (cfg.huntTarget) config.target = cfg.huntTarget; }
      } else {
        config = { mode: 'counting_words', items: [{ text: 'El gato come' }] };
      }
    }
    try { return buildActivity(config); } catch { return null; }
  }, [step, PRESETS]);

  if (step?.mode === 'video') {
    return <VideoModelPlayer videoUrl={step?.config?.videoUrl} title={step.title} send={send} />;
  }

  if (step?.mode === 'activities') {
    if (isLoading) return <div className="p-10 text-center text-slate-400">Loading activity…</div>;
    const mode = activity?.mode || '';
    if (mode === 'counting_words' || mode === 'counting_phonemes') {
      return <CountingModelCanvas items={activity.items || []} modeDef={activity.modeDef} send={send} />;
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