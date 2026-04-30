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

// In 2-up mode, the "spread key" is always the left (odd) page number
function spreadKey(page) {
  return page % 2 === 0 ? page - 1 : page;
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

  // Always-mounted audio ref for replay — avoids ref timing issues
  const audioRef = useRef(null);

  const totalPages = book.pdf_page_count || (book.pages || []).length || 1;
  const today = getToday();

  // The recording key for current view
  // In 1-up: currentPage. In 2-up: spreadKey(currentPage) (always the odd/left page)
  const recKey = twoPerPage ? spreadKey(currentPage) : currentPage;

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

  const getSpreadRecording = useCallback((key) => {
    if (!session) return null;
    return (session.recordings || []).find(r => r.page === key) || null;
  }, [session]);

  // Laser — tracks over the full container in both modes
  const laserTracker = useLaserTracker({ containerRef, enabled: true });

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
  const [spreadRecording, setSpreadRecording] = useState(null);
  const [showReplay, setShowReplay] = useState(false);
  const [replayLaserData, setReplayLaserData] = useState([]);

  // Sync recording state when page/mode changes
  useEffect(() => {
    const rec = getSpreadRecording(recKey);
    setSpreadRecording(rec || null);
    setShowReplay(false);
  }, [recKey, session]);

  // Snap to correct spread when switching to 2-up
  const handleToggle2Up = () => {
    setTwoPerPage(v => {
      const next = !v;
      if (next) {
        // Snap to odd page (left of spread)
        setCurrentPage(p => spreadKey(p));
      }
      return next;
    });
  };

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
    const file = new File([blob], `book-read-p${recKey}-${Date.now()}.webm`, { type: 'audio/webm' });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const ld = laserTracker.getLaserData();
    const newRec = {
      page: recKey,
      audio_url: file_url,
      laser_data: ld,
      recorded_at: new Date().toISOString(),
      is_spread: twoPerPage, // track if this was a 2-up recording
    };

    const prevRecs = session?.recordings || [];
    // Remove any existing recording(s) for this spread key
    // In 2-up, a spread covers recKey and recKey+1; also clear any single-page recs for those pages
    const filtered = twoPerPage
      ? prevRecs.filter(r => r.page !== recKey && r.page !== recKey + 1)
      : prevRecs.filter(r => r.page !== recKey);
    const updatedRecs = [...filtered, newRec];

    const newPages = twoPerPage
      ? [recKey, recKey + 1 <= totalPages ? recKey + 1 : null].filter(Boolean)
      : [recKey];
    const updatedPages = Array.from(new Set([...(session?.pages_completed || []), ...newPages]));

    if (session) {
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
        pages_completed: updatedPages,
        last_page: currentPage,
      });
    }

    setSpreadRecording(newRec);
    setUploading(false);
    resetRecorder();
    laserTracker.clearLaser();
    refetch();
  };

  const handleReplay = (rec) => {
    const ld = rec.laser_data || [];
    setReplayLaserData(typeof ld === 'string' ? JSON.parse(ld) : ld);
    // If it was a spread recording, snap to 2-up mode at correct spread
    if (rec.is_spread) {
      setTwoPerPage(true);
      setCurrentPage(rec.page); // rec.page is always the odd/left page for spreads
    }
    setShowReplay(true);
  };

  const pageAnnotations = (book.teacher_annotations || []).filter(a => a.page === currentPage);
  const rightPageAnnotations = twoPerPage ? (book.teacher_annotations || []).filter(a => a.page === currentPage + 1) : [];

  // Navigation — always jumps by spread size
  const step = twoPerPage ? 2 : 1;
  const canGoNext = currentPage + step - 1 < totalPages;
  const canGoPrev = currentPage > 1;
  const goNext = () => setCurrentPage(p => Math.min(twoPerPage ? totalPages - (totalPages % 2 === 0 ? 1 : 0) : totalPages, p + step));
  const goPrev = () => setCurrentPage(p => Math.max(1, p - step));

  const renderPage = (pageNum) => {
    if (book.book_type === 'images') {
      const img = (book.pages || []).find(p => p.page_number === pageNum);
      return img
        ? <img src={img.image_url} alt={`Page ${pageNum}`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
        : <div className="flex items-center justify-center w-full h-full text-gray-400">No image</div>;
    }
    return <PdfPageRenderer pdfUrl={book.pdf_url} pageNumber={pageNum} fitMode="contain" />;
  };

  const isRecording = recState === 'recording' || recState === 'paused';

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: '#042f2e' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ background: '#0f3d3a', borderBottom: '2px solid #0d9488' }}>
        <button onClick={onBack} className="text-teal-300 hover:text-white font-bold text-sm">← Back</button>
        <p className="flex-1 text-white font-black text-sm truncate">{book.title}</p>
        <span className="text-teal-400 text-xs font-bold">#{studentNumber}</span>
        <button
          onClick={handleToggle2Up}
          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${twoPerPage ? 'bg-teal-600 text-white border-teal-400' : 'text-teal-300 border-teal-700'}`}
        >
          {twoPerPage ? '📖 2-up' : '📄 1-up'}
        </button>
        <span className="text-teal-300 text-sm font-bold">
          Pg {currentPage}{twoPerPage && currentPage + 1 <= totalPages ? `–${currentPage + 1}` : ''} / {totalPages}
        </span>
      </div>

      {/* Page display */}
      <div
        className="flex-1 relative overflow-hidden"
        ref={containerRef}
        style={{ background: '#1a1a1a' }}
      >
        {twoPerPage ? (
          <div style={{ display: 'flex', width: '100%', height: '100%', gap: 4 }}>
            {/* Left page */}
            <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {renderPage(currentPage)}
              {pageAnnotations.map((ann, i) => (
                <TeacherSpeakerIcon key={ann.id || i} annotation={ann} containerSize={{ w: containerSize.w / 2, h: containerSize.h }} />
              ))}
            </div>
            {/* Right page */}
            {currentPage + 1 <= totalPages && (
              <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {renderPage(currentPage + 1)}
                {rightPageAnnotations.map((ann, i) => (
                  <TeacherSpeakerIcon key={ann.id || i} annotation={ann} containerSize={{ w: containerSize.w / 2, h: containerSize.h }} />
                ))}
              </div>
            )}
            {/* Laser overlays span the FULL container (absolute relative to containerRef) */}
            {isRecording && (
              <LaserOverlay trailPoints={laserTracker.trailPoints} width={containerSize.w} height={containerSize.h} />
            )}
            {showReplay && replayLaserData.length > 0 && (
              <LaserReplayOverlay
                laserData={replayLaserData}
                audioRef={audioRef}
                containerWidth={containerSize.w}
                containerHeight={containerSize.h}
              />
            )}
          </div>
        ) : (
          <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {renderPage(currentPage)}
            {isRecording && (
              <LaserOverlay trailPoints={laserTracker.trailPoints} />
            )}
            {showReplay && replayLaserData.length > 0 && (
              <LaserReplayOverlay
                laserData={replayLaserData}
                audioRef={audioRef}
                containerWidth={containerSize.w}
                containerHeight={containerSize.h}
              />
            )}
            {pageAnnotations.map((ann, i) => (
              <TeacherSpeakerIcon key={ann.id || i} annotation={ann} containerSize={containerSize} />
            ))}
          </div>
        )}

        {/* Always-mounted hidden audio for replay — avoids ref timing race */}
        <audio
          ref={audioRef}
          src={showReplay && spreadRecording ? spreadRecording.audio_url : ''}
          style={{ display: 'none' }}
        />
      </div>

      {/* Bottom controls */}
      <div className="shrink-0 p-3 flex flex-col gap-2" style={{ background: '#0f3d3a', borderTop: '2px solid #0d9488' }}>
        {/* Existing recording */}
        {spreadRecording && !showReplay && recState === 'idle' && (
          <div className="flex items-center gap-2 p-2 rounded-xl" style={{ background: '#134e4a', border: '1px solid #0d9488' }}>
            <span className="text-teal-300 text-xs font-bold flex-1">
              ✅ {spreadRecording.is_spread ? `Pages ${recKey}–${recKey + 1}` : `Page ${recKey}`} recorded
            </span>
            <button onClick={() => handleReplay(spreadRecording)}
              className="px-3 py-1 rounded-lg font-bold text-white text-xs" style={{ background: '#0d9488' }}>
              ▶ Replay
            </button>
            <button onClick={() => { resetRecorder(); setSpreadRecording(null); }}
              className="px-3 py-1 rounded-lg font-bold text-white text-xs" style={{ background: '#374151' }}>
              🔄 Re-record
            </button>
          </div>
        )}

        {/* Replay controls */}
        {showReplay && spreadRecording && (
          <div className="flex items-center gap-2 p-2 rounded-xl" style={{ background: '#134e4a', border: '1px solid #14b8a6' }}>
            <span className="text-teal-200 text-xs font-bold shrink-0">▶ Replay</span>
            <button onClick={() => audioRef.current?.play()} className="px-3 py-1 rounded-lg font-bold text-white text-xs" style={{ background: '#0d9488' }}>▶</button>
            <button onClick={() => audioRef.current?.pause()} className="px-3 py-1 rounded-lg font-bold text-white text-xs" style={{ background: '#374151' }}>⏸</button>
            <button onClick={() => { if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.pause(); } setShowReplay(false); }}
              className="px-3 py-1 rounded-lg font-bold text-white text-xs" style={{ background: '#374151' }}>✕ Close</button>
          </div>
        )}

        {/* Record button */}
        {recState === 'idle' && !spreadRecording && (
          <button onClick={handleStartRecord}
            className="w-full py-3 rounded-2xl font-black text-white text-base"
            style={{ background: '#dc2626' }}>
            ⏺ Record Reading — {twoPerPage && currentPage + 1 <= totalPages ? `Pages ${currentPage}–${currentPage + 1}` : `Page ${currentPage}`}
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