import React, { useState } from 'react';
import PdfPageRenderer from '@/components/notebook/PdfPageRenderer';
import StaticStrokes from './StaticStrokes';

// Fill the printable area of an 8.5in page with 0.5in margins = 7.5in = 720px.
const PRINT_WIDTH = 720;

function NotebookPagePrint({ pdfUrl, pageNum, strokes }) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  return (
    <div className="ws-nb-page" style={{ position: 'relative', width: PRINT_WIDTH }}>
      <PdfPageRenderer
        pdfUrl={pdfUrl}
        pageNumber={pageNum}
        fitMode="width"
        targetWidth={PRINT_WIDTH}
        onRendered={(w, h) => setSize({ w, h })}
      />
      {size.h > 0 && strokes && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: size.w, height: size.h, pointerEvents: 'none' }}>
          <StaticStrokes strokes={strokes} width={size.w} height={size.h} />
        </div>
      )}
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