import React from 'react';

// Green background (#92D050) + black checkmark when checked.
// Blacked-out cells (digraphs, 2nd occurrence Letra) render solid black.
export function CheckCell({ checked, onClick, readOnly, blackedOut }) {
  if (blackedOut) {
    return <div className="w-full h-full bg-black" />;
  }
  return (
    <button
      onClick={readOnly ? undefined : onClick}
      disabled={readOnly}
      className={`w-full min-h-7 py-1 flex items-center justify-center transition ${
        checked ? 'bg-[#92D050] text-black' : 'text-transparent hover:bg-gray-100'
      } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <span className="text-base font-bold leading-none">✓</span>
    </button>
  );
}

export default CheckCell;