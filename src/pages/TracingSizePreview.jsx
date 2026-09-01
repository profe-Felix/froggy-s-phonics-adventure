import { useState, useRef, useEffect } from 'react';
import { LETTER_WAYPOINTS } from '@/components/data/letterWaypoints';
import { splinePathD } from '@/components/tracing/strokeMath';

const CANVAS_W = 300;
const CANVAS_H = 375;
const ASPECT = CANVAS_W / CANVAS_H; // 0.8

// Guideline positions in the waypoint coordinate system (from letterWaypoints.jsx):
// T=0.10, M=0.42, B=0.72, D=0.92
const GUIDELINES = [
  { y: 0.10, color: '#93c5fd', dash: null, width: 1.5, label: 'cap' },
  { y: 0.42, color: '#93c5fd', dash: '8 6', width: 1, label: 'mid' },
  { y: 0.72, color: '#93c5fd', dash: null, width: 1.5, label: 'base' },
  { y: 0.92, color: '#fca5a5', dash: '6 6', width: 1.5, label: 'desc' },
];

// x-height = baseline - midline = 0.72 - 0.42 = 0.30 of canvas height
const X_HEIGHT_FRAC = 0.30;
const ZB_TARGET_PX = 31;

const CURRENT_SCALES = [
  { label: 'Huge', scale: 1.0 },
  { label: 'Big', scale: 0.78 },
  { label: 'Medium', scale: 0.60 },
  { label: 'Small', scale: 0.46 },
  { label: 'Paper', scale: 0.34 },
];

const SAMPLE_LETTERS = ['a', 'h', 'p', 'o', 'e'];

export default function TracingSizePreview() {
  const [scale, setScale] = useState(0.34);
  const [letter, setLetter] = useState('a');
  const containerRef = useRef(null);
  const [areaH, setAreaH] = useState(500);

  useEffect(() => {
    if (!containerRef.current) return;
    const measure = () => {
      const r = containerRef.current.getBoundingClientRect();
      if (r.height > 0) setAreaH(r.height);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const svgH = areaH * scale;
  const svgW = svgH * ASPECT;
  const xHeightPx = Math.round(svgH * X_HEIGHT_FRAC);

  const letterData = LETTER_WAYPOINTS[letter] || LETTER_WAYPOINTS['a'];
  const strokes = letterData?.strokes || letterData;

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
      <div
        ref={containerRef}
        className="flex-1 min-h-0 flex items-center justify-center px-4"
      >
        <svg
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          style={{ width: `${svgW}px`, height: `${svgH}px` }}
          className="rounded-2xl border-4 border-slate-200 bg-white shadow-lg shrink-0"
        >
          {/* Guidelines matching waypoint coordinate system */}
          {GUIDELINES.map((g, i) => (
            <line
              key={i}
              x1="0"
              y1={g.y * CANVAS_H}
              x2={CANVAS_W}
              y2={g.y * CANVAS_H}
              stroke={g.color}
              strokeWidth={g.width}
              strokeDasharray={g.dash}
              opacity="0.7"
            />
          ))}

          {/* Letter strokes with corner-respecting splines */}
          {strokes.map((stroke, si) => {
            if (!Array.isArray(stroke) || stroke.length < 2) {
              if (stroke.length === 1) {
                return <circle key={si} cx={stroke[0].x * CANVAS_W} cy={stroke[0].y * CANVAS_H} r="5" fill="#8888dd" opacity="0.7" />;
              }
              return null;
            }
            const pts = stroke.map(p => ({ x: p.x * CANVAS_W, y: p.y * CANVAS_H, ...(p.corner ? { corner: true } : {}) }));
            return (
              <path
                key={si}
                d={splinePathD(pts)}
                fill="none"
                stroke="#8888dd"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.7"
              />
            );
          })}
        </svg>
      </div>

      {/* Controls — directly below canvas, always visible */}
      <div className="shrink-0 bg-white border-t-2 border-slate-200 px-4 py-3 flex flex-col gap-2">
        {/* Readout row */}
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

        {/* Slider */}
        <input
          type="range"
          min="0.10"
          max="1.00"
          step="0.01"
          value={scale}
          onChange={(e) => setScale(parseFloat(e.target.value))}
          className="w-full accent-indigo-600"
        />

        {/* Tier quick-jump */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-400">Tiers:</span>
          {CURRENT_SCALES.map(t => {
            const px = Math.round(areaH * t.scale * X_HEIGHT_FRAC);
            return (
              <button
                key={t.label}
                onClick={() => setScale(t.scale)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold border transition ${
                  Math.abs(scale - t.scale) < 0.005
                    ? 'bg-indigo-500 text-white border-indigo-500'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                }`}
              >
                {t.label} <span className="tabular-nums opacity-70">{px}px</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}