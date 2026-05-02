import React from 'react';

// All special Spanish characters students might need
const SPECIAL_CHARS = ['á', 'é', 'í', 'ó', 'ú', 'ü', 'ñ', 'Á', 'É', 'Í', 'Ó', 'Ú', 'Ñ', '¿', '¡'];

export default function SpecialCharPicker({ onInsert }) {
  return (
    <div className="flex flex-wrap gap-1.5 justify-center bg-purple-50 border-2 border-purple-200 rounded-2xl px-3 py-2">
      {SPECIAL_CHARS.map(ch => (
        <button
          key={ch}
          type="button"
          onMouseDown={e => { e.preventDefault(); onInsert(ch); }}
          onTouchEnd={e => { e.preventDefault(); onInsert(ch); }}
          className="w-10 h-10 rounded-xl bg-white border-2 border-purple-300 text-purple-800 font-black text-lg hover:bg-purple-100 active:scale-95 transition-all shadow-sm"
        >
          {ch}
        </button>
      ))}
    </div>
  );
}