import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PdfPageRenderer from '@/components/notebook/PdfPageRenderer';
import LaserOverlay from '@/components/notebook/LaserOverlay';
import LaserReplayOverlay from '@/components/notebook/LaserReplayOverlay';
import useLaserTracker from '@/hooks/useLaserTracker';
import useAudioRecorder from '@/hooks/useAudioRecorder';

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function TeacherSpeakerIcon({ annotation, containerSize }) {
  const px = annotation.x_pct * containerSize.w;
  const py = annotation.y_pct * containerSize.h;
  const [showing, setShowing] = useState(false);
  const audioRef = useRef(null);
  const [laserData] = useState(() => {
    if (!annotation.laser_data) return [];
    try { return typeof annotation.laser_data === 'string' ? JSON.parse(annotation.laser_data) : annotation.laser_data; } catch { return []; }
  });

  return (
    <>
      <div
        style={{ position: 'absolute', left: px, top: py, transform: 'translate(-50%,-50%)', zIndex: 30, cursor: 'pointer' }}
        onClick={() => setShowing(v => !v)}
      >
        <motion.div whileTap={{ scale: 0.9 }}
          style={{ width: 40, height: 40, borderRadius: '50%', background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 4px 12px rgba(245,158,11,0.5)', border: '3px solid rgba(255,255,255,0.4)' }}>
          🔊
        </motion.div>
      </div>
      <AnimatePresence>
        {showing && (
          <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'absolute', left: Math.min(px + 28, containerSize.w - 220), top: Math.max(py - 40, 10), zIndex: 50, background: '#1a1a2e', border: '2px solid #f59e0b', borderRadius: 14, padding: 12, width: 210, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
            <div className="flex items-center justify-between mb-2">
              <span style={{ color: '#fcd34d', fontSize: 12, fontWeight: 'bold' }}>🔊 Teacher</span>
              <button onClick={() => setShowing(false)} style={{ color: '#6366f1', fontWeight: 'bold' }}>✕</button>
            </div>
            {annotation.label && <p style={{ color: '#e0e7ff', fontSize: 11, marginBottom: 8, fontStyle: 'italic' }}>{annotation.label}</p>}
            <audio ref={audioRef} controls src={annotation.audio_url} style={{ width: '100%', height: 32 }} />
            {laserData.length > 0 && <p style={{ color: '#fcd34d', fontSize: 10, marginTop: 4 }}>🔴 Laser plays while listening</p>}
          </motion.div>
        )}
      </AnimatePresence>
      {/* Laser replay synced to teacher audio */}
      {showing && laserData.length > 0 && (
        <LaserReplayOverlay
          laserData={laserData}
          audioRef={audioRef}
          containerWidth={containerSize.w}
          containerHeight={containerSize.h}
        />
      )}
    </>
  );
}

export default function StudentBookReader({ book, studentNumber, className, onBack }) {
  const qc = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const [twoPerPage, setTwoPerPage] = useState(false);
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const audioRef = useRef(null);

  const totalPages = book.pdf_page_count || (book.pages || []).length || 1;
  const today = getToday();

  // Session query
  const { data: sessions = [], refetch } = useQuery({
    queryKey: ['book-sessions', book.id, studentNumber, today],
    queryFn: () => base44.entities.BookReadingSession.filter({
      book_id: book.id,
      class_name: className,
      student_number: studentNumber,
      session_date: today,
    }),
  });

  const session = sessions[0] || null;

  const getPageRecording = useCallback(() => {
    if (!session) return null;
    return (session.recordings || []).find(r => r.page === currentPage) || null;
  }, [session, currentPage]);

  // Laser
  const laserTracker = useLaserTracker({ containerRef, enabled: true });

  // Audio recorder
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

  const [uploading, setUploading] = useState(false);
  const [pageRecording, setPageRecording] = useState(null);
  const [showReplay, setShowReplay] = useState(false);
  const [replayLaserData, setReplayLaserData] = useState([]);

  useEffect(() => {
    const rec = getPageRecording();
    setPageRecording(rec || null);
    setShowReplay(false);
  }, [currentPage, session]);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: Math.round(width), h: Math.round(height) });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const handleStartRecord = async () => {
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
    const file = new File([blob], `book-read-p${currentPage}-${Date.now()}.webm`, { type: 'audio/webm' });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const ld = laserTracker.getLaserData();
    const newRec = { page: currentPage, audio_url: file_url, laser_data: ld, recorded_at: new Date().toISOString() };

    if (session) {
      const updatedRecs = [
        ...(session.recordings || []).filter(r => r.page !== currentPage),
        newRec,
      ];
      const updatedPages = Array.from(new Set([...(session.pages_completed || []), currentPage]));
      await base44.entities.BookReadingSession.update(session.id, {
        recordings: updatedRecs,
        pages_completed: updatedPages,
        last_page: currentPage,
      });
    } else {
      await base44.entities.BookReadingSession.create({
        book_id: book.id,
        class_name: className,
        student_number: studentNumber,
        session_date: today,
        recordings: [newRec],
        pages_completed: [currentPage],
        last_page: currentPage,
      });
    }

    setPageRecording(newRec);
    setUploading(false);
    resetRecorder();
    laserTracker.clearLaser();
    refetch();
  };

  const handleReplay = (rec) => {
    const ld = rec.laser_data || [];
    setReplayLaserData(typeof ld === 'string' ? JSON.parse(ld) : ld);
    setShowReplay(true);
  };

  const pageAnnotations = (book.teacher_annotations || []).filter(a => a.page === currentPage);

  // Page navigation — 2-per-page jumps by 2
  const step = twoPerPage ? 2 : 1;
  const canGoNext = currentPage + step - 1 < totalPages;
  const canGoPrev = currentPage > 1;

  const goNext = () => setCurrentPage(p => Math.min(totalPages, p + step));
  const goPrev = () => setCurrentPage(p => Math.max(1, p - step));

  // Render a single book page (PDF or image)
  const renderPage = (pageNum) => {
    if (book.book_type === 'images') {
      const img = (book.pages || []).find(p => p.page_number === pageNum);
      return img
        ? <img src={img.image_url} alt={`Page ${pageNum}`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
        : <div className="flex items-center justify-center w-full h-full text-gray-400">No image</div>;
    }
    return <PdfPageRenderer pdfUrl={book.pdf_url} pageNumber={pageNum} fitMode="contain" />;
  };

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: '#042f2e' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ background: '#0f3d3a', borderBottom: '2px solid #0d9488' }}>
        <button onClick={onBack} className="text-teal-300 hover:text-white font-bold text-sm">← Back</button>
        <p className="flex-1 text-white font-black text-sm truncate">{book.title}</p>
        <span className="text-teal-400 text-xs font-bold">#{studentNumber}</span>
        {/* 2-per-page toggle */}
        <button
          onClick={() => setTwoPerPage(v => !v)}
          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${twoPerPage ? 'bg-teal-600 text-white border-teal-400' : 'text-teal-300 border-teal-700'}`}
          title="Toggle 2 pages per view"
        >
          {twoPerPage ? '📖 2-up' : '📄 1-up'}
        </button>
        <span className="text-teal-300 text-sm font-bold">
          Pg {currentPage}{twoPerPage && currentPage + 1 <= totalPages ? `–${currentPage + 1}` : ''} / {totalPages}
        </span>
      </div>

      {/* Page display — fit to available space, no scroll */}
      <div
        className="flex-1 relative flex items-center justify-center overflow-hidden"
        ref={containerRef}
        style={{ background: '#1a1a1a' }}
      >
        {twoPerPage ? (
          // Two pages side by side
          <div style={{ display: 'flex', width: '100%', height: '100%', gap: 4 }}>
            <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {renderPage(currentPage)}
              </div>
              {/* Laser live */}
              {(recState === 'recording' || recState === 'paused') && (
                <LaserOverlay trailPoints={laserTracker.trailPoints} />
              )}
              {/* Replay laser */}
              {showReplay && replayLaserData.length > 0 && (
                <LaserReplayOverlay laserData={replayLaserData} audioRef={audioRef} />
              )}
              {/* Teacher annotations */}
              {pageAnnotations.map((ann, i) => (
                <TeacherSpeakerIcon key={ann.id || i} annotation={ann} containerSize={{ w: containerSize.w / 2, h: containerSize.h }} />
              ))}
            </div>
            {currentPage + 1 <= totalPages && (
              <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {renderPage(currentPage + 1)}
                </div>
              </div>
            )}
          </div>
        ) : (
          // Single page — fit to container
          <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <div style={{ maxWidth: '100%', maxHeight: '100%', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {renderPage(currentPage)}
            </div>
            {/* Laser live */}
            {(recState === 'recording' || recState === 'paused') && (
              <LaserOverlay trailPoints={laserTracker.trailPoints} />
            )}
            {/* Replay laser */}
            {showReplay && replayLaserData.length > 0 && (
              <LaserReplayOverlay
                laserData={replayLaserData}
                audioRef={audioRef}
                containerWidth={containerSize.w}
                containerHeight={containerSize.h}
              />
            )}
            {/* Teacher speaker annotations */}
            {pageAnnotations.map((ann, i) => (
              <TeacherSpeakerIcon key={ann.id || i} annotation={ann} containerSize={containerSize} />
            ))}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="shrink-0 p-3 flex flex-col gap-2" style={{ background: '#0f3d3a', borderTop: '2px solid #0d9488' }}>
        {/* Existing recording */}
        {pageRecording && !showReplay && recState === 'idle' && (
          <div className="flex items-center gap-2 p-2 rounded-xl" style={{ background: '#134e4a', border: '1px solid #0d9488' }}>
            <span className="text-teal-300 text-xs font-bold flex-1">✅ Page {currentPage} recorded</span>
            <button onClick={() => handleReplay(pageRecording)}
              className="px-3 py-1 rounded-lg font-bold text-white text-xs" style={{ background: '#0d9488' }}>
              ▶ Replay
            </button>
            <button onClick={() => { resetRecorder(); setPageRecording(null); }}
              className="px-3 py-1 rounded-lg font-bold text-white text-xs" style={{ background: '#374151' }}>
              🔄 Re-record
            </button>
          </div>
        )}

        {/* Replay audio */}
        {showReplay && pageRecording && (
          <div className="flex items-center gap-2 p-2 rounded-xl" style={{ background: '#134e4a', border: '1px solid #14b8a6' }}>
            <span className="text-teal-200 text-xs font-bold">▶ Replay — laser synced</span>
            <audio ref={audioRef} controls src={pageRecording.audio_url} className="flex-1 h-8" />
            <button onClick={() => setShowReplay(false)} className="text-teal-400 font-bold text-xs">✕</button>
          </div>
        )}

        {/* Record controls */}
        {recState === 'idle' && !pageRecording && (
          <button onClick={handleStartRecord}
            className="w-full py-3 rounded-2xl font-black text-white text-base"
            style={{ background: '#dc2626' }}>
            ⏺ Record Reading — Page {currentPage}
          </button>
        )}
        {recState === 'recording' && (
          <div className="flex gap-2">
            <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-xl" style={{ background: '#7f1d1d' }}>
              <span className="text-red-300 font-black text-sm animate-pulse">● REC</span>
              <span className="text-white font-bold text-sm">{formatTime(elapsed)}</span>
            </div>
            <button onClick={pauseRecording} className="px-4 py-2 rounded-xl font-bold text-white" style={{ background: '#d97706' }}>⏸</button>
            <button onClick={handleStop} className="px-4 py-2 rounded-xl font-bold text-white" style={{ background: '#dc2626' }}>⏹ Stop</button>
          </div>
        )}
        {recState === 'paused' && (
          <div className="flex gap-2">
            <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-xl" style={{ background: '#374151' }}>
              <span className="text-gray-300 font-bold text-sm">⏸ Paused</span>
              <span className="text-white font-bold text-sm">{formatTime(elapsed)}</span>
            </div>
            <button onClick={resumeRecording} className="px-4 py-2 rounded-xl font-bold text-white" style={{ background: '#0d9488' }}>▶ Resume</button>
            <button onClick={handleStop} className="px-4 py-2 rounded-xl font-bold text-white" style={{ background: '#dc2626' }}>⏹ Stop</button>
          </div>
        )}
        {recState === 'stopped' && (
          <div className="flex flex-col gap-2">
            {liveAudioUrl && <audio controls src={liveAudioUrl} className="w-full h-8" />}
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={uploading}
                className="flex-1 py-2 rounded-xl font-bold text-white"
                style={{ background: '#16a34a', opacity: uploading ? 0.6 : 1 }}>
                {uploading ? '⏳ Saving…' : '💾 Save Recording'}
              </button>
              <button onClick={() => { resetRecorder(); laserTracker.clearLaser(); }}
                className="px-4 py-2 rounded-xl font-bold text-white" style={{ background: '#374151' }}>🔄</button>
            </div>
          </div>
        )}

        {/* Page navigation */}
        <div className="flex gap-2">
          <button onClick={goPrev} disabled={!canGoPrev}
            className="flex-1 py-2 rounded-xl font-bold text-white disabled:opacity-30"
            style={{ background: '#0f766e' }}>‹ Prev</button>
          <button onClick={goNext} disabled={!canGoNext}
            className="flex-1 py-2 rounded-xl font-bold text-white disabled:opacity-30"
            style={{ background: '#0f766e' }}>Next ›</button>
        </div>
      </div>
    </div>
  );
}