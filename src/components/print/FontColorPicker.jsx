import { Pipette } from 'lucide-react';

const PRESETS = ['#2e7d32', '#000000', '#1d4ed8', '#dc2626', '#7c3aed', '#ea580c', '#db2777', '#0d9488'];

// Font color for the handwriting handout: preset swatches, a native color
// picker, and an eyedropper (Chrome/Edge EyeDropper API) to grab a color
// from anywhere on screen.
export default function FontColorPicker({ color, onChange }) {
  const openEyedropper = async () => {
    if (!window.EyeDropper) return;
    try {
      const ed = new window.EyeDropper();
      const { sRGBHex } = await ed.open();
      onChange(sRGBHex);
    } catch { /* cancelled */ }
  };

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-bold text-slate-600">Color</label>
      <div className="flex items-center gap-1">
        {PRESETS.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            title={c}
            className={`h-6 w-6 rounded-full border-2 ${color.toLowerCase() === c ? 'border-slate-800 ring-2 ring-slate-300' : 'border-slate-200'}`}
            style={{ background: c }}
          />
        ))}
      </div>
      <input
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-9 cursor-pointer rounded border border-slate-200 bg-white p-0"
        title="Custom color"
      />
      <button
        onClick={openEyedropper}
        disabled={!window.EyeDropper}
        title={window.EyeDropper ? 'Pick a color from the screen' : 'Eyedropper not supported in this browser'}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
      >
        <Pipette className="h-4 w-4" />
        Pick
      </button>
    </div>
  );
}