import { useState } from 'react';
import { Check } from 'lucide-react';
import { useClassColors } from '@/hooks/useClassColors';

// Small swatch shown beside a class name in the teacher dashboard. Clicking
// opens a popover of the full palette; selecting one persists a ClassConfig
// record so the class's login tiles update everywhere.
export default function ClassColorPicker({ className }) {
  const { colorFor, setColor, palette } = useClassColors();
  const [open, setOpen] = useState(false);
  const current = colorFor(className);

  return (
    <span className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-4 h-4 rounded-full ring-2 ring-white shadow-sm shrink-0"
        style={{ backgroundImage: `linear-gradient(to bottom right, ${current.from}, ${current.to})` }}
        title={`Class color: ${current.name} — click to change`}
        aria-label={`Change color for class ${className}`}
      />
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-2 left-0 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 grid grid-cols-4 gap-2 w-56">
            {Object.entries(palette).map(([key, p]) => (
              <button
                key={key}
                onClick={() => { setColor(className, key); setOpen(false); }}
                className="w-9 h-9 rounded-lg ring-2 ring-white shadow flex items-center justify-center transition hover:scale-110"
                style={{ backgroundImage: `linear-gradient(to bottom right, ${p.from}, ${p.to})` }}
                title={p.name}
              >
                {current.from === p.from && current.to === p.to ? (
                  <Check className="w-4 h-4 text-white drop-shadow" />
                ) : null}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}