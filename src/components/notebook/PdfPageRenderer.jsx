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


const rasterCache = new Map();
const rasterPromiseCache = new Map();
const MAX_CACHED_RASTERS = 3;

function getRasterCacheKey(
  pdfUrl,
  pageNumber,
  displayWidth,
  displayHeight,
  dpr
) {
  const backingWidth = Math.max(
    1,
    Math.floor(displayWidth * dpr)
  );

  const backingHeight = Math.max(
    1,
    Math.floor(displayHeight * dpr)
  );

  return `${pdfUrl}::${pageNumber}::${backingWidth}x${backingHeight}`;
}

function getCachedRaster(key) {
  if (!rasterCache.has(key)) return null;

  const cachedCanvas = rasterCache.get(key);

  // Move recently used renders to the end of the Map.
  rasterCache.delete(key);
  rasterCache.set(key, cachedCanvas);

  return cachedCanvas;
}

function trimRasterCache(protectedKey) {
  while (rasterCache.size > MAX_CACHED_RASTERS) {
    const oldestKey = rasterCache.keys().next().value;

    if (!oldestKey) return;

    if (oldestKey === protectedKey) {
      const protectedCanvas = rasterCache.get(oldestKey);
      rasterCache.delete(oldestKey);
      rasterCache.set(oldestKey, protectedCanvas);
      continue;
    }

    const oldCanvas = rasterCache.get(oldestKey);

    if (oldCanvas) {
      // Release the large pixel backing store before dropping the reference.
      oldCanvas.width = 1;
      oldCanvas.height = 1;
    }

    rasterCache.delete(oldestKey);
  }
}

function renderPageToCachedRaster({
  key,
  page,
  displayWidth,
  displayHeight,
  dpr,
}) {
  const cachedCanvas = getCachedRaster(key);

  if (cachedCanvas) {
    return Promise.resolve(cachedCanvas);
  }

  if (rasterPromiseCache.has(key)) {
    return rasterPromiseCache.get(key);
  }

  const renderPromise = (async () => {
    const naturalViewport = page.getViewport({ scale: 1 });
    const scale = displayWidth / naturalViewport.width;
    const viewport = page.getViewport({ scale });

    const offscreenCanvas = document.createElement('canvas');

    offscreenCanvas.width = Math.max(
      1,
      Math.floor(displayWidth * dpr)
    );

    offscreenCanvas.height = Math.max(
      1,
      Math.floor(displayHeight * dpr)
    );

    const context = offscreenCanvas.getContext('2d', {
      alpha: false,
    });

    context.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );

    const task = page.render({
      canvasContext: context,
      viewport,
    });

    await task.promise;

    rasterCache.set(key, offscreenCanvas);
    trimRasterCache(key);

    return offscreenCanvas;
  })()
    .catch((error) => {
      rasterCache.delete(key);
      throw error;
    })
    .finally(() => {
      rasterPromiseCache.delete(key);
    });

  rasterPromiseCache.set(key, renderPromise);

  return renderPromise;
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

  // Render the visible page from the completed-raster cache when possible.
  // Afterward, pre-render neighboring pages at the same fit and DPR.
  useEffect(() => {
    if (!pdfUrl || containerSize.w < 10) return;

    let cancelled = false;
    const visibleKey = `${pdfUrl}:${pageNumber}`;
    const isNewPage = renderedKey.current !== visibleKey;

    const calculatePageDimensions = (page) => {
      const viewport = page.getViewport({ scale: 1 });
      const availableW = targetWidth || containerSize.w;
      const availableH = targetHeight || containerSize.h;

      let scale;

      if (fitMode === 'height' && availableH > 10) {
        scale = availableH / viewport.height;
      } else if (fillHeight && availableH > 10) {
        scale = Math.min(
          availableH / viewport.height,
          availableW / viewport.width
        );
      } else if (
        fitMode === 'contain' &&
        availableH > 10
      ) {
        scale = Math.min(
          availableW / viewport.width,
          availableH / viewport.height
        );
      } else {
        scale = availableW / viewport.width;
      }

      return {
        naturalWidth: viewport.width,
        naturalHeight: viewport.height,
        w: viewport.width * scale,
        h: viewport.height * scale,
      };
    };

    const copyRasterToVisibleCanvas = (
      raster,
      displayWidth,
      displayHeight
    ) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = raster.width;
      canvas.height = raster.height;
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;

      const context = canvas.getContext('2d', {
        alpha: false,
      });

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      context.drawImage(raster, 0, 0);
    };

    setError(null);

    (async () => {
      try {
        const document = await getCachedPdfDocument(pdfUrl);
        if (cancelled) return;

        const safePageNumber = Math.max(
          1,
          Math.min(document.numPages, pageNumber)
        );

        const page = await getCachedPdfPage(
          pdfUrl,
          document,
          safePageNumber
        );

        if (cancelled) return;

        const dimensions = calculatePageDimensions(page);

        naturalSizeRef.current = {
          width: dimensions.naturalWidth,
          height: dimensions.naturalHeight,
        };

        // Report the authoritative display size before rasterization finishes.
        // This allows saved ink to load without waiting for the PDF pixels.
        reportRenderedSize(
          dimensions.w,
          dimensions.h
        );

        const visibleCanvas = canvasRef.current;

        if (visibleCanvas) {
          visibleCanvas.style.width = `${dimensions.w}px`;
          visibleCanvas.style.height = `${dimensions.h}px`;
        }

        const dpr = Math.min(
          window.devicePixelRatio || 1,
          3
        );

        const rasterKey = getRasterCacheKey(
          pdfUrl,
          safePageNumber,
          dimensions.w,
          dimensions.h,
          dpr
        );

        const immediatelyCachedRaster =
          getCachedRaster(rasterKey);

        if (immediatelyCachedRaster) {
          copyRasterToVisibleCanvas(
            immediatelyCachedRaster,
            dimensions.w,
            dimensions.h
          );

          renderedKey.current = visibleKey;
          setLoading(false);
        } else {
          if (isNewPage) {
            setLoading(true);
          }

          const raster = await renderPageToCachedRaster({
            key: rasterKey,
            page,
            displayWidth: dimensions.w,
            displayHeight: dimensions.h,
            dpr,
          });

          if (cancelled) return;

          copyRasterToVisibleCanvas(
            raster,
            dimensions.w,
            dimensions.h
          );

          renderedKey.current = visibleKey;
          setLoading(false);
        }

        // Pre-render neighboring pages only after the visible page is ready.
        // The next page is prioritized because students usually move forward.
        const warmPage = async (neighborPageNumber) => {
          if (
            neighborPageNumber < 1 ||
            neighborPageNumber > document.numPages
          ) {
            return;
          }

          const neighborPage = await getCachedPdfPage(
            pdfUrl,
            document,
            neighborPageNumber
          );

          const neighborDimensions =
            calculatePageDimensions(neighborPage);

          const neighborKey = getRasterCacheKey(
            pdfUrl,
            neighborPageNumber,
            neighborDimensions.w,
            neighborDimensions.h,
            dpr
          );

          if (
            rasterCache.has(neighborKey) ||
            rasterPromiseCache.has(neighborKey)
          ) {
            return;
          }

          await renderPageToCachedRaster({
            key: neighborKey,
            page: neighborPage,
            displayWidth: neighborDimensions.w,
            displayHeight: neighborDimensions.h,
            dpr,
          });
        };

        const warmNeighbors = async () => {
          try {
            await warmPage(safePageNumber + 1);
            await warmPage(safePageNumber - 1);
          } catch {
            // Background rendering must never affect the visible page.
          }
        };

        if ('requestIdleCallback' in window) {
          window.requestIdleCallback(
            () => {
              void warmNeighbors();
            },
            { timeout: 800 }
          );
        } else {
          window.setTimeout(() => {
            void warmNeighbors();
          }, 100);
        }
      } catch (error) {
        if (
          !cancelled &&
          error?.name !== 'RenderingCancelledException'
        ) {
          setError('Failed to load PDF');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    pdfUrl,
    pageNumber,
    containerSize.w,
    containerSize.h,
    fitMode,
    fillHeight,
    renderScale,
    targetWidth,
    targetHeight,
  ]);

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