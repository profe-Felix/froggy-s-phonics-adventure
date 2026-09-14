import React from 'react';

// Black checkmark on white when checked. No green background (saves ink).
// Blacked-out cells (digraphs, 2nd occurrence Letra) render solid black.
export function CheckCell({ checked, onClick, readOnly, blackedOut }) {
  if (blackedOut) {
    return <div className="w-full h-full bg-black" />;
  }
  return (
    <button
      onClick={readOnly ? undefined : onClick}
      disabled={readOnly}
      className={`w-full min-h-5 py-0.5 flex items-center justify-center transition ${
        checked ? 'text-black' : 'text-transparent hover:bg-gray-100'
      } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <span className="text-sm font-bold leading-none">✓</span>
    </button>
  );
}

// InlineToggle — label: ____ where the underline toggles a black check.
export function InlineToggle({ label, checked, onClick, readOnly }) {
  return (
    <span className="font-bold whitespace-nowrap text-xs">
      {label}:
      <button
        onClick={readOnly ? undefined : onClick}
        disabled={readOnly}
        className={`inline-block w-8 ml-1 border-b-2 border-black text-center leading-tight ${
          readOnly ? 'cursor-default' : 'cursor-pointer'
        }`}
      >
        {checked ? '✓' : '\u00A0'}
      </button>
    </span>
  );
}

export default CheckCell;