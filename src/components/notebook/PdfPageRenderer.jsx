import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

export default function PdfPageRenderer({ pdfUrl, pageNumber, onRendered }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  const renderTask = useRef(null);
  const pdfDoc = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

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

  // Reset doc on url change
  useEffect(() => {
    pdfDoc.current = null;
  }, [pdfUrl]);

  // Render whenever url, page, or container width changes
  useEffect(() => {
    if (!pdfUrl || containerWidth < 10) return;
    let cancelled = false;

    (async () => {
      try {
        if (!pdfDoc.current) {
          pdfDoc.current = await pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false }).promise;
        }
        if (cancelled) return;

        const page = await pdfDoc.current.getPage(pageNumber);
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
        if (!cancelled && onRendered) onRendered(scaled.width, scaled.height);
      } catch (e) {
        if (e?.name !== 'RenderingCancelledException') setError('Failed to load PDF');
      }
    })();

    return () => { cancelled = true; };
  }, [pdfUrl, pageNumber, containerWidth]);

  if (error) return <div className="flex items-center justify-center h-full text-red-400">{error}</div>;

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%' }} />
    </div>
  );
}