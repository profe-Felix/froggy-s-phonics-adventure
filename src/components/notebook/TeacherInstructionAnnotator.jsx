import { useState, useRef, useEffect, useCallback } from 'react';
import PdfPageRenderer from './PdfPageRenderer';
import LaserOverlay from './LaserOverlay';
import LaserReplayOverlay from './LaserReplayOverlay';
import useLaserTracker from '@/hooks/useLaserTracker';
import useAudioRecorder from '@/hooks/useAudioRecorder';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Single floating speaker icon for teacher instruction placement.
 * Identical UX to FloatingMicWidget but for teacher-side annotation of notebook assignments.
 */
function InstructionIcon({ ann, containerSize, onUpdate, onRemove, laserTracker, isEditing, onSetEditing }) {
  const [showPanel, setShowPanel] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showReplay, setShowReplay] = useState(false);
  const [currentLaserData, setCurrentLaserData] = useState(() => {
    if (!ann.laser_data) return [];
    try { return typeof ann.laser_data === 'string' ? JSON.parse(ann.laser_data) : ann.laser_data; }
    catch { return []; }
  });
  const panelRef = useRef(null);
  const audioRef = useRef(null);

  const {
    state, elapsed, formatTime,
    startRecording, pauseRecording, resumeRecording, stopRecording,
    reset: resetRecorder, getBlob, audioUrl,
  } = useAudioRecorder();

  useEffect(() => {
    if (!showPanel) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setShowPanel(false);
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [showPanel]);

  const handleStartRecord = async () => {
    onSetEditing(ann.id);
    laserTracker.startRecordingLaser();
    await startRecording();
  };

  const handleStop = () => {
    stopRecording();
    laserTracker.stopRecordingLaser();
  };

  const handleSave = async () => {
    const blob = getBlob();
    if (!blob) return;
    setUploading(true);
    const file = new File([blob], `nb-instr-${Date.now()}.webm`, { type: 'audio/webm' });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const ld = laserTracker.getLaserData();
    setCurrentLaserData(ld);
    setUploading(false);
    resetRecorder();
    laserTracker.clearLaser();
    onSetEditing(null);
    onUpdate({ ...ann, audio_url: file_url, laser_data: ld });
  };

  const handlePlayReplay = () => {
    setShowReplay(true);
    setShowPanel(false);
    setTimeout(() => {
      if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play().catch(() => {}); }
    }, 50);
  };

  const px = ann.x_pct * containerSize.w;
  const py = ann.y_pct * containerSize.h;
  const hasAudio = !!ann.audio_url;
  const isRec = state === 'recording' || state === 'paused';

  return (
    <>
      <div
        style={{
          position: 'absolute', left: px, top: py,
          transform: 'translate(-50%,-50%)', zIndex: 30, cursor: 'pointer',
          width: 44, height: 44, borderRadius: '50%',
        }}
        onClick={(e) => { e.stopPropagation(); setShowPanel(v => !v); }}
      >
        <motion.div
          animate={{ scale: isRec ? [1, 1.15, 1] : 1 }}
          transition={{ repeat: isRec ? Infinity : 0, duration: 0.8 }}
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: hasAudio ? '#f59e0b' : '#4338ca',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
            border: isEditing ? '3px solid white' : '3px solid rgba(255,255,255,0.3)',
            boxShadow: isRec ? '0 0 16px rgba(239,68,68,0.8)' : '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          {hasAudio ? '🔊' : '🎙'}
        </motion.div>
        {isRec && (
          <div style={{
            position: 'absolute', top: -8, right: -8,
            background: '#ef4444', color: 'white', fontSize: 9,
            fontWeight: 'bold', borderRadius: 8, padding: '1px 5px',
          }}>{formatTime(elapsed)}</div>
        )}
      </div>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            style={{
              position: 'absolute',
              left: Math.min(px + 28, containerSize.w - 240),
              top: Math.max(py - 60, 10),
              zIndex: 50, background: '#1a1a2e',
              border: '2px solid #4338ca', borderRadius: 16, padding: 14, width: 230,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <span style={{ color: '#a5b4fc', fontSize: 12, fontWeight: 'bold' }}>🔊 Instruction</span>
              <button onClick={() => setShowPanel(false)} style={{ color: '#6366f1', fontWeight: 'bold', fontSize: 14 }}>✕</button>
            </div>

            {hasAudio && state === 'idle' && (
              <div style={{ marginBottom: 8 }}>
                {!showReplay ? (
                  <button onClick={handlePlayReplay}
                    style={{ width: '100%', padding: '7px 0', background: '#4338ca', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer', marginBottom: 4 }}>
                    ▶ Play Recording
                  </button>
                ) : (
                  <button onClick={() => { audioRef.current?.pause(); audioRef.current && (audioRef.current.currentTime = 0); setShowReplay(false); }}
                    style={{ width: '100%', padding: '7px 0', background: '#374151', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer', marginBottom: 4 }}>
                    ⏹ Stop
                  </button>
                )}
              </div>
            )}

            {state === 'idle' && (
              <button onClick={handleStartRecord}
                style={{ width: '100%', padding: '7px 0', background: '#dc2626', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer' }}>
                {hasAudio ? '🔄 Re-record' : '⏺ Record'}
              </button>
            )}

            {state === 'recording' && (
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ flex: 1, padding: '7px 0', background: '#7f1d1d', color: '#fca5a5', borderRadius: 10, fontWeight: 'bold', fontSize: 12, textAlign: 'center' }}>
                  ● {formatTime(elapsed)}
                </div>
                <button onClick={pauseRecording} style={{ flex: 1, padding: '7px 0', background: '#d97706', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer' }}>⏸</button>
                <button onClick={handleStop} style={{ flex: 1, padding: '7px 0', background: '#dc2626', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer' }}>⏹</button>
              </div>
            )}

            {state === 'paused' && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={resumeRecording} style={{ flex: 1, padding: '7px 0', background: '#4338ca', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer' }}>▶ Resume</button>
                <button onClick={handleStop} style={{ flex: 1, padding: '7px 0', background: '#dc2626', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer' }}>⏹</button>
              </div>
            )}

            {state === 'stopped' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {audioUrl && <audio controls src={audioUrl} style={{ width: '100%', height: 32 }} />}
                <button onClick={handleSave} disabled={uploading}
                  style={{ padding: '7px 0', background: '#16a34a', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer', opacity: uploading ? 0.6 : 1 }}>
                  {uploading ? '⏳ Saving…' : '💾 Save'}
                </button>
                <button onClick={() => resetRecorder()}
                  style={{ padding: '7px 0', background: '#374151', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer' }}>
                  🔄 Re-record
                </button>
              </div>
            )}

            {(state === 'idle' || isRec) && (
              <p style={{ color: '#818cf8', fontSize: 10, marginTop: 8 }}>
                🔴 Move finger/mouse on page to record laser while speaking
              </p>
            )}

            <button onClick={() => { setShowPanel(false); onRemove(ann.id); }}
              style={{ width: '100%', padding: '6px 0', background: 'transparent', color: '#f87171', borderRadius: 10, fontWeight: 'bold', fontSize: 12, border: '1px solid #7f1d1d', cursor: 'pointer', marginTop: 8 }}>
              🗑 Remove
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <audio ref={audioRef} src={ann.audio_url || ''} style={{ display: 'none' }}
        onEnded={() => setShowReplay(false)} />

      {showReplay && currentLaserData.length > 0 && (
        <LaserReplayOverlay
          laserData={currentLaserData}
          audioRef={audioRef}
          containerWidth={containerSize.w}
          containerHeight={containerSize.h}
        />
      )}
    </>
  );
}

/**
 * TeacherInstructionAnnotator
 * Replaces the old audio/video instruction system.
 * Shows the PDF page, teacher places speaker icons, records audio+laser per icon.
 * Saves to assignment.audio_instructions as [{id, page, x_pct, y_pct, url, laser_data, label}]
 */
export default function TeacherInstructionAnnotator({ assignment, onSave }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [annotations, setAnnotations] = useState(() => {
    // Load from audio_instructions — support both old {page,url,label} and new {id,page,x_pct,y_pct,url,laser_data}
    return (assignment.audio_instructions || []).filter(a => a.x_pct !== undefined);
  });
  const [placing, setPlacing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [pdfSize, setPdfSize] = useState(null);
  const [containerSize, setContainerSize] = useState({ w: 600, h: 800 });

  const containerRef = useRef(null);
  const laserTracker = useLaserTracker({ containerRef, enabled: true });

  const totalPages = assignment.pdf_page_count || assignment.page_count || 1;
  const pageAnnotations = annotations.filter(a => a.page === currentPage);
  const effectiveSize = pdfSize || containerSize;

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(e => {
      const { width, height } = e[0].contentRect;
      setContainerSize({ w: Math.round(width), h: Math.round(height) });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const persist = useCallback((next) => {
    // Preserve any old-style non-positioned instructions alongside new ones
    const oldStyle = (assignment.audio_instructions || []).filter(a => a.x_pct === undefined);
    onSave([...oldStyle, ...next]);
  }, [assignment.audio_instructions, onSave]);

  const handlePageClick = (e) => {
    if (!placing || !containerRef.current) return;
    e.stopPropagation();
    const rect = containerRef.current.getBoundingClientRect();
    const newAnn = {
      id: `instr-${Date.now()}`,
      page: currentPage,
      x_pct: (e.clientX - rect.left) / rect.width,
      y_pct: (e.clientY - rect.top) / rect.height,
      url: null,
      audio_url: null,
      laser_data: null,
      label: `Page ${currentPage} instruction`,
    };
    const next = [...annotations, newAnn];
    setAnnotations(next);
    setPlacing(false);
    persist(next);
  };

  const handleUpdate = useCallback((updatedAnn) => {
    setAnnotations(prev => {
      const next = prev.map(a => a.id === updatedAnn.id ? updatedAnn : a);
      persist(next);
      return next;
    });
  }, [persist]);

  const handleRemove = useCallback((id) => {
    setAnnotations(prev => {
      const next = prev.filter(a => a.id !== id);
      persist(next);
      return next;
    });
    if (editingId === id) setEditingId(null);
  }, [persist, editingId]);

  if (!assignment.pdf_url) {
    return <p className="text-indigo-400 text-sm">No PDF uploaded for this assignment.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap p-3 rounded-2xl" style={{ background: '#1a1a2e', border: '1px solid #4338ca' }}>
        <button
          onClick={() => setPlacing(v => !v)}
          className={`px-4 py-2 rounded-xl font-bold text-sm ${placing ? 'bg-yellow-500 text-black' : 'border border-indigo-500 text-indigo-300'}`}>
          {placing ? '🖱 Click page to place' : '➕ Place Speaker Icon'}
        </button>
        <p className="text-indigo-400 text-xs flex-1">
          {pageAnnotations.length} icon{pageAnnotations.length !== 1 ? 's' : ''} on this page
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
            className="w-8 h-8 rounded-lg font-bold text-white disabled:opacity-30" style={{ background: '#4338ca' }}>‹</button>
          <span className="text-white font-black text-sm">Pg {currentPage} / {totalPages}</span>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
            className="w-8 h-8 rounded-lg font-bold text-white disabled:opacity-30" style={{ background: '#4338ca' }}>›</button>
        </div>
      </div>

      <div
        ref={containerRef}
        style={{ position: 'relative', background: '#e8e8e8', cursor: placing ? 'crosshair' : 'default' }}
        onClick={handlePageClick}
      >
        <PdfPageRenderer
          pdfUrl={assignment.pdf_url}
          pageNumber={currentPage}
          onRendered={(w, h) => setPdfSize({ w, h })}
        />

        {editingId && (
          <LaserOverlay trailPoints={laserTracker.trailPoints} width={effectiveSize.w} height={effectiveSize.h} />
        )}

        {pageAnnotations.map(ann => (
          <InstructionIcon
            key={ann.id}
            ann={ann}
            containerSize={effectiveSize}
            onUpdate={handleUpdate}
            onRemove={handleRemove}
            laserTracker={laserTracker}
            isEditing={editingId === ann.id}
            onSetEditing={setEditingId}
          />
        ))}
      </div>
    </div>
  );
}