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
  const audioRef = useRef(null);

  const totalPages = book.pdf_page_count || (book.pages || []).length || 1;
  const today = getToday();

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
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const getSpreadRecording = useCallback((key) => {
    if (!session) return null;
    return (session.recordings || []).find(r => r.page === key) || null;
  }, [session]);

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

  // Keep recState in a ref for use in navigation callbacks
  const recStateRef = useRef(recState);
  useEffect(() => { recStateRef.current = recState; }, [recState]);

  const [uploading, setUploading] = useState(false);
  const [spreadRecording, setSpreadRecording] = useState(null);
  const [showReplay, setShowReplay] = useState(false);
  const [replayLaserData, setReplayLaserData] = useState([]);

  useEffect(() => {
    const rec = getSpreadRecording(recKey);
    setSpreadRecording(rec || null);
    setShowReplay(false);
  }, [recKey, session]);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: Math.round(width), h: Math.round(height) });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const handleToggle2Up = () => {
    setTwoPerPage(v => {
      const next = !v;
      if (next) setCurrentPage(p => spreadKey(p));
      return next;
    });
  };

  const handleStartRecord = async () => {
    laserTracker.startRecordingLaser();
    await startRecording();
  };

  const handleStop = () => {
    stopRecording();
    laserTracker.stopRecordingLaser();
    // Auto-save immediately — no preview step
    setTimeout(() => saveRecording(), 100);
  };

  // saveRecording saves for a given recKey (defaults to current)
  const saveRecording = useCallback(async (keyOverride) => {
    const blob = getBlob();
    if (!blob) return;
    const key = keyOverride ?? recKey;
    setUploading(true);
    const file = new File([blob], `book-read-p${key}-${Date.now()}.webm`, { type: 'audio/webm' });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const ld = laserTracker.getLaserData();
    const newRec = {
      page: key,
      audio_url: file_url,
      laser_data: ld,
      recorded_at: new Date().toISOString(),
      is_spread: twoPerPage,
    };

    const currentSession = sessionRef.current;
    const prevRecs = currentSession?.recordings || [];
    const filtered = twoPerPage
      ? prevRecs.filter(r => r.page !== key && r.page !== key + 1)
      : prevRecs.filter(r => r.page !== key);
    const updatedRecs = [...filtered, newRec];
    const newPages = twoPerPage
      ? [key, key + 1 <= totalPages ? key + 1 : null].filter(Boolean)
      : [key];
    const updatedPages = Array.from(new Set([...(currentSession?.pages_completed || []), ...newPages]));

    if (currentSession) {
      await base44.entities.BookReadingSession.update(currentSession.id, {
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
  }, [getBlob, recKey, twoPerPage, totalPages, currentPage, laserTracker, resetRecorder, refetch, book, className, studentNumber, today]);

  // Navigate to a new page — stop+save any active/stopped recording first
  const navigateTo = useCallback(async (newPage) => {
    const state = recStateRef.current;
    if (state === 'recording' || state === 'paused') {
      stopRecording();
      laserTracker.stopRecordingLaser();
      // small delay so the blob finalizes
      await new Promise(r => setTimeout(r, 150));
    }
    if (recStateRef.current === 'stopped' || state === 'recording' || state === 'paused') {
      await saveRecording(recKey);
    }
    setCurrentPage(newPage);
    setShowReplay(false);
  }, [saveRecording, recKey, stopRecording, laserTracker]);

  const step = twoPerPage ? 2 : 1;
  const canGoNext = currentPage + step - 1 < totalPages;
  const canGoPrev = currentPage > 1;
  const goNext = () => navigateTo(Math.min(totalPages, currentPage + step));
  const goPrev = () => navigateTo(Math.max(1, currentPage - step));

  const handleReplay = (rec) => {
    const ld = rec.laser_data || [];
    setReplayLaserData(typeof ld === 'string' ? JSON.parse(ld) : ld);
    if (rec.is_spread) {
      setTwoPerPage(true);
      setCurrentPage(rec.page);
    }
    setShowReplay(true);
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
    }, 50);
  };

  const stopReplay = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    setShowReplay(false);
  };

  const pageAnnotations = (book.teacher_annotations || []).filter(a => a.page === currentPage);
  const rightPageAnnotations = twoPerPage ? (book.teacher_annotations || []).filter(a => a.page === currentPage + 1) : [];
  const isRecording = recState === 'recording' || recState === 'paused';

  const renderPage = (pageNum) => {
    if (book.book_type === 'images') {
      const img = (book.pages || []).find(p => p.page_number === pageNum);
      return img
        ? <img src={img.image_url} alt={`Page ${pageNum}`} style={{ width: '100%', display: 'block' }} />
        : <div className="flex items-center justify-center w-full h-full text-gray-400">No image</div>;
    }
    return <PdfPageRenderer pdfUrl={book.pdf_url} pageNumber={pageNum} fitMode="width" />;
  };

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: '#042f2e' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ background: '#0f3d3a', borderBottom: '2px solid #0d9488' }}>
        <button onClick={onBack} className="text-teal-300 hover:text-white font-bold text-sm">← Back</button>
        <p className="flex-1 text-white font-black text-sm truncate">{book.title}</p>
        <span className="text-teal-400 text-xs font-bold">#{studentNumber}</span>
        <button onClick={handleToggle2Up}
          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${twoPerPage ? 'bg-teal-600 text-white border-teal-400' : 'text-teal-300 border-teal-700'}`}>
          {twoPerPage ? '📖 2-up' : '📄 1-up'}
        </button>
        <span className="text-teal-300 text-sm font-bold">
          Pg {currentPage}{twoPerPage && currentPage + 1 <= totalPages ? `–${currentPage + 1}` : ''} / {totalPages}
        </span>
      </div>

      {/* Page display — scrollable so full-width pages show without gaps */}
      <div className="flex-1 relative overflow-y-auto overflow-x-hidden" ref={containerRef} style={{ background: '#1a1a1a' }}>
        {twoPerPage ? (
          <div style={{ position: 'relative', display: 'flex', width: '100%' }}>
            <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
              {renderPage(currentPage)}
            </div>
            {currentPage + 1 <= totalPages && (
              <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                {renderPage(currentPage + 1)}
              </div>
            )}
            {/* Annotations */}
            {pageAnnotations.map((ann, i) => (
              <TeacherSpeakerIcon key={ann.id || i} annotation={ann} containerSize={{ w: containerSize.w / 2, h: containerSize.h }} />
            ))}
            {rightPageAnnotations.map((ann, i) => (
              <TeacherSpeakerIcon key={`r-${ann.id || i}`} annotation={{ ...ann, x_pct: 0.5 + ann.x_pct / 2 }} containerSize={{ w: containerSize.w, h: containerSize.h }} />
            ))}
            {isRecording && <LaserOverlay trailPoints={laserTracker.trailPoints} width={containerSize.w} height={containerSize.h} />}
            {showReplay && replayLaserData.length > 0 && (
              <LaserReplayOverlay laserData={replayLaserData} audioRef={audioRef} containerWidth={containerSize.w} containerHeight={containerSize.h} />
            )}
          </div>
        ) : (
          <div style={{ position: 'relative', width: '100%' }}>
            {renderPage(currentPage)}
            {isRecording && <LaserOverlay trailPoints={laserTracker.trailPoints} />}
            {showReplay && replayLaserData.length > 0 && (
              <LaserReplayOverlay laserData={replayLaserData} audioRef={audioRef} containerWidth={containerSize.w} containerHeight={containerSize.h} />
            )}
            {pageAnnotations.map((ann, i) => (
              <TeacherSpeakerIcon key={ann.id || i} annotation={ann} containerSize={containerSize} />
            ))}
          </div>
        )}
        {/* Always-mounted hidden audio for replay */}
        <audio ref={audioRef} src={spreadRecording?.audio_url || ''} style={{ display: 'none' }}
          onEnded={() => setShowReplay(false)} />
      </div>

      {/* Bottom controls — compact for mobile */}
      <div className="shrink-0 px-2 py-1.5 flex flex-col gap-1.5" style={{ background: '#0f3d3a', borderTop: '2px solid #0d9488' }}>

        {/* === IDLE with existing recording === */}
        {recState === 'idle' && spreadRecording && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl" style={{ background: '#134e4a', border: '1px solid #0d9488' }}>
            <span className="text-teal-300 text-xs font-bold shrink-0">
              ✅ Pg {recKey}{spreadRecording.is_spread ? `–${recKey+1}` : ''}
            </span>
            {!showReplay ? (
              <button onClick={() => handleReplay(spreadRecording)}
                className="flex-1 py-1 rounded-lg font-bold text-white text-xs"
                style={{ background: '#0d9488' }}>▶ Play</button>
            ) : (
              <button onClick={stopReplay}
                className="flex-1 py-1 rounded-lg font-bold text-white text-xs"
                style={{ background: '#374151' }}>⏹ Stop</button>
            )}
            <button
              onClick={() => { resetRecorder(); setSpreadRecording(null); setShowReplay(false); stopReplay(); }}
              className="shrink-0 px-2 py-1 rounded-lg font-bold text-white text-xs" style={{ background: '#374151' }}>
              🔄
            </button>
          </div>
        )}

        {/* === IDLE no recording === */}
        {recState === 'idle' && !spreadRecording && (
          <button onClick={handleStartRecord}
            className="w-full py-2 rounded-xl font-black text-white text-sm"
            style={{ background: '#dc2626' }}>
            ⏺ Record — {twoPerPage && currentPage + 1 <= totalPages ? `Pgs ${currentPage}–${currentPage + 1}` : `Pg ${currentPage}`}
          </button>
        )}

        {/* === RECORDING === */}
        {recState === 'recording' && (
          <div className="flex gap-1.5">
            <div className="flex items-center gap-2 flex-1 px-2 py-1.5 rounded-xl" style={{ background: '#7f1d1d' }}>
              <span className="text-red-300 font-black text-xs animate-pulse">● REC</span>
              <span className="text-white font-bold text-xs">{formatTime(elapsed)}</span>
            </div>
            <button onClick={pauseRecording} className="px-3 py-1.5 rounded-xl font-bold text-white text-sm" style={{ background: '#d97706' }}>⏸</button>
            <button onClick={handleStop} className="px-3 py-1.5 rounded-xl font-bold text-white text-sm" style={{ background: '#dc2626' }}>⏹</button>
          </div>
        )}

        {/* === PAUSED === */}
        {recState === 'paused' && (
          <div className="flex gap-1.5">
            <div className="flex items-center gap-2 flex-1 px-2 py-1.5 rounded-xl" style={{ background: '#374151' }}>
              <span className="text-gray-300 font-bold text-xs">⏸ Paused</span>
              <span className="text-white font-bold text-xs">{formatTime(elapsed)}</span>
            </div>
            <button onClick={resumeRecording} className="px-3 py-1.5 rounded-xl font-bold text-white text-sm" style={{ background: '#0d9488' }}>▶</button>
            <button onClick={handleStop} className="px-3 py-1.5 rounded-xl font-bold text-white text-sm" style={{ background: '#dc2626' }}>⏹</button>
          </div>
        )}

        {/* === STOPPED — auto-saving === */}
        {(recState === 'stopped' || uploading) && (
          <div className="flex items-center justify-center gap-2 py-1.5 rounded-xl" style={{ background: '#134e4a' }}>
            <span className="text-teal-300 font-bold text-xs animate-pulse">⏳ Saving…</span>
          </div>
        )}

        {/* Page navigation */}
        <div className="flex gap-1.5 items-center">
          <button onClick={goPrev} disabled={!canGoPrev || uploading}
            className="flex-1 py-1.5 rounded-xl font-bold text-white text-sm disabled:opacity-30"
            style={{ background: '#0f766e' }}>‹ Prev</button>
          <span className="text-teal-400 text-xs font-bold whitespace-nowrap px-1">
            {currentPage}{twoPerPage && currentPage+1<=totalPages?`–${currentPage+1}`:''}/{totalPages}
          </span>
          <button onClick={goNext} disabled={!canGoNext || uploading}
            className="flex-1 py-1.5 rounded-xl font-bold text-white text-sm disabled:opacity-30"
            style={{ background: '#0f766e' }}>Next ›</button>
        </div>
      </div>
    </div>
  );
}