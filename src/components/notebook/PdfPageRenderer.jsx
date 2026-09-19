import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

const pdfCache = new Map();
const pageCache = new Map();
const MAX_CACHED_PAGES = 16;

function getPageCacheKey(pdfUrl, pageNumber) {
  return `${pdfUrl}::${pageNumber}`;
}

function trimPageCache(protectedKey) {
  while (pageCache.size > MAX_CACHED_PAGES) {
    const oldestKey = pageCache.keys().next().value;

    if (!oldestKey) return;

    if (oldestKey === protectedKey) {
      const protectedValue = pageCache.get(oldestKey);
      pageCache.delete(oldestKey);
      pageCache.set(oldestKey, protectedValue);
      continue;
    }

    pageCache.delete(oldestKey);
  }
}

function getCachedPdfDocument(pdfUrl) {
  if (!pdfCache.has(pdfUrl)) {
    const documentPromise = pdfjsLib.getDocument({
      url: pdfUrl,
      withCredentials: false,
      disableAutoFetch: false,
      disableStream: false,
    }).promise.catch((error) => {
      pdfCache.delete(pdfUrl);

      for (const key of pageCache.keys()) {
        if (key.startsWith(`${pdfUrl}::`)) {
          pageCache.delete(key);
        }
      }

      throw error;
    });

    pdfCache.set(pdfUrl, documentPromise);
  }

  return pdfCache.get(pdfUrl);
}

function getCachedPdfPage(pdfUrl, document, pageNumber) {
  const safePageNumber = Math.max(
    1,
    Math.min(document.numPages, pageNumber)
  );

  const key = getPageCacheKey(pdfUrl, safePageNumber);

  if (!pageCache.has(key)) {
    const pagePromise = document
      .getPage(safePageNumber)
      .catch((error) => {
        pageCache.delete(key);
        throw error;
      });

    pageCache.set(key, pagePromise);
    trimPageCache(key);
  } else {
    // Move recently used pages to the end of the Map.
    const cachedPromise = pageCache.get(key);
    pageCache.delete(key);
    pageCache.set(key, cachedPromise);
  }

  return pageCache.get(key);
}

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
  const lastReportedSizeRef = useRef({ w: 0, h: 0 });
  const resizeFrameRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      const nextWidth = Math.round(width);
      const nextHeight = Math.round(height);

      if (nextWidth <= 10) return;

      if (resizeFrameRef.current) {
        cancelAnimationFrame(resizeFrameRef.current);
      }

      resizeFrameRef.current = requestAnimationFrame(() => {
        setContainerSize((current) => {
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

    obs.observe(el);

    return () => {
      obs.disconnect();

      if (resizeFrameRef.current) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, []);

  const reportRenderedSize = (width, height) => {
    const previous = lastReportedSizeRef.current;

    if (
      Math.abs(previous.w - width) < 0.1 &&
      Math.abs(previous.h - height) < 0.1
    ) {
      return;
    }

    lastReportedSizeRef.current = {
      w: width,
      h: height,
    };

    if (onRendered) {
      onRendered(width, height);
    }
  };

  useEffect(() => {
    // A new page must report its authoritative dimensions even when they are
    // numerically identical to the previous page. The notebook may be waiting
    // for that notification to synchronize its annotation layer.
    lastReportedSizeRef.current = {
      w: 0,
      h: 0,
    };
  }, [pdfUrl, pageNumber]);

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
      scale = availableW / vp.width;
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
    reportRenderedSize(dims.w, dims.h);
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
        const doc = await getCachedPdfDocument(pdfUrl);
        if (cancelled) return;

        const safePageNumber = Math.max(
          1,
          Math.min(doc.numPages, pageNumber)
        );

        const page = await getCachedPdfPage(
          pdfUrl,
          doc,
          safePageNumber
        );
        if (cancelled) return;

        const canvas = canvasRef.current;

        // Warm only the next page. The bounded cache ensures this happens once
        // per page instead of on every resize or fit-mode change.
        if (safePageNumber < doc.numPages) {
          void getCachedPdfPage(
            pdfUrl,
            doc,
            safePageNumber + 1
          ).catch(() => {
            // A failed preload must not affect the current page.
          });
        }
        
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

        const dpr = Math.min(window.devicePixelRatio || 1, 2);

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
        // Re-sync only if the displayed dimensions actually changed.
        reportRenderedSize(dims.w, dims.h);
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