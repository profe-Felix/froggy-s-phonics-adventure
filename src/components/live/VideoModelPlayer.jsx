import { useRef, useEffect } from 'react';
import { Play } from 'lucide-react';

// Teacher's video player during the "watch" (I do) phase. The teacher controls
// playback with the native controls; every play/pause/seek is broadcast to the
// session so student iPads mirror the same video in sync.
export default function VideoModelPlayer({ videoUrl, title, send }) {
  const videoRef = useRef(null);
  const lastSendRef = useRef(0);

  const emit = (playing) => {
    const v = videoRef.current;
    if (!v) return;
    const now = Date.now();
    if (now - lastSendRef.current < 200) return; // light throttle
    lastSendRef.current = now;
    send({
      type: 'video',
      playing,
      currentTime: v.currentTime,
      updatedAt: now,
      videoUrl,
    });
  };

  // Periodic sync ping while playing so student drift stays bounded.
  useEffect(() => {
    const id = setInterval(() => {
      const v = videoRef.current;
      if (v && !v.paused) emit(true);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  if (!videoUrl) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-900 text-white/60 p-8 text-center">
        <div>
          <Play className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-bold">No video assigned to this step.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-900 p-4 gap-3">
      <div className="w-full max-w-3xl">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          playsInline
          preload="auto"
          className="w-full rounded-2xl shadow-2xl bg-black"
          onPlay={() => emit(true)}
          onPause={() => emit(false)}
          onSeeked={() => emit(!videoRef.current?.paused)}
        />
      </div>
      <div className="text-white/60 text-xs text-center">
        You're broadcasting — student iPads mirror this video. Use the controls to play, pause, or scrub.
      </div>
      {title && <p className="text-white/40 text-sm text-center">{title}</p>}
    </div>
  );
}