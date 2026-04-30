import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useAudioRecorder from '@/hooks/useAudioRecorder';
import useLaserTracker from '@/hooks/useLaserTracker';
import LaserOverlay from './LaserOverlay';
import LaserReplayOverlay from './LaserReplayOverlay';
import { base44 } from '@/api/base44Client';

/**
 * FloatingMicWidget
 * - containerRef: the inner PDF wrapper div (for correct coordinate mapping)
 * - canvasRef:    the AnnotationCanvas imperative handle (for stroke replay during playback)
 * - Laser tracks against containerRef.
 * - On record: captures laser + snapshots strokes from canvasRef.
 * - On "Play Recording": clears canvas, animates strokes by timestamp, replays laser,
 *   then restores full strokes when audio ends/stops.
 */
export default function FloatingMicWidget({
  note,
  containerRef,
  canvasRef,
  onSave,
  onRemove,
  readOnly = false,
  role = 'student',
}) {
  const [pos, setPos] = useState({ x: note.x_pct ?? 0.1, y: note.y_pct ?? 0.1 });
  const [showPanel, setShowPanel] = useState(false);
  const [showReplay, setShowReplay] = useState(false);
  const fullStrokesBeforeReplayRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  // Saved data
  const [savedAudioUrl, setSavedAudioUrl] = useState(note.audio_url || null);
  const [laserData, setLaserData] = useState(() => {
    if (!note.laser_data) return [];
    try { return typeof note.laser_data === 'string' ? JSON.parse(note.laser_data) : note.laser_data; }
    catch { return []; }
  });
  const [strokeSnapshot, setStrokeSnapshot] = useState(() => {
    if (!note.stroke_snapshot) return null;
    try { return typeof note.stroke_snapshot === 'string' ? JSON.parse(note.stroke_snapshot) : note.stroke_snapshot; }
    catch { return null; }
  });

  const [containerSize, setContainerSize] = useState({ w: 600, h: 800 });
  const panelRef = useRef(null);
  const audioRef = useRef(null);
  const replayRafRef = useRef(null);
  // Strokes drawn ONLY during the recording session
  const strokesDuringRecordingRef = useRef(null);
  const strokeCountAtRecordStart = useRef(0);

  const {
    state: recState,
    elapsed,
    formatTime,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    reset: resetRecorder,
    getBlob,
  } = useAudioRecorder();

  // Laser tracks against the PDF container ref — active during recording/paused
  const laserTracker = useLaserTracker({
    containerRef,
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
    // set immediately
    const rect = containerRef.current.getBoundingClientRect();
    setContainerSize({ w: rect.width, h: rect.height });
    return () => obs.disconnect();
  }, [containerRef]);

  // Click-away to close panel
  useEffect(() => {
    if (!showPanel) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setShowPanel(false);
      }
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [showPanel]);

  // Drag handling
  const dragging = useRef(false);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, posX: 0, posY: 0 });
  const hasSavedAudio = !!savedAudioUrl;

  const onDragStart = useCallback((e) => {
    if (hasSavedAudio) return; // locked once saved
    e.preventDefault();
    dragging.current = true;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragStart.current = { mouseX: clientX, mouseY: clientY, posX: pos.x, posY: pos.y };
  }, [hasSavedAudio, pos]);

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

  const onDragEnd = useCallback(() => { dragging.current = false; }, []);

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
    // Remember how many strokes existed before recording started
    const existing = canvasRef?.current?.getStrokes();
    strokeCountAtRecordStart.current = existing?.strokes?.length ?? 0;
    strokesDuringRecordingRef.current = null;
    laserTracker.startRecordingLaser();
    await startRecording();
  };

  const handleStop = () => {
    stopRecording();
    laserTracker.stopRecordingLaser();
    // Capture only strokes added SINCE recording started
    const all = canvasRef?.current?.getStrokes();
    const newStrokes = all?.strokes?.slice(strokeCountAtRecordStart.current) ?? [];
    strokesDuringRecordingRef.current = { strokes: newStrokes };
    setTimeout(() => doSave(), 150);
  };

  const doSave = async () => {
    const blob = getBlob();
    if (!blob) return;
    setUploading(true);

    // Snapshot ONLY the strokes added during this recording
    const snapshot = strokesDuringRecordingRef.current || { strokes: [] };

    const file = new File([blob], `mic-note-${Date.now()}.webm`, { type: 'audio/webm' });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const ld = laserTracker.getLaserData();

    setSavedAudioUrl(file_url);
    setLaserData(ld);
    setStrokeSnapshot(snapshot);
    setUploading(false);
    resetRecorder();
    laserTracker.clearLaser();
    strokesDuringRecordingRef.current = null;

    onSave?.({
      ...note,
      x_pct: pos.x,
      y_pct: pos.y,
      audio_url: file_url,
      laser_data: JSON.stringify(ld),
      stroke_snapshot: JSON.stringify(snapshot),
    });
  };

  const handleReRecord = () => {
    setSavedAudioUrl(null);
    setLaserData([]);
    setStrokeSnapshot(null);
    setShowReplay(false);
    stopStrokeReplay();
    resetRecorder();
  };

  // ── Stroke replay logic ──────────────────────────────────────────────────
  const stopStrokeReplay = useCallback((allCurrentStrokes) => {
    cancelAnimationFrame(replayRafRef.current);
    // Restore all strokes (base + recorded)
    if (canvasRef?.current) {
      canvasRef.current.loadStrokes(allCurrentStrokes || { strokes: [], normalized: true });
    }
    setShowReplay(false);
  }, [canvasRef]);

  const handlePlayReplay = useCallback(() => {
    if (!savedAudioUrl) return;
    setShowReplay(true);

    // Snapshot full current strokes so we can restore on stop
    const allCurrent = canvasRef?.current?.getStrokes();
    fullStrokesBeforeReplayRef.current = allCurrent;

    // Get the strokes that existed BEFORE this recording (everything to keep visible)
    const allStrokes = allCurrent?.strokes ?? [];
    // The snapshot only contains strokes from during the recording
    const recordedStrokes = strokeSnapshot?.strokes ?? [];
    // Pre-recording strokes = everything minus the recorded ones (by count, from the end)
    const preCount = Math.max(0, allStrokes.length - recordedStrokes.length);
    const baseStrokes = allStrokes.slice(0, preCount);

    // Load just the base (pre-recording) strokes — recorded ones will animate in
    if (canvasRef?.current) {
      canvasRef.current.loadStrokes({ strokes: baseStrokes, normalized: true });
    }

    // Start audio
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
    }, 30);

    // Animate the recorded strokes by timestamp on top of base
    if (recordedStrokes.length > 0) {
      const minT = Math.min(
        ...recordedStrokes.flatMap(s => s.pts.map(p => p.t || 0)).filter(t => t > 0)
      );
      const playbackStart = Date.now();
      const strokesProgress = recordedStrokes.map(() => 0);

      const animate = () => {
        const elapsed = Date.now() - playbackStart;
        let changed = false;

        recordedStrokes.forEach((stroke, si) => {
          const prevCount = strokesProgress[si];
          let newCount = 0;
          for (let pi = 0; pi < stroke.pts.length; pi++) {
            const ptT = (stroke.pts[pi].t || 0) > 0 ? (stroke.pts[pi].t - minT) : pi * 16;
            if (ptT <= elapsed) newCount = pi + 1;
            else break;
          }
          if (newCount !== prevCount) { strokesProgress[si] = newCount; changed = true; }
        });

        if (changed && canvasRef?.current) {
          const partialRecorded = recordedStrokes
            .map((s, si) => strokesProgress[si] > 0 ? { ...s, pts: s.pts.slice(0, strokesProgress[si]) } : null)
            .filter(Boolean);
          // Combine base + animated recorded strokes
          canvasRef.current.loadStrokes({ strokes: [...baseStrokes, ...partialRecorded], normalized: true });
        }

        if (audioRef.current?.ended) return;
        replayRafRef.current = requestAnimationFrame(animate);
      };

      replayRafRef.current = requestAnimationFrame(animate);
    }
  }, [savedAudioUrl, strokeSnapshot, canvasRef]);

  const handleStopReplay = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    stopStrokeReplay(fullStrokesBeforeReplayRef.current);
  }, [stopStrokeReplay]);

  const handleAudioEnded = useCallback(() => {
    cancelAnimationFrame(replayRafRef.current);
    // Restore all strokes to pre-replay state
    if (canvasRef?.current) {
      canvasRef.current.loadStrokes(fullStrokesBeforeReplayRef.current || { strokes: [], normalized: true });
    }
    setShowReplay(false);
  }, [canvasRef]);

  // Cleanup on unmount
  useEffect(() => () => cancelAnimationFrame(replayRafRef.current), []);

  const isTeacher = role === 'teacher';
  const icon = isTeacher ? '🔊' : '🎙';
  const iconBg = isTeacher ? '#f59e0b' : (recState === 'recording' ? '#ef4444' : '#4338ca');
  const pixelX = pos.x * containerSize.w;
  const pixelY = pos.y * containerSize.h;

  return (
    <>
      {/* The floating icon — small hit area so it doesn't intercept nearby drawing */}
      <div
        style={{
          position: 'absolute',
          left: pixelX,
          top: pixelY,
          transform: 'translate(-50%, -50%)',
          zIndex: 30,
          cursor: hasSavedAudio ? 'pointer' : 'grab',
          userSelect: 'none',
          touchAction: 'none',
          // Tight 44px hit area — anything outside falls through to canvas
          width: 44,
          height: 44,
          borderRadius: '50%',
        }}
        onMouseDown={onDragStart}
        onTouchStart={onDragStart}
        onClick={() => setShowPanel(v => !v)}
      >
        <motion.div
          animate={{ scale: recState === 'recording' ? [1, 1.15, 1] : 1 }}
          transition={{ repeat: recState === 'recording' ? Infinity : 0, duration: 0.8 }}
          style={{
            width: 44, height: 44, borderRadius: '50%', background: iconBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
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
            ref={panelRef}
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

            {/* Saved: show replay button */}
            {savedAudioUrl && (
              <div className="mb-2 flex flex-col gap-1">
                {!showReplay ? (
                  <button onClick={() => { setShowPanel(false); handlePlayReplay(); }}
                    style={{ width: '100%', padding: '8px 0', background: '#4338ca', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer' }}>
                    ▶ Play Recording
                  </button>
                ) : (
                  <button onClick={handleStopReplay}
                    style={{ width: '100%', padding: '8px 0', background: '#374151', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer' }}>
                    ⏹ Stop
                  </button>
                )}
                {laserData.length > 0 && (
                  <p style={{ color: '#818cf8', fontSize: 10 }}>🔴 Laser + drawings replay while playing</p>
                )}
              </div>
            )}

            {/* audio element is rendered outside the panel — see below */}

            {/* Recording controls (not readOnly) */}
            {!readOnly && (
              <>
                {recState === 'idle' && !savedAudioUrl && (
                  <button onClick={handleStartRecord}
                    style={{ width: '100%', padding: '8px 0', background: '#4338ca', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer' }}>
                    ⏺ Start Recording
                  </button>
                )}

                {recState === 'recording' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ flex: 1, padding: '8px 0', background: '#7f1d1d', color: '#fca5a5', borderRadius: 10, fontWeight: 'bold', fontSize: 12, textAlign: 'center' }}>
                      ● {formatTime(elapsed)}
                    </div>
                    <button onClick={pauseRecording}
                      style={{ flex: 1, padding: '8px 0', background: '#d97706', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer' }}>
                      ⏸
                    </button>
                    <button onClick={handleStop}
                      style={{ flex: 1, padding: '8px 0', background: '#dc2626', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer' }}>
                      ⏹
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

                {(recState === 'stopped' || uploading) && (
                  <div style={{ padding: '8px 0', color: '#a5b4fc', fontWeight: 'bold', fontSize: 13, textAlign: 'center' }}>
                    ⏳ Saving…
                  </div>
                )}

                {savedAudioUrl && !readOnly && (
                  <button onClick={handleReRecord}
                    style={{ width: '100%', padding: '6px 0', background: '#374151', color: '#fbbf24', borderRadius: 10, fontWeight: 'bold', fontSize: 12, border: 'none', cursor: 'pointer', marginTop: 6 }}>
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

      {/* Hidden audio element — always mounted so audioRef is valid during replay */}
      <audio ref={audioRef} src={savedAudioUrl || ''} style={{ display: 'none' }}
        onEnded={handleAudioEnded} />

      {/* Laser replay overlay — shown during playback */}
      {savedAudioUrl && laserData.length > 0 && showReplay && (
        <LaserReplayOverlay
          laserData={laserData}
          audioRef={audioRef}
          containerWidth={containerSize.w}
          containerHeight={containerSize.h}
        />
      )}

      {/* Live laser overlay — shown during active recording */}
      {(recState === 'recording' || recState === 'paused') && (
        <LaserOverlay
          trailPoints={laserTracker.trailPoints}
          width={containerSize.w}
          height={containerSize.h}
        />
      )}
    </>
  );
}