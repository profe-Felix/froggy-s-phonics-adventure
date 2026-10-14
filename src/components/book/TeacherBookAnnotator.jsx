import { useState, useRef, useEffect, useCallback } from 'react';
import BookPageRenderer from '@/components/book/BookPageRenderer';
import LaserOverlay from '@/components/notebook/LaserOverlay';
import LaserReplayOverlay from '@/components/notebook/LaserReplayOverlay';
import useLaserTracker from '@/hooks/useLaserTracker';
import useAudioRecorder from '@/hooks/useAudioRecorder';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * A single floating speaker icon on the annotation canvas.
 * Teacher: can record/re-record. Shows full widget panel.
 */
function AnnotationIcon({ ann, containerSize, onUpdate, onRemove, laserTracker, recState, isEditing, onSetEditing }) {
  const [showPanel, setShowPanel] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [liveAudioUrl, setLiveAudioUrl] = useState(null);
  const panelRef = useRef(null);
  const audioRef = useRef(null);
  const [showReplay, setShowReplay] = useState(false);
  const [laserData] = useState(() => {
    if (!ann.laser_data) return [];
    try { return typeof ann.laser_data === 'string' ? JSON.parse(ann.laser_data) : ann.laser_data; }
    catch { return []; }
  });
  const [currentLaserData, setCurrentLaserData] = useState(laserData);

  const {
    state, elapsed, formatTime,
    startRecording, pauseRecording, resumeRecording, stopRecording,
    reset: resetRecorder, getBlob, audioUrl,
  } = useAudioRecorder();

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
    const file = new File([blob], `teacher-ann-${Date.now()}.webm`, { type: 'audio/webm' });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const ld = laserTracker.getLaserData();
    setCurrentLaserData(ld);
    setUploading(false);
    resetRecorder();
    laserTracker.clearLaser();
    onSetEditing(null);
    onUpdate({ ...ann, audio_url: file_url, laser_data: ld });
  };

  const handleReRecord = () => {
    resetRecorder();
    setShowReplay(false);
  };

  const handlePlayReplay = () => {
    setShowReplay(true);
    setShowPanel(false);
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
    }, 50);
  };

  const px = ann.x_pct * containerSize.w;
  const py = ann.y_pct * containerSize.h;
  const hasAudio = !!ann.audio_url;
  const isRec = state === 'recording' || state === 'paused';

  return (
    <>
      {/* Icon button */}
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
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22,
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
              left: Math.min(px + 28, containerSize.w - 240),
              top: Math.max(py - 60, 10),
              zIndex: 50,
              background: '#0f3d3a',
              border: '2px solid #0d9488',
              borderRadius: 16, padding: 14, width: 230,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <span style={{ color: '#5eead4', fontSize: 12, fontWeight: 'bold' }}>🔊 Speaker Annotation</span>
              <button onClick={() => setShowPanel(false)} style={{ color: '#0d9488', fontWeight: 'bold', fontSize: 14 }}>✕</button>
            </div>

            {ann.label && (
              <p style={{ color: '#e0e7ff', fontSize: 11, marginBottom: 8, fontStyle: 'italic' }}>{ann.label}</p>
            )}

            {/* Existing audio */}
            {hasAudio && state === 'idle' && (
              <div style={{ marginBottom: 8 }}>
                {!showReplay ? (
                  <button onClick={handlePlayReplay}
                    style={{ width: '100%', padding: '7px 0', background: '#0d9488', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer', marginBottom: 4 }}>
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

            {/* Recording controls */}
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
                <button onClick={pauseRecording}
                  style={{ flex: 1, padding: '7px 0', background: '#d97706', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer' }}>⏸</button>
                <button onClick={handleStop}
                  style={{ flex: 1, padding: '7px 0', background: '#dc2626', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer' }}>⏹</button>
              </div>
            )}

            {state === 'paused' && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={resumeRecording}
                  style={{ flex: 1, padding: '7px 0', background: '#0d9488', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer' }}>▶ Resume</button>
                <button onClick={handleStop}
                  style={{ flex: 1, padding: '7px 0', background: '#dc2626', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer' }}>⏹</button>
              </div>
            )}

            {state === 'stopped' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {audioUrl && <audio controls src={audioUrl} style={{ width: '100%', height: 32 }} />}
                <button onClick={handleSave} disabled={uploading}
                  style={{ padding: '7px 0', background: '#16a34a', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer', opacity: uploading ? 0.6 : 1 }}>
                  {uploading ? '⏳ Saving…' : '💾 Save'}
                </button>
                <button onClick={handleReRecord}
                  style={{ padding: '7px 0', background: '#374151', color: 'white', borderRadius: 10, fontWeight: 'bold', fontSize: 13, border: 'none', cursor: 'pointer' }}>
                  🔄 Re-record
                </button>
              </div>
            )}

            {(state === 'idle' || isRec) && (
              <p style={{ color: '#5eead4', fontSize: 10, marginTop: 8 }}>
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

      {/* Hidden audio for replay */}
      <audio ref={audioRef} src={ann.audio_url || ''} style={{ display: 'none' }}
        onEnded={() => setShowReplay(false)} />

      {/* Laser replay overlay */}
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

export default function TeacherBookAnnotator({ book, onUpdate }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [annotations, setAnnotations] = useState(book.teacher_annotations || []);
  const [placing, setPlacing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [containerSize, setContainerSize] = useState({ w: 600, h: 800 });
  const [pdfSize, setPdfSize] = useState(null);

  const containerRef = useRef(null);
  const totalPages = book.pdf_page_count || (book.pages || []).length || 1;
  const pageAnnotations = annotations.filter(a => a.page === currentPage);

  // Laser tracker always on so any active AnnotationIcon can use it
  const laserTracker = useLaserTracker({ containerRef, enabled: true });

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(e => {
      const { width, height } = e[0].contentRect;
      setContainerSize({ w: Math.round(width), h: Math.round(height) });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const handlePageClick = (e) => {
    if (!placing || !containerRef.current) return;
    e.stopPropagation();
    const rect = containerRef.current.getBoundingClientRect();
    const x_pct = (e.clientX - rect.left) / rect.width;
    const y_pct = (e.clientY - rect.top) / rect.height;
    const newAnn = {
      id: `ann-${Date.now()}`,
      page: currentPage,
      x_pct, y_pct,
      type: 'speaker',
      audio_url: null,
      laser_data: null,
      label: '',
    };
    const updated = [...annotations, newAnn];
    setAnnotations(updated);
    setPlacing(false);
    onUpdate?.({ ...book, teacher_annotations: updated });
  };

  const handleUpdate = useCallback((updatedAnn) => {
    setAnnotations(prev => {
      const next = prev.map(a => a.id === updatedAnn.id ? updatedAnn : a);
      onUpdate?.({ ...book, teacher_annotations: next });
      return next;
    });
  }, [book, onUpdate]);

  const handleRemove = useCallback((id) => {
    setAnnotations(prev => {
      const next = prev.filter(a => a.id !== id);
      onUpdate?.({ ...book, teacher_annotations: next });
      return next;
    });
    if (editingId === id) setEditingId(null);
  }, [book, onUpdate, editingId]);

  const isHtmlBook = book.book_type === 'html' || (book.pages || []).some(page => page.html_url);
  const effectiveSize = isHtmlBook ? containerSize : pdfSize || containerSize;

  return (
    <div className="flex flex-col gap-3">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap p-3 rounded-2xl" style={{ background: '#0f3d3a', border: '1px solid #0d9488' }}>
        <button
          onClick={() => setPlacing(v => !v)}
          className={`px-4 py-2 rounded-xl font-bold text-sm ${placing ? 'bg-yellow-500 text-black' : 'border border-teal-600 text-teal-300'}`}>
          {placing ? '🖱 Click page to place' : '➕ Place Speaker'}
        </button>
        <p className="text-teal-400 text-xs flex-1">
          {pageAnnotations.length} icon{pageAnnotations.length !== 1 ? 's' : ''} on this page
        </p>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
            className="w-8 h-8 rounded-lg font-bold text-white disabled:opacity-30" style={{ background: '#0d9488' }}>‹</button>
          <span className="text-white font-black text-sm">Pg {currentPage} / {totalPages}</span>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
            className="w-8 h-8 rounded-lg font-bold text-white disabled:opacity-30" style={{ background: '#0d9488' }}>›</button>
        </div>
      </div>

      {/* PDF page with annotation icons */}
      <div
        ref={containerRef}
        style={{ position: 'relative', background: '#e8e8e8', cursor: placing ? 'crosshair' : 'default', height: isHtmlBook ? 'min(65vh, 768px)' : undefined }}
        onClick={handlePageClick}
      >
        <BookPageRenderer
          book={book}
          pageNumber={currentPage}
          fitMode="width"
          onRendered={(w, h) => setPdfSize({ w, h })}
        />

        {/* Live laser overlay while any icon is recording */}
        {editingId && (
          <LaserOverlay trailPoints={laserTracker.trailPoints} width={effectiveSize.w} height={effectiveSize.h} />
        )}

        {/* Annotation icons */}
        {pageAnnotations.map(ann => (
          <AnnotationIcon
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