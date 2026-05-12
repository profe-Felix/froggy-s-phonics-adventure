import { useState, useRef, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';
import AnnotationToolbar from '@/components/notebook/AnnotationToolbar';
import PdfPageRenderer from '@/components/notebook/PdfPageRenderer';
import FloatingMicWidget from '@/components/notebook/FloatingMicWidget';
import useLaserTracker from '@/hooks/useLaserTracker';
import LaserOverlay from '@/components/notebook/LaserOverlay';
import SnapshotViewer from './SnapshotViewer';
import { exportAssessmentStudentPdf } from './exportAssessmentPdf';

/**
 * AssessmentStudentView
 * Teacher annotates a student's assessment record.
 * - Auto-saves strokes
 * - "Save & Start New" locks a snapshot, creates new session
 * - Orientation-stable (uses pdfRenderedSize as the source of truth)
 */
export default function AssessmentStudentView({ record, template, studentNumber, onBack, onRecordUpdate }) {
  const pages = template.pages || [];
  const totalPages = pages.length || 1;

  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#dc2626');
  const [size, setSize] = useState(4);
  const [side, setSide] = useState('left');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pdfRenderedSize, setPdfRenderedSize] = useState(null);
  const [floatingMics, setFloatingMics] = useState([]);
  const [addingMic, setAddingMic] = useState(false);
  const [showPasteImage, setShowPasteImage] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [viewingSnapshot, setViewingSnapshot] = useState(null);
  const [pastedImages, setPastedImages] = useState(() => {
    const map = {};
    Object.entries(record.pasted_images_by_page || {}).forEach(([k, v]) => {
      map[k] = typeof v === 'string' ? JSON.parse(v) : v;
    });
    return map;
  });

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const pdfWrapperRef = useRef(null);
  const loadedKeyRef = useRef(null);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const pendingSavePageRef = useRef(null);
  const isDrawingRef = useRef(false);
  const localDirtyRef = useRef(false);
  const latestRecordRef = useRef(record);
  const currentPageIdxRef = useRef(currentPageIdx);
  const lastMicTouchRef = useRef(0);

  useEffect(() => { currentPageIdxRef.current = currentPageIdx; }, [currentPageIdx]);

  useEffect(() => {
    latestRecordRef.current = record;

    const map = {};
    Object.entries(record.pasted_images_by_page || {}).forEach(([k, v]) => {
      try {
        map[k] = typeof v === 'string' ? JSON.parse(v) : v;
      } catch {
        map[k] = [];
      }
    });
    setPastedImages(map);
  }, [record]);

  const draftKey = record?.id ? `assessment-draft-${record.id}-${currentPageIdx}` : null;

  // Load strokes when page changes OR when canvas first becomes ready.
  // Key is only record/page-based — NOT pixel-size-based — so resize never clobbers local work.
  useEffect(() => {
    if (!canvasRef.current || !pdfRenderedSize) return;

    if (isDrawingRef.current) return;
    if (localDirtyRef.current) return;

    const key = `${record.id}-${currentPageIdx}`;
    if (loadedKeyRef.current === key) return;

    loadedKeyRef.current = key;

    const pageKey = String(currentPageIdx);
    const pageData = latestRecordRef.current.strokes_by_page?.[pageKey];
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
        canvasRef.current.loadStrokes(typeof pageData === 'string' ? JSON.parse(pageData) : pageData);
      } catch {
        canvasRef.current.clearStrokes();
      }
    } else {
      const templateStrokes = template.template_strokes_by_page?.[pageKey];

      if (templateStrokes) {
        try {
          canvasRef.current.clearStrokes();
          canvasRef.current.loadStrokes(typeof templateStrokes === 'string' ? JSON.parse(templateStrokes) : templateStrokes);
        } catch {
          canvasRef.current.clearStrokes();
        }
      } else {
        canvasRef.current.clearStrokes();
      }
    }
  }, [currentPageIdx, record.id, draftKey, !!pdfRenderedSize]);

  // Load floating mics for current page.
  // Use latestRecordRef so page changes do not read an older record prop.
  useEffect(() => {
    const rec = latestRecordRef.current || record;
    const raw = rec.strokes_by_page?.[`mics_${currentPageIdx}`];

    try {
      setFloatingMics(raw ? JSON.parse(raw) : []);
    } catch {
      setFloatingMics([]);
    }
  }, [record, currentPageIdx]);

  const saveStrokes = useCallback(async (pageOverride) => {
    if (!canvasRef.current) return;
    if (!pdfRenderedSize?.w || !pdfRenderedSize?.h) return;

    if (isDrawingRef.current) {
      pendingSaveRef.current = true;
      pendingSavePageRef.current = pageOverride ?? currentPageIdxRef.current;
      return;
    }

    if (saveInFlightRef.current) {
      pendingSaveRef.current = true;
      pendingSavePageRef.current = pageOverride ?? currentPageIdxRef.current;
      return;
    }

    const rec = latestRecordRef.current;
    if (!rec) return;

    const savePage = pageOverride ?? currentPageIdxRef.current;
    const saveDraftKey = `assessment-draft-${rec.id}-${savePage}`;

    saveInFlightRef.current = true;
    setSaving(true);

    try {
      const strokeData = canvasRef.current.getStrokes();
      const payload = {
        ...strokeData,
        canvasWidth: pdfRenderedSize?.w,
        canvasHeight: pdfRenderedSize?.h,
        normalized: true,
      };

      const updated = {
        ...(rec.strokes_by_page || {}),
        [String(savePage)]: JSON.stringify(payload),
      };

      // Local safety backup first. If Base44 fails, refresh will still restore the strokes.
      localStorage.setItem(saveDraftKey, JSON.stringify(payload));

      await base44.entities.AssessmentRecord.update(rec.id, {
        strokes_by_page: updated,
        last_active: new Date().toISOString(),
      });

      localStorage.removeItem(saveDraftKey);
      localDirtyRef.current = false;

      const nextRecord = {
        ...rec,
        strokes_by_page: updated,
        last_active: new Date().toISOString(),
      };

      latestRecordRef.current = nextRecord;
      onRecordUpdate?.(nextRecord);
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);

      if (pendingSaveRef.current) {
        const queuedPage = pendingSavePageRef.current;

        pendingSaveRef.current = false;
        pendingSavePageRef.current = null;

        void saveStrokes(queuedPage);
      }
    }
  }, [onRecordUpdate, pdfRenderedSize]);

  const handleStrokeStart = useCallback(() => {
    isDrawingRef.current = true;
    localDirtyRef.current = true;
  }, []);

  const handleStrokeEnd = useCallback(() => {
    isDrawingRef.current = false;
    void saveStrokes(currentPageIdxRef.current);
  }, [saveStrokes]);

  // Auto-save every 20s, but only when this page has unsaved local work.
  // This avoids repeatedly saving a clean/empty canvas over existing page data.
  useEffect(() => {
    const interval = setInterval(() => {
      if (localDirtyRef.current) {
        void saveStrokes(currentPageIdxRef.current);
      }
    }, 20000);

    return () => clearInterval(interval);
  }, [saveStrokes]);

  // Save on hide/pagehide.
  // Also writes a local draft synchronously because iPad/Safari may kill async saves.
  useEffect(() => {
    const writeLocalEmergencyDraft = () => {
      const rec = latestRecordRef.current;
      const canvas = canvasRef.current;
      if (!rec || !canvas) return;

      try {
        const page = currentPageIdxRef.current;
        const strokeData = canvas.getStrokes();
        const payload = {
          ...strokeData,
          canvasWidth: pdfRenderedSize?.w,
          canvasHeight: pdfRenderedSize?.h,
          normalized: true,
        };

        localStorage.setItem(
          `assessment-draft-${rec.id}-${page}`,
          JSON.stringify(payload)
        );
      } catch {
        // Do not block navigation if emergency draft fails.
      }
    };

    const onHide = () => {
      writeLocalEmergencyDraft();
      void saveStrokes();
    };

    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        writeLocalEmergencyDraft();
        void saveStrokes();
      }
    };

    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onVis);

    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [saveStrokes, pdfRenderedSize]);

  const goToPage = async (idx) => {
    const clamped = Math.max(0, Math.min(totalPages - 1, idx));
    if (clamped === currentPageIdx) return;

    await saveStrokes(currentPageIdx);

    localDirtyRef.current = false;
    loadedKeyRef.current = null;

    // Important: do not let the next page load using the old page's rendered size.
    // The canvas should remount only after the new page/image/pdf reports its real size.
    setPdfRenderedSize(null);
    setCurrentPageIdx(clamped);
  };

  const handleSaveAndStartNew = async () => {
    await saveStrokes(currentPageIdxRef.current);

    const rec = latestRecordRef.current;
    if (!rec) return;

    // Lock current as snapshot
    const snapshot = {
      id: `snap-${Date.now()}`,
      label: `Session ${rec.session_number || 1}`,
      date: new Date().toISOString(),
      strokes_by_page: rec.strokes_by_page || {},
      pasted_images_by_page: rec.pasted_images_by_page || {},
    };

    const updatedRec = await base44.entities.AssessmentRecord.update(rec.id, {
      snapshots: [...(rec.snapshots || []), snapshot],
      strokes_by_page: {},
      session_number: (rec.session_number || 1) + 1,
      last_active: new Date().toISOString(),
    });

    // Clear local emergency drafts for this assessment record so old ink does not reload
    // after starting a new session.
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith(`assessment-draft-${rec.id}-`)) {
        localStorage.removeItem(key);
      }
    });

    latestRecordRef.current = updatedRec;
    onRecordUpdate?.(updatedRec);

    localDirtyRef.current = false;
    loadedKeyRef.current = null;
    setPdfRenderedSize(null);
    setCurrentPageIdx(0);
    canvasRef.current?.clearStrokes();
  };

  const saveFloatingMics = useCallback(async (mics) => {
    const rec = latestRecordRef.current;
    if (!rec) return;

    // Save current ink first so mic updates do not accidentally preserve an older strokes_by_page object.
    await saveStrokes(currentPageIdxRef.current);

    const freshRec = latestRecordRef.current;
    if (!freshRec) return;

    const key = `mics_${currentPageIdxRef.current}`;
    const updated = {
      ...(freshRec.strokes_by_page || {}),
      [key]: JSON.stringify(mics),
    };

    await base44.entities.AssessmentRecord.update(freshRec.id, {
      strokes_by_page: updated,
      last_active: new Date().toISOString(),
    });

    const nextRecord = {
      ...freshRec,
      strokes_by_page: updated,
      last_active: new Date().toISOString(),
    };

    latestRecordRef.current = nextRecord;
    onRecordUpdate?.(nextRecord);
  }, [onRecordUpdate, saveStrokes]);

  const handlePageClickForMic = (e) => {
    if (!addingMic || !pdfWrapperRef.current) return;

    e.preventDefault?.();
    e.stopPropagation?.();

    if (e.type === 'touchend') {
      lastMicTouchRef.current = Date.now();
    }

    if (e.type === 'click' && Date.now() - lastMicTouchRef.current < 700) {
      return;
    }

    const src = e.changedTouches ? e.changedTouches[0] : e;
    const rect = pdfWrapperRef.current.getBoundingClientRect();

    const x_pct = (src.clientX - rect.left) / rect.width;
    const y_pct = (src.clientY - rect.top) / rect.height;

    const newMic = {
      id: `mic-${Date.now()}`,
      x_pct,
      y_pct,
      audio_url: null,
      role: 'teacher',
    };

    const updated = [...floatingMics, newMic];

    setFloatingMics(updated);
    setAddingMic(false);
    void saveFloatingMics(updated);
  };

  const handlePasteImage = async (file) => {
    await saveStrokes(currentPageIdxRef.current);

    const { file_url } = await base44.integrations.Core.UploadFile({ file });

    const img = {
      id: `img-${Date.now()}`,
      url: file_url,
      x_pct: 0.1,
      y_pct: 0.1,
      w_pct: 0.5,
      h_pct: 0.3,
    };

    const pageKey = String(currentPageIdxRef.current);
    const updatedPage = [...(pastedImages[pageKey] || []), img];
    const updatedAll = { ...pastedImages, [pageKey]: updatedPage };

    setPastedImages(updatedAll);

    const rec = latestRecordRef.current;
    if (!rec) return;

    const serialized = {};
    Object.entries(updatedAll).forEach(([k, v]) => {
      serialized[k] = JSON.stringify(v);
    });

    await base44.entities.AssessmentRecord.update(rec.id, {
      pasted_images_by_page: serialized,
      last_active: new Date().toISOString(),
    });

    const nextRecord = {
      ...rec,
      pasted_images_by_page: serialized,
      last_active: new Date().toISOString(),
    };

    latestRecordRef.current = nextRecord;
    onRecordUpdate?.(nextRecord);
    setShowPasteImage(false);
  };

  const laserActive = tool === 'laser';
  const laserTracker = useLaserTracker({ containerRef: pdfWrapperRef, enabled: laserActive });
  const laserTrackerRef = useRef(laserTracker);
  useEffect(() => { laserTrackerRef.current = laserTracker; });

  const currentPageData = pages[currentPageIdx];
  const currentPastedImages = pastedImages[String(currentPageIdx)] || [];
  const snapshots = record.snapshots || [];

  return (
    <div className="flex flex-col h-full w-full relative" style={{ background: '#0f0f1a' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 shrink-0 flex-wrap" style={{ background: '#1a1a2e', borderBottom: '2px solid #4338ca' }}>
        <button
          onClick={async () => {
            await saveStrokes(currentPageIdxRef.current);
            onBack();
          }}
          className="text-indigo-300 hover:text-white font-bold text-sm"
        >
          ← Back
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-black text-sm truncate">{template.title}</p>
          <p className="text-indigo-400 text-xs">Student #{studentNumber} · Session {record.session_number || 1}
            {snapshots.length > 0 && <span className="ml-2 text-green-400">· {snapshots.length} saved</span>}
          </p>
        </div>
        <span className="text-indigo-300 text-xs font-bold">Page {currentPageIdx + 1}/{totalPages}</span>
        {saving && <span className="text-xs text-indigo-400 animate-pulse">Saving…</span>}
        <button onClick={() => setShowPasteImage(true)}
          className="px-2 py-1.5 rounded-xl text-xs font-bold text-white" style={{ background: '#374151' }}>
          📷 Paste
        </button>

        <button
          disabled={exporting}
          onClick={async () => {
            try {
              setExporting(true);
              await saveStrokes(currentPageIdxRef.current);

              await exportAssessmentStudentPdf({
                template,
                record: latestRecordRef.current,
                studentNumber,
              });
            } finally {
              setExporting(false);
            }
          }}
          className="px-2 py-1.5 rounded-xl text-xs font-bold text-white disabled:opacity-40"
          style={{ background: '#9333ea' }}
        >
          {exporting ? '⏳ Exporting…' : '🖨 Export PDF'}
        </button>
        {snapshots.length > 0 && (
          <button onClick={() => setShowHistory(true)}
            className="px-2 py-1.5 rounded-xl text-xs font-bold text-white" style={{ background: '#7c3aed' }}>
            🗓 History ({snapshots.length})
          </button>
        )}
        <button onClick={handleSaveAndStartNew}
          className="px-3 py-1.5 rounded-xl text-xs font-bold text-white" style={{ background: '#16a34a' }}>
          ✅ Save & Start New
        </button>
      </div>

      {/* Page turner strip */}
      <div className="flex gap-1.5 px-3 py-1.5 overflow-x-auto shrink-0" style={{ background: '#111122', borderBottom: '1px solid #2d2d5e' }}>
        {pages.map((p, i) => (
          <button key={i} onClick={() => void goToPage(i)}
            className={`flex-shrink-0 w-12 h-16 rounded-lg border-2 flex items-center justify-center text-xs font-bold transition-all
              ${currentPageIdx === i ? 'border-indigo-400 text-white' : 'border-indigo-800 text-indigo-500 opacity-60'}`}
            style={{ background: '#1a1a2e' }}>
            {i + 1}
          </button>
        ))}
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
        {side === 'left' && (
          <div className="p-1.5 shrink-0" style={{ background: '#1a1a2e' }}>
            <AnnotationToolbar
              tool={tool} setTool={setTool} color={color} setColor={setColor}
              size={size} setSize={setSize}
              onUndo={() => {
                localDirtyRef.current = true;
                canvasRef.current?.undo();
                void saveStrokes(currentPageIdxRef.current);
              }}
              onClear={() => {
                localDirtyRef.current = true;
                canvasRef.current?.clearStrokes();
                void saveStrokes(currentPageIdxRef.current);
              }}
              side={side} onSwapSide={() => setSide(s => s === 'left' ? 'right' : 'left')}
            />
          </div>
        )}

        <div ref={containerRef} className="flex-1 overflow-auto"
          style={{ background: '#e8e8e8', position: 'relative', cursor: addingMic ? 'copy' : 'default' }}
          onClick={addingMic ? handlePageClickForMic : undefined}
          onTouchEnd={addingMic ? handlePageClickForMic : undefined}>
          {currentPageData ? (
            <div ref={pdfWrapperRef} style={{ position: 'relative', display: 'block', width: '100%' }}>
              {currentPageData.type === 'blank' ? (
                <div style={{ width: '100%', paddingBottom: '129%', background: 'white', position: 'relative' }}
                  ref={el => {
                    if (el && !pdfRenderedSize) {
                      const r = el.getBoundingClientRect();

                      if (r.width > 0) {
                        setPdfRenderedSize({
                          w: Math.round(r.width),
                          h: Math.round(r.width * 1.29),
                        });
                      }
                    }
                  }} />
              ) : currentPageData.type === 'pdf' && currentPageData.url ? (
                <PdfPageRenderer
                  pdfUrl={currentPageData.url}
                  pageNumber={currentPageData.pdfPage || 1}
                  onRendered={(w, h) => {
                    if (w > 0 && h > 0) {
                      setPdfRenderedSize({ w, h });
                    }
                  }}
                />
              ) : currentPageData.url ? (
                <img src={currentPageData.url} alt={`page ${currentPageIdx + 1}`}
                  style={{ width: '100%', display: 'block' }}
                  onLoad={e => {
                    const el = e.target;
                    const w = el.offsetWidth;
                    const h = el.offsetHeight;

                    if (w > 0 && h > 0) {
                      setPdfRenderedSize({ w, h });
                    }
                  }} />
              ) : null}

              {/* Pasted images */}
              {pdfRenderedSize && currentPastedImages.map(img => (
                <img key={img.id} src={img.url} alt="pasted"
                  style={{
                    position: 'absolute',
                    left: img.x_pct * pdfRenderedSize.w,
                    top: img.y_pct * pdfRenderedSize.h,
                    width: img.w_pct * pdfRenderedSize.w,
                    height: img.h_pct * pdfRenderedSize.h,
                    objectFit: 'contain',
                    pointerEvents: 'none',
                    zIndex: 5,
                  }} />
              ))}

              {pdfRenderedSize && (
                <AnnotationCanvas
                  ref={canvasRef}
                  width={pdfRenderedSize.w}
                  height={pdfRenderedSize.h}
                  color={color} size={size}
                  tool={tool === 'laser' ? 'none' : tool}
                  mode={tool === 'laser' ? 'none' : 'draw'}
                  passThrough={addingMic}
                  onStrokeStart={handleStrokeStart}
                  onStrokeEnd={handleStrokeEnd}
                />
              )}

              {laserActive && pdfRenderedSize && (
                <LaserOverlay trailPoints={laserTracker.trailPoints}
                  width={pdfRenderedSize.w} height={pdfRenderedSize.h} />
              )}

              {/* Template audio pins */}
              {pdfRenderedSize && (template.audio_annotations || [])
                .filter(a => a.page === currentPageIdx && a.x_pct !== undefined)
                .map((ann, i) => (
                  <FloatingMicWidget key={ann.id || i}
                    note={{ ...ann, audio_url: ann.audio_url || ann.url }}
                    containerRef={pdfWrapperRef} canvasRef={null} laserTrackerRef={null}
                    containerSize={pdfRenderedSize}
                    role="teacher" readOnly={true} onSave={null} onRemove={null} />
                ))}

              {/* Floating teacher mics */}
              {pdfRenderedSize && floatingMics.map(mic => (
                <FloatingMicWidget key={mic.id} note={mic}
                  containerRef={pdfWrapperRef} canvasRef={canvasRef}
                  laserTrackerRef={laserTrackerRef}
                  containerSize={pdfRenderedSize}
                  role="teacher"
                  onSave={(updated) => {
                    const newMics = floatingMics.map(m => m.id === mic.id ? updated : m);
                    setFloatingMics(newMics); saveFloatingMics(newMics);
                  }}
                  onRemove={() => {
                    const newMics = floatingMics.filter(m => m.id !== mic.id);
                    setFloatingMics(newMics); saveFloatingMics(newMics);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-400">No pages in this template</p>
            </div>
          )}
        </div>

        {side === 'right' && (
          <div className="p-1.5 shrink-0" style={{ background: '#1a1a2e' }}>
            <AnnotationToolbar
              tool={tool} setTool={setTool} color={color} setColor={setColor}
              size={size} setSize={setSize}
              onUndo={() => {
                localDirtyRef.current = true;
                canvasRef.current?.undo();
                void saveStrokes(currentPageIdxRef.current);
              }}
              onClear={() => {
                localDirtyRef.current = true;
                canvasRef.current?.clearStrokes();
                void saveStrokes(currentPageIdxRef.current);
              }}
              side={side} onSwapSide={() => setSide(s => s === 'left' ? 'right' : 'left')}
            />
          </div>
        )}
      </div>

      {/* Add mic button — absolute so it stays inside the container */}
      <button onClick={() => setAddingMic(v => !v)}
        className="absolute bottom-16 left-4 z-40 w-12 h-12 rounded-full shadow-xl flex items-center justify-center text-xl"
        style={{ background: addingMic ? '#f59e0b' : '#374151', border: `3px solid ${addingMic ? '#fbbf24' : '#6b7280'}` }}
        title="Add voice note">
        {addingMic ? '📍' : '🎙+'}
      </button>

      {/* Page nav */}
      <div className="shrink-0 flex items-center justify-center gap-3 py-2"
        style={{ background: '#1a1a2e', borderTop: '2px solid #4338ca' }}>
        <button onClick={() => void goToPage(currentPageIdx - 1)} disabled={currentPageIdx === 0}
          className="w-10 h-10 rounded-xl font-black text-white text-lg flex items-center justify-center disabled:opacity-30"
          style={{ background: '#4338ca' }}>‹</button>
        <span className="text-white font-bold text-sm">{currentPageIdx + 1} / {totalPages}</span>
        <button onClick={() => void goToPage(currentPageIdx + 1)} disabled={currentPageIdx >= totalPages - 1}
          className="w-10 h-10 rounded-xl font-black text-white text-lg flex items-center justify-center disabled:opacity-30"
          style={{ background: '#4338ca' }}>›</button>
      </div>

      {/* History / Snapshots modal */}
      <AnimatePresence>
        {showHistory && !viewingSnapshot && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col"
            style={{ background: '#0f0f1a' }}>
            <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ background: '#1a1a2e', borderBottom: '2px solid #7c3aed' }}>
              <button onClick={() => setShowHistory(false)} className="text-purple-300 hover:text-white font-bold text-sm">← Back</button>
              <p className="font-black text-white text-base">🗓 Session History · Student #{studentNumber}</p>
            </div>
            <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
              {snapshots.length === 0 && (
                <p className="text-gray-500 text-center mt-8">No saved sessions yet.</p>
              )}
              {[...snapshots].reverse().map((snap, i) => (
                <button key={snap.id} onClick={() => setViewingSnapshot(snap)}
                  className="w-full text-left rounded-2xl p-4 flex items-center gap-4 hover:opacity-90 transition-all"
                  style={{ background: '#1a1a2e', border: '2px solid #7c3aed' }}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-white text-lg flex-shrink-0"
                    style={{ background: '#7c3aed' }}>
                    {snapshots.length - i}
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">{snap.label || `Session ${snapshots.length - i}`}</p>
                    <p className="text-purple-400 text-xs">📅 {new Date(snap.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {Object.keys(snap.strokes_by_page || {}).filter(k => !k.startsWith('mics_')).length} page(s) with annotations
                    </p>
                  </div>
                  <div className="ml-auto text-purple-400 text-lg">›</div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Snapshot viewer — read-only canvas replay */}
      <AnimatePresence>
        {showHistory && viewingSnapshot && (
          <SnapshotViewer
            snapshot={viewingSnapshot}
            template={template}
            onBack={() => setViewingSnapshot(null)}
          />
        )}
      </AnimatePresence>

      {/* Paste image modal */}
      <AnimatePresence>
        {showPasteImage && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.7)' }}>
            <div className="rounded-2xl p-6 flex flex-col gap-4 w-80" style={{ background: '#1a1a2e', border: '2px solid #4338ca' }}>
              <p className="font-black text-white text-lg">📷 Paste Paper Copy</p>
              <p className="text-indigo-300 text-sm">Take a photo or upload an image of handwritten work to embed in this page.</p>
              <label className="cursor-pointer py-3 rounded-xl border-2 border-dashed border-indigo-500 flex flex-col items-center gap-2 hover:border-indigo-400 transition-all">
                <span className="text-2xl">📎</span>
                <span className="text-indigo-300 text-sm font-bold">Choose Photo or File</span>
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handlePasteImage(f); }} />
              </label>
              <button onClick={() => setShowPasteImage(false)}
                className="py-2 rounded-xl text-red-400 border border-red-800 font-bold text-sm">Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}