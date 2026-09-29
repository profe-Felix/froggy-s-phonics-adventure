import React from 'react';
import SentenceWritingLines from './SentenceWritingLines';
import SelfChecks from './SelfChecks';

// A single numbered sentence-writing area with SVG handwriting guide lines
// (matching Letter/Name Tracing size + emoji guys), an annotation canvas
// overlay for freehand writing, and an optional text input for typed entry.
export default function SentenceWritingArea({
  index, row, sentenceText,
  tool, color, size,
  onStrokeStart, onStrokeEnd, onActivateCanvas,
  onTypedTextChange, onSelfCheckChange,
  active, onActivate,
  canvasRef,
}) {
  return (
    <div
      className={`rounded-xl border-2 transition-all ${active ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-300'}`}
      onClick={onActivate}
    >
      {/* Row number + mode badge */}
      <div className="flex items-center gap-2 px-2 pt-2">
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-800 text-white text-sm font-bold">
          {index + 1}
        </span>
        <span className="text-xs font-bold text-slate-500">
          {row.mode === '3part' ? '3 partes' : '2 partes'}
        </span>
        {active && (
          <span className="text-[10px] font-bold text-indigo-500 animate-pulse">✏️ Editando</span>
        )}
      </div>

      {/* Assembled sentence guide */}
      {sentenceText && (
        <p className="px-3 pt-1 text-sm font-medium text-slate-400 italic">
          {sentenceText}
        </p>
      )}

      {/* Writing area — SVG handwriting lines + canvas overlay */}
      <div className="mx-2 mt-1 mb-1">
        <SentenceWritingLines
          row={row}
          canvasRef={canvasRef}
          tool={tool}
          color={color}
          size={size}
          onStrokeStart={onStrokeStart}
          onStrokeEnd={onStrokeEnd}
          onActivateCanvas={onActivateCanvas}
          onActivate={onActivate}
        />
      </div>

      {/* Typed text input */}
      <div className="px-2 pb-2">
        <input
          type="text"
          value={row.typed_text || ''}
          onChange={(e) => onTypedTextChange(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="Escribe tu oración aquí..."
          className="w-full text-sm border-b border-slate-300 bg-transparent px-1 py-0.5 focus:border-indigo-400 focus:outline-none"
          style={{ fontFamily: "'Andika', sans-serif" }}
        />
      </div>
    </div>
  );
}