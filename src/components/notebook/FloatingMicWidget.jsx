import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useAudioRecorder from '@/hooks/useAudioRecorder';
import useLaserTracker from '@/hooks/useLaserTracker';
import LaserOverlay from './LaserOverlay';
import LaserReplayOverlay from './LaserReplayOverlay';
import { base44 } from '@/api/base44Client';

/**
 * FloatingMicWidget — a draggable mic/speaker icon that records or plays back audio + laser.
 *
 * Props:
 *   note: { id, x_pct, y_pct, audio_url, laser_data, label, role }
 *   containerRef: ref to the page container (for sizing)
 *   onSave(noteData): called with updated note after recording
 *   onRemove(): called when user deletes
 *   readOnly: if true, can only playback (teacher speaker mode)
 *   role: 'student' | 'teacher'
 */
export default function FloatingMicWidget({
  note,
  containerRef,
  onSave,
  onRemove,
  readOnly = false,
  role = 'student',
}) {
  const [pos, setPos] = useState({ x: note.x_pct ?? 0.1, y: note.y_pct ?? 0.1 });
  const [locked, setLocked] = useState(!!note.audio_url); // locked after first recording
  const [showPanel, setShowPanel] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [laserData, setLaserData] = useState(
    note.laser_data ? (typeof note.laser_data === 'string' ? JSON.parse(note.laser_data) : note.laser_data) : []
  );
  const [savedAudioUrl, setSavedAudioUrl] = useState(note.audio_url || null);
  const [containerSize, setContainerSize] = useState({ w: 600, h: 800 });

  // Laser tracking (for student recording)
  const laserContainerRef = useRef(null);
  const audioRef = useRef(null); // for replay

  const {
    state: recState,
    audioUrl: liveAudioUrl,
    elapsed,
    formatTime,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    reset: resetRecorder,
    getBlob,
  } = useAudioRecorder();

  const laserTracker = useLaserTracker({
    containerRef: containerRef,
    enabled: recState === 'recording' || recState === 'paused',
  });

  // Track container size for positioning
  useEffect(() => {
    if (!containerRef?.current) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: width, h: height });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [containerRef]);

  // Drag handling
  const dragging = useRef(false);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, posX: 0, posY: 0 });

  const onDragStart = useCallback((e) => {
    if (locked) return;
    e.preventDefault();
    dragging.current = true;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragStart.current = { mouseX: clientX, mouseY: clientY, posX: pos.x, posY: pos.y };
  }, [locked, pos]);

  const onDragMove = useCallback((e) => {
    if (!dragging.current || !containerRef?.current) return;
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const { width, height } = containerRef.current.getBoundingClientRect();
    const dx = (clientX - dragStart.current.mouseX) / width;
    const dy = (clientY - dragStart.current.mouseY) / height;
    setPos({
      x: Math.max(0.02, Math.min(0.95, dragStart.current.posX + dx)),
      y: Math.max(0.02, Math.min(0.95, dragStart.current.posY + dy)),
    });
  }, [containerRef]);

  const onDragEnd = useCallback(() => {
    dragging.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
    window.addEventListener('touchmove', onDragMove, { passive: false });
    window.addEventListener('touchend', onDragEnd);
    return () => {
      window.removeEventListener('mousemove', onDragMove);
      window.removeEventListener('mouseup', onDragEnd);
      window.removeEventListener('touchmove', onDragMove);
      window.removeEventListener('touchend', onDragEnd);
    };
  }, [onDragMove, onDragEnd]);

  const handleStartRecord = async () => {
    laserTracker.startRecordingLaser();
    await startRecording();
  };

  const handleStop = async () => {
    stopRecording();
    laserTracker.stopRecordingLaser();
  };

  const handleSave = async () => {
    const blob = getBlob();
    if (!blob) return;
    setUploading(true);
    const file = new File([blob], `mic-note-${Date.now()}.webm`, { type: 'audio/webm' });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const ld = laserTracker.getLaserData();
    setSavedAudioUrl(file_url);
    setLaserData(ld);
    setLocked(true);
    setUploading(false);
    resetRecorder();
    onSave?.({
      ...note,
      x_pct: pos.x,
      y_pct: pos.y,
      audio_url: file_url,
      laser_data: JSON.stringify(ld),
    });
  };

  const handleReRecord = () => {
    setSavedAudioUrl(null);
    setLaserData([]);
    setLocked(false);
    resetRecorder();
  };

  const isTeacher = role === 'teacher';
  const icon = isTeacher ? '🔊' : '🎙';
  const iconColor = isTeacher ? '#f59e0b' : (recState === 'recording' ? '#ef4444' : '#4338ca');

  const pixelX = pos.x * containerSize.w;
  const pixelY = pos.y * containerSize.h;

  return (
    <>
      {/* The floating icon */}
      <div
        style={{
          position: 'absolute',
          left: pixelX,
          top: pixelY,
          transform: 'translate(-50%, -50%)',
          zIndex: 30,
          cursor: locked ? 'pointer' : 'grab',
          userSelect: 'none',
          touchAction: 'none',
        }}
        onMouseDown={onDragStart}
        onTouchStart={onDragStart}
        onClick={() => setShowPanel(v => !v)}
      >
        <motion.div
          animate={{ scale: recState === 'recording' ? [1, 1.15, 1] : 1 }}
          transition={{ repeat: recState === 'recording' ? Infinity : 0, duration: 0.8 }}
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: iconColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            boxShadow: recState === 'recording' ? '0 0 16px rgba(239,68,68,0.8)' : '0 4px 12px rgba(0,0,0,0.4)',
            border: '3px solid rgba(255,255,255,0.3)',
          }}
        >
          {icon}
        </motion.div>
        {recState === 'recording' && (
          <div style={{
            position: 'absolute', top: -8, right: -8,
            background: '#ef4444', color: 'white', fontSize: 9,
            fontWeight: 'bold', borderRadius: 8, padding: '1px 5px',
          }}>
            {formatTime(elapsed)}
          </div>
        )}
      </div>

      {/* Panel */}
      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            style={{
              position: 'absolute',
              left: Math.min(pixelX + 28, containerSize.w - 240),
              top: Math.max(pixelY - 60, 10),
              zIndex: 50,
              background: '#1a1a2e',
              border: '2px solid #4338ca',
              borderRadius: 16,
              padding: 14,
              width: 230,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span style={{ color: '#a5b4fc', fontSize: 12, fontWeight: 'bold' }}>
                {isTeacher ? '🔊 Teacher Note' : '🎙 Voice Note'}
              </span>
              <button onClick={() => setShowPanel(false)} style={{ color: '#6366f1', fontWeight: 'bold', fontSize: 14 }}>✕</button>
            </div>

            {note.label && (
              <p style={{ color: '#e0e7ff', fontSize: 11, marginBottom: 8, fontStyle: 'italic' }}>{note.label}</p>
            )}

            {/* Playback */}
            {savedAudioUrl && (
              <div className="mb-2">
                <audio
                  ref={audioRef}
                  controls
                  src={savedAudioUrl}
                  style={{ width: '100%', height: 32 }}
                />
                {laserData.length > 0 && (
                  <p style={{ color: '#818cf8', fontSize: 10, marginTop: 4 }}>
                    🔴 Laser replay active while playing
                  </p>
                )}
              </div>
            )}

            {/* Recording controls (student only when not readOnly) */}
            {!readOnly && (
              <>
                {recState === 'idle' && !savedAudioUrl && (
                  <button
                    onClick={handleStartRecord}
                    style={{ width: '100%', padding: '8px 0', background: '#4338ca', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer' }}
                  >
                    ⏺ Start Recording
                  </button>
                )}

                {recState === 'recording' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={pauseRecording}
                      style={{ flex: 1, padding: '8px 0', background: '#d97706', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer' }}>
                      ⏸ Pause
                    </button>
                    <button onClick={handleStop}
                      style={{ flex: 1, padding: '8px 0', background: '#dc2626', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer' }}>
                      ⏹ Stop
                    </button>
                  </div>
                )}

                {recState === 'paused' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={resumeRecording}
                      style={{ flex: 1, padding: '8px 0', background: '#4338ca', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer' }}>
                      ▶ Resume
                    </button>
                    <button onClick={handleStop}
                      style={{ flex: 1, padding: '8px 0', background: '#dc2626', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer' }}>
                      ⏹ Stop
                    </button>
                  </div>
                )}

                {recState === 'stopped' && !savedAudioUrl && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {liveAudioUrl && <audio controls src={liveAudioUrl} style={{ width: '100%', height: 32 }} />}
                    <button onClick={handleSave} disabled={uploading}
                      style={{ padding: '8px 0', background: '#16a34a', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer', opacity: uploading ? 0.6 : 1 }}>
                      {uploading ? '⏳ Saving…' : '💾 Save'}
                    </button>
                    <button onClick={() => { resetRecorder(); }}
                      style={{ padding: '8px 0', background: '#374151', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer' }}>
                      🔄 Re-record
                    </button>
                  </div>
                )}

                {savedAudioUrl && (
                  <button onClick={handleReRecord}
                    style={{ width: '100%', padding: '8px 0', background: '#374151', color: '#fbbf24', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer', marginTop: 6 }}>
                    🔄 Re-record
                  </button>
                )}
              </>
            )}

            {onRemove && (
              <button onClick={() => { setShowPanel(false); onRemove(); }}
                style={{ width: '100%', padding: '6px 0', background: 'transparent', color: '#f87171', borderRadius: 10, fontWeight: 'bold', fontSize: 12, border: '1px solid #7f1d1d', cursor: 'pointer', marginTop: 8 }}>
                🗑 Remove
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Laser replay overlay — active when audio plays */}
      {savedAudioUrl && laserData.length > 0 && showPanel && (
        <LaserReplayOverlay
          laserData={laserData}
          audioRef={audioRef}
          containerWidth={containerSize.w}
          containerHeight={containerSize.h}
        />
      )}

      {/* Live laser overlay during recording */}
      {(recState === 'recording' || recState === 'paused') && (
        <LaserOverlay
          trailPoints={laserTracker.trailPoints}
          width={containerSize.w}
          height={containerSize.h}
          style={{ zIndex: 25 }}
        />
      )}
    </>
  );
}