import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AnnotationToolbar from './AnnotationToolbar';
import VoiceNoteRecorder from './VoiceNoteRecorder';
import LaserRecordView from './LaserRecordView';
import AnnotationCanvas from './AnnotationCanvas';
import PdfPageRenderer from './PdfPageRenderer';
import PageNavBar from './PageNavBar';

function getYouTubeEmbedUrl(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/);
  if (m) return `https://www.youtube.com/embed/${m[1]}?autoplay=1`;
  return url;
}

function AssignmentPicker({ assignments, onSelect }) {
  return (
    <div className="min-h-screen flex flex-col items-center py-8 px-4" style={{ background: '#0f0f1a' }}>
      <h2 className="text-2xl font-black text-white mb-6">📓 Your Assignments</h2>
      {assignments.length === 0 && <p className="text-indigo-400">No active assignments right now.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-xl">
        {assignments.map((a) => (
          <motion.button
            key={a.id}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSelect(a)}
            className="rounded-2xl p-5 text-left flex flex-col gap-2 hover:scale-105 transition-all"
            style={{ background: '#1a1a2e', border: '2px solid #4338ca' }}
          >
            <span className="text-3xl">📄</span>
            <p className="font-black text-white text-lg">{a.title}</p>
            <p className="text-xs text-indigo-300">{a.page_mode === 'locked' ? '🔒 Teacher-paced' : '🆓 Self-paced'}</p>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export default function StudentNotebookView({ studentNumber, className, onBack, directAssignmentName }) {
  const qc = useQueryClient();
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#4338ca');
  const [size, setSize] = useState(4);
  const [side, setSide] = useState('left');
  const [session, setSession] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastUrl, setBroadcastUrl] = useState(null);
  const [showAudioHint, setShowAudioHint] = useState(false);
  const [showVoiceNote, setShowVoiceNote] = useState(false);
  const [showLaserRecord, setShowLaserRecord] = useState(false);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ w: 600, h: 800 });
  const [pdfRenderedSize, setPdfRenderedSize] = useState(null);
  const saveTimer = useRef(null);
  const loadedKeyRef = useRef(null);
  const draftKey = session ? `notebook-draft-${session.id}-${currentPage}` : null;
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const latestSessionRef = useRef(null);
  const isDrawingRef = useRef(false);

  const { data: assignments = [] } = useQuery({
    queryKey: ['student-notebook-assignments', className],
    queryFn: () => base44.entities.DigitalNotebookAssignment.filter({ class_name: className, status: 'active' }),
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!directAssignmentName || selectedAssignment || assignments.length === 0) return;
    const match = assignments.find(
      (a) => a.title?.toLowerCase().trim() === directAssignmentName.toLowerCase().trim()
    );
    if (match) setSelectedAssignment(match);
  }, [assignments, directAssignmentName, selectedAssignment]);

  useEffect(() => {
    loadedKeyRef.current = null;
  }, [selectedAssignment?.id]);

  useEffect(() => {
    loadedKeyRef.current = null;
  }, [session?.id]);

  useQuery({
    queryKey: ['student-notebook-poll', selectedAssignment?.id],
    queryFn: async () => {
      const fresh = await base44.entities.DigitalNotebookAssignment.filter({
        class_name: className,
        status: 'active',
      });
      const a = fresh.find((x) => x.id === selectedAssignment?.id);
      if (!a) return null;

      const limitActive = a.page_mode === 'locked' || a.limit_pages;
      const pdfMaxPage = a.pdf_page_count || a.page_count || 1;
      const minAllowed = limitActive ? (a.page_range_start || 1) : 1;
      const maxAllowed = limitActive
        ? Math.min(a.page_range_end || pdfMaxPage, pdfMaxPage)
        : pdfMaxPage;

      if (a.page_mode === 'locked' && a.locked_page) {
        const locked = Math.max(minAllowed, Math.min(maxAllowed, a.locked_page));
        if (locked !== currentPage) {
          await saveStrokes();
          loadedKeyRef.current = null;
          setCurrentPage(locked);
        }
      } else {
        if (currentPage < minAllowed) {
          loadedKeyRef.current = null;
          setCurrentPage(minAllowed);
        }
        if (currentPage > maxAllowed) {
          loadedKeyRef.current = null;
          setCurrentPage(maxAllowed);
        }
      }

      if (a.broadcast_video && a.broadcast_video !== broadcastUrl) {
        setBroadcastUrl(a.broadcast_video);
        setShowBroadcast(true);
      } else if (!a.broadcast_video) {
        setBroadcastUrl(null);
        setShowBroadcast(false);
      }
      return a;
    },
    enabled: !!selectedAssignment,
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setCanvasSize({ w: Math.round(width), h: Math.round(height) });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [selectedAssignment]);

  useEffect(() => {
    if (!selectedAssignment) return;
    (async () => {
      const sessions = await base44.entities.NotebookSession.filter({
        assignment_id: selectedAssignment.id,
        student_number: studentNumber,
        class_name: className,
      });

      const limitActive = selectedAssignment.page_mode === 'locked' || selectedAssignment.limit_pages;
      const pdfMaxPage = selectedAssignment.pdf_page_count || selectedAssignment.page_count || 1;
      const minAllowed = limitActive ? (selectedAssignment.page_range_start || 1) : 1;
      const maxAllowed = limitActive
        ? Math.min(selectedAssignment.page_range_end || pdfMaxPage, pdfMaxPage)
        : pdfMaxPage;

      if (sessions.length > 0) {
        const sorted = [...sessions].sort(
          (a, b) => new Date(b.updated_date || b.last_active || 0) - new Date(a.updated_date || a.last_active || 0)
        );
        const activeSession = sorted[0];
        setSession(activeSession);
        latestSessionRef.current = activeSession;
        const page = activeSession.current_page || 1;
        const desiredPage =
          selectedAssignment.page_mode === 'locked'
            ? (selectedAssignment.locked_page || 1)
            : page;
        setCurrentPage(Math.max(minAllowed, Math.min(maxAllowed, desiredPage)));
      } else {
        const newSession = await base44.entities.NotebookSession.create({
          assignment_id: selectedAssignment.id,
          class_name: className,
          student_number: studentNumber,
          current_page: 1,
          strokes_by_page: {},
        });
        setSession(newSession);
        latestSessionRef.current = newSession;
        const desiredPage =
          selectedAssignment.page_mode === 'locked'
            ? (selectedAssignment.locked_page || 1)
            : 1;
        setCurrentPage(Math.max(minAllowed, Math.min(maxAllowed, desiredPage)));
      }
    })();
  }, [selectedAssignment, className, studentNumber]);

  useEffect(() => {
    latestSessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!session || !canvasRef.current || !pdfRenderedSize) return;
    const key = `${session.id}-${currentPage}-${pdfRenderedSize.w}-${pdfRenderedSize.h}`;
    if (loadedKeyRef.current === key) return;

    loadedKeyRef.current = key;
    const pageData = session.strokes_by_page?.[String(currentPage)];
    const localDraft = draftKey ? localStorage.getItem(draftKey) : null;

    if (localDraft) {
      try {
        canvasRef.current.clearStrokes();
        canvasRef.current.loadStrokes(JSON.parse(localDraft));
      } catch {
        canvasRef.current.clearStrokes();
      }
    } else if (pageData) {
      try {
        canvasRef.current.clearStrokes();
        canvasRef.current.loadStrokes(JSON.parse(pageData));
      } catch {
        canvasRef.current.clearStrokes();
      }
    } else {
      canvasRef.current.clearStrokes();
    }
  }, [currentPage, session?.id, pdfRenderedSize, draftKey]);

  const saveStrokes = useCallback(async () => {
    if (!canvasRef.current) return;

    if (isDrawingRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    if (saveInFlightRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    const activeSession = latestSessionRef.current;
    if (!activeSession) return;

    saveInFlightRef.current = true;
    setSaving(true);

    try {
      const strokeData = canvasRef.current.getStrokes();
      const payload = {
        ...strokeData,
        canvasWidth: pdfRenderedSize?.w || canvasSize.w,
        canvasHeight: pdfRenderedSize?.h || canvasSize.h,
        normalized: true,
      };

      const updated = {
        ...(activeSession.strokes_by_page || {}),
        [String(currentPage)]: JSON.stringify(payload),
      };

      if (draftKey) {
        localStorage.setItem(draftKey, JSON.stringify(payload));
      }

      await base44.entities.NotebookSession.update(activeSession.id, {
        strokes_by_page: updated,
        current_page: currentPage,
        last_active: new Date().toISOString(),
      });

      const nextSession = {
        ...activeSession,
        strokes_by_page: updated,
        current_page: currentPage,
        last_active: new Date().toISOString(),
      };

      latestSessionRef.current = nextSession;
      setSession(nextSession);
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);

      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        void saveStrokes();
      }
    }
  }, [currentPage, pdfRenderedSize, canvasSize, draftKey]);

  const handleStrokeStart = useCallback(() => {
    isDrawingRef.current = true;
  }, []);

  const handleStrokeEnd = useCallback(() => {
    isDrawingRef.current = false;
    void saveStrokes();
  }, [saveStrokes]);

  const saveVoiceNote = useCallback(async (url) => {
    if (!session) return;
    const updated = { ...(session.voice_notes_by_page || {}), [String(currentPage)]: url };
    await base44.entities.NotebookSession.update(session.id, { voice_notes_by_page: updated });
    setSession((s) => ({ ...s, voice_notes_by_page: updated }));
  }, [session, currentPage]);

  const deleteVoiceNote = useCallback(async () => {
    if (!session) return;
    const updated = { ...(session.voice_notes_by_page || {}) };
    delete updated[String(currentPage)];
    await base44.entities.NotebookSession.update(session.id, { voice_notes_by_page: updated });
    setSession((s) => ({ ...s, voice_notes_by_page: updated }));
  }, [session, currentPage]);

  useEffect(() => {
    if (!session) return;

    const interval = setInterval(() => {
      void saveStrokes();
    }, 20000);

    return () => clearInterval(interval);
  }, [saveStrokes, session]);

  useEffect(() => {
    const handlePageHide = () => {
      void saveStrokes();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void saveStrokes();
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [saveStrokes]);

  const pageAudio = selectedAssignment?.audio_instructions?.filter((a) => a.page === currentPage) || [];
  const pageVideo = selectedAssignment?.video_instructions?.filter((v) => v.page === currentPage) || [];

  const limitActive = selectedAssignment?.page_mode === 'locked' || selectedAssignment?.limit_pages;
  const minPage = limitActive ? (selectedAssignment?.page_range_start || 1) : 1;
  const inferredMaxPage =
    selectedAssignment?.pdf_page_count ||
    selectedAssignment?.page_count ||
    selectedAssignment?.page_range_end ||
    1;
  const maxPage = limitActive
    ? Math.min(selectedAssignment?.page_range_end || inferredMaxPage, inferredMaxPage)
    : inferredMaxPage;

  const goToPage = async (p) => {
    const clamped = Math.max(minPage, Math.min(maxPage, p));
    if (clamped === currentPage) return;
    await saveStrokes();
    loadedKeyRef.current = null;
    setCurrentPage(clamped);
  };

  if (!selectedAssignment) {
    return <AssignmentPicker assignments={assignments} onSelect={setSelectedAssignment} />;
  }

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: '#0f0f1a' }}>
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ background: '#1a1a2e', borderBottom: '2px solid #4338ca' }}
      >
        <button
          onClick={async () => {
            await saveStrokes();
            loadedKeyRef.current = null;
            setSelectedAssignment(null);
          }}
          className="text-indigo-300 hover:text-white font-bold text-sm"
        >
          ← Back
        </button>
        <p className="flex-1 text-white font-black text-sm truncate">{selectedAssignment.title}</p>
        <span
          className="text-indigo-400 text-xs font-bold px-2 py-1 rounded-lg"
          style={{ background: '#0f0f1a' }}
        >
          Class {className} · #{studentNumber}
        </span>
        <span className="text-indigo-300 text-sm font-bold">Page {currentPage}</span>
        {saving && <span className="text-xs text-indigo-400 animate-pulse">Saving…</span>}
        <button
          onClick={async () => {
            await saveStrokes();
          }}
          className="px-3 py-1.5 rounded-xl text-xs font-bold text-white"
          style={{ background: '#4338ca' }}
        >
          💾 Save
        </button>
      </div>

      <AnimatePresence>
        {showBroadcast && broadcastUrl && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-14 left-1/2 -translate-x-1/2 z-50 shadow-2xl rounded-2xl overflow-hidden"
            style={{ width: 360, border: '3px solid #9333ea', background: '#1a1a2e' }}
          >
            <div className="flex items-center justify-between px-3 py-1.5" style={{ background: '#9333ea' }}>
              <span className="text-white text-xs font-bold">📡 Teacher Video</span>
              <button onClick={() => setShowBroadcast(false)} className="text-white font-bold">✕</button>
            </div>
            <div style={{ aspectRatio: '16/9' }}>
              <iframe src={getYouTubeEmbedUrl(broadcastUrl)} allow="autoplay" allowFullScreen className="w-full h-full" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {(pageAudio.length > 0 || pageVideo.length > 0) && (
        <div className="absolute bottom-16 right-4 z-40 flex flex-col gap-2">
          <button
            onClick={() => setShowAudioHint((v) => !v)}
            className="w-12 h-12 rounded-full shadow-xl flex items-center justify-center text-2xl"
            style={{ background: '#4338ca', border: '3px solid #9333ea' }}
          >
            🔊
          </button>
          <AnimatePresence>
            {showAudioHint && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl p-3 flex flex-col gap-2 max-w-xs w-64"
                style={{ background: '#1a1a2e', border: '2px solid #4338ca' }}
              >
                {pageAudio.map((a, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <span className="text-xs text-indigo-300">{a.label}</span>
                    <audio controls src={a.url} className="w-full h-8" />
                  </div>
                ))}
                {pageVideo.map((v, i) => (
                  <div key={i}>
                    <p className="text-xs text-indigo-300 mb-1">{v.label}</p>
                    <div style={{ aspectRatio: '16/9' }} className="rounded-xl overflow-hidden">
                      <iframe src={getYouTubeEmbedUrl(v.url)} allowFullScreen className="w-full h-full" />
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {showLaserRecord ? (
        <div className="flex-1 overflow-auto">
          <LaserRecordView
            assignment={selectedAssignment}
            session={session}
            initialPage={currentPage}
            onRecordingSaved={(updated) => setSession((s) => ({ ...s, recordings_by_page: updated }))}
          />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
          <div className="p-1.5 overflow-y-auto shrink-0" style={{ background: '#1a1a2e' }}>
            <AnnotationToolbar
              tool={tool}
              setTool={setTool}
              color={color}
              setColor={setColor}
              size={size}
              setSize={setSize}
              onUndo={() => canvasRef.current?.undo()}
              onClear={() => canvasRef.current?.clearStrokes()}
            />
          </div>

          <div
            ref={containerRef}
            className="flex-1 overflow-auto"
            style={{ background: '#e8e8e8' }}
          >
            {selectedAssignment.pdf_url ? (
              <div style={{ position: 'relative', display: 'block', width: '100%' }}>
                <PdfPageRenderer
                  pdfUrl={selectedAssignment.pdf_url}
                  pageNumber={currentPage}
                  onRendered={(w, h) => setPdfRenderedSize({ w, h })}
                />
                {pdfRenderedSize && (
                  <AnnotationCanvas
                    ref={canvasRef}
                    width={pdfRenderedSize.w}
                    height={pdfRenderedSize.h}
                    color={color}
                    size={size}
                    tool={tool}
                    mode="draw"
                    onStrokeStart={handleStrokeStart}
                    onStrokeEnd={handleStrokeEnd}
                  />
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full bg-white">
                <p className="text-gray-400 text-lg">No PDF uploaded</p>
              </div>
            )}
          </div>

          {(selectedAssignment.recording_pages || []).includes(currentPage) && (
            <>
              <button
                onClick={() => setShowVoiceNote((v) => !v)}
                className="absolute bottom-20 right-4 z-40 w-12 h-12 rounded-full shadow-xl flex items-center justify-center text-xl"
                style={{ background: showVoiceNote ? '#9333ea' : '#4338ca', border: '3px solid #9333ea' }}
              >
                🎙
              </button>

              {showVoiceNote && (
                <div className="absolute bottom-36 right-4 z-40 w-72">
                  <VoiceNoteRecorder
                    existingUrl={session?.voice_notes_by_page?.[String(currentPage)]}
                    onSaved={saveVoiceNote}
                    onDelete={deleteVoiceNote}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {selectedAssignment.page_mode !== 'locked' && (
        <PageNavBar
          currentPage={currentPage}
          minPage={minPage}
          maxPage={maxPage}
          onGo={goToPage}
        />
      )}
    </div>
  );
}