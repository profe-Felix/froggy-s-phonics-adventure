import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

const pdfCache = {};

/**
 * PdfPageRenderer
 * fitMode: 'width' (default) — scale to container width (original behavior for notebook)
 *          'height' — scale to container height
 *          'contain' — scale to fit both width AND height (for book reader, no scroll)
 *
 * Resize / fit-mode changes are smooth and blink-free:
 *  - The displayed (CSS) size is updated instantly from the cached page aspect
 *    ratio, so the canvas never gets squished by maxWidth/maxHeight and the ink
 *    layer (which tracks the rendered size) stays aligned.
 *  - The crisp backing store is re-rendered to an offscreen canvas and swapped
 *    in only when ready, so there is never a blank frame.
 *  - The "Loading page…" overlay only appears for a brand-new page, not for a
 *    resize of the current one.
 */
export default function PdfPageRenderer({ pdfUrl, pageNumber, onRendered, fitMode = 'width', fillHeight = false, alignSelf = 'center', renderScale = 1, targetWidth, targetHeight }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  const renderTask = useRef(null);
  const renderedKey = useRef('');
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [loading, setLoading] = useState(true);
  // Natural page size at scale 1. Cached after first load so we can compute the
  // display size synchronously on every resize (before any await).
  const naturalSizeRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 10) setContainerSize({ w: Math.round(width), h: Math.round(height) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Figure out the target display size (px) for the current container + fit mode,
  // using the cached page aspect ratio. Returns null until the page is known.
  const computeDisplaySize = () => {
    const vp = naturalSizeRef.current;
    if (!vp || containerSize.w < 10) return null;
    const availableW = targetWidth || containerSize.w;
    const availableH = targetHeight || containerSize.h;
    let scale;
    if (fitMode === 'height' && availableH > 10) {
      scale = availableH / vp.height;
    } else if (fillHeight && availableH > 10) {
      scale = Math.min(availableH / vp.height, availableW / vp.width);
    } else if (fitMode === 'contain' && availableH > 10) {
      scale = Math.min(availableW / vp.width, availableH / vp.height);
    } else {
      scale = containerSize.w / vp.width;
    }
    return { w: vp.width * scale, h: vp.height * scale };
  };

  // Instantly apply the display size (CSS only — no re-render) so the canvas is
  // never squished/blanked during a resize and the ink layer stays aligned. This
  // runs on every container/fit change, even while a backing re-render is pending.
  useEffect(() => {
    const canvas = canvasRef.current;
    const dims = computeDisplaySize();
    if (!dims || !canvas) return;
    canvas.style.width = dims.w + 'px';
    canvas.style.height = dims.h + 'px';
    if (onRendered) onRendered(dims.w, dims.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerSize.w, containerSize.h, fitMode, fillHeight, targetWidth, targetHeight]);

  // Load the page and render the crisp backing store. Re-runs on page / url /
  // size / fit changes; the visible canvas keeps its current pixels (CSS-scaled)
  // until the offscreen render is ready to swap in.
  useEffect(() => {
    if (!pdfUrl || containerSize.w < 10) return;
    let cancelled = false;
    const key = `${pdfUrl}:${pageNumber}`;
    const isNewPage = renderedKey.current !== key;

    setError(null);
    if (isNewPage) setLoading(true);
    (async () => {
      try {
        if (!pdfCache[pdfUrl]) {
          pdfCache[pdfUrl] = pdfjsLib.getDocument({
            url: pdfUrl,
            withCredentials: false,
            disableAutoFetch: false,
            disableStream: false,
          }).promise;
        }
        const doc = await pdfCache[pdfUrl];
        if (cancelled) return;

        const totalPages = doc.numPages;
        if (pageNumber < totalPages) doc.getPage(pageNumber + 1).catch(() => {});
        if (pageNumber > 1) doc.getPage(pageNumber - 1).catch(() => {});

        const page = await doc.getPage(pageNumber);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const viewport = page.getViewport({ scale: 1 });
        naturalSizeRef.current = { width: viewport.width, height: viewport.height };

        const dims = computeDisplaySize();
        if (!dims) return;

        // Keep the displayed size correct while we re-render the backing store.
        canvas.style.width = dims.w + 'px';
        canvas.style.height = dims.h + 'px';

        const scale = dims.w / viewport.width;
        const scaled = page.getViewport({ scale });

        const dpr = Math.min(window.devicePixelRatio || 1, 3);

        // Render offscreen so the visible canvas keeps its current pixels until
        // the new render is ready to swap in (no blank flash).
        const off = document.createElement('canvas');
        off.width = Math.floor(scaled.width * dpr);
        off.height = Math.floor(scaled.height * dpr);
        const offCtx = off.getContext('2d');
        offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        if (renderTask.current) renderTask.current.cancel();

        renderTask.current = page.render({
          canvasContext: offCtx,
          viewport: scaled,
        });

        await renderTask.current.promise;
        if (cancelled) return;

        canvas.width = off.width;
        canvas.height = off.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(off, 0, 0);

        renderedKey.current = key;
        setLoading(false);
        // Re-sync the ink layer now that the freshly-rendered page is in place
        // (same display size; this just ensures the parent has the final dims).
        if (onRendered) onRendered(dims.w, dims.h);
      } catch (e) {
        if (e?.name !== 'RenderingCancelledException') setError('Failed to load PDF');
      }
    })();

    return () => { cancelled = true; };
  }, [pdfUrl, pageNumber, containerSize.w, containerSize.h, fitMode, fillHeight, renderScale, targetWidth, targetHeight]);

  if (error) return <div className="flex items-center justify-center h-full text-red-400">{error}</div>;

  const isFullHeight = fitMode === 'height' || fitMode === 'contain' || fillHeight;
  const justifyContent = alignSelf === 'flex-start' ? 'flex-start' : alignSelf === 'flex-end' ? 'flex-end' : 'center';

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: isFullHeight ? '100%' : 'auto',
        position: 'relative',
        display: 'flex',
        alignItems: isFullHeight ? 'center' : 'flex-start',
        justifyContent,
        overflow: 'hidden',
        background: isFullHeight ? '#fff' : undefined,
      }}
    >
      {loading && (
        <div style={{ position: 'absolute', inset: 0, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e8e8e8' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div className="w-10 h-10 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span style={{ color: '#6366f1', fontWeight: 'bold', fontSize: 13 }}>Loading page…</span>
          </div>
        </div>
      )}
      {/* Explicit CSS dimensions are set in code; no maxWidth/maxHeight so a
          height-fit page can overflow (clipped by the container) without being
          squished/distorted during re-renders. */}
      <canvas ref={canvasRef} style={{ display: 'block', opacity: loading ? 0 : 1 }} />
    </div>
  );
}