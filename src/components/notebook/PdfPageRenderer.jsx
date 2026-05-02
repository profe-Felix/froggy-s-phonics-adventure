import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

const pdfCache = {};

/**
 * PdfPageRenderer
 * fitMode: 'width' (default) — scale to container width (original behavior for notebook)
 *          'contain' — scale to fit both width AND height (for book reader, no scroll)
 */
export default function PdfPageRenderer({ pdfUrl, pageNumber, onRendered, fitMode = 'width', fillHeight = false, alignSelf = 'center' }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  const renderTask = useRef(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    if (!pdfUrl || containerSize.w < 10) return;
    let cancelled = false;

    setError(null);
    setLoading(true);
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

        let scale;
        if (fillHeight && containerSize.h > 10) {
          // Scale to fill height exactly; page may be narrower than container (gap handled by alignment)
          // but never exceed container width (portrait fallback)
          const scaleByH = containerSize.h / viewport.height;
          const scaleByW = containerSize.w / viewport.width;
          scale = Math.min(scaleByH, scaleByW);
        } else if (fitMode === 'contain' && containerSize.h > 10) {
          const scaleW = containerSize.w / viewport.width;
          const scaleH = containerSize.h / viewport.height;
          scale = Math.min(scaleW, scaleH);
        } else {
          scale = containerSize.w / viewport.width;
        }

        const scaled = page.getViewport({ scale });

        canvas.width = scaled.width;
        canvas.height = scaled.height;
        canvas.style.width = scaled.width + 'px';
        canvas.style.height = scaled.height + 'px';

        if (renderTask.current) renderTask.current.cancel();

        renderTask.current = page.render({
          canvasContext: canvas.getContext('2d'),
          viewport: scaled,
        });

        await renderTask.current.promise;
        if (!cancelled) {
          setLoading(false);
          if (onRendered) onRendered(scaled.width, scaled.height);
        }
      } catch (e) {
        if (e?.name !== 'RenderingCancelledException') setError('Failed to load PDF');
      }
    })();

    return () => { cancelled = true; };
  }, [pdfUrl, pageNumber, containerSize.w, containerSize.h, fitMode]);

  if (error) return <div className="flex items-center justify-center h-full text-red-400">{error}</div>;

  const justifyContent = alignSelf === 'flex-start' ? 'flex-start' : alignSelf === 'flex-end' ? 'flex-end' : 'center';

  return (
    <div ref={containerRef} style={{ width: '100%', height: fitMode === 'contain' || fillHeight ? '100%' : 'auto', position: 'relative', display: 'flex', alignItems: 'center', justifyContent, overflow: 'hidden', background: (fitMode === 'contain' || fillHeight) ? '#fff' : undefined }}>
      {loading && (
        <div style={{ position: 'absolute', inset: 0, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e8e8e8' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div className="w-10 h-10 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span style={{ color: '#6366f1', fontWeight: 'bold', fontSize: 13 }}>Loading page…</span>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: 'block', opacity: loading ? 0 : 1, maxWidth: '100%', maxHeight: '100%' }} />
    </div>
  );
}