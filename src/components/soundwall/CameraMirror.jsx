import { useCamera } from '@/hooks/useCamera';
import { CameraOff, Loader2 } from 'lucide-react';

// Front-facing camera mirror. Flips the video horizontally so it acts like a
// real mirror. Shows a loading state while requesting access and a fallback
// message if the camera is unavailable or permission is denied.
export default function CameraMirror({ className }) {
  const { videoRef, active, error } = useCamera();
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-slate-900 ${className || ''}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover -scale-x-100"
      />
      {!active && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Starting camera…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40 gap-2">
          <CameraOff className="w-10 h-10" />
          <span className="text-xs font-bold">Camera unavailable</span>
          <span className="text-[10px] text-white/30 max-w-[80%] text-center">
            Allow camera access in your browser settings to see your mouth.
          </span>
        </div>
      )}
    </div>
  );
}