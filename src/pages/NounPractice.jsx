import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Printer, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { CARDS_BY_CATEGORY } from '@/components/data/sentenceCards';
import NounPracticeSheet from '@/components/print/NounPracticeSheet';
import { printWithPage } from '@/lib/printWithPage';

const NOUNS = CARDS_BY_CATEGORY.who; // 18 "who" nouns from Creando Oraciones

export default function NounPractice() {
  const [page, setPage] = useState(0);
  const [fontSize, setFontSize] = useState(() => parseFloat(localStorage.getItem('np_fontSize')) || 0.95);
  const [vOffset, setVOffset] = useState(() => parseFloat(localStorage.getItem('np_vOffset')) || 0);
  const [rowsPerPage, setRowsPerPage] = useState(() => parseInt(localStorage.getItem('np_rowsPerPage')) || 6);
  const [zoom, setZoom] = useState(1);

  // Persist settings so they survive page reloads
  useEffect(() => { localStorage.setItem('np_fontSize', fontSize); }, [fontSize]);
  useEffect(() => { localStorage.setItem('np_vOffset', vOffset); }, [vOffset]);
  useEffect(() => { localStorage.setItem('np_rowsPerPage', rowsPerPage); }, [rowsPerPage]);

  // Max font size that keeps descenders inside the dirt zone (must match
  // the clamp in NounPracticeSheet). Drives the slider upper bound so the
  // user sees the real limit for the current row count.
  const maxFontSize = lineGap / 0.533333;
  const totalPages = Math.ceil(NOUNS.length / rowsPerPage);

  // Split nouns into pages
  const allPages = useMemo(() => {
    const pages = [];
    for (let i = 0; i < NOUNS.length; i += rowsPerPage) {
      pages.push(NOUNS.slice(i, i + rowsPerPage));
    }
    return pages;
  }, [rowsPerPage]);

  // Auto-fit line gap to page height based on rows per page only.
  const lineGap = useMemo(() => {
    const usableHeight = 10.5;
    const gapBetweenRows = 0.3;
    const totalGaps = (rowsPerPage - 1) * gapBetweenRows;
    return Math.min(0.65, (usableHeight - totalGaps) / (3 * rowsPerPage));
  }, [rowsPerPage]);

  // Scale the 8.5in page down to fit the viewport
  useEffect(() => {
    const updateZoom = () => {
      const available = window.innerWidth - 48;
      const pageWidthPx = 8.5 * 96;
      setZoom(Math.min(1, available / pageWidthPx));
    };
    updateZoom();
    window.addEventListener('resize', updateZoom);
    return () => window.removeEventListener('resize', updateZoom);
  }, []);

  const handlePrint = () => {
    printWithPage('size: letter portrait; margin: 0.25in');
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/CreandoOraciones"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <h1 className="text-xl font-black text-slate-800">
              Noun Practice Sheets
            </h1>
            <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700">
              {NOUNS.length} nouns
            </span>
            <Link
              to="/FontPreview"
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700"
            >
              Font Preview
            </Link>
          </div>

          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white shadow-md transition hover:bg-slate-900"
          >
            <Printer className="h-5 w-5" />
            Print All
          </button>
        </div>

        {/* Controls */}
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-sm font-bold text-slate-700">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-bold text-slate-600">
              Rows
            </label>
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(parseInt(e.target.value));
                setPage(0);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-bold text-slate-700"
            >
              <option value={5}>5</option>
              <option value={6}>6</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-bold text-slate-600">
              Font size
            </label>
            <input
              type="range"
              min="0.3"
              max={maxFontSize}
              step="0.05"
              value={Math.min(fontSize, maxFontSize)}
              onChange={(e) => setFontSize(parseFloat(e.target.value))}
              className="w-28"
            />
            <span className="w-12 text-sm font-semibold text-slate-500">
              {Math.min(fontSize, maxFontSize).toFixed(2)}in
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-bold text-slate-600">
              Shift ↕
            </label>
            <input
              type="range"
              min="-0.3"
              max="0.3"
              step="0.01"
              value={vOffset}
              onChange={(e) => setVOffset(parseFloat(e.target.value))}
              className="w-24"
            />
            <span className="w-16 text-sm font-semibold text-slate-500">
              {vOffset > 0 ? '+' : ''}{vOffset.toFixed(2)}in
            </span>
          </div>
        </div>

        {/* Preview — all pages render; only current shows on screen, all print */}
        <div className="np-zoom-container printable" style={{ '--np-zoom': zoom }}>
          <div className="np-scale-wrap">
            {allPages.map((nouns, i) => (
              <div
                key={i}
                className={`noun-page ${i !== page ? 'noun-page--screen-hidden' : ''}`}
              >
                <NounPracticeSheet nouns={nouns} fontSize={fontSize} lineGap={lineGap} vOffset={vOffset} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}