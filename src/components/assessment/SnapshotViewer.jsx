import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';
import PdfPageRenderer from '@/components/notebook/PdfPageRenderer';

/**
 * Read-only viewer for a saved assessment snapshot.
 */
export default function SnapshotViewer({ snapshot, template, onBack }) {
  const pages = template.pages || [];
  const totalPages = pages.length || 1;
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [pdfRenderedSize, setPdfRenderedSize] = useState(null);
  const canvasRef = useRef(null);
  const loadedKeyRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !pdfRenderedSize) return;
    const key = `${snapshot.id}-${currentPageIdx}-${pdfRenderedSize.w}`;
    if (loadedKeyRef.current === key) return;
    loadedKeyRef.current = key;
    const pageData = snapshot.strokes_by_page?.[String(currentPageIdx)];
    if (pageData) {
      try { canvasRef.current.loadStrokes(JSON.parse(pageData)); }
      catch { canvasRef.current.clearStrokes(); }
    } else {
      canvasRef.current.clearStrokes();
    }
  }, [currentPageIdx, snapshot.id, pdfRenderedSize]);

  const currentPageData = pages[currentPageIdx];

  return (
    <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
      className="absolute inset-0 z-50 flex flex-col" style={{ background: '#0f0f1a' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ background: '#1a1a2e', borderBottom: '2px solid #7c3aed' }}>
        <button onClick={onBack} className="text-purple-300 hover:text-white font-bold text-sm">← Back</button>
        <div className="flex-1">
          <p className="text-white font-black text-sm">{snapshot.label || 'Saved Session'}</p>
          <p className="text-purple-400 text-xs">
            📅 {new Date(snapshot.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · Read-only
          </p>
        </div>
        <span className="text-purple-300 text-xs font-bold">Page {currentPageIdx + 1}/{totalPages}</span>
      </div>

      {/* Page strip */}
      {totalPages > 1 && (
        <div className="flex gap-1.5 px-3 py-1.5 overflow-x-auto shrink-0" style={{ background: '#111122', borderBottom: '1px solid #2d2d5e' }}>
          {pages.map((_, i) => (
            <button key={i} onClick={() => { setPdfRenderedSize(null); loadedKeyRef.current = null; setCurrentPageIdx(i); }}
              className={`flex-shrink-0 w-12 h-16 rounded-lg border-2 flex items-center justify-center text-xs font-bold transition-all
                ${currentPageIdx === i ? 'border-purple-400 text-white' : 'border-purple-900 text-purple-600 opacity-60'}`}
              style={{ background: '#1a1a2e' }}>
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* Canvas area — read-only */}
      <div className="flex-1 overflow-auto" style={{ background: '#e8e8e8' }}>
        {currentPageData ? (
          <div style={{ position: 'relative', width: '100%' }}>
            {currentPageData.type === 'blank' ? (
              <div style={{ width: '100%', paddingBottom: '129%', background: 'white', position: 'relative' }}
                ref={el => {
                  if (el && !pdfRenderedSize) {
                    const r = el.getBoundingClientRect();
                    if (r.width > 0) setPdfRenderedSize({ w: Math.round(r.width), h: Math.round(r.width * 1.29) });
                  }
                }} />
            ) : currentPageData.type === 'pdf' && currentPageData.url ? (
              <PdfPageRenderer
                pdfUrl={currentPageData.url}
                pageNumber={currentPageData.pdfPage || 1}
                onRendered={(w, h) => setPdfRenderedSize({ w, h })}
              />
            ) : currentPageData.url ? (
              <img src={currentPageData.url} alt={`page ${currentPageIdx + 1}`}
                style={{ width: '100%', display: 'block' }}
                onLoad={e => setPdfRenderedSize({ w: e.target.offsetWidth, h: e.target.offsetHeight })} />
            ) : null}

            {pdfRenderedSize && (
              <AnnotationCanvas
                ref={canvasRef}
                width={pdfRenderedSize.w}
                height={pdfRenderedSize.h}
                color="#dc2626" size={4} tool="none" mode="none"
                passThrough={true}
              />
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400">No pages</p>
          </div>
        )}
      </div>

      {/* Page nav */}
      {totalPages > 1 && (
        <div className="shrink-0 flex items-center justify-center gap-3 py-2"
          style={{ background: '#1a1a2e', borderTop: '2px solid #7c3aed' }}>
          <button onClick={() => { setPdfRenderedSize(null); loadedKeyRef.current = null; setCurrentPageIdx(i => Math.max(0, i - 1)); }}
            disabled={currentPageIdx === 0}
            className="w-10 h-10 rounded-xl font-black text-white text-lg flex items-center justify-center disabled:opacity-30"
            style={{ background: '#7c3aed' }}>‹</button>
          <span className="text-white font-bold text-sm">{currentPageIdx + 1} / {totalPages}</span>
          <button onClick={() => { setPdfRenderedSize(null); loadedKeyRef.current = null; setCurrentPageIdx(i => Math.min(totalPages - 1, i + 1)); }}
            disabled={currentPageIdx >= totalPages - 1}
            className="w-10 h-10 rounded-xl font-black text-white text-lg flex items-center justify-center disabled:opacity-30"
            style={{ background: '#7c3aed' }}>›</button>
        </div>
      )}
    </motion.div>
  );
}