import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

// Font preview page — type any word and see it rendered in ZBKidLettersArrowDot
// (the arrow+number tracing font) on handwriting guide lines, same as the
// NounPractice print sheets. Lets the teacher preview how words will look
// before committing them to a print sheet.
export default function FontPreview() {
  const [text, setText] = useState('hola');
  const [fontSize, setFontSize] = useState(1.2);
  const [vOffset, setVOffset] = useState(0);
  const [zoom, setZoom] = useState(1);

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
          <h1 className="text-xl font-black text-slate-800">Font Preview</h1>
          <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700">
            ZBKidLettersArrowDot
          </span>
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
        </div>

        {/* Preview */}
        <div className="np-zoom-container" style={{ '--np-zoom': zoom }}>
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
                      {/* Sky band */}
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${g}in`, background: '#dceaf9' }} />
                      {/* Grass band */}
                      <div style={{ position: 'absolute', top: `${g}in`, left: 0, right: 0, height: `${g}in`, background: '#e8f5e9' }} />
                      {/* Dirt band */}
                      <div style={{ position: 'absolute', top: `${2 * g}in`, left: 0, right: 0, height: `${g}in`, background: '#f5ebe0' }} />
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
                          left: '0.2in',
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