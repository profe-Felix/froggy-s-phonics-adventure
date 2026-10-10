import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { printWithPage } from '@/lib/printWithPage';
import HandwritingLines from '@/components/print/HandwritingLines';
import WorksheetSaver from '@/components/print/WorksheetSaver';
import AlignmentControls from '@/components/print/AlignmentControls';
import { useHandwritingCalibration } from '@/hooks/useHandwritingCalibration';
import { PAGE_SIZES, ROW_GAP_IN, fitLineGap } from '@/lib/handwritingLayout';

// Handwriting handout — one word per row on guide lines. Letter size + shift
// come from the shared saved alignment and scale with the row count.
export default function FontPreview() {
  const [text, setText] = useState(() => localStorage.getItem('fp_text') || 'hola');
  const [rows, setRows] = useState(() => parseInt(localStorage.getItem('fp_rows')) || 6);
  const [orientation, setOrientation] = useState(() => localStorage.getItem('fp_orientation') || 'portrait');
  const [zoom, setZoom] = useState(1);
  const calib = useHandwritingCalibration();

  useEffect(() => { localStorage.setItem('fp_text', text); }, [text]);
  useEffect(() => { localStorage.setItem('fp_rows', rows); }, [rows]);
  useEffect(() => { localStorage.setItem('fp_orientation', orientation); }, [orientation]);

  const page = PAGE_SIZES[orientation];
  const g = fitLineGap(rows, page.usable);
  const fontSize = calib.fontRatio * g;
  const vOffset = calib.shiftRatio * g;

  useEffect(() => {
    const updateZoom = () => {
      const available = Math.min(window.innerWidth - 48, 1024);
      setZoom(Math.min(1, available / (page.w * 96)));
    };
    updateZoom();
    window.addEventListener('resize', updateZoom);
    return () => window.removeEventListener('resize', updateZoom);
  }, [page.w]);

  // Paginate words, padding the last page with blank practice rows.
  const pages = useMemo(() => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const count = Math.max(1, Math.ceil(words.length / rows));
    return Array.from({ length: count }, (_, p) =>
      Array.from({ length: rows }, (_, r) => words[p * rows + r] || '')
    );
  }, [text, rows]);

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center gap-3">
          <Link to="/NounPractice" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <h1 className="text-xl font-black text-slate-800">Handwriting Handout</h1>
          <button
            onClick={() => printWithPage(`size: letter ${orientation}; margin: 0.25in`)}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white shadow-md transition hover:bg-slate-900"
          >
            <Printer className="h-5 w-5" />
            Print
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex min-w-[200px] flex-1 items-center gap-2">
            <label className="whitespace-nowrap text-sm font-bold text-slate-600">Text</label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type words (one per row)..."
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 focus:border-indigo-400 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-bold text-slate-600">Rows</label>
            <select value={rows} onChange={(e) => setRows(parseInt(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-bold text-slate-700">
              {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex overflow-hidden rounded-lg border border-slate-200">
            {['portrait', 'landscape'].map((o) => (
              <button key={o} onClick={() => setOrientation(o)}
                className={`px-3 py-1.5 text-sm font-bold capitalize ${orientation === o ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                {o}
              </button>
            ))}
          </div>
          <AlignmentControls calib={calib} lineGap={g} />
          <WorksheetSaver
            values={{ text, rows, orientation }}
            onLoad={(s) => { setText(s.text); setRows(s.rows); setOrientation(s.orientation); }}
          />
        </div>

        <div className="np-zoom-container printable" style={{ '--np-zoom': zoom, width: `calc(${page.w}in * ${zoom})` }}>
          <div className="np-scale-wrap" style={{ width: `${page.w}in` }}>
            {pages.map((words, p) => (
              <div key={p} className="noun-page" style={{ marginBottom: '0.3in' }}>
                <div className="page-preview" style={{ padding: '0.25in', width: `${page.w}in`, minHeight: `${page.h}in` }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: `${ROW_GAP_IN}in` }}>
                    {words.map((word, i) => (
                      <HandwritingLines key={i} word={word} lineGap={g} fontSize={fontSize} vOffset={vOffset} />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}