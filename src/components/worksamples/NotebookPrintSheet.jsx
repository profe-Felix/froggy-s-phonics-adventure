import React, { useState } from 'react';
import PdfPageRenderer from '@/components/notebook/PdfPageRenderer';
import StaticStrokes from './StaticStrokes';

const PRINT_WIDTH = 680;

function NotebookPagePrint({ pdfUrl, pageNum, strokes }) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  return (
    <div style={{ position: 'relative', width: PRINT_WIDTH, marginBottom: 12, breakInside: 'avoid' }}>
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

// One student's digital notebook: PDF pages with their annotation strokes overlaid.
// `assignment` = DigitalNotebookAssignment (has pdf_url, pdf_page_count, title)
// `session`    = NotebookSession (has strokes_by_page)
export default function NotebookPrintSheet({ student, assignment, session }) {
  const strokesByPage = session?.strokes_by_page || {};

  const pages = Object.keys(strokesByPage)
    .map(Number)
    .filter(n => {
      const d = strokesByPage[String(n)];
      return d && ((d.strokes?.length || 0) > 0 || (d.history?.length || 0) > 0);
    })
    .sort((a, b) => a - b);

  return (
    <div className="ws-print-sheet" style={{ width: PRINT_WIDTH, margin: '0 auto', padding: '0.2in 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
          {student.name || `Estudiante #${student.student_number}`}
        </span>
        <span style={{ fontSize: 11, color: '#64748b' }}>
          {assignment?.title || 'Notebook'} · {student.class_name}
        </span>
      </div>

      {pages.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#999', border: '1px dashed #ccc', borderRadius: 8 }}>
          Sin trabajo
        </div>
      ) : (
        pages.map(p => (
          <NotebookPagePrint
            key={p}
            pdfUrl={assignment?.pdf_url}
            pageNum={p}
            strokes={strokesByPage[String(p)]}
          />
        ))
      )}
    </div>
  );
}