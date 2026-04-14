import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

// Module-level cache so re-mounting never re-downloads the same PDF
const pdfCache = {};

export default function PdfPageRenderer({ pdfUrl, pageNumber, onRendered }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  const renderTask = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [loading, setLoading] = useState(true);

  // Watch container width via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const w = Math.round(entries[0].contentRect.width);
      if (w > 10) setContainerWidth(w);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);


  // Render whenever url, page, or container width changes
  useEffect(() => {
    if (!pdfUrl || containerWidth < 10) return;
    let cancelled = false;

    setLoading(true);
    (async () => {
      try {
        if (!pdfCache[pdfUrl]) {
          pdfCache[pdfUrl] = pdfjsLib.getDocument({
            url: pdfUrl,
            withCredentials: false,
            disableAutoFetch: false,  // allow full pre-download for fast page turns
            disableStream: false,
          }).promise;
        }
        const doc = await pdfCache[pdfUrl];
        if (cancelled) return;
        // Pre-fetch adjacent pages in the background for faster page turns
        const totalPages = doc.numPages;
        if (pageNumber < totalPages) doc.getPage(pageNumber + 1).catch(() => {});
        if (pageNumber > 1) doc.getPage(pageNumber - 1).catch(() => {});

        const page = await doc.getPage(pageNumber);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const viewport = page.getViewport({ scale: 1 });
        const scale = containerWidth / viewport.width;
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
  }, [pdfUrl, pageNumber, containerWidth]);

  if (error) return <div className="flex items-center justify-center h-full text-red-400">{error}</div>;

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      {loading && (
        <div style={{ position: 'absolute', inset: 0, minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e8e8e8' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div className="w-10 h-10 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span style={{ color: '#6366f1', fontWeight: 'bold', fontSize: 13 }}>Loading page…</span>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', opacity: loading ? 0 : 1 }} />
    </div>
  );
}