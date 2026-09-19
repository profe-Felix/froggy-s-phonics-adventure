import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import AnnotationToolbar from './AnnotationToolbar';
import VoiceNoteRecorder from './VoiceNoteRecorder';
import LaserRecordView from './LaserRecordView';
import AnnotationCanvas from './AnnotationCanvas';
import PdfPageRenderer from './PdfPageRenderer';
import PageNavBar from './PageNavBar';
import FloatingMicWidget from './FloatingMicWidget';
import LaserOverlay from './LaserOverlay';
import LassoLayer from './LassoLayer';
import CutPiecesLayer from './CutPiecesLayer';
import useLaserTracker from '@/hooks/useLaserTracker';
import useCutPaste from '@/hooks/useCutPaste';
import BackButton from '@/components/ui/BackButton';
import { QRCodeSVG } from 'qrcode.react';
import { useClassNames } from '@/hooks/useClassNames';

function getYouTubeEmbedUrl(url) {
  if (!url) return null;
  // Only return a sanitized https YouTube embed URL. Never fall back to the
  // raw user-provided value — a 'javascript:'/'data:' URL would execute in the
  // iframe src on every student's device.
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
  } catch { return null; }
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1` : null;
}

function getAssignmentPageBounds(assignment) {
  const total = Math.max(
    1,
    Number(
      assignment?.pdf_page_count ||
      assignment?.page_count ||
      assignment?.page_range_end ||
      1
    )
  );

  const limitActive =
    assignment?.page_mode === 'locked' ||
    assignment?.limit_pages;

  if (!limitActive) {
    return {
      total,
      min: 1,
      max: total,
    };
  }

  const requestedMin = Number(assignment?.page_range_start || 1);
  const requestedMax = Number(assignment?.page_range_end || total);

  const min = Math.max(1, Math.min(total, requestedMin));
  const max = Math.max(min, Math.min(total, requestedMax));

  return {
    total,
    min,
    max,
  };
}

function getEffectiveLockedPage(assignment) {
  const bounds = getAssignmentPageBounds(assignment);
  const requestedPage = Number(
    assignment?.locked_page ||
    bounds.min
  );

  return Math.max(
    bounds.min,
    Math.min(bounds.max, requestedPage)
  );
}

function AssignmentPicker({ assignments, onSelect, className }) {
  return (
    <div className="min-h-screen flex flex-col items-center py-8 px-4" style={{ background: '#0f0f1a' }}>
      <h2 className="text-2xl font-black text-white mb-6">📓 Your Assignments</h2>
      {assignments.length === 0 && <p className="text-indigo-400">No active assignments right now.</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-2xl">
        {assignments.map((a) => (
          <motion.button
            key={a.id}
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
            onClick={() => onSelect(a)}
            className="aspect-[4/3] rounded-3xl p-4 text-left flex flex-col justify-between shadow-xl ring-1 ring-white/20"
            style={{ background: '#1a1a2e', border: '2px solid #4338ca' }}
          >
            <span className="text-3xl">📄</span>
            <div>
              <p className="font-black text-white text-base leading-tight">{a.title}</p>
              <p className="text-xs text-indigo-300 mt-1">{a.page_mode === 'locked' ? '🔒 Teacher-paced' : '🆓 Self-paced'}</p>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export default function StudentNotebookView({ studentNumber, className, onBack, directAssignmentName, directPage, extraHeaderContent }) {
  const qc = useQueryClient();
  const { classList } = useClassNames();
  const [showQR, setShowQR] = useState(false);
  const [qrClass, setQrClass] = useState('');
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#4338ca');
  const [size, setSize] = useState(4);
  const [side, setSide] = useState('left');
  const [fitMode, setFitMode] = useState(() => {
    if (typeof window !== 'undefined' && window.innerHeight > window.innerWidth) {
      return 'height';
    }
    return 'width';
  }); // width | height | page
  const [session, setSession] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastUrl, setBroadcastUrl] = useState(null);
  const [showAudioHint, setShowAudioHint] = useState(false);
  const [showVoiceNote, setShowVoiceNote] = useState(false);
  const [showLaserRecord, setShowLaserRecord] = useState(false);
  // Floating mics state: [{id, x_pct, y_pct, audio_url, laser_data, label, role}]
  const [floatingMics, setFloatingMics] = useState([]);
  const [addingMic, setAddingMic] = useState(false);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const pdfWrapperRef = useRef(null); // inner PDF wrapper — laser tracks against this
  const [canvasSize, setCanvasSize] = useState({ w: 600, h: 800 });
  const [pdfRenderedSize, setPdfRenderedSize] = useState(null);
  const saveTimer = useRef(null);
  const loadedKeyRef = useRef(null);
  const saveInFlightRef = useRef(false);
  const pendingSavesRef = useRef(new Map());
  const saveDrainPromiseRef = useRef(null);
  const latestSessionRef = useRef(null);
  const pendingPageCommitRef = useRef(null);
  const pageCommitPromiseRef = useRef(null);
  const isDrawingRef = useRef(false);
  const localDirtyRef = useRef(false);
  const lastMicTouchRef = useRef(0);
  const navigationInFlightRef = useRef(false);

  // Keep a ref so saveStrokes always uses the correct page — avoids stale closure bugs
  const currentPageRef = useRef(currentPage);
  useLayoutEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  useEffect(() => {
    const applyAutoFit = () => {
      const portrait = window.innerHeight > window.innerWidth;
      setFitMode(portrait ? 'height' : 'width');
    };

    applyAutoFit();
    window.addEventListener('resize', applyAutoFit);
    window.addEventListener('orientationchange', applyAutoFit);

    return () => {
      window.removeEventListener('resize', applyAutoFit);
      window.removeEventListener('orientationchange', applyAutoFit);
    };
  }, []);

  const draftKey = session ? `notebook-draft-${session.id}-${currentPage}` : null;

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

  const { data: polledAssignment = null } = useQuery({
    queryKey: ['student-notebook-poll', selectedAssignment?.id],
    queryFn: async () => {
      const fresh = await base44.entities.DigitalNotebookAssignment.filter({
        class_name: className,
        status: 'active',
      });

      return (
        fresh.find((assignment) =>
          assignment.id === selectedAssignment?.id
        ) || null
      );
    },
    enabled: !!selectedAssignment,
    refetchInterval: 3000,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animationFrame = null;

    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      const nextWidth = Math.round(width);
      const nextHeight = Math.round(height);

      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }

      animationFrame = requestAnimationFrame(() => {
        setCanvasSize((current) => {
          if (
            current.w === nextWidth &&
            current.h === nextHeight
          ) {
            return current;
          }

          return {
            w: nextWidth,
            h: nextHeight,
          };
        });
      });
    });

    obs.observe(container);

    return () => {
      obs.disconnect();

      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [selectedAssignment?.id]);

  useEffect(() => {
    if (!selectedAssignment) return;
    (async () => {
      const sessions = await base44.entities.NotebookSession.filter({
        assignment_id: selectedAssignment.id,
        student_number: studentNumber,
        class_name: className,
        school_year: ACTIVE_SCHOOL_YEAR,
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
            ? getEffectiveLockedPage(selectedAssignment)
            : Math.max(
                minAllowed,
                Math.min(maxAllowed, directPage || page)
              );

        currentPageRef.current = desiredPage;
        setCurrentPage(desiredPage);
      } else {
        const desiredPage =
          selectedAssignment.page_mode === 'locked'
            ? getEffectiveLockedPage(selectedAssignment)
            : Math.max(
                minAllowed,
                Math.min(maxAllowed, directPage || 1)
              );

        const newSession = await base44.entities.NotebookSession.create({
          assignment_id: selectedAssignment.id,
          class_name: className,
          student_number: studentNumber,
          school_year: ACTIVE_SCHOOL_YEAR,
          current_page: desiredPage,
          strokes_by_page: {},
        });

        setSession(newSession);
        latestSessionRef.current = newSession;
        currentPageRef.current = desiredPage;
        setCurrentPage(desiredPage);
      }
    })();
  }, [selectedAssignment, className, studentNumber]);

  useEffect(() => {
    latestSessionRef.current = session;
  }, [session]);

  useLayoutEffect(() => {
    if (!session || !canvasRef.current || !pdfRenderedSize) return;

    // IMPORTANT:
    // Do NOT include pdfRenderedSize in the key.
    // PDF/canvas resize/render events were causing the canvas to clear/reload.
    const key = `${session.id}-${currentPage}`;
    if (loadedKeyRef.current === key) return;

    // A different page must always replace the long-lived canvas immediately.
    // Never let dirty/drawing flags from the page we just left suppress this
    // load; otherwise its ink remains in memory and can be saved on this page.
    loadedKeyRef.current = key;
    localDirtyRef.current = false;

    const pageData = session.strokes_by_page?.[String(currentPage)];
    const localDraft = draftKey ? localStorage.getItem(draftKey) : null;

    if (localDraft) {
      try {
        canvasRef.current.loadStrokes(JSON.parse(localDraft));
      } catch {
        canvasRef.current.loadStrokes(null);
      }
    } else if (pageData) {
      try {
        canvasRef.current.loadStrokes(typeof pageData === 'string' ? JSON.parse(pageData) : pageData);
      } catch {
        canvasRef.current.loadStrokes(null);
      }
    } else {
      canvasRef.current.loadStrokes(null);
    }
  }, [currentPage, session?.id, draftKey, !!pdfRenderedSize]);

  const saveStrokes = useCallback((pageOverride, preCapturedData) => {
    if (!canvasRef.current) {
      return Promise.resolve();
    }

    // Capture the page and strokes before any asynchronous work.
    const savePage =
      pageOverride ??
      currentPageRef.current;

    const strokeData =
      preCapturedData ??
      canvasRef.current.getStrokes();

    const activeSession =
      latestSessionRef.current;

    if (!activeSession) {
      return Promise.resolve();
    }

    const pageKey = String(savePage);
    const saveDraftKey =
      `notebook-draft-${activeSession.id}-${savePage}`;

    const payload = {
      ...strokeData,
      canvasWidth:
        pdfRenderedSize?.w ||
        canvasSize.w,
      canvasHeight:
        pdfRenderedSize?.h ||
        canvasSize.h,
      normalized: true,
    };

    // Create the local recovery copy before any network request.
    localStorage.setItem(
      saveDraftKey,
      JSON.stringify(payload)
    );

    localDirtyRef.current = true;

    // A newer save may replace an older pending save for the same page,
    // but it cannot replace a save belonging to another page.
    pendingSavesRef.current.set(pageKey, {
      page: savePage,
      pageKey,
      payload,
      draftKey: saveDraftKey,
      sessionId: activeSession.id,
    });

    // Do not begin network work in the middle of a stroke.
    // handleStrokeEnd will call saveStrokes again with the final data.
    if (isDrawingRef.current) {
      return Promise.resolve();
    }

    // A worker is already processing the queue.
    if (saveDrainPromiseRef.current) {
      return saveDrainPromiseRef.current;
    }

    const drainPromise = (async () => {
      saveInFlightRef.current = true;
      setSaving(true);

      try {
        while (pendingSavesRef.current.size > 0) {
          const nextEntry =
            pendingSavesRef.current.entries().next().value;

          if (!nextEntry) break;

          const [
            queuedPageKey,
            queuedSave,
          ] = nextEntry;

          // Remove this version before saving. If the page changes again while
          // the request is running, a newer entry will be added for that page.
          pendingSavesRef.current.delete(
            queuedPageKey
          );

          const currentSession =
            latestSessionRef.current;

          if (
            !currentSession ||
            currentSession.id !==
              queuedSave.sessionId
          ) {
            continue;
          }

          let baseStrokesByPage =
            currentSession.strokes_by_page || {};

          try {
            const freshSession =
              await base44.entities.NotebookSession.get(
                queuedSave.sessionId
              );

            if (freshSession?.strokes_by_page) {
              baseStrokesByPage =
                freshSession.strokes_by_page;
            }
          } catch {
            // Use the latest local session if the merge read fails.
          }

          const updatedStrokesByPage = {
            ...baseStrokesByPage,
            [queuedPageKey]: JSON.stringify(
              queuedSave.payload
            ),
          };

          try {
            const savedAt =
              new Date().toISOString();

            await base44.entities.NotebookSession.update(
              queuedSave.sessionId,
              {
                strokes_by_page:
                  updatedStrokesByPage,
                last_active: savedAt,
              }
            );

            // If a newer version of this page was queued during the request,
            // keep its recovery draft until that newer version is saved.
            if (
              !pendingSavesRef.current.has(
                queuedPageKey
              )
            ) {
              localStorage.removeItem(
                queuedSave.draftKey
              );
            }

            const nextSession = {
              ...currentSession,
              ...latestSessionRef.current,
              strokes_by_page:
                updatedStrokesByPage,
              current_page:
                latestSessionRef.current
                  ?.current_page ??
                currentPageRef.current,
              last_active: savedAt,
            };

            latestSessionRef.current =
              nextSession;

            setSession(nextSession);
          } catch (error) {
            // Keep the local draft after a failed server save.
            console.error(
              `Unable to save notebook page ${queuedSave.page}`,
              error
            );
          }
        }
      } finally {
        saveInFlightRef.current = false;
        saveDrainPromiseRef.current = null;

        localDirtyRef.current =
          pendingSavesRef.current.size > 0 ||
          isDrawingRef.current;

        setSaving(false);
      }
    })();

    saveDrainPromiseRef.current =
      drainPromise;

    return drainPromise;
  }, [pdfRenderedSize, canvasSize]);

  const handlePdfRendered = useCallback((width, height) => {
    const nextWidth = Math.round(width * 100) / 100;
    const nextHeight = Math.round(height * 100) / 100;

    setPdfRenderedSize((current) => {
      if (
        current &&
        Math.abs(current.w - nextWidth) < 0.1 &&
        Math.abs(current.h - nextHeight) < 0.1
      ) {
        return current;
      }

      return {
        w: nextWidth,
        h: nextHeight,
      };
    });
  }, []);

  const handleStrokeStart = useCallback(() => {
    isDrawingRef.current = true;
    localDirtyRef.current = true;
  }, []);

  const handleStrokeEnd = useCallback(() => {
    isDrawingRef.current = false;
    void saveStrokes(currentPageRef.current);
  }, [saveStrokes]);
  const handleClearPage = useCallback(() => {
    if (!canvasRef.current) return;

    const page = currentPageRef.current;
    localDirtyRef.current = true;

    canvasRef.current.clearStrokes();
    void saveStrokes(page);
  }, [saveStrokes]);

  const handleUndoPage = useCallback(() => {
    if (!canvasRef.current) return;

    const page = currentPageRef.current;
    localDirtyRef.current = true;

    canvasRef.current.undo();
    void saveStrokes(page);
  }, [saveStrokes]);

  const handleRedoPage = useCallback(() => {
    if (!canvasRef.current) return;

    const page = currentPageRef.current;
    localDirtyRef.current = true;

    canvasRef.current.redo();
    void saveStrokes(page);
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

  // Poll server for session updates from other devices/tabs
  useEffect(() => {
    if (!session?.id) return;

    const interval = setInterval(async () => {
      if (isDrawingRef.current) return;
      if (saveInFlightRef.current) return;
      if (localDirtyRef.current) return;

      try {
        const fresh = await base44.entities.NotebookSession.get(session.id);
        if (!fresh) return;

        const pageKey = String(currentPageRef.current);
        const serverStroke = fresh.strokes_by_page?.[pageKey];
        const localStroke = latestSessionRef.current?.strokes_by_page?.[pageKey];

        // Only reload if server has different data for current page
        if (serverStroke && serverStroke !== localStroke) {
          const mergedSession = {
            ...latestSessionRef.current,
            ...fresh,
            strokes_by_page: fresh.strokes_by_page || {},
          };
          latestSessionRef.current = mergedSession;
          setSession(mergedSession);

          // Directly reload canvas with server data
          if (canvasRef.current && !isDrawingRef.current && !localDirtyRef.current) {
            try {
              const parsed = typeof serverStroke === 'string' ? JSON.parse(serverStroke) : serverStroke;
              canvasRef.current.loadStrokes(parsed);
            } catch { /* skip bad payload */ }
          }
        }
      } catch {
        // silent polling failure
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [session?.id]);

  const pageAudio = selectedAssignment?.audio_instructions?.filter((a) => a.page === currentPage) || [];
  const pageVideo = selectedAssignment?.video_instructions?.filter((v) => v.page === currentPage) || [];

  // Laser tracker — active when laser tool is selected OR when a mic recording is active
  // (so the laser can be recorded even if the user switches to pencil mid-session)
  // We always enable it so the mic widget can record laser strokes; we only SHOW the overlay
  // when the laser tool is the selected tool.
  const laserActive = tool === 'laser';
  const laserTracker = useLaserTracker({ containerRef: pdfWrapperRef, enabled: laserActive });
  // Expose laserTracker methods via a stable ref so FloatingMicWidget can call them
  const laserTrackerRef = useRef(laserTracker);
  useEffect(() => {
    laserTrackerRef.current = laserTracker;
  });

  // ── Cut & Paste ─────────────────────────────────────────────────────────
  const cutPaste = useCutPaste({
    pdfWrapperRef,
    session,
    currentPage,
    onSessionUpdate: (updated) => setSession(s => ({ ...s, voice_notes_by_page: updated })),
  });

  // Sync cut pieces whenever page or session changes
  useEffect(() => {
    if (session) cutPaste.syncFromSession(session, currentPage);
  }, [session?.id, currentPage]);

  // Load floating mics from session for current page
  useEffect(() => {
    if (!session) return;
    const micsForPage = (session.voice_notes_by_page?.[`mics_${currentPage}`]) || '[]';
    try { setFloatingMics(JSON.parse(micsForPage)); } catch { setFloatingMics([]); }
  }, [session?.id, currentPage]);

  const saveFloatingMics = useCallback(async (mics, pageOverride = currentPageRef.current) => {
    const activeSession = latestSessionRef.current;
    if (!activeSession) return;
    const key = `mics_${pageOverride}`;
    let baseVoiceNotes = activeSession.voice_notes_by_page || {};
    try {
      const fresh = await base44.entities.NotebookSession.get(activeSession.id);
      baseVoiceNotes = fresh?.voice_notes_by_page || baseVoiceNotes;
    } catch { /* merge with the latest local session */ }
    const updated = { ...baseVoiceNotes, [key]: JSON.stringify(mics) };
    await base44.entities.NotebookSession.update(activeSession.id, { voice_notes_by_page: updated });
    const nextSession = { ...latestSessionRef.current, voice_notes_by_page: updated };
    latestSessionRef.current = nextSession;
    setSession(nextSession);
  }, []);

  const handlePageClickForMic = (e) => {
    if (!addingMic || !pdfWrapperRef.current) return;
    if (e.type === 'touchend') lastMicTouchRef.current = Date.now();
    if (e.type === 'click' && Date.now() - lastMicTouchRef.current < 700) return;
    e.preventDefault?.();
    e.stopPropagation?.();
    const page = currentPageRef.current;
    const strokeSnapshot = canvasRef.current?.getStrokes();
    const src = e.changedTouches ? e.changedTouches[0] : e;
    const rect = pdfWrapperRef.current.getBoundingClientRect();
    const x_pct = (src.clientX - rect.left) / rect.width;
    const y_pct = (src.clientY - rect.top) / rect.height;
    const newMic = { id: `mic-${Date.now()}`, x_pct, y_pct, audio_url: null, laser_data: null, label: '', role: 'student' };
    const updated = [...floatingMics, newMic];
    setFloatingMics(updated);
    void (async () => {
      await saveStrokes(page, strokeSnapshot);
      await saveFloatingMics(updated, page);
    })();
    setAddingMic(false);
  };

  const commitSessionPage = useCallback((sessionId, page) => {
    if (!sessionId) {
      return Promise.resolve();
    }

    // While one page update is running, retain only the newest requested page.
    pendingPageCommitRef.current = {
      sessionId,
      page,
    };

    if (pageCommitPromiseRef.current) {
      return pageCommitPromiseRef.current;
    }

    const commitPromise = (async () => {
      try {
        while (pendingPageCommitRef.current) {
          const pendingCommit =
            pendingPageCommitRef.current;

          pendingPageCommitRef.current = null;

          const updatedAt =
            new Date().toISOString();

          try {
            await base44.entities.NotebookSession.update(
              pendingCommit.sessionId,
              {
                current_page:
                  pendingCommit.page,
                last_active: updatedAt,
              }
            );

            // Keep local state on the newest visible page even if this request
            // was for an earlier page.
            const nextSession = {
              ...latestSessionRef.current,
              current_page:
                currentPageRef.current,
              last_active: updatedAt,
            };

            latestSessionRef.current =
              nextSession;

            setSession(nextSession);
          } catch (error) {
            console.error(
              'Unable to commit notebook page',
              error
            );
          }
        }
      } finally {
        pageCommitPromiseRef.current = null;
      }
    })();

    pageCommitPromiseRef.current =
      commitPromise;

    return commitPromise;
  }, []);

  const pageBounds = getAssignmentPageBounds(selectedAssignment);
  const minPage = pageBounds.min;
  const maxPage = pageBounds.max;
  const pdfTotal = pageBounds.total;
  const isPageLocked = selectedAssignment?.page_mode === 'locked';

  const goToPage = async (requestedPage, assignmentOverride = null) => {
    const effectiveAssignment =
      assignmentOverride ||
      selectedAssignment;

    if (!effectiveAssignment) return;
    if (navigationInFlightRef.current) return;

    const bounds = getAssignmentPageBounds(effectiveAssignment);

    const targetPage =
      effectiveAssignment.page_mode === 'locked'
        ? getEffectiveLockedPage(effectiveAssignment)
        : Math.max(
            bounds.min,
            Math.min(bounds.max, Number(requestedPage) || bounds.min)
          );

    const fromPage = currentPageRef.current;

    if (targetPage === fromPage) return;

    navigationInFlightRef.current = true;

    // Capture the old page before changing any refs or React state.
    const strokeSnapshot = canvasRef.current?.getStrokes();
    const activeSession = latestSessionRef.current;
    const updatedAt = new Date().toISOString();

    // saveStrokes writes the local recovery draft synchronously before its
    // first await. Keep its promise so navigation can happen immediately.
    const savePromise = saveStrokes(
      fromPage,
      strokeSnapshot
    );

    // Switch the visible page immediately. The old page's immutable stroke
    // snapshot continues saving in the background.
    localDirtyRef.current = false;
    loadedKeyRef.current = null;
    currentPageRef.current = targetPage;
    setCurrentPage(targetPage);

    if (activeSession) {
      const optimisticSession = {
        ...latestSessionRef.current,
        current_page: targetPage,
        last_active: updatedAt,
      };

      latestSessionRef.current = optimisticSession;
      setSession(optimisticSession);
    }

    try {
      const tasks = [savePromise];

      if (activeSession) {
        tasks.push(
          commitSessionPage(
            activeSession.id,
            targetPage
          )
        );
      }

      await Promise.allSettled(tasks);
    } finally {
      navigationInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!polledAssignment) return;
    if (polledAssignment.id !== selectedAssignment?.id) return;

    setSelectedAssignment((current) =>
      current?.id === polledAssignment.id
        ? { ...current, ...polledAssignment }
        : current
    );

    if (
      polledAssignment.broadcast_video &&
      polledAssignment.broadcast_video !== broadcastUrl
    ) {
      setBroadcastUrl(polledAssignment.broadcast_video);
      setShowBroadcast(true);
    } else if (!polledAssignment.broadcast_video) {
      setBroadcastUrl(null);
      setShowBroadcast(false);
    }

    const bounds = getAssignmentPageBounds(polledAssignment);

    const targetPage =
      polledAssignment.page_mode === 'locked'
        ? getEffectiveLockedPage(polledAssignment)
        : Math.max(
            bounds.min,
            Math.min(bounds.max, currentPageRef.current)
          );

    if (targetPage !== currentPageRef.current) {
      void goToPage(targetPage, polledAssignment);
    }
    // A new polled assignment snapshot is the trigger for reconciliation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polledAssignment]);

  // Keep URL in sync with current assignment + page so teachers can copy direct links
  useEffect(() => {
    if (!selectedAssignment) return;
    const sp = new URLSearchParams(window.location.search);
    sp.set('assignment', selectedAssignment.title);
    sp.set('page', String(currentPage));
    const newUrl = `${window.location.pathname}?${sp.toString()}`;
    window.history.replaceState(null, '', newUrl);
  }, [currentPage, selectedAssignment]);

  if (!selectedAssignment) {
    const visibleAssignments = assignments.filter(a => !a.hidden);
    return <AssignmentPicker assignments={visibleAssignments} onSelect={setSelectedAssignment} className={className} />;
  }

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: '#0f0f1a' }}>
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ background: '#1a1a2e', borderBottom: '2px solid #4338ca', paddingTop: 'env(safe-area-inset-top)' }}
      >
        <BackButton
          tone="indigo"
          onClick={async () => {
            await saveStrokes();
            loadedKeyRef.current = null;
            setSelectedAssignment(null);
          }}
        />
        <p className="flex-1 text-white font-black text-sm truncate">{selectedAssignment.title}</p>
        <span
          className="text-indigo-400 text-xs font-bold px-2 py-1 rounded-lg"
          style={{ background: '#0f0f1a' }}
        >
          Class {className} · #{studentNumber}
        </span>
        <span className="text-indigo-300 text-sm font-bold">Page {currentPage}</span>
        {saving && <span className="text-xs text-indigo-400 animate-pulse">Saving…</span>}
        {extraHeaderContent}
        <button
          onClick={() => setShowQR(true)}
          className="px-3 py-1.5 rounded-xl text-xs font-bold text-white shrink-0"
          style={{ background: '#0d9488' }}
          title="Share QR code for this page"
        >
          📱 QR
        </button>
        <button
          onClick={async () => {
            await saveStrokes();
          }}
          className="px-3 py-1.5 rounded-xl text-xs font-bold text-white"
          style={{ background: '#4338ca' }}
        >
          💾 Save
        </button>
                <select
          value={fitMode}
          onChange={(e) => setFitMode(e.target.value)}
          className="px-2 py-1.5 rounded-xl text-xs font-bold bg-white text-gray-900"
          title="Page fit mode"
        >
          <option value="width">Fit Width</option>
          <option value="height">Fit Height</option>
          <option value="page">Full Page</option>
        </select>
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
            {side === 'left' && (
            <div className="p-1.5 shrink-0" style={{ background: '#1a1a2e' }}>
              <AnnotationToolbar
                tool={tool} setTool={setTool}
                color={color} setColor={setColor}
                size={size} setSize={setSize}
                onUndo={handleUndoPage}
                onRedo={handleRedoPage}
                onClear={handleClearPage}
                side={side} onSwapSide={() => setSide(s => s === 'left' ? 'right' : 'left')}
                onAddMic={() => setAddingMic(v => !v)}
                addingMic={addingMic}
              />
            </div>
          )}

          <div
            ref={containerRef}
            className="flex-1 overflow-auto"
            style={{
              background: '#e8e8e8',
              position: 'relative',
              cursor: addingMic ? 'copy' : 'default',
              // Reserve the scrollbar gutter so a vertical scrollbar appearing
              // or disappearing can't change the measured container width. Without
              // this, width-fit modes oscillate (scrollbar shrinks width → page
              // re-fits narrower → gets shorter → scrollbar vanishes → width grows
              // → repeat) which shows as continuous "shaking".
              scrollbarGutter: 'stable',
            }}
            onClick={handlePageClickForMic}
            onTouchEnd={addingMic ? handlePageClickForMic : undefined}
          >
            {selectedAssignment.pdf_url ? (
              <div
                ref={pdfWrapperRef}
                style={{
                  position: 'relative',
                  display: 'block',
                  width: '100%',
                  height: 'auto',
                }}
              >
                  <PdfPageRenderer
                    pdfUrl={selectedAssignment.pdf_url}
                    pageNumber={currentPage}
                    fitMode={fitMode}
                    fillHeight={false}
                    alignSelf="flex-start"
                    targetWidth={canvasSize.w}
                    targetHeight={canvasSize.h}
                    onRendered={handlePdfRendered}
                  />
                {pdfRenderedSize && (
                  <AnnotationCanvas
                    ref={canvasRef}
                    width={pdfRenderedSize.w}
                    height={pdfRenderedSize.h}
                    color={color}
                    size={size}
                    tool={tool === 'laser' || tool === 'lasso' ? 'none' : tool}
                    mode={tool === 'laser' || tool === 'lasso' ? 'none' : 'draw'}
                    passThrough={addingMic || tool === 'lasso' || !!cutPaste.selectedPieceId}
                    scrollContainerRef={containerRef}
                    onStrokeStart={handleStrokeStart}
                    onStrokeEnd={handleStrokeEnd}
                  />
                )}
                {/* Lasso layer — only active when lasso tool selected */}
                {tool === 'lasso' && pdfRenderedSize && (
                  <LassoLayer
                    width={pdfRenderedSize.w}
                    height={pdfRenderedSize.h}
                    onCutRequest={cutPaste.handleCutRequest}
                    disabled={false}
                  />
                )}
                {/* Cut pieces layer */}
                {pdfRenderedSize && cutPaste.pieces.length > 0 && (
                  <CutPiecesLayer
                    pieces={cutPaste.pieces}
                    containerW={pdfRenderedSize.w}
                    containerH={pdfRenderedSize.h}
                    onUpdate={cutPaste.handlePiecesUpdate}
                    selectedId={cutPaste.selectedPieceId}
                    onSelect={cutPaste.setSelectedPieceId}
                  />
                )}
                {/* Laser overlay — only shown when laser tool selected */}
                {laserActive && pdfRenderedSize && (
                  <LaserOverlay
                    trailPoints={laserTracker.trailPoints}
                    width={pdfRenderedSize.w}
                    height={pdfRenderedSize.h}
                  />
                )}
                {/* Prevent AnnotationCanvas from capturing events when laser tool active */}
                {/* Teacher instruction icons — tap to replay audio+laser */}
                {pdfRenderedSize && (selectedAssignment.audio_instructions || [])
                  .filter(a => a.page === currentPage && a.x_pct !== undefined)
                  .map((ann, i) => (
                    <FloatingMicWidget
                      key={ann.id || i}
                      note={{ ...ann, audio_url: ann.audio_url || ann.url }}
                      containerRef={pdfWrapperRef}
                      canvasRef={null}
                      laserTrackerRef={null}
                      containerSize={pdfRenderedSize}
                      role="teacher"
                      readOnly={true}
                      onSave={null}
                      onRemove={null}
                    />
                  ))}
                {/* Floating student mics */}
                {pdfRenderedSize && floatingMics.map(mic => (
                  <FloatingMicWidget
                    key={mic.id}
                    note={mic}
                    containerRef={pdfWrapperRef}
                    canvasRef={canvasRef}
                    laserTrackerRef={laserTrackerRef}
                    containerSize={pdfRenderedSize ? { w: pdfRenderedSize.w, h: pdfRenderedSize.h } : undefined}
                    role="student"
                    onSave={(updated) => {
                      const newMics = floatingMics.map(m => m.id === mic.id ? updated : m);
                      setFloatingMics(newMics);
                      saveFloatingMics(newMics);
                    }}
                    onRemove={() => {
                      const newMics = floatingMics.filter(m => m.id !== mic.id);
                      setFloatingMics(newMics);
                      saveFloatingMics(newMics);
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full bg-white">
                <p className="text-gray-400 text-lg">No PDF uploaded</p>
              </div>
            )}
          </div>

          {side === 'right' && (
            <div className="p-1.5 shrink-0" style={{ background: '#1a1a2e' }}>
              <AnnotationToolbar
                tool={tool} setTool={setTool}
                color={color} setColor={setColor}
                size={size} setSize={setSize}
                onUndo={handleUndoPage}
                onRedo={handleRedoPage}
                onClear={handleClearPage}
                side={side} onSwapSide={() => setSide(s => s === 'left' ? 'right' : 'left')}
                onAddMic={() => setAddingMic(v => !v)}
                addingMic={addingMic}
              />
            </div>
          )}

          {/* Clipboard paste button — shown when clipboard has content */}
          {cutPaste.clipboard && (
            <button
              onClick={cutPaste.pasteFromClipboard}
              className="absolute bottom-20 left-20 z-40 w-12 h-12 rounded-full shadow-xl flex items-center justify-center text-xl"
              style={{ background: '#7c3aed', border: '3px solid #a78bfa' }}
              title="Paste cut piece from clipboard"
            >
              📋
            </button>
          )}

          {/* Selected piece action bar */}
          {cutPaste.selectedPieceId && (
            <div
              className="absolute top-16 left-1/2 -translate-x-1/2 z-50 flex gap-2 px-4 py-2 rounded-2xl shadow-2xl"
              style={{ background: '#1a1a2e', border: '2px solid #7c3aed' }}
            >
              <span className="text-xs text-purple-300 font-bold self-center">✂️ Piece selected</span>
              <button
                onClick={cutPaste.copyToClipboard}
                className="px-3 py-1 rounded-xl text-xs font-bold text-white"
                style={{ background: '#4338ca' }}
                title="Copy to clipboard for pasting on another page"
              >
                📋 Copy to Clipboard
              </button>
              <button
                onClick={cutPaste.deleteSelectedPiece}
                className="px-3 py-1 rounded-xl text-xs font-bold"
                style={{ background: '#7f1d1d', color: '#fca5a5' }}
              >
                🗑 Delete
              </button>
              <button
                onClick={() => cutPaste.setSelectedPieceId(null)}
                className="px-3 py-1 rounded-xl text-xs font-bold text-gray-400"
                style={{ background: '#374151' }}
              >
                ✕ Done
              </button>
            </div>
          )}

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

      {showQR && selectedAssignment && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[200] p-6" onClick={() => setShowQR(false)}>
          <div className="bg-white rounded-3xl p-8 text-center shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <p className="font-black text-2xl mb-1">📱 Share Page {currentPage}</p>
            <p className="text-sm text-gray-500 mb-4">{selectedAssignment.title}</p>
            <div className="flex items-center gap-3 mb-5 justify-center">
              <span className="text-base font-bold text-gray-700">Class:</span>
              <select value={qrClass || className}
                onChange={e => setQrClass(e.target.value)}
                className="border-2 border-gray-300 rounded-xl px-3 py-2 text-base font-bold">
                <option value="">All classes</option>
                {classList.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex justify-center mb-4">
              <QRCodeSVG
                value={`${window.location.origin}/DigitalNotebook?assignment=${encodeURIComponent(selectedAssignment.title)}&class=${qrClass || className}&page=${currentPage}`}
                size={320}
                level="M"
              />
            </div>
            <p className="text-xs text-gray-400 mb-5 break-all">
              {window.location.origin}/DigitalNotebook?assignment={encodeURIComponent(selectedAssignment.title)}&class={qrClass || className}&page={currentPage}
            </p>
            <button onClick={() => setShowQR(false)} className="border-2 border-gray-300 bg-white rounded-2xl px-8 py-3 text-base font-bold hover:bg-gray-50">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}