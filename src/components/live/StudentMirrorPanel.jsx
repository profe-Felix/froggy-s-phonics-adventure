import VideoMirrorPlayer from './VideoMirrorPlayer';
import CountingMirrorCanvas from './CountingMirrorCanvas';
import ManipulationMirrorCanvas from './ManipulationMirrorCanvas';
import HuntMirrorPanel from './HuntMirrorPanel';
import TracingMirrorCanvas from './TracingMirrorCanvas';
import LetterSoundsMirrorCanvas from './LetterSoundsMirrorCanvas';
import { Eye, Lock } from 'lucide-react';

// Student's side: renders a read-only mirror of the teacher's screen during the
// "watch" phase. Routes by the broadcast type the teacher is emitting (video,
// counting, manipulation, hunt, or tracing); any other activity shows a
// "watch the board" screen until that mirror is added.
export default function StudentMirrorPanel({ step, broadcast }) {
  const bType = broadcast?.type;

  if (step?.mode === 'video' || bType === 'video') {
    return <VideoMirrorPlayer broadcast={bType === 'video' ? broadcast : null} videoUrl={step?.config?.videoUrl} />;
  }
  if (bType === 'counting') {
    return <CountingMirrorCanvas broadcast={broadcast} />;
  }
  if (bType === 'manipulation') {
    return <ManipulationMirrorCanvas broadcast={broadcast} />;
  }
  if (bType === 'hunt') {
    return <HuntMirrorPanel broadcast={broadcast} />;
  }
  if (step?.mode === 'letter_tracing' || bType === 'tracing') {
    return <TracingMirrorCanvas broadcast={bType === 'tracing' ? broadcast : null} />;
  }

  if (bType === 'letter_sounds') {
    return <LetterSoundsMirrorCanvas broadcast={broadcast} />;
  }

  // Fallback: teacher is modeling an activity whose mirror isn't built yet.
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex items-center gap-2 text-rose-400 font-black text-sm">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
        LIVE with your teacher
      </div>
      <div className="w-24 h-24 rounded-full bg-indigo-500/20 flex items-center justify-center">
        <Eye className="w-12 h-12 text-indigo-300" />
      </div>
      <h2 className="text-2xl font-black text-white">{step?.title || 'Watch'}</h2>
      <p className="text-white/70 max-w-xs">👀 Watch your teacher on the board… getting ready to practice!</p>
      <div className="text-xs text-white/50 flex items-center gap-1.5">
        <Lock className="w-3.5 h-3.5" /> Locked until your teacher says go
      </div>
    </div>
  );
}