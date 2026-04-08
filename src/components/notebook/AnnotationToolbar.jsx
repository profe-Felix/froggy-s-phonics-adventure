import { useState } from 'react';
import { motion } from 'framer-motion';

const COLORS = [
  // Dark / neutrals
  { label: 'Black', value: '#000000' },
  { label: 'Dark Grey', value: '#374151' },
  { label: 'Grey', value: '#9ca3af' },
  { label: 'White', value: '#ffffff' },
  // Blues
  { label: 'Navy', value: '#1e3a8a' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Sky', value: '#38bdf8' },
  // Greens
  { label: 'Dark Green', value: '#166534' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Lime', value: '#84cc16' },
  // Reds / pinks
  { label: 'Red', value: '#dc2626' },
  { label: 'Pink', value: '#ec4899' },
  { label: 'Rose', value: '#fda4af' },
  // Warm
  { label: 'Orange', value: '#ea580c' },
  { label: 'Yellow', value: '#facc15' },
  { label: 'Brown', value: '#78350f' },
  // Purples
  { label: 'Purple', value: '#9333ea' },
  { label: 'Violet', value: '#6d28d9' },
  // Skin tones
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
  { id: 'eraser', label: '⬜', title: 'Eraser' },
];

export default function AnnotationToolbar({ tool, setTool, color, setColor, size, setSize, onUndo, onClear, side = 'left', onSideToggle }) {
  const [showColors, setShowColors] = useState(false);

  return (
    <motion.div
      initial={{ x: side === 'left' ? -80 : 80, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={`fixed top-1/2 -translate-y-1/2 z-50 flex flex-col gap-1 p-2 rounded-2xl shadow-2xl
        ${side === 'left' ? 'left-2' : 'right-2'}`}
      style={{ background: '#1a1a2e', border: '2px solid #4338ca' }}
    >
      {/* Side toggle */}
      <button
        onClick={onSideToggle}
        className="text-indigo-300 hover:text-white text-xs font-bold px-1 py-0.5 rounded mb-1"
        title="Move toolbar"
      >
        {side === 'left' ? '→' : '←'}
      </button>

      {/* Tools */}
      {TOOLS.map(t => (
        <button key={t.id} onClick={() => setTool(t.id)} title={t.title}
          className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center transition-all
            ${tool === t.id ? 'bg-indigo-600 shadow-lg scale-110' : 'hover:bg-indigo-900 text-white'}`}>
          {t.label}
        </button>
      ))}

      <div className="h-px bg-indigo-800 my-1" />

      {/* Color picker toggle */}
      <button onClick={() => setShowColors(v => !v)} title="Color"
        className="w-10 h-10 rounded-full border-4 border-white shadow-md hover:scale-110 transition-all"
        style={{ background: color }} />

      {showColors && (
        <div className={`absolute flex flex-col z-50
          ${side === 'left' ? 'left-14' : 'right-14'}`}
          style={{ top: 0, background: '#1a1a2e', border: '2px solid #4338ca', borderRadius: 16, padding: 8, width: 96, maxHeight: '80vh', overflowY: 'auto' }}>
          <p className="text-indigo-300 text-xs font-bold text-center mb-1">Crayons</p>
          <div className="grid grid-cols-2 gap-1">
            {COLORS.map(c => (
              <button key={c.value} onClick={() => { setColor(c.value); setShowColors(false); }}
                title={c.label}
                className={`w-9 h-9 rounded-xl border-4 transition-all hover:scale-110
                  ${color === c.value ? 'border-white scale-110' : 'border-transparent'}`}
                style={{ background: c.value }} />
            ))}
          </div>
        </div>
      )}

      <div className="h-px bg-indigo-800 my-1" />

      {/* Sizes */}
      {SIZES.map(s => (
        <button key={s} onClick={() => setSize(s)} title={`Size ${s}`}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all
            ${size === s ? 'bg-indigo-600' : 'hover:bg-indigo-900'}`}>
          <div className="rounded-full bg-white" style={{ width: Math.min(s * 2, 20), height: Math.min(s * 2, 20) }} />
        </button>
      ))}

      <div className="h-px bg-indigo-800 my-1" />

      {/* Undo / Clear */}
      <button onClick={onUndo} title="Undo"
        className="w-10 h-10 rounded-xl hover:bg-indigo-900 text-white text-lg flex items-center justify-center">↩</button>
      <button onClick={onClear} title="Clear page"
        className="w-10 h-10 rounded-xl hover:bg-red-900 text-red-400 text-sm flex items-center justify-center font-bold">✕</button>
    </motion.div>
  );
}