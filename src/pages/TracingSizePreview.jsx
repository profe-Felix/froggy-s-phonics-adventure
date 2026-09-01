import { useState, useRef, useEffect } from 'react';
import LetterTracingCanvas from '@/components/game/LetterTracingCanvas';
import { LETTER_WAYPOINTS } from '@/components/data/letterWaypoints';

// Current size tiers from LetterTracingMode
const CURRENT_SCALES = [
  { label: 'Huge', scale: 1.0 },
  { label: 'Big', scale: 0.78 },
  { label: 'Medium', scale: 0.60 },
  { label: 'Small', scale: 0.46 },
  { label: 'Paper', scale: 0.34 },
];

// x-height as fraction of canvas height:
// baseline (0.633*375) - midline (0.367*375) = 99.75 / 375 = 0.266
const X_HEIGHT_FRAC = 0.266;
const ZB_TARGET_PX = 31;

const SAMPLE_LETTERS = ['a', 'h', 'p', 'o', 'e'];

export default function TracingSizePreview() {
  const [scale, setScale] = useState(0.34);
  const [letter, setLetter] = useState('a');
  const containerRef = useRef(null);
  const [containerH, setContainerH] = useState(500);

  useEffect(() => {
    if (!containerRef.current) return;
    const measure = () => {
      const r = containerRef.current.getBoundingClientRect();
      if (r.height > 0) setContainerH(r.height);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const xHeightPx = Math.round(containerH * scale * X_HEIGHT_FRAC);
  const letterData = LETTER_WAYPOINTS[letter] || LETTER_WAYPOINTS['a'];
  const strokes = letterData?.strokes || letterData;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col p-4 gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tracing Size Preview</h1>
        <a href="/" className="text-sm text-slate-500 hover:text-slate-700 underline">← Back to app</a>
      </div>

      {/* Controls panel */}
      <div className="bg-white rounded-xl shadow p-5 flex flex-col gap-4">
        {/* Letter picker */}
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm text-slate-600 w-16">Letter:</span>
          <div className="flex gap-2">
            {SAMPLE_LETTERS.map(l => (
              <button
                key={l}
                onClick={() => setLetter(l)}
                className={`w-10 h-10 rounded-lg font-bold text-lg border-2 transition ${
                  letter === l
                    ? 'bg-indigo-500 text-white border-indigo-500'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="font-semibold text-sm text-slate-600">Size Scale</label>
            <span className="text-3xl font-bold text-indigo-600 tabular-nums">{scale.toFixed(2)}</span>
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
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>0.10</span>
            <span>0.25</span>
            <span>0.50</span>
            <span>0.75</span>
            <span>1.00</span>
          </div>
        </div>

        {/* Readout */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-indigo-50 rounded-lg p-3 text-center">
            <div className="text-xs text-slate-500 uppercase tracking-wide">x-height</div>
            <div className={`text-3xl font-bold tabular-nums ${xHeightPx === ZB_TARGET_PX ? 'text-green-600' : 'text-indigo-600'}`}>
              {xHeightPx}px
            </div>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-center">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Zaner-Bloser target</div>
            <div className="text-3xl font-bold text-amber-600 tabular-nums">{ZB_TARGET_PX}px</div>
          </div>
        </div>

        {/* Current tiers table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Current size tiers (at this container height)
          </div>
          <div className="divide-y divide-slate-100">
            {CURRENT_SCALES.map(t => {
              const px = Math.round(containerH * t.scale * X_HEIGHT_FRAC);
              return (
                <div
                  key={t.label}
                  className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 ${
                    Math.abs(scale - t.scale) < 0.005 ? 'bg-indigo-50' : ''
                  }`}
                  onClick={() => setScale(t.scale)}
                >
                  <span className="font-medium text-slate-700">{t.label}</span>
                  <span className="text-slate-500 tabular-nums">scale {t.scale.toFixed(2)}</span>
                  <span className={`font-bold tabular-nums w-16 text-right ${
                    px === ZB_TARGET_PX ? 'text-green-600' : 'text-slate-700'
                  }`}>{px}px</span>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-slate-400">
          Container height: {Math.round(containerH)}px. x-height = container height × scale × 0.266.
          Tap a tier row to jump to that scale. Adjust the slider until the letter matches real Zaner-Bloser paper, then tell me the scale value.
        </p>
      </div>

      {/* Preview canvas */}
      <div
        ref={containerRef}
        className="flex-1 bg-white rounded-xl shadow-lg flex items-center justify-center min-h-[400px]"
      >
        <LetterTracingCanvas
          key={`${letter}-${scale}`}
          letter={letter}
          strokes={strokes}
          fillHeight={true}
          sizeScale={scale}
          silent={true}
          showGuide={true}
          onComplete={() => {}}
          onReset={() => {}}
        />
      </div>
    </div>
  );
}