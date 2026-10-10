import { Save, Loader2, Check, RotateCcw } from 'lucide-react';

// Letter size + shift sliders, stored relative to the line height so the
// saved alignment scales automatically with rows / page orientation.
// When showDots is true, a second row adjusts the dots-only (waypoint) font
// size + shift so it can be lined up with the arrow-dot letters.
export default function AlignmentControls({ calib, lineGap, showDots = false }) {
  const { fontRatio, shiftRatio, setFontRatio, setShiftRatio, dotsScale, setDotsScale, dotsShiftRatio, setDotsShiftRatio, save, revert, saving, dirty } = calib;
  const shiftIn = shiftRatio * lineGap;
  const dotsShiftIn = dotsShiftRatio * lineGap;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-bold text-slate-600">Letter size</label>
          <input type="range" min="1" max="2.6" step="0.01" value={fontRatio}
            onChange={(e) => setFontRatio(parseFloat(e.target.value))} className="w-28" />
          <span className="w-12 text-sm font-semibold text-slate-500">{(fontRatio * lineGap).toFixed(2)}in</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-bold text-slate-600">Shift ↕</label>
          <input type="range" min="-0.6" max="0.6" step="0.01" value={shiftRatio}
            onChange={(e) => setShiftRatio(parseFloat(e.target.value))} className="w-24" />
          <span className="w-14 text-sm font-semibold text-slate-500">{shiftIn > 0 ? '+' : ''}{shiftIn.toFixed(2)}in</span>
        </div>
        {showDots && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-sm font-bold text-slate-600">Dots size</label>
              <input type="range" min="0.5" max="2" step="0.01" value={dotsScale}
                onChange={(e) => setDotsScale(parseFloat(e.target.value))} className="w-24" />
              <span className="w-10 text-sm font-semibold text-slate-500">{dotsScale.toFixed(2)}×</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-bold text-slate-600">Dots shift ↕</label>
              <input type="range" min="-0.6" max="0.6" step="0.01" value={dotsShiftRatio}
                onChange={(e) => setDotsShiftRatio(parseFloat(e.target.value))} className="w-24" />
              <span className="w-14 text-sm font-semibold text-slate-500">{dotsShiftIn > 0 ? '+' : ''}{dotsShiftIn.toFixed(2)}in</span>
            </div>
          </>
        )}
        <button onClick={save} disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-bold text-white shadow-sm transition hover:bg-green-700 disabled:bg-green-100 disabled:text-green-700">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : dirty ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {dirty ? 'Save alignment' : 'Alignment saved'}
        </button>
        {dirty && (
          <button onClick={revert} title="Undo changes" className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50">
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}