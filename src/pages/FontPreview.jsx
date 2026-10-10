import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { printWithPage } from '@/lib/printWithPage';
import PrintGuideVisual from '@/components/print/PrintGuideVisual';
import WorksheetSaver from '@/components/print/WorksheetSaver';

// Font preview page — type any word and see it rendered in ZBKidLettersArrowDot
// (the arrow+number tracing font) on handwriting guide lines, same as the
// NounPractice print sheets. Lets the teacher preview how words will look
// before committing them to a print sheet.
export default function FontPreview() {
  const [text, setText] = useState(() => localStorage.getItem('fp_text') || 'hola');
  const [fontSize, setFontSize] = useState(() => parseFloat(localStorage.getItem('fp_fontSize')) || 1.2);
  const [vOffset, setVOffset] = useState(() => parseFloat(localStorage.getItem('fp_vOffset')) || 0);
  const [zoom, setZoom] = useState(1);

  // Persist settings so they survive page reloads
  useEffect(() => { localStorage.setItem('fp_text', text); }, [text]);
  useEffect(() => { localStorage.setItem('fp_fontSize', fontSize); }, [fontSize]);
  useEffect(() => { localStorage.setItem('fp_vOffset', vOffset); }, [vOffset]);

  const g = 0.65; // line gap (inches)
  const asc = fontSize * 1.166667;

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

  const words = useMemo(() => text.trim().split(/\s+/).filter(Boolean), [text]);

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <Link
            to="/NounPractice"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <h1 className="text-xl font-black text-slate-800">Handwriting Handout</h1>
          <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700">
            ZBKidLettersArrowDot
          </span>
          <button
            onClick={() => printWithPage('size: letter portrait; margin: 0.25in')}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white shadow-md transition hover:bg-slate-900"
          >
            <Printer className="h-5 w-5" />
            Print
          </button>
        </div>

        {/* Controls */}
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-1 items-center gap-2 min-w-[200px]">
            <label className="text-sm font-bold text-slate-600 whitespace-nowrap">
              Text
            </label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a word..."
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 focus:border-indigo-400 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-bold text-slate-600">Font size</label>
            <input
              type="range"
              min="0.3"
              max="2.0"
              step="0.05"
              value={fontSize}
              onChange={(e) => setFontSize(parseFloat(e.target.value))}
              className="w-28"
            />
            <span className="w-12 text-sm font-semibold text-slate-500">
              {fontSize.toFixed(2)}in
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-bold text-slate-600">Shift ↕</label>
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

          <WorksheetSaver
            text={text}
            fontSize={fontSize}
            vOffset={vOffset}
            onLoad={(s) => { setText(s.text); setFontSize(s.fontSize); setVOffset(s.vOffset); }}
          />
        </div>

        {/* Preview */}
        <div className="np-zoom-container printable" style={{ '--np-zoom': zoom }}>
          <div className="np-scale-wrap">
            <div className="page-preview" style={{ padding: '0.25in' }}>
              {words.length === 0 ? (
                <p className="py-12 text-center text-slate-400">
                  Type a word above to preview the font
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3in' }}>
                  {words.map((word, i) => (
                    <div
                      key={i}
                      style={{
                        height: `${3 * g}in`,
                        position: 'relative',
                      }}
                    >
                      {/* Guide visual — walking figures + fence with colored zones
                          limited to the visual width (saves ink; no color behind letters). */}
                      <PrintGuideVisual lineGap={g} />
                      {/* Sky line */}
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, borderTop: '2px solid #4a90e2' }} />
                      {/* Fence line (dashed midline) */}
                      <div style={{ position: 'absolute', top: `${g}in`, left: 0, right: 0, borderTop: '2px dashed #000000' }} />
                      {/* Base line (grass floor) */}
                      <div style={{ position: 'absolute', top: `${2 * g}in`, left: 0, right: 0, borderTop: '2px solid #43a047' }} />
                      {/* Dirt line */}
                      <div style={{ position: 'absolute', top: `calc(${3 * g}in - 2px)`, left: 0, right: 0, borderTop: '2px solid #4e342e' }} />
                      {/* The word */}
                      <div
                        style={{
                          position: 'absolute',
                          left: '1.4in',
                          top: `${2 * g - asc + vOffset}in`,
                          fontFamily: 'ZBKidLettersArrowDot, ui-sans-serif, sans-serif',
                          fontSize: `${fontSize}in`,
                          color: '#2e7d32',
                          whiteSpace: 'nowrap',
                          lineHeight: 1.7,
                        }}
                      >
                        {word}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}