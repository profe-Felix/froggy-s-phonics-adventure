import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, RotateCw, Maximize, Minimize, Grid3x3, RefreshCw, Pen, Snowflake } from 'lucide-react';
import DocCamMarkup from '@/components/doccam/DocCamMarkup';

// Document Camera — a simple teacher-only page for using an iPad as a doc
// camera. Connect an external USB camera via a dock and this page shows the
// live feed full-screen with a toggle to switch between cameras.
// Access via /DocumentCamera (not linked anywhere students can reach).
export default function DocumentCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameras, setCameras] = useState([]);
  const [activeCameraId, setActiveCameraId] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [mirror, setMirror] = useState(false);
  const [showMarkup, setShowMarkup] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const containerRef = useRef(null);
  const markupRef = useRef(null);

  // Freeze frame: pause the live feed on the current frame so the teacher
  // can hold a still image (e.g. to annotate). Resumes on toggle off.
  const toggleFreeze = () => {
    const v = videoRef.current;
    if (!v) return;
    if (frozen) {
      v.play().catch(() => {});
      setFrozen(false);
    } else {
      v.pause();
      setFrozen(true);
    }
  };

  // Enumerate available video input devices
  const enumerateCameras = useCallback(async () => {
    try {
      // Must request permission first on iOS/Safari before labels are available
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
      tempStream.getTracks().forEach(t => t.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      setCameras(videoInputs);

      // Prefer external cameras: heuristic — on iOS, external cameras often
      // have labels containing "External" or "USB". On other platforms, if
      // there are 3+ cameras, the 3rd+ is often external. Otherwise default
      // to the last camera (often the rear/external).
      let preferred = null;
      const external = videoInputs.find(d =>
        /external|usb|doc|document|capture/i.test(d.label)
      );
      if (external) {
        preferred = external.deviceId;
      } else if (videoInputs.length >= 3) {
        // 3+ cameras: skip front (0) and back (1), pick index 2+
        preferred = videoInputs[2].deviceId;
      } else if (videoInputs.length > 0) {
        // Default to the last camera (often rear on iPad)
        preferred = videoInputs[videoInputs.length - 1].deviceId;
      }
      setActiveCameraId(preferred);
    } catch (err) {
      setError('Camera access denied. Please allow camera permissions in Safari settings.');
      setLoading(false);
    }
  }, []);

  // Start / restart the camera stream
  const startCamera = useCallback(async (deviceId) => {
    if (!deviceId) return;
    // Stop existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    try {
      setLoading(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setError('');
    } catch (err) {
      setError(`Could not start camera: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    enumerateCameras();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [enumerateCameras]);

  // When active camera changes, restart stream
  useEffect(() => {
    if (activeCameraId) startCamera(activeCameraId);
  }, [activeCameraId, startCamera]);

  // Re-enumerate when device list changes (e.g. plugging in a camera)
  useEffect(() => {
    const handler = () => enumerateCameras();
    navigator.mediaDevices?.addEventListener?.('devicechange', handler);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', handler);
  }, [enumerateCameras]);

  // Track container size for the markup canvas overlay
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showMarkup]);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
      setFullscreen(true);
    } else {
      await document.exitFullscreen?.();
      setFullscreen(false);
    }
  };

  const activeCamera = cameras.find(c => c.deviceId === activeCameraId);
  const cameraLabel = activeCamera?.label?.replace(/\(.*?\)/g, '').trim() || 'Camera';

  return (
    <div className="fixed inset-0 bg-black flex flex-col select-none" onContextMenu={(e) => e.preventDefault()} style={{ WebkitTouchCallout: 'none' }}>
      {/* Video feed */}
      <div ref={containerRef} className="relative flex-1 flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="text-center text-white p-8 max-w-md">
            <Camera className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-bold mb-2">Camera Unavailable</p>
            <p className="text-sm text-white/70">{error}</p>
            <button
              onClick={() => { setError(''); enumerateCameras(); }}
              className="mt-4 px-6 py-2 bg-white text-black rounded-lg font-bold text-sm"
            >
              Try Again
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="max-w-full max-h-full object-contain"
            style={{
              transform: `rotate(${rotation}deg) scaleX(${mirror ? -1 : 1})`,
            }}
          />
        )}

        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {/* Grid overlay */}
        {showGrid && !error && !showMarkup && (
          <div className="absolute inset-0 pointer-events-none flex">
            <div className="flex-1 border-l border-r border-white/30" />
            <div className="flex-1 border-r border-white/30" />
          </div>
        )}
        {showGrid && !error && !showMarkup && (
          <div className="absolute inset-0 pointer-events-none flex flex-col">
            <div className="flex-1 border-b border-white/30" />
            <div className="flex-1 border-b border-white/30" />
          </div>
        )}

        {/* Markup overlay */}
        {showMarkup && !error && containerSize.w > 0 && (
          <DocCamMarkup
            ref={markupRef}
            width={containerSize.w}
            height={containerSize.h}
            onClose={() => setShowMarkup(false)}
          />
        )}

        {/* Camera label badge */}
        {!error && (
          <div className="absolute top-3 left-3 bg-black/60 text-white text-xs font-bold px-3 py-1.5 rounded-full">
            {cameraLabel}
          </div>
        )}

        {/* Frozen indicator */}
        {frozen && !error && (
          <div className="absolute top-3 right-3 bg-sky-500 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 animate-pulse">
            <Snowflake className="w-3.5 h-3.5" />
            FROZEN
          </div>
        )}
      </div>

      {/* Control bar — large touch targets for iPad */}
      {!error && (
        <div className="bg-zinc-900 px-4 py-3 flex items-center justify-center gap-3 flex-wrap shrink-0">
          {/* Camera switch */}
          {cameras.length > 1 && (
            <button
              onClick={() => {
                const idx = cameras.findIndex(c => c.deviceId === activeCameraId);
                const next = cameras[(idx + 1) % cameras.length];
                setActiveCameraId(next.deviceId);
              }}
              className="flex items-center gap-2 bg-white text-black font-bold text-sm px-5 py-3 rounded-xl active:scale-95 transition-transform"
            >
              <RefreshCw className="w-5 h-5" />
              Switch Camera
              <span className="text-xs text-zinc-500">
                ({cameras.findIndex(c => c.deviceId === activeCameraId) + 1}/{cameras.length})
              </span>
            </button>
          )}

          {/* Rotate */}
          <button
            onClick={() => setRotation(r => (r + 90) % 360)}
            className="flex items-center gap-2 bg-zinc-700 text-white font-bold text-sm px-4 py-3 rounded-xl active:scale-95 transition-transform"
          >
            <RotateCw className="w-5 h-5" />
            Rotate
          </button>

          {/* Mirror */}
          <button
            onClick={() => setMirror(m => !m)}
            className={`flex items-center gap-2 font-bold text-sm px-4 py-3 rounded-xl active:scale-95 transition-transform ${
              mirror ? 'bg-indigo-600 text-white' : 'bg-zinc-700 text-white'
            }`}
          >
            <Camera className="w-5 h-5" />
            Mirror
          </button>

          {/* Grid */}
          <button
            onClick={() => setShowGrid(g => !g)}
            className={`flex items-center gap-2 font-bold text-sm px-4 py-3 rounded-xl active:scale-95 transition-transform ${
              showGrid ? 'bg-indigo-600 text-white' : 'bg-zinc-700 text-white'
            }`}
          >
            <Grid3x3 className="w-5 h-5" />
            Grid
          </button>

          {/* Freeze frame */}
          <button
            onClick={toggleFreeze}
            className={`flex items-center gap-2 font-bold text-sm px-4 py-3 rounded-xl active:scale-95 transition-transform ${
              frozen ? 'bg-sky-500 text-white' : 'bg-zinc-700 text-white'
            }`}
          >
            <Snowflake className="w-5 h-5" />
            {frozen ? 'Frozen' : 'Freeze'}
          </button>

          {/* Markup */}
          <button
            onClick={() => setShowMarkup(m => !m)}
            className={`flex items-center gap-2 font-bold text-sm px-4 py-3 rounded-xl active:scale-95 transition-transform ${
              showMarkup ? 'bg-indigo-600 text-white' : 'bg-zinc-700 text-white'
            }`}
          >
            <Pen className="w-5 h-5" />
            Markup
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-2 bg-zinc-700 text-white font-bold text-sm px-4 py-3 rounded-xl active:scale-95 transition-transform"
          >
            {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            {fullscreen ? 'Exit' : 'Fullscreen'}
          </button>
        </div>
      )}
    </div>
  );
}