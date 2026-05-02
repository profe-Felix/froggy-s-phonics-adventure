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

  const renderPage = (pageNum, fitH) => {
    if (book.book_type === 'images') {
      const img = (book.pages || []).find(p => p.page_number === pageNum);
      return img
        ? <img src={img.image_url} alt={`Page ${pageNum}`} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
        : <div className="flex items-center justify-center w-full h-full text-gray-400">No image</div>;
    }
    return <PdfPageRenderer pdfUrl={book.pdf_url} pageNumber={pageNum} fitMode="contain" fillHeight={twoPerPage} />;
  };

  const handleFullscreen = () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.() || el.webkitRequestFullscreen?.();
    } else {
      document.exitFullscreen?.() || document.webkitExitFullscreen?.();
    }
  };

  // Single combined bottom bar
  const pageLabel = `${currentPage}${twoPerPage && currentPage + 1 <= totalPages ? `–${currentPage + 1}` : ''}/${totalPages}`;

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: '#042f2e' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 shrink-0" style={{ background: '#0f3d3a', borderBottom: '1px solid #0d9488' }}>
        <button onClick={onBack} className="text-teal-300 hover:text-white font-bold text-sm shrink-0">← Back</button>
        <p className="flex-1 text-white font-black text-sm truncate min-w-0">{book.title}</p>
        <span className="text-teal-400 text-xs font-bold shrink-0">#{studentNumber}</span>
        <button onClick={handleToggle2Up}
          className={`px-2 py-0.5 rounded text-xs font-bold border transition-all shrink-0 ${twoPerPage ? 'bg-teal-600 text-white border-teal-400' : 'text-teal-300 border-teal-700'}`}>
          {twoPerPage ? '2-up' : '1-up'}
        </button>
        <button onClick={handleFullscreen}
          className="px-2 py-0.5 rounded text-xs font-bold border border-teal-700 text-teal-300 shrink-0"
          title="Fullscreen">⛶</button>
        <span className="text-teal-300 text-xs font-bold shrink-0">
          Pg {currentPage}{twoPerPage && currentPage + 1 <= totalPages ? `–${currentPage + 1}` : ''} / {totalPages}
        </span>
      </div>

      {/* Page display — fixed height, contain-fit so nothing scrolls */}
      <div className="flex-1 relative overflow-hidden" ref={containerRef} style={{ background: '#fff' }}>
        {twoPerPage ? (
          <div style={{ position: 'relative', display: 'flex', width: '100%', height: '100%', alignItems: 'stretch' }}>
            <div style={{ flex: 1, minWidth: 0, height: '100%', position: 'relative' }}>
              {renderPage(currentPage)}
            </div>
            {currentPage + 1 <= totalPages && (
              <div style={{ flex: 1, minWidth: 0, height: '100%', position: 'relative' }}>
                {renderPage(currentPage + 1)}
              </div>
            )}
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
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
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
        <audio ref={audioRef} src={spreadRecording?.audio_url || ''} style={{ display: 'none' }}
          onEnded={() => setShowReplay(false)} />
      </div>

      {/* Single combined bottom bar */}
      <div className="shrink-0 flex items-center gap-1.5 px-2 py-1.5" style={{ background: '#0f3d3a', borderTop: '1px solid #0d9488' }}>

        {/* Prev button */}
        <button onClick={goPrev} disabled={!canGoPrev || uploading}
          className="shrink-0 px-3 py-1.5 rounded-lg font-bold text-white text-sm disabled:opacity-30"
          style={{ background: '#0f766e' }}>‹</button>

        {/* Center: recording controls */}
        <div className="flex-1 min-w-0">
          {/* IDLE — no recording */}
          {recState === 'idle' && !spreadRecording && (
            <button onClick={handleStartRecord}
              className="w-full py-1.5 rounded-lg font-black text-white text-sm"
              style={{ background: '#dc2626' }}>
              ⏺ Record Pg {twoPerPage && currentPage + 1 <= totalPages ? `${currentPage}–${currentPage + 1}` : currentPage}
            </button>
          )}

          {/* IDLE — has recording */}
          {recState === 'idle' && spreadRecording && (
            <div className="flex items-center gap-1 w-full">
              <span className="text-teal-300 text-xs font-bold shrink-0">✅</span>
              {!showReplay ? (
                <button onClick={() => handleReplay(spreadRecording)}
                  className="flex-1 py-1.5 rounded-lg font-bold text-white text-xs"
                  style={{ background: '#0d9488' }}>▶ Play</button>
              ) : (
                <button onClick={stopReplay}
                  className="flex-1 py-1.5 rounded-lg font-bold text-white text-xs"
                  style={{ background: '#374151' }}>⏹ Stop</button>
              )}
              <button
                onClick={() => { resetRecorder(); setSpreadRecording(null); setShowReplay(false); stopReplay(); }}
                className="shrink-0 px-2 py-1.5 rounded-lg font-bold text-white text-xs" style={{ background: '#374151' }}>
                🔄
              </button>
            </div>
          )}

          {/* RECORDING */}
          {recState === 'recording' && (
            <div className="flex items-center gap-1 w-full">
              <span className="text-red-300 font-black text-xs animate-pulse shrink-0">● {formatTime(elapsed)}</span>
              <button onClick={pauseRecording} className="flex-1 py-1.5 rounded-lg font-bold text-white text-xs" style={{ background: '#d97706' }}>⏸ Pause</button>
              <button onClick={handleStop} className="flex-1 py-1.5 rounded-lg font-bold text-white text-xs" style={{ background: '#dc2626' }}>⏹ Stop</button>
            </div>
          )}

          {/* PAUSED */}
          {recState === 'paused' && (
            <div className="flex items-center gap-1 w-full">
              <span className="text-gray-300 font-bold text-xs shrink-0">⏸ {formatTime(elapsed)}</span>
              <button onClick={resumeRecording} className="flex-1 py-1.5 rounded-lg font-bold text-white text-xs" style={{ background: '#0d9488' }}>▶ Resume</button>
              <button onClick={handleStop} className="flex-1 py-1.5 rounded-lg font-bold text-white text-xs" style={{ background: '#dc2626' }}>⏹ Stop</button>
            </div>
          )}

          {/* SAVING */}
          {(recState === 'stopped' || uploading) && (
            <div className="text-center py-1.5">
              <span className="text-teal-300 font-bold text-xs animate-pulse">⏳ Saving…</span>
            </div>
          )}
        </div>

        {/* Page counter */}
        <span className="text-teal-400 text-xs font-bold shrink-0 px-1">{pageLabel}</span>

        {/* Next button */}
        <button onClick={goNext} disabled={!canGoNext || uploading}
          className="shrink-0 px-3 py-1.5 rounded-lg font-bold text-white text-sm disabled:opacity-30"
          style={{ background: '#0f766e' }}>›</button>
      </div>
    </div>
  );
}