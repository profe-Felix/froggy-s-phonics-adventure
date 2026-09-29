import React from 'react';
import { Volume2 } from 'lucide-react';
import { playTts } from '@/lib/audio';
import SentenceWritingLines from './SentenceWritingLines';

// A single numbered sentence-writing area with SVG handwriting guide lines
// (matching Letter/Name Tracing size + emoji guys), a faint model sentence
// printed large on the top guide line, a TTS speaker button, two blank
// practice lines for freehand writing, and an optional text input for typed entry.
export default function SentenceWritingArea({
  index, row, sentenceText,
  tool, color, size,
  onStrokeStart, onStrokeEnd, onActivateCanvas,
  onTypedTextChange, onSelfCheckChange,
  active, onActivate,
  canvasRef,
}) {
  const handlePlay = (e) => {
    e.stopPropagation();
    if (sentenceText) playTts(sentenceText, 'es', 0.85);
  };

  return (
    <div
      className={`rounded-xl border-2 transition-all ${active ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-300'}`}
      onClick={onActivate}
    >
      {/* Row number + mode badge + TTS speaker */}
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
        <div className="flex-1" />
        {sentenceText && (
          <button
            onClick={handlePlay}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-white bg-indigo-500 hover:bg-indigo-600 active:scale-95 transition-all"
            title="Escuchar la oración"
          >
            <Volume2 className="w-3.5 h-3.5" /> Escuchar
          </button>
        )}
      </div>

      {/* Writing area — model sentence on top guide line + 2 practice lines */}
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
          lineCount={2}
          modelText={sentenceText || ''}
        />
      </div>

    </div>
  );
}