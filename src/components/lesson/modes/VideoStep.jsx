import { useState, useRef } from 'react';
import { Play, Check } from 'lucide-react';

// Student-facing video step. Plays the lesson video from R2 and completes the
// step when the student finishes watching (or taps "Done"). Completion is
// delegated to the parent's onComplete callback (view-type, one watch).
export default function VideoStep({ onComplete, videoUrl, title }) {
  const videoRef = useRef(null);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);

  const handleEnded = () => {
    if (done) return;
    setDone(true);
    onComplete?.();
  };

  const handleMarkDone = () => {
    if (done) return;
    setDone(true);
    onComplete?.();
  };

  if (!videoUrl) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-900 text-white/60 p-8 text-center">
        <div>
          <Play className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-bold">No video assigned</p>
          <p className="text-sm opacity-60 mt-1">Ask your teacher for help.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-900 p-4 gap-4">
      <div className="w-full max-w-3xl">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          playsInline
          className="w-full rounded-2xl shadow-2xl bg-black"
          onPlay={() => setStarted(true)}
          onEnded={handleEnded}
        />
      </div>
      <div className="flex items-center gap-3">
        {done ? (
          <div className="flex items-center gap-2 text-green-400 font-black text-lg">
            <Check className="w-6 h-6" /> Watched!
          </div>
        ) : (
          <button
            onClick={handleMarkDone}
            disabled={!started}
            className="px-6 py-3 rounded-2xl font-black text-white shadow-lg transition disabled:opacity-40 disabled:cursor-not-allowed bg-green-500 hover:bg-green-600"
          >
            <Check className="w-5 h-5 inline mr-2" />
            I'm done watching
          </button>
        )}
      </div>
      {title && <p className="text-white/50 text-sm text-center max-w-md">{title}</p>}
    </div>
  );
}