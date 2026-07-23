import { SWATCHES } from '@/lib/activities/palette';

const MIN = 2, MAX = 6;

// Teacher palette editor for the phoneme-manipulation activity: pick the
// counter colors and how many (default 2). Shown in the Activities config bar.
export default function PaletteEditor({ palette, onChange }) {
  function setColor(i, hex) { onChange(palette.map((h, idx) => (idx === i ? hex : h))); }
  function add() { if (palette.length < MAX) onChange([...palette, SWATCHES[palette.length % SWATCHES.length]]); }
  function remove() { if (palette.length > MIN) onChange(palette.slice(0, -1)); }
  return (
    <div className="flex flex-col w-full sm:w-auto">
      <label className="text-xs font-bold text-gray-600">Fichas de color ({palette.length})</label>
      <div className="flex items-center gap-2 flex-wrap mt-0.5">
        {palette.map((h, i) => (
          <input
            key={i}
            type="color"
            value={h}
            onChange={(e) => setColor(i, e.target.value)}
            className="w-8 h-8 rounded-md cursor-pointer border border-slate-300 bg-white p-0.5"
            aria-label={`Color ${i + 1}`}
          />
        ))}
        <button type="button" onClick={remove} disabled={palette.length <= MIN} className="w-8 h-8 rounded-lg border border-slate-300 bg-white font-bold disabled:opacity-30">−</button>
        <button type="button" onClick={add} disabled={palette.length >= MAX} className="w-8 h-8 rounded-lg border border-slate-300 bg-white font-bold disabled:opacity-30">+</button>
      </div>
      <span className="text-xs text-gray-500 mt-1">Elige los colores y cuántas fichas. Por defecto 2.</span>
    </div>
  );
}