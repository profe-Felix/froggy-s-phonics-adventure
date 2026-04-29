import { useState, useRef, useEffect, useCallback } from 'react';
import PdfPageRenderer from '@/components/notebook/PdfPageRenderer';
import LaserOverlay from '@/components/notebook/LaserOverlay';
import useLaserTracker from '@/hooks/useLaserTracker';
import useAudioRecorder from '@/hooks/useAudioRecorder';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Teacher annotates a book: drops speaker icons on any page position,
 * records voice + laser for each icon.
 */
export default function TeacherBookAnnotator({ book, onUpdate }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [annotations, setAnnotations] = useState(book.teacher_annotations || []);
  const [placing, setPlacing] = useState(false); // click-to-place mode
  const [editingId, setEditingId] = useState(null);
  const [containerSize, setContainerSize] = useState({ w: 600, h: 800 });
  const [uploading, setUploading] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  const containerRef = useRef(null);

  const totalPages = book.pdf_page_count || (book.pages || []).length || 1;
  const pageAnnotations = annotations.filter(a => a.page === currentPage);

  const laserTracker = useLaserTracker({ containerRef, enabled: !!editingId });
  const {
    state: recState, audioUrl: liveAudioUrl, elapsed, formatTime,
    startRecording, pauseRecording, resumeRecording, stopRecording,
    reset: resetRecorder, getBlob,
  } = useAudioRecorder();

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(e => {
      const { width, height } = e[0].contentRect;
      setContainerSize({ w: width, h: height });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const handlePageClick = (e) => {
    if (!placing || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x_pct = (e.clientX - rect.left) / rect.width;
    const y_pct = (e.clientY - rect.top) / rect.height;
    const newAnn = {
      id: `ann-${Date.now()}`,
      page: currentPage,
      x_pct,
      y_pct,
      type: 'speaker',
      audio_url: null,
      laser_data: null,
      label: '',
    };
    const updated = [...annotations, newAnn];
    setAnnotations(updated);
    setPlacing(false);
    setEditingId(newAnn.id);
    setNewLabel('');
  };

  const handleStartRecord = async () => {
    laserTracker.startRecordingLaser();
    await startRecording();
  };

  const handleStop = () => {
    stopRecording();
    laserTracker.stopRecordingLaser();
  };

  const handleSaveRecording = async () => {
    const blob = getBlob();
    if (!blob || !editingId) return;
    setUploading(true);
    const file = new File([blob], `teacher-ann-${Date.now()}.webm`, { type: 'audio/webm' });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const ld = laserTracker.getLaserData();
    const updated = annotations.map(a =>
      a.id === editingId
        ? { ...a, audio_url: file_url, laser_data: ld, label: newLabel || a.label }
        : a
    );
    setAnnotations(updated);
    setUploading(false);
    resetRecorder();
    laserTracker.clearLaser();
    onUpdate?.({ ...book, teacher_annotations: updated });
    setEditingId(null);
  };

  const removeAnnotation = (id) => {
    const updated = annotations.filter(a => a.id !== id);
    setAnnotations(updated);
    onUpdate?.({ ...book, teacher_annotations: updated });
    if (editingId === id) setEditingId(null);
  };

  const editingAnn = annotations.find(a => a.id === editingId);

  return (
    <div className="flex flex-col gap-3">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap p-3 rounded-2xl" style={{ background: '#0f3d3a', border: '1px solid #0d9488' }}>
        <button
          onClick={() => { setPlacing(v => !v); setEditingId(null); }}
          className={`px-4 py-2 rounded-xl font-bold text-sm ${placing ? 'bg-yellow-500 text-black' : 'border border-teal-600 text-teal-300'}`}>
          {placing ? '🖱 Click page to place' : '➕ Place Speaker'}
        </button>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
            className="w-8 h-8 rounded-lg font-bold text-white disabled:opacity-30" style={{ background: '#0d9488' }}>‹</button>
          <span className="text-white font-black text-sm">Pg {currentPage} / {totalPages}</span>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
            className="w-8 h-8 rounded-lg font-bold text-white disabled:opacity-30" style={{ background: '#0d9488' }}>›</button>
        </div>
      </div>

      {/* Page with annotations */}
      <div
        ref={containerRef}
        style={{ position: 'relative', background: '#e8e8e8', cursor: placing ? 'crosshair' : 'default' }}
        onClick={handlePageClick}
      >
        {book.pdf_url ? (
          <PdfPageRenderer pdfUrl={book.pdf_url} pageNumber={currentPage} />
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-400">No PDF</div>
        )}

        {/* Live laser during recording */}
        {editingId && (recState === 'recording' || recState === 'paused') && (
          <LaserOverlay trailPoints={laserTracker.trailPoints} width={containerSize.w} height={containerSize.h} />
        )}

        {/* Annotation icons */}
        {pageAnnotations.map(ann => (
          <div
            key={ann.id}
            style={{
              position: 'absolute',
              left: ann.x_pct * containerSize.w,
              top: ann.y_pct * containerSize.h,
              transform: 'translate(-50%,-50%)',
              zIndex: 30,
              cursor: 'pointer',
            }}
            onClick={e => { e.stopPropagation(); setEditingId(editingId === ann.id ? null : ann.id); setNewLabel(ann.label || ''); }}
          >
            <div style={{
              width: 38, height: 38, borderRadius: '50%',
              background: ann.audio_url ? '#f59e0b' : '#4338ca',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
              border: editingId === ann.id ? '3px solid white' : '3px solid rgba(255,255,255,0.3)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}>
              {ann.audio_url ? '🔊' : '🎙'}
            </div>
          </div>
        ))}
      </div>

      {/* Edit panel for selected annotation */}
      <AnimatePresence>
        {editingId && editingAnn && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-2xl p-4 flex flex-col gap-3"
            style={{ background: '#0f3d3a', border: '2px solid #f59e0b' }}>
            <div className="flex items-center justify-between">
              <span className="text-yellow-300 font-bold text-sm">🔊 Speaker Annotation</span>
              <button onClick={() => { setEditingId(null); resetRecorder(); }} className="text-teal-400 font-bold">✕</button>
            </div>

            <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
              placeholder="Label (e.g. 'Find the word casa')"
              className="px-3 py-2 rounded-xl border border-teal-600 text-white text-sm"
              style={{ background: '#042f2e' }} />

            {editingAnn.audio_url && (
              <div>
                <p className="text-teal-300 text-xs mb-1">Current recording:</p>
                <audio controls src={editingAnn.audio_url} className="w-full h-8" />
              </div>
            )}

            <p className="text-teal-400 text-xs">🔴 Move your finger/mouse on the page to record laser while speaking.</p>

            {recState === 'idle' && (
              <button onClick={handleStartRecord}
                className="py-2 rounded-xl font-bold text-white text-sm"
                style={{ background: '#dc2626' }}>
                ⏺ Record Instruction
              </button>
            )}
            {recState === 'recording' && (
              <div className="flex gap-2">
                <div className="flex-1 px-3 py-2 rounded-xl flex items-center gap-2" style={{ background: '#7f1d1d' }}>
                  <span className="text-red-300 animate-pulse text-xs font-bold">● REC</span>
                  <span className="text-white text-sm font-bold">{formatTime(elapsed)}</span>
                </div>
                <button onClick={pauseRecording} className="px-3 py-2 rounded-xl font-bold text-white text-sm" style={{ background: '#d97706' }}>⏸</button>
                <button onClick={handleStop} className="px-3 py-2 rounded-xl font-bold text-white text-sm" style={{ background: '#dc2626' }}>⏹</button>
              </div>
            )}
            {recState === 'paused' && (
              <div className="flex gap-2">
                <button onClick={resumeRecording} className="flex-1 py-2 rounded-xl font-bold text-white text-sm" style={{ background: '#0d9488' }}>▶ Resume</button>
                <button onClick={handleStop} className="px-3 py-2 rounded-xl font-bold text-white text-sm" style={{ background: '#dc2626' }}>⏹</button>
              </div>
            )}
            {recState === 'stopped' && (
              <div className="flex flex-col gap-2">
                {liveAudioUrl && <audio controls src={liveAudioUrl} className="w-full h-8" />}
                <button onClick={handleSaveRecording} disabled={uploading}
                  className="py-2 rounded-xl font-bold text-white text-sm"
                  style={{ background: '#16a34a', opacity: uploading ? 0.6 : 1 }}>
                  {uploading ? '⏳ Saving…' : '💾 Save'}
                </button>
                <button onClick={() => resetRecorder()}
                  className="py-2 rounded-xl font-bold text-white text-sm"
                  style={{ background: '#374151' }}>🔄 Re-record</button>
              </div>
            )}

            <button onClick={() => removeAnnotation(editingId)}
              className="py-1.5 rounded-xl font-bold text-sm"
              style={{ background: 'transparent', color: '#f87171', border: '1px solid #7f1d1d' }}>
              🗑 Remove this icon
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}