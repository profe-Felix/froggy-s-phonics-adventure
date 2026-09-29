import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';

// A single numbered sentence-writing area with handwriting guide lines
// (sky/grass/fence/dirt), an annotation canvas overlay for freehand writing,
// and an optional text input for typed entry. Reuses the same practice-sheet
// CSS classes from index.css used by NamePractice and WordTracing.
export default function SentenceWritingArea({
  index, row, sentenceText, artMode,
  tool, color, size,
  onStrokeStart, onStrokeEnd, onActivateCanvas,
  onTypedTextChange, onSelfCheckChange,
  active, onActivate,
  canvasRef,
}) {
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 300, h: 100 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.round(width), h: Math.round(height) });
    });
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  // Load strokes when row changes
  useLayoutEffect(() => {
    if (!canvasRef.current) return;
    const data = row.writing_strokes;
    if (data && Object.keys(data).length > 0) {
      canvasRef.current.loadStrokes(data);
    } else {
      canvasRef.current.loadStrokes(null);
    }
  }, [row.writing_strokes]);

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

      {/* Writing area — handwriting lines + canvas overlay */}
      <div ref={containerRef} className="relative mx-2 mt-1 mb-2" style={{ height: '80px' }}>
        {/* Handwriting guide lines (sky/grass/fence/dirt) */}
        <div className="practice-sheet absolute inset-0" style={{ '--f': '0.28in', '--g': '0.18in' }}>
          <div className="practice-set">
            <div className="practice-bg sky" />
            <div className="practice-bg grass" />
            <div className="practice-bg dirt" />
            <div className="practice-line top" />
            <div className="practice-line mid" />
            <div className="practice-line base" />
            <div className="practice-line desc" />
          </div>
        </div>
        {/* Annotation canvas overlay */}
        <AnnotationCanvas
          ref={canvasRef}
          width={dims.w}
          height={dims.h}
          color={color}
          size={size}
          tool={tool}
          onStrokeStart={() => { onStrokeStart?.(); onActivateCanvas?.(canvasRef); onActivate?.(); }}
          onStrokeEnd={onStrokeEnd}
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