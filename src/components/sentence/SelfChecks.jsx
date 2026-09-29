import React from 'react';
import { Check } from 'lucide-react';

// Self-check checkboxes — capital letter, spaces, final period, legible writing.
// Students tap to toggle each check off/on as they review their sentence.
const CHECKS = [
  { key: 'capital', label: 'Mayúscula', icon: 'Aa' },
  { key: 'spaces', label: 'Espacios', icon: '␣' },
  { key: 'period', label: 'Punto final', icon: '.' },
  { key: 'legible', label: 'Letra clara', icon: '✎' },
];

export default function SelfChecks({ checks = {}, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mt-1">
      {CHECKS.map((c) => {
        const checked = checks[c.key];
        return (
          <button
            key={c.key}
            onClick={() => onChange({ ...checks, [c.key]: !checked })}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border-2 transition-all ${
              checked
                ? 'bg-green-100 border-green-500 text-green-700'
                : 'bg-white border-slate-300 text-slate-500 hover:border-slate-400'
            }`}
          >
            <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px]"
              style={{ borderColor: checked ? '#16a34a' : '#cbd5e1', background: checked ? '#16a34a' : 'transparent' }}>
              {checked && <Check className="w-2.5 h-2.5 text-white" />}
            </span>
            {c.label}
          </button>
        );
      })}
    </div>
  );
}