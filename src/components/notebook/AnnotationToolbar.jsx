import { useState, useRef } from 'react';

const COLORS = [
  { label: 'Black', value: '#000000' },
  { label: 'Dark Grey', value: '#374151' },
  { label: 'Grey', value: '#9ca3af' },
  { label: 'White', value: '#ffffff' },
  { label: 'Navy', value: '#1e3a8a' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Sky', value: '#38bdf8' },
  { label: 'Dark Green', value: '#166534' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Lime', value: '#84cc16' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Pink', value: '#ec4899' },
  { label: 'Rose', value: '#fda4af' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Yellow', value: '#facc15' },
  { label: 'Brown', value: '#78350f' },
  { label: 'Purple', value: '#9333ea' },
  { label: 'Violet', value: '#6d28d9' },
  { label: 'Skin 1', value: '#fddbb4' },
  { label: 'Skin 2', value: '#f5c89a' },
  { label: 'Skin 3', value: '#e8a87c' },
  { label: 'Skin 4', value: '#c68642' },
  { label: 'Skin 5', value: '#8d5524' },
  { label: 'Skin 6', value: '#4a2010' },
];

const SIZES = [2, 4, 7, 12];

const TOOLS = [
  { id: 'pen', label: '✏️', title: 'Pen' },
  { id: 'highlighter', label: '🖍', title: 'Highlighter' },
  { id: 'eraser_object', label: '🧹', title: 'Stroke Eraser (tap a stroke to remove it)' },
  { id: 'eraser_pixel', label: '◻️', title: 'Pixel Eraser (fine)' },
  { id: 'laser', label: 'laser', title: 'Laser pointer' },
];

export default function AnnotationToolbar({ tool, setTool, color, setColor, size, setSize, onUndo, onClear, side, onSwapSide }) {
  const [showColors, setShowColors] = useState(false);
  const [colorBtnPos, setColorBtnPos] = useState(null);
  const colorBtnRef = useRef(null);

  return (
    <div className="relative flex flex-col gap-0.5 p-1.5 rounded-2xl shadow-2xl shrink-0"
      style={{ background: '#1a1a2e', border: '2px solid #4338ca', maxHeight: '100%', overflowY: 'auto', overflowX: 'hidden' }}
    >
      {/* Swap side button */}
      <button onClick={onSwapSide} title={side === 'left' ? 'Move toolbar to right' : 'Move toolbar to left'}
        className="w-9 h-9 rounded-xl hover:bg-indigo-900 text-white text-base flex items-center justify-center transition-all">
        {side === 'left' ? '→' : '←'}
      </button>

      <div className="h-px bg-indigo-800 my-0.5" />

      {TOOLS.map(t => (
        <button key={t.id} onClick={() => setTool(t.id)} title={t.title}
          className={`w-9 h-9 rounded-xl text-base flex items-center justify-center transition-all
            ${tool === t.id ? 'bg-indigo-600 shadow-lg scale-110' : 'hover:bg-indigo-900 text-white'}`}>
          {t.id === 'laser' ? (
            // Red dot laser icon
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36 }}>
              <span style={{
                width: 14, height: 14, borderRadius: '50%',
                background: 'radial-gradient(circle, #fff 0%, #ff2222 40%, #ff000088 70%, transparent 100%)',
                boxShadow: tool === t.id ? '0 0 10px 4px #ff4444cc' : '0 0 6px 2px #ff222266',
                display: 'block',
              }} />
            </span>
          ) : t.label}
        </button>
      ))}

      <div className="h-px bg-indigo-800 my-1" />

      <button
        ref={colorBtnRef}
        onClick={() => {
          if (!showColors && colorBtnRef.current) {
            const r = colorBtnRef.current.getBoundingClientRect();
            setColorBtnPos({ top: r.top, left: r.left, width: r.width });
          }
          setShowColors(v => !v);
        }}
        title="Color"
        className="w-9 h-9 rounded-full border-4 border-white shadow-md hover:scale-110 transition-all"
        style={{ background: color }}
      />

      {showColors && colorBtnPos && (
        <div
          className="fixed z-50"
          style={{
            top: Math.min(colorBtnPos.top, window.innerHeight - Math.min(320, window.innerHeight - 20)),
            left: colorBtnPos.left + colorBtnPos.width + 4,
            background: '#1a1a2e',
            border: '2px solid #4338ca',
            borderRadius: 16,
            padding: 8,
            width: 120,
            maxHeight: window.innerHeight - 24,
            overflowY: 'auto',
          }}
        >
          <p className="text-indigo-300 text-xs font-bold text-center mb-2">Crayons</p>
          <div className="grid grid-cols-2 gap-1">
            {COLORS.map(c => (
              <button key={c.value} onClick={() => { setColor(c.value); setShowColors(false); }}
                title={c.label}
                className={`w-10 h-10 rounded-xl border-4 transition-all hover:scale-110
                  ${color === c.value ? 'border-white scale-110' : 'border-transparent'}`}
                style={{ background: c.value }} />
            ))}
          </div>
        </div>
      )}

      <div className="h-px bg-indigo-800 my-1" />

      {SIZES.map(s => (
        <button key={s} onClick={() => setSize(s)} title={`Size ${s}`}
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all
            ${size === s ? 'bg-indigo-600' : 'hover:bg-indigo-900'}`}>
          <div className="rounded-full bg-white" style={{ width: Math.min(s * 2, 18), height: Math.min(s * 2, 18) }} />
        </button>
      ))}

      <div className="h-px bg-indigo-800 my-1" />

      <button onClick={onUndo} title="Undo"
        className="w-9 h-9 rounded-xl hover:bg-indigo-900 text-white text-base flex items-center justify-center">↩</button>
      <button onClick={onClear} title="Clear page"
        className="w-9 h-9 rounded-xl hover:bg-red-900 text-red-400 text-sm flex items-center justify-center font-bold">✕</button>
    </div>
  );
}