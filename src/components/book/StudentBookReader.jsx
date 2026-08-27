import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ACTIVE_SCHOOL_YEAR, todayLocal } from '@/lib/schoolYear';
import { useToast } from '@/components/ui/use-toast';
import PdfPageRenderer from '@/components/notebook/PdfPageRenderer';
import LaserOverlay from '@/components/notebook/LaserOverlay';
import LaserReplayOverlay from '@/components/notebook/LaserReplayOverlay';
import useLaserTracker from '@/hooks/useLaserTracker';
import useAudioRecorder from '@/hooks/useAudioRecorder';
import BackButton from '@/components/ui/BackButton';

// localStorage key remembering the last book + page this student opened, so a
// refresh (or re-entering Books from the game menu) drops them back on the
// exact page they left instead of the bookshelf.
const restoreKey = (className, studentNumber) => `br:last:${className}:${studentNumber}`;
function readRestore(className, studentNumber) {
  try { return JSON.parse(localStorage.getItem(restoreKey(className, studentNumber)) || 'null'); } catch { return null; }
}
function writeRestore(className, studentNumber, book, page) {
  try {
    localStorage.setItem(restoreKey(className, studentNumber), JSON.stringify({
      bookId: book?.id, bookTitle: book?.title, page,
    }));
  } catch { /* ignore quota / private-mode errors */ }
}
function clearRestore(className, studentNumber) {
  try { localStorage.removeItem(restoreKey(className, studentNumber)); } catch { /* ignore */ }
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

export default function StudentBookReader({ book, studentNumber, className, onBack, showQrButton = false, onShowQR, initialPage }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const restoredPage = readRestore(className, studentNumber)?.page;
  const startPage = (initialPage && initialPage >= 1 && initialPage <= (book.pdf_page_count || 1)) ? initialPage : (restoredPage || 1);
  const [currentPage, setCurrentPage] = useState(startPage);
  const [twoPerPage, setTwoPerPage] = useState(false);
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const audioRef = useRef(null);

  const totalPages = book.pdf_page_count || (book.pages || []).length || 1;
  const today = todayLocal();

  const recKey = twoPerPage ? spreadKey(currentPage) : currentPage;

  // Sort newest-first so if duplicate sessions exist (a known past bug), the
  // newest one — which has the latest recording — is preferred.
  const { data: sessions = [], refetch } = useQuery({
    queryKey: ['book-sessions', book.id, studentNumber, today],
    queryFn: () => base44.entities.BookReadingSession.filter({
      book_id: book.id,
      class_name: className,
      student_number: studentNumber,
      school_year: ACTIVE_SCHOOL_YEAR,
      session_date: today,
    }, '-created_date'),
  });

  // Search ALL sessions for this page's recording — not just sessions[0]. Past
  // duplicate-session bugs left many sessions per student/book/day, each with
  // only one page's recording. Looking at just the first session meant a
  // recording that was saved (it's in the DB) looked gone after refresh because
  // the first session didn't have that page.
  const getSpreadRecording = useCallback((key) => {
    for (const s of sessions) {
      const rec = (s.recordings || []).find(r => r.page === key);
      if (rec) return rec;
    }
    return null;
  }, [sessions]);

  // Persist the current book + page so a refresh (or re-entering Books from the
  // game menu) reopens on this exact page instead of the bookshelf.
  useEffect(() => {
    writeRestore(className, studentNumber, book, currentPage);
  }, [className, studentNumber, book, currentPage]);

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
  } = useAudioRecorder();

  // Keep recState in a ref for use in navigation callbacks
  const recStateRef = useRef(recState);
  useEffect(() => { recStateRef.current = recState; }, [recState]);

  const [uploading, setUploading] = useState(false);
  const [spreadRecording, setSpreadRecording] = useState(null);
  // Track the most recently saved recording so the [recKey, sessions] effect
  // doesn't overwrite it with null when the DB is eventually-consistent
  // (the refetch right after save can return stale data, which cancels the
  // in-progress audio load and makes the recording look gone).
  const justSavedRef = useRef(null);
  const [showReplay, setShowReplay] = useState(false);
  const [replayLaserData, setReplayLaserData] = useState([]);

  useEffect(() => {
    const rec = getSpreadRecording(recKey);
    if (rec) {
      setSpreadRecording(rec);
    } else if (justSavedRef.current?.page === recKey) {
      // DB hasn't propagated the save yet — keep the just-saved recording
      // so the audio load isn't canceled and the recording stays visible.
      setSpreadRecording(justSavedRef.current);
    } else {
      setSpreadRecording(null);
    }
    setShowReplay(false);
  }, [recKey, sessions]);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: Math.round(width), h: Math.round(height) });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Auto-disable 2-up when container is portrait (too narrow)
  const isPortrait = containerSize.w > 0 && containerSize.h > containerSize.w;
  useEffect(() => {
    if (isPortrait && twoPerPage) setTwoPerPage(false);
  }, [isPortrait]);

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

  const handleStop = async () => {
    laserTracker.stopRecordingLaser();
    // stopRecording resolves with the finalized blob (see useAudioRecorder);
    // awaiting it means the blob is ready before we save, so the save never
    // bails on a missing blob and the "Saving…" state never gets stuck.
    const blob = await stopRecording();
    if (blob) {
      await saveRecording(blob, recKey);
    } else {
      // No blob (recorder was already inactive / stream cut) — still reset so
      // the UI doesn't freeze on "Saving…" forever.
      resetRecorder();
      laserTracker.clearLaser();
    }
  };

  // saveRecording uploads the audio and upserts the student's session for today.
  // Robustness rules (this is the fix for "recordings don't save" + "gets stuck"):
  //   • The blob is passed in explicitly (not read from a ref that may be stale).
  //   • We re-query the existing session at save time instead of trusting a ref —
  //     the old code created a DUPLICATE session whenever the post-save refetch
  //     hadn't landed yet, fragmenting one student's recordings across many
  //     sessions (18 sessions for one student was the symptom). The fresh query
  //     guarantees a single session per student/book/day.
  //   • try/catch/finally: any failure (upload, network, write) surfaces a toast
  //     and ALWAYS resets the recorder + uploading flag, so the UI can never
  //     freeze on "Saving…".
  //   • A save-in-flight guard serializes concurrent saves (stop + quick nav).
  const saveInFlightRef = useRef(null);
  const saveRecording = useCallback(async (blob, keyOverride) => {
    if (!blob) return;
    const key = keyOverride ?? recKey;
    const run = async () => {
      setUploading(true);
      try {
        const file = new File([blob], `book-read-p${key}-${Date.now()}.webm`, { type: blob.type || 'audio/webm' });
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        const ld = laserTracker.getLaserData();
        const newRec = {
          page: key,
          audio_url: file_url,
          laser_data: ld,
          recorded_at: new Date().toISOString(),
          is_spread: twoPerPage,
        };

        // Fresh upsert: find this student's session(s) for today before writing.
        // A past bug created a NEW session per recording (the "existing" filter
        // missed the prior session due to eventual consistency), fragmenting one
        // student's recordings across many sessions. We now MERGE all of them:
        // collect every recording from every session, dedupe by page (keep the
        // latest), update the first session with the merged set, and delete the
        // rest — collapsing duplicates back into a single session.
        const existing = await base44.entities.BookReadingSession.filter({
          book_id: book.id,
          class_name: className,
          student_number: studentNumber,
          school_year: ACTIVE_SCHOOL_YEAR,
          session_date: today,
        }, '-created_date');
        // Merge recordings from all existing sessions, deduped by page (newest wins).
        const recsByPage = new Map();
        const allPages = new Set();
        for (const s of existing) {
          for (const r of (s.recordings || [])) {
            const prev = recsByPage.get(r.page);
            if (!prev || (r.recorded_at || '') > (prev.recorded_at || '')) recsByPage.set(r.page, r);
          }
          for (const p of (s.pages_completed || [])) allPages.add(p);
        }
        const primarySession = existing[0] || null;
        const extraSessions = existing.slice(1);

        // Replace the page being recorded (and its 2-up pair) with the new rec.
        const pagesToReplace = twoPerPage ? [key, key + 1] : [key];
        for (const p of pagesToReplace) recsByPage.delete(p);
        recsByPage.set(key, newRec);
        const updatedRecs = Array.from(recsByPage.values());
        const newPages = twoPerPage
          ? [key, key + 1 <= totalPages ? key + 1 : null].filter(Boolean)
          : [key];
        const updatedPages = Array.from(new Set([...allPages, ...newPages]));

        if (primarySession) {
          await base44.entities.BookReadingSession.update(primarySession.id, {
            recordings: updatedRecs,
            pages_completed: updatedPages,
            last_page: currentPage,
          });
          // Delete duplicate sessions from the past bug.
          for (const s of extraSessions) {
            try { await base44.entities.BookReadingSession.delete(s.id); } catch { /* best-effort cleanup */ }
          }
        } else {
          await base44.entities.BookReadingSession.create({
            book_id: book.id,
            class_name: className,
            student_number: studentNumber,
            school_year: ACTIVE_SCHOOL_YEAR,
            session_date: today,
            recordings: updatedRecs,
            pages_completed: updatedPages,
            last_page: currentPage,
          });
        }

        setSpreadRecording(newRec);
        justSavedRef.current = newRec;
        // Optimistically update the query cache so the recording is immediately
        // visible — refetch() can return stale data (DB eventual consistency),
        // and the [recKey, sessions] useEffect would then overwrite
        // spreadRecording with null, making the recording look gone.
        qc.setQueryData(['book-sessions', book.id, studentNumber, today], (old) => {
          const arr = (old || []).slice();
          if (arr.length === 0) {
            arr.push({
              id: primarySession?.id || 'temp',
              book_id: book.id, class_name: className, student_number: studentNumber,
              school_year: ACTIVE_SCHOOL_YEAR, session_date: today,
              recordings: updatedRecs, pages_completed: updatedPages, last_page: currentPage,
            });
          } else {
            arr[0] = { ...arr[0], recordings: updatedRecs, pages_completed: updatedPages, last_page: currentPage };
          }
          return arr;
        });
        // Fire-and-forget: awaiting refetch here can return stale data (DB
        // eventual consistency) and overwrite the just-saved recording.
        refetch();
      } catch (e) {
        console.error('Book recording save failed', e);
        toast({
          title: 'Recording not saved',
          description: 'Please check the connection and try recording that page again.',
          variant: 'destructive',
        });
      } finally {
        setUploading(false);
        resetRecorder();
        laserTracker.clearLaser();
      }
    };
    // Serialize: if a save is already running, wait for it before starting the next.
    if (saveInFlightRef.current) { try { await saveInFlightRef.current; } catch { /* swallow; our own try/catch handles ours */ } }
    saveInFlightRef.current = run();
    try { await saveInFlightRef.current; } finally { saveInFlightRef.current = null; }
  }, [recKey, twoPerPage, totalPages, currentPage, laserTracker, resetRecorder, refetch, book, className, studentNumber, today, toast]);

  // Navigate to a new page — stop+save any active recording first, then persist
  // the new page so a refresh returns here.
  const navigateTo = useCallback(async (newPage) => {
    const state = recStateRef.current;
    let blob = null;
    if (state === 'recording' || state === 'paused') {
      laserTracker.stopRecordingLaser();
      blob = await stopRecording();
      if (!blob) resetRecorder(); // recorder was inactive — reset so UI doesn't freeze
    }
    if (blob) await saveRecording(blob, recKey);
    setCurrentPage(newPage);
    setShowReplay(false);
  }, [saveRecording, recKey, stopRecording, laserTracker, resetRecorder]);

  // Exit the reader — stop+save any active recording first so the mic is
  // released and the recording isn't lost. Without this, onBack just unmounted
  // the component mid-recording, leaving the mic on and the audio unsaved.
  const handleBack = useCallback(async () => {
    const state = recStateRef.current;
    if (state === 'recording' || state === 'paused') {
      laserTracker.stopRecordingLaser();
      const blob = await stopRecording();
      if (blob) await saveRecording(blob, recKey);
      else resetRecorder();
    }
    onBack();
  }, [saveRecording, recKey, stopRecording, laserTracker, resetRecorder, onBack]);

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
        audioRef.current.load();
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

  const renderPage = (pageNum, align = 'center') => {
    if (book.book_type === 'images') {
      const img = (book.pages || []).find(p => p.page_number === pageNum);
      return img
        ? <img src={img.image_url} alt={`Page ${pageNum}`} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
        : <div className="flex items-center justify-center w-full h-full text-gray-400">No image</div>;
    }
    return (
      <PdfPageRenderer
        pdfUrl={book.pdf_url}
        pageNumber={pageNum}
        fitMode="contain"
        fillHeight={twoPerPage}
        alignSelf={align}
      />
    );
  };

  const readerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => {
      const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFullscreen(fs);
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const handleFullscreen = () => {
    const el = readerRef.current;
    if (!el) return;

    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      setIsFullscreen(false);
      return;
    }

    const requestFull =
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.webkitEnterFullscreen;

    if (requestFull) {
      try {
        const result = requestFull.call(el);
        if (result?.catch) {
          result.catch(() => setIsFullscreen(true));
        } else {
          setIsFullscreen(true);
        }
      } catch {
        setIsFullscreen(true);
      }
    } else {
      setIsFullscreen(v => !v);
    }
  };
  // Single combined bottom bar
  const pageLabel = `${currentPage}${twoPerPage && currentPage + 1 <= totalPages ? `–${currentPage + 1}` : ''}/${totalPages}`;

  return (
    <div
      ref={readerRef}
      className="flex flex-col"
      style={{
        background: '#042f2e',
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        zIndex: isFullscreen ? 9999 : 'auto',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 shrink-0" style={{ background: '#0f3d3a', borderBottom: '1px solid #0d9488', paddingTop: 'env(safe-area-inset-top)' }}>
        <BackButton tone="teal" onClick={handleBack} />
        <p className="flex-1 text-white font-black text-sm truncate min-w-0">{book.title}</p>
        <span className="text-teal-400 text-xs font-bold shrink-0">#{studentNumber}</span>
        <button onClick={handleToggle2Up}
          className={`px-2 py-0.5 rounded text-xs font-bold border transition-all shrink-0 ${twoPerPage ? 'bg-teal-600 text-white border-teal-400' : 'text-teal-300 border-teal-700'}`}>
          {twoPerPage ? '2-up' : '1-up'}
        </button>
        {showQrButton && (
          <button
            onClick={onShowQR}
            className="px-2 py-0.5 rounded text-xs font-bold border border-teal-500 text-teal-300 hover:bg-teal-900 shrink-0"
            style={{ background: '#0f3d3a' }}
          >
            📱 QR
          </button>
        )}        
        <button onClick={handleFullscreen}
          className={`px-2 py-0.5 rounded text-xs font-bold border shrink-0 ${isFullscreen ? 'bg-teal-600 text-white border-teal-400' : 'text-teal-300 border-teal-700'}`}
          title="Fullscreen">{isFullscreen ? '⊡' : '⛶'}</button>
        <span className="text-teal-300 text-xs font-bold shrink-0">
          Pg {currentPage}{twoPerPage && currentPage + 1 <= totalPages ? `–${currentPage + 1}` : ''} / {totalPages}
        </span>
      </div>

      {/* Page display — fixed height, contain-fit so nothing scrolls */}
      <div className="flex-1 relative overflow-hidden no-select-text" ref={containerRef} style={{ background: '#fff' }}>
        {twoPerPage ? (
          <div style={{ position: 'relative', display: 'flex', width: '100%', height: '100%', alignItems: 'stretch' }}>
            <div style={{ flex: 1, minWidth: 0, height: '100%', position: 'relative' }}>
              {renderPage(currentPage, 'flex-end')}
            </div>
            {currentPage + 1 <= totalPages && (
              <div style={{ flex: 1, minWidth: 0, height: '100%', position: 'relative' }}>
                {renderPage(currentPage + 1, 'flex-start')}
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