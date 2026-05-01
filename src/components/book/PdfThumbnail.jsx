import { useEffect, useRef, useState } from 'react';

/**
 * Renders page `pageNumber` of a PDF as a small thumbnail.
 * Uses page 2 by default (title page convention).
 */
export default function PdfThumbnail({ pdfUrl, pageNumber = 2, width = 200 }) {
  const canvasRef = useRef(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;

    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
        if (cancelled) return;

        // Use requested page, fall back to page 1 if PDF has only 1 page
        const pageNum = Math.min(pageNumber, pdf.numPages);
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: 1 });
        const scale = width / viewport.width;
        const scaled = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = scaled.width;
        canvas.height = scaled.height;

        await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaled }).promise;
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => { cancelled = true; };
  }, [pdfUrl, pageNumber, width]);

  if (error || !pdfUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center text-4xl" style={{ background: '#0f766e' }}>
        📖
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  );
}