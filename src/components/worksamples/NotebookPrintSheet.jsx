import React, { useState } from 'react';
import PdfPageRenderer from '@/components/notebook/PdfPageRenderer';
import StaticStrokes from './StaticStrokes';

// Full 8.5in letter width (printed with zero page margins) = 816px.
const PRINT_WIDTH = 816;
const PRINT_HEIGHT = 1056; // 11in

function NotebookPagePrint({ pdfUrl, pageNum, strokes }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [width, setWidth] = useState(PRINT_WIDTH);

  // If the PDF page is taller than letter, shrink the width so the whole
  // page fits on one 8.5×11 sheet instead of being clipped.
  const handleRendered = (w, h) => {
    if (h > PRINT_HEIGHT + 1) setWidth(Math.floor(w * PRINT_HEIGHT / h));
    else setSize({ w, h });
  };

  return (
    <div className="ws-nb-page" style={{ width: PRINT_WIDTH }}>
      <div style={{ position: 'relative', width, margin: '0 auto' }}>
        <PdfPageRenderer
          key={width}
          pdfUrl={pdfUrl}
          pageNumber={pageNum}
          fitMode="width"
          targetWidth={width}
          onRendered={handleRendered}
        />
        {size.h > 0 && strokes && (
          <div style={{ position: 'absolute', top: 0, left: 0, width: size.w, height: size.h, pointerEvents: 'none' }}>
            <StaticStrokes strokes={strokes} width={size.w} height={size.h} />
          </div>
        )}
      </div>
    </div>
  );
}

// One student's digital notebook: only PDF pages that have annotation strokes.
// No header or footer — each page fills the printed page and breaks to the next.
export default function NotebookPrintSheet({ student, assignment, session }) {
  const strokesByPage = session?.strokes_by_page || {};

  // strokes_by_page values are stored as JSON strings, so parse each.
  const parsedByPage = {};
  for (const key of Object.keys(strokesByPage)) {
    const raw = strokesByPage[key];
    try { parsedByPage[key] = typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch { parsedByPage[key] = null; }
  }

  // Only include pages that have actual strokes on them (not just history).
  const pages = Object.keys(parsedByPage)
    .map(Number)
    .filter(n => {
      const d = parsedByPage[String(n)];
      return d && (d.strokes?.length || 0) > 0;
    })
    .sort((a, b) => a - b);

  if (pages.length === 0) return null;

  return (
    <div className="ws-print-sheet" style={{ width: PRINT_WIDTH, margin: '0 auto' }}>
      {pages.map(p => (
        <NotebookPagePrint
          key={p}
          pdfUrl={assignment?.pdf_url}
          pageNum={p}
          strokes={parsedByPage[String(p)]}
        />
      ))}
    </div>
  );
}