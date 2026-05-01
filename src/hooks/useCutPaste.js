import { useState, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * useCutPaste — manages cut pieces for one notebook session page.
 *
 * pdfWrapperRef: ref to the element that renders the PDF (used to capture pixel region).
 * session / currentPage / onSessionUpdate: for persistence.
 */
export default function useCutPaste({ pdfWrapperRef, session, currentPage, onSessionUpdate }) {
  const [pieces, setPieces] = useState([]);
  const [selectedPieceId, setSelectedPieceId] = useState(null);
  const [clipboard, setClipboard] = useState(null); // piece data ready to paste on another page
  const loadedPageRef = useRef(null);

  // ── Load pieces for the current page from session ───────────────────────
  const loadPiecesForPage = useCallback((sess, page) => {
    const key = `cut_pieces_${page}`;
    const raw = sess?.voice_notes_by_page?.[key];
    if (!raw) { setPieces([]); return; }
    try { setPieces(JSON.parse(raw)); } catch { setPieces([]); }
  }, []);

  // Call this whenever page or session changes
  const syncFromSession = useCallback((sess, page) => {
    const key = `${sess?.id}-${page}`;
    if (loadedPageRef.current === key) return;
    loadedPageRef.current = key;
    loadPiecesForPage(sess, page);
    setSelectedPieceId(null);
  }, [loadPiecesForPage]);

  // ── Persist pieces to session ────────────────────────────────────────────
  const savePieces = useCallback(async (newPieces, sess, page) => {
    if (!sess) return;
    const key = `cut_pieces_${page}`;
    const updated = {
      ...(sess.voice_notes_by_page || {}),
      [key]: JSON.stringify(newPieces),
    };
    await base44.entities.NotebookSession.update(sess.id, { voice_notes_by_page: updated });
    onSessionUpdate?.(updated);
  }, [onSessionUpdate]);

  // ── Capture a region of the PDF as an image ──────────────────────────────
  const captureRegion = useCallback(async ({ x, y, w, h }) => {
    if (!pdfWrapperRef?.current) return null;
    const { default: html2canvas } = await import('html2canvas');
    const el = pdfWrapperRef.current;
    const rect = el.getBoundingClientRect();
    const scaleX = el.scrollWidth / rect.width;
    const scaleY = el.scrollHeight / rect.height;

    const canvas = await html2canvas(el, {
      x: x * scaleX,
      y: y * scaleY,
      width: w * scaleX,
      height: h * scaleY,
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
    });
    return canvas.toDataURL('image/png');
  }, [pdfWrapperRef]);

  // ── Handle cut request from LassoLayer ──────────────────────────────────
  const handleCutRequest = useCallback(async ({ x, y, w, h, canvasW, canvasH }) => {
    const imageDataUrl = await captureRegion({ x, y, w, h });
    if (!imageDataUrl) return;

    const newPiece = {
      id: `piece-${Date.now()}`,
      imageDataUrl,
      // Position (top-left of piece) as fraction of container
      x_pct: x / canvasW,
      y_pct: y / canvasH,
      w_pct: w / canvasW,
      h_pct: h / canvasH,
      // Origin dashed box
      originX_pct: x / canvasW,
      originY_pct: y / canvasH,
      sourcePage: currentPage,
    };

    const updated = [...pieces, newPiece];
    setPieces(updated);
    setSelectedPieceId(newPiece.id);
    await savePieces(updated, session, currentPage);
  }, [captureRegion, pieces, session, currentPage, savePieces]);

  // ── Update piece positions (drag) ────────────────────────────────────────
  const handlePiecesUpdate = useCallback(async (newPieces) => {
    setPieces(newPieces);
    await savePieces(newPieces, session, currentPage);
  }, [session, currentPage, savePieces]);

  // ── Delete a selected piece ──────────────────────────────────────────────
  const deleteSelectedPiece = useCallback(async () => {
    if (!selectedPieceId) return;
    const updated = pieces.filter(p => p.id !== selectedPieceId);
    setPieces(updated);
    setSelectedPieceId(null);
    await savePieces(updated, session, currentPage);
  }, [selectedPieceId, pieces, session, currentPage, savePieces]);

  // ── Copy to clipboard (for cross-page paste) ────────────────────────────
  const copyToClipboard = useCallback(() => {
    if (!selectedPieceId) return;
    const piece = pieces.find(p => p.id === selectedPieceId);
    if (piece) setClipboard(piece);
  }, [selectedPieceId, pieces]);

  // ── Paste from clipboard onto current page ───────────────────────────────
  const pasteFromClipboard = useCallback(async () => {
    if (!clipboard) return;
    const newPiece = {
      ...clipboard,
      id: `piece-${Date.now()}`,
      x_pct: 0.1,
      y_pct: 0.1,
      originX_pct: 0.1,
      originY_pct: 0.1,
      sourcePage: currentPage,
    };
    const updated = [...pieces, newPiece];
    setPieces(updated);
    setSelectedPieceId(newPiece.id);
    await savePieces(updated, session, currentPage);
  }, [clipboard, pieces, session, currentPage, savePieces]);

  return {
    pieces,
    selectedPieceId,
    setSelectedPieceId,
    clipboard,
    syncFromSession,
    handleCutRequest,
    handlePiecesUpdate,
    deleteSelectedPiece,
    copyToClipboard,
    pasteFromClipboard,
  };
}