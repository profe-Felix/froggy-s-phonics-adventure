import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

// Grade enum → readable label.
const GRADE_LABEL = {
  kinder: 'Kinder',
  first: '1st Grade',
};

// ClassConfig color enum → badge background hex. Keeps each teacher's class
// visually distinct in the header.
const COLOR_HEX = {
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#eab308',
  green: '#22c55e',
  emerald: '#10b981',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  sky: '#0ea5e9',
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  purple: '#a855f7',
  fuchsia: '#d946ef',
  pink: '#ec4899',
  rose: '#f43f5e',
};

// Green class avatar (class initial in the circle, class name + grade below)
// with a dropdown to switch the active class. The grade is looked up from the
// ClassConfig records so the URL's ?class= is all that's needed — the app
// figures out the grade level from there.
export default function ClassToggle({ activeClass, classes, configs = [], onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const activeConfig = configs.find((c) => c.class_name === activeClass);
  const grade = activeConfig?.grade ? GRADE_LABEL[activeConfig.grade] : '';
  const badgeColor = COLOR_HEX[activeConfig?.color] || '#2ecc71';
  const initial = activeClass ? activeClass[0].toUpperCase() : '?';

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const gradeFor = (name) => {
    const c = configs.find((cfg) => cfg.class_name === name);
    return c?.grade ? GRADE_LABEL[c.grade] : '';
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 select-none"
      >
        <span
          className="flex items-center justify-center rounded-full shadow-lg"
          style={{
            width: 44,
            height: 44,
            background: badgeColor,
            border: '2px solid #ffffff',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: 20,
          }}
        >
          {initial}
        </span>
        <span className="hidden sm:flex flex-col items-start leading-tight">
          <span className="text-xs font-bold text-white">{activeClass}</span>
          <span className="text-[10px] text-white/50">{grade || 'switch class'}</span>
        </span>
        <ChevronDown className="w-4 h-4 text-white/60" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-48 rounded-xl bg-white py-1 shadow-2xl border border-slate-200">
          {classes.map((c) => {
            const g = gradeFor(c);
            const cfg = configs.find((x) => x.class_name === c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onSelect(c);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm font-bold hover:bg-slate-50 flex items-center gap-2 ${
                  c === activeClass ? 'text-emerald-600' : 'text-slate-700'
                }`}
              >
                <span
                  className="w-5 h-5 rounded-full shrink-0"
                  style={{ background: COLOR_HEX[cfg?.color] || '#cbd5e1' }}
                />
                <span className="flex-1">{c}</span>
                {g && <span className="text-[10px] font-medium text-slate-400">{g}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}