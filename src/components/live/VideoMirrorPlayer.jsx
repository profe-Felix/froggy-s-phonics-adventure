import { useRef, useEffect, useState } from 'react';
import { Volume2, VolumeX, Eye } from 'lucide-react';

// Student's read-only video mirror. Syncs to the teacher's broadcast: plays,
// pauses, and seeks to match. Muted by default (the teacher's main board carries
// the audio) with a tap-to-unmute toggle.
export default function VideoMirrorPlayer({ broadcast, videoUrl: fallbackUrl }) {
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);

  // Apply broadcast changes.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !broadcast?.type) return;
    const target = broadcast.playing
      ? broadcast.currentTime + (Date.now() - (broadcast.updatedAt || Date.now())) / 1000
      : broadcast.currentTime;
    if (broadcast.playing) {
      if (v.paused) {
        // First play — always seek to the teacher's current position so the
        // student starts at the right spot, not wherever the video was buffered.
        v.currentTime = target;
        v.play().catch(() => {});
      } else if (Math.abs(v.currentTime - target) > 0.7) {
        v.currentTime = target;
      }
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - broadcast.currentTime) > 0.3) v.currentTime = broadcast.currentTime;
    }
  }, [broadcast]);

  // Drift correction while playing (in case broadcasts pause).
  useEffect(() => {
    const id = setInterval(() => {
      const v = videoRef.current;
      if (v && !v.paused && broadcast?.type === 'video' && broadcast.playing) {
        const target = broadcast.currentTime + (Date.now() - (broadcast.updatedAt || Date.now())) / 1000;
        if (Math.abs(v.currentTime - target) > 1.2) v.currentTime = target;
      }
    }, 1500);
    return () => clearInterval(id);
  }, [broadcast]);

  const videoUrl = broadcast?.videoUrl || fallbackUrl;

  if (!videoUrl) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-white/70">
        <Eye className="w-10 h-10" />
        <p className="text-sm">Waiting for your teacher to start the video…</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-900 p-3 gap-2">
      <div className="w-full max-w-2xl relative">
        <video
          ref={videoRef}
          src={videoUrl}
          playsInline
          preload="auto"
          muted={muted}
          className="w-full rounded-2xl shadow-2xl bg-black pointer-events-none"
        />
        <button
          onClick={() => setMuted(m => !m)}
          className="absolute bottom-3 right-3 bg-black/60 text-white rounded-full p-2.5 backdrop-blur"
        >
          {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>
      <div className="text-white/50 text-xs flex items-center gap-1.5">
        <Eye className="w-3.5 h-3.5" /> Watch your teacher's screen
      </div>
    </div>
  );
}