import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

export default function PdfPageRenderer({ pdfUrl, pageNumber }) {
  const canvasRef = useRef(null);
  const [error, setError] = useState(null);
  const renderTask = useRef(null);
  const pdfDoc = useRef(null);

  useEffect(() => {
    if (!pdfUrl) return;
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

        const container = canvas.parentElement;
        const containerWidth = container?.clientWidth || 800;
        const viewport = page.getViewport({ scale: 1 });
        const scale = containerWidth / viewport.width;
        const scaled = page.getViewport({ scale });

        canvas.width = scaled.width;
        canvas.height = scaled.height;

        if (renderTask.current) {
          renderTask.current.cancel();
        }

        renderTask.current = page.render({
          canvasContext: canvas.getContext('2d'),
          viewport: scaled,
        });

        await renderTask.current.promise;
      } catch (e) {
        if (e?.name !== 'RenderingCancelledException') {
          setError('Failed to load PDF');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [pdfUrl, pageNumber]);

  // Reset doc if url changes
  useEffect(() => {
    pdfDoc.current = null;
  }, [pdfUrl]);

  if (error) return <div className="flex items-center justify-center h-full text-red-400">{error}</div>;

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height: 'auto', maxHeight: '100%', objectFit: 'contain' }}
    />
  );
}