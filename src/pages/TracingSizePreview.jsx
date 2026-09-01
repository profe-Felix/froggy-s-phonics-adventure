import { useState, useRef, useEffect } from 'react';
import LetterTracingCanvas from '@/components/game/LetterTracingCanvas';
import { LETTER_WAYPOINTS } from '@/components/data/letterWaypoints';
import { NUMBER_WAYPOINTS } from '@/components/data/numberWaypoints';
import { base44 } from '@/api/base44Client';

// LetterTracingCanvas uses equally-spaced guidelines:
// midline=0.367, baseline=0.633 → x-height = 0.266 of SVG height
const X_HEIGHT_FRAC = 0.266;
const ZB_TARGET_PX = 31;

const CURRENT_SCALES = [
  { label: 'Huge', scale: 1.0 },
  { label: 'Big', scale: 0.74 },
  { label: 'Medium', scale: 0.55 },
  { label: 'Small', scale: 0.40 },
  { label: 'Tiny', scale: 0.30 },
  { label: 'Paper', scale: 0.22 },
];

const SAMPLE_LETTERS = ['a', 'h', 'p', 'o', 'e'];

export default function TracingSizePreview() {
  const [scale, setScale] = useState(0.22);
  const [letter, setLetter] = useState('a');
  const [waypoints, setWaypoints] = useState({ ...LETTER_WAYPOINTS, ...NUMBER_WAYPOINTS });
  const containerRef = useRef(null);

  // Load DB waypoints (same merge logic as the real game)
  useEffect(() => {
    let cancelled = false;
    base44.entities.LetterWaypoint.list().then((records) => {
      if (cancelled || !Array.isArray(records)) return;
      setWaypoints((prev) => {
        const merged = { ...prev };
        for (const r of records) {
          if (!r.letter || !r.strokes_data) continue;
          try {
            const strokes = JSON.parse(r.strokes_data);
            if (Array.isArray(strokes) && strokes.length) {
              merged[r.letter] = { strokes, hint: r.hint || prev[r.letter]?.hint || '' };
            }
          } catch {}
        }
        return merged;
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Measure the container so we can compute renderWidth from the scale.
  // LetterTracingCanvas clamps fillHeight width to ≥200px, which blocks
  // small scale values — so we use renderWidth (no fillHeight) instead.
  const [containerH, setContainerH] = useState(500);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const r = container.getBoundingClientRect();
      if (r.height > 0) setContainerH(r.height);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Canvas is 300×375 (4:5). Max width = container height × aspect ratio.
  const maxRenderW = containerH * (300 / 375);
  const renderWidth = Math.max(60, maxRenderW * scale);
  // x-height = 0.266 of SVG height; SVG height = renderWidth × (375/300)
  const svgH = renderWidth * (375 / 300);
  const xHeightPx = Math.round(svgH * X_HEIGHT_FRAC);
  const letterData = waypoints[letter];
  const strokes = letterData?.strokes;

  return (
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden">
      {/* Compact header */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0">
        <h1 className="text-lg font-bold">Tracing Size Preview</h1>
        <div className="flex items-center gap-2">
          {SAMPLE_LETTERS.map(l => (
            <button
              key={l}
              onClick={() => setLetter(l)}
              className={`w-8 h-8 rounded-lg font-bold text-sm border-2 transition ${
                letter === l
                  ? 'bg-indigo-500 text-white border-indigo-500'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
              }`}
            >
              {l}
            </button>
          ))}
          <a href="/" className="ml-3 text-xs text-slate-500 hover:text-slate-700 underline">Back</a>
        </div>
      </div>

      {/* Canvas area — fills available space */}
      <div ref={containerRef} className="flex-1 min-h-0 flex items-center justify-center px-4 pb-2">
        {strokes ? (
          <LetterTracingCanvas
            key={letter}
            letter={letter}
            strokes={strokes}
            renderWidth={renderWidth}
            silent
            showGuide
            onComplete={() => {}}
            onReset={() => {}}
          />
        ) : (
          <p className="text-slate-400">No waypoints for '{letter}'</p>
        )}
      </div>

      {/* Controls — directly below canvas, always visible */}
      <div className="shrink-0 bg-white border-t-2 border-slate-200 px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-xs text-slate-400 uppercase tracking-wide">Scale </span>
              <span className="text-xl font-bold text-indigo-600 tabular-nums">{scale.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 uppercase tracking-wide">x-height </span>
              <span className={`text-xl font-bold tabular-nums ${xHeightPx === ZB_TARGET_PX ? 'text-green-600' : 'text-slate-700'}`}>{xHeightPx}px</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 uppercase tracking-wide">Target </span>
              <span className="text-xl font-bold text-amber-600 tabular-nums">{ZB_TARGET_PX}px</span>
            </div>
          </div>
        </div>

        <input
          type="range"
          min="0.10"
          max="1.00"
          step="0.01"
          value={scale}
          onChange={(e) => setScale(parseFloat(e.target.value))}
          className="w-full accent-indigo-600"
        />

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-400">Tiers:</span>
          {CURRENT_SCALES.map(t => (
            <button
              key={t.label}
              onClick={() => setScale(t.scale)}
              className={`px-2.5 py-1 rounded-full text-xs font-bold border transition ${
                Math.abs(scale - t.scale) < 0.005
                  ? 'bg-indigo-500 text-white border-indigo-500'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}