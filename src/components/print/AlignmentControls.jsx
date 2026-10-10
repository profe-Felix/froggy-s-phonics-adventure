import { Save, Loader2, Check, RotateCcw } from 'lucide-react';

// Letter size + shift sliders, stored relative to the line height so the
// saved alignment scales automatically with rows / page orientation.
export default function AlignmentControls({ calib, lineGap }) {
  const { fontRatio, shiftRatio, setFontRatio, setShiftRatio, save, revert, saving, dirty } = calib;
  const shiftIn = shiftRatio * lineGap;

  return (
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
  );
}