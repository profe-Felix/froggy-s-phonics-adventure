import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { ChevronDown } from 'lucide-react';

// Green class avatar (count in the circle, class name below) with a dropdown
// to switch the active class. Clicking a class updates ?class= everywhere in
// the teacher view so the launcher + bookshelf refill.
export default function ClassToggle({ activeClass, classes, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const { data: count = 0 } = useQuery({
    queryKey: ['class-student-count', activeClass, ACTIVE_SCHOOL_YEAR],
    queryFn: () =>
      base44.entities.Student.count({
        class_name: activeClass,
        school_year: ACTIVE_SCHOOL_YEAR,
      }),
    enabled: !!activeClass,
  });

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

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
            background: '#2ecc71',
            border: '2px solid #ffffff',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: 16,
          }}
        >
          {count || (activeClass ? activeClass[0] : '?')}
        </span>
        <span className="hidden sm:flex flex-col items-start leading-tight">
          <span className="text-xs font-bold text-white">{activeClass}</span>
          <span className="text-[10px] text-white/50">switch class</span>
        </span>
        <ChevronDown className="w-4 h-4 text-white/60" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-44 rounded-xl bg-white py-1 shadow-2xl border border-slate-200">
          {classes.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                onSelect(c);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm font-bold hover:bg-slate-50 ${
                c === activeClass ? 'text-emerald-600' : 'text-slate-700'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}