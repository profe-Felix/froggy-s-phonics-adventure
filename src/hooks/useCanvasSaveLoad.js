import { useRef, useCallback, useEffect } from 'react';

/**
 * Unified save/load/stroke management hook for both StudentNotebookView and StoryBuilder.
 * Ensures stroke integrity by:
 * - Deferring saves while drawing
 * - Queueing pending saves
 * - Using stable refs to avoid closure bugs
 * - Auto-saving on visibility change and page hide
 */
export default function useCanvasSaveLoad({
  canvasRef,
  currentIdx,
  dataByIdx,
  onSave,
  canvasSize,
  setSaving,
  setDataByIdx, // NEW: for immediate state sync
}) {
  const isDrawingRef = useRef(false);
  const currentIdxRef = useRef(currentIdx);
  const dataByIdxRef = useRef(dataByIdx);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const loadedKeyRef = useRef(null);

  // Keep refs in sync with latest state
  useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);
  useEffect(() => { dataByIdxRef.current = dataByIdx; }, [dataByIdx]);

  // Core save logic — exactly mirrors StudentNotebookView
  const save = useCallback(async (idxOverride) => {
    if (!canvasRef.current) return;

    if (isDrawingRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    if (saveInFlightRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    saveInFlightRef.current = true;
    setSaving(true);

    try {
      const idx = idxOverride ?? currentIdxRef.current;
      const strokeData = canvasRef.current.getStrokes();
      const payload = JSON.stringify({ ...strokeData, normalized: true });

      const updated = dataByIdxRef.current.map((item, i) =>
        i === idx ? { ...item, strokes_data: payload } : item
      );

      // Update local state immediately so re-renders work
      if (setDataByIdx) {
        setDataByIdx(updated);
        dataByIdxRef.current = updated;
      }

      await onSave(updated);
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);

      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        void save();
      }
    }
  }, [onSave, setSaving, setDataByIdx]);

  // Load logic
  const load = useCallback((page, key) => {
    if (!canvasRef.current || !page || !key) return;
    if (loadedKeyRef.current === key) return;
    loadedKeyRef.current = key;

    canvasRef.current.clearStrokes();
    if (page.strokes_data) {
      try {
        canvasRef.current.loadStrokes(JSON.parse(page.strokes_data));
      } catch {
        canvasRef.current.clearStrokes();
      }
    } else if (page.strokes && page.strokes.length > 0) {
      try {
        canvasRef.current.loadStrokes({ strokes: page.strokes, normalized: true });
      } catch {
        canvasRef.current.clearStrokes();
      }
    }
  }, []);

  const handleStrokeStart = useCallback(() => {
    isDrawingRef.current = true;
  }, []);

  const handleStrokeEnd = useCallback(() => {
    isDrawingRef.current = false;
    void save();
  }, [save]);

  // Auto-save every 20s
  useEffect(() => {
    const interval = setInterval(() => void save(), 20000);
    return () => clearInterval(interval);
  }, [save]);

  // Save on visibility change / page hide
  useEffect(() => {
    const onHide = () => void save();
    const onVis = () => { if (document.visibilityState === 'hidden') void save(); };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [save]);

  const invalidateLoadKey = () => { loadedKeyRef.current = null; };

  return {
    save,
    load,
    handleStrokeStart,
    handleStrokeEnd,
    invalidateLoadKey,
  };
}