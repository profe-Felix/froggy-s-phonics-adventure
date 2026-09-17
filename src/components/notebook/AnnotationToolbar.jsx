import { useState, useRef, useEffect } from 'react';

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

const SIZE_MIN = 2;
const SIZE_MAX = 16;
const SIZE_DEFAULT = 4;

const TOOLS = [
  { id: 'pen', label: '✏️', title: 'Pen' },
  { id: 'highlighter', label: '🖍', title: 'Highlighter' },
  { id: 'eraser_object', label: '🧹', title: 'Stroke Eraser (tap a stroke to remove it)' },
  { id: 'eraser_pixel', label: '◻️', title: 'Pixel Eraser (fine)' },
  { id: 'laser', label: 'laser', title: 'Laser pointer' },
  // lasso hidden for now
];

export default function AnnotationToolbar({ tool, setTool, color, setColor, size, setSize, onUndo, onRedo, onClear, side, onSwapSide, onAddMic, addingMic }) {
  const [showColors, setShowColors] = useState(false);
  const [colorBtnPos, setColorBtnPos] = useState(null);
  const colorBtnRef = useRef(null);
  const [showSizes, setShowSizes] = useState(false);
  const [sizeBtnPos, setSizeBtnPos] = useState(null);
  const sizeBtnRef = useRef(null);
  const toolbarRef = useRef(null);

  useEffect(() => {
    if (!showColors && !showSizes) return;

    const dismissPopovers = (e) => {
      if (toolbarRef.current?.contains(e.target)) return;

      setShowColors(false);
      setShowSizes(false);
    };

    document.addEventListener('pointerdown', dismissPopovers);

    return () => {
      document.removeEventListener('pointerdown', dismissPopovers);
    };
  }, [showColors, showSizes]);

  const PICKER_W = 128;
  const SIZE_POPOVER_W = 180;

  return (
    <div
      ref={toolbarRef}
      className="relative flex flex-col gap-0.5 p-1 rounded-2xl shadow-2xl shrink-0"
      style={{ background: '#1a1a2e', border: '2px solid #4338ca', maxHeight: '100%', overflowY: 'auto', overflowX: 'hidden' }}
    >
      {/* Swap side button */}
      <button onClick={onSwapSide} title={side === 'left' ? 'Move toolbar to right' : 'Move toolbar to left'}
        className="w-8 h-8 rounded-xl hover:bg-indigo-900 text-white text-base flex items-center justify-center transition-all">
        {side === 'left' ? '→' : '←'}
      </button>

      <button
        ref={colorBtnRef}
        onClick={() => {
          if (!showColors && colorBtnRef.current) {
            const r = colorBtnRef.current.getBoundingClientRect();
            setColorBtnPos({ top: r.top, left: r.left, right: r.right, width: r.width });
          }
          setShowColors(v => !v);
          setShowSizes(false);
        }}
        title="Color"
        className="w-8 h-8 rounded-full border-4 border-white shadow-md hover:scale-110 transition-all"
        style={{ background: color }}
      />
      
      <div className="h-px bg-indigo-800 my-0.5" />

      {TOOLS.map(t => (
        <div key={t.id} className="flex flex-col gap-0.5">
          <button onClick={() => setTool(t.id)} title={t.title}
            className={`w-8 h-8 rounded-xl text-base flex items-center justify-center transition-all
              ${tool === t.id ? 'bg-indigo-600 shadow-lg scale-110' : 'hover:bg-indigo-900 text-white'}`}>
            {t.id === 'laser' ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32 }}>
                <span style={{
                  width: 13, height: 13, borderRadius: '50%',
                  background: 'radial-gradient(circle, #fff 0%, #ff2222 40%, #ff000088 70%, transparent 100%)',
                  boxShadow: tool === t.id ? '0 0 10px 4px #ff4444cc' : '0 0 6px 2px #ff222266',
                  display: 'block',
                }} />
              </span>
            ) : t.label}
          </button>

          {t.id === 'laser' && onAddMic && (
            <button
              onClick={onAddMic}
              title={addingMic ? 'Tap the page to place the mic' : 'Add voice note to page'}
              className={`w-8 h-8 rounded-xl text-base flex items-center justify-center transition-all
                ${addingMic ? 'bg-yellow-600 text-white shadow-lg scale-110' : 'hover:bg-indigo-900 text-white'}`}
            >
              {addingMic ? '📍' : '🎙'}
            </button>
          )}
        </div>
      ))}

      <div className="h-px bg-indigo-800 my-1" />



      {showColors && colorBtnPos && (
        <div
          className="fixed z-50"
          style={{
            // Clamp top so picker never goes below viewport
            top: Math.min(colorBtnPos.top, window.innerHeight - Math.min(340, window.innerHeight - 16)),
            // Open to the right when toolbar is on the left; to the left when on the right
            left: side === 'left'
              ? colorBtnPos.right + 4
              : colorBtnPos.left - PICKER_W - 4,
            background: '#1a1a2e',
            border: '2px solid #4338ca',
            borderRadius: 16,
            padding: 8,
            width: PICKER_W,
            maxHeight: window.innerHeight - 16,
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

      <button
        ref={sizeBtnRef}
        onClick={() => {
          if (!showSizes && sizeBtnRef.current) {
            const r = sizeBtnRef.current.getBoundingClientRect();
            setSizeBtnPos({ top: r.top, left: r.left, right: r.right, width: r.width });
          }
          setShowSizes(v => !v);
          setShowColors(false);
        }}
        title={`Pen size ${size}`}
        className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all
          ${showSizes ? 'bg-indigo-600 shadow-lg scale-110' : 'hover:bg-indigo-900'}`}>
        <div className="rounded-full bg-white" style={{ width: Math.min(size * 1.5, 20), height: Math.min(size * 1.5, 20) }} />
      </button>

      {showSizes && sizeBtnPos && (
        <div
          className="fixed z-50"
          style={{
            top: Math.min(sizeBtnPos.top, window.innerHeight - 200),
            left: side === 'left'
              ? sizeBtnPos.right + 4
              : sizeBtnPos.left - SIZE_POPOVER_W - 4,
            background: '#1a1a2e',
            border: '2px solid #4338ca',
            borderRadius: 16,
            padding: 12,
            width: SIZE_POPOVER_W,
          }}
        >
          <p className="text-indigo-300 text-xs font-bold text-center mb-2">Pen Size</p>

          {/* Quick size choices */}
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {[2, 4, 7].map(preset => (
              <button
                key={preset}
                onClick={() => setSize(preset)}
                className={`py-1.5 rounded-lg text-xs font-black border transition-all ${
                  size === preset
                    ? 'bg-indigo-600 border-indigo-400 text-white'
                    : 'bg-indigo-950 border-indigo-800 text-indigo-200 hover:bg-indigo-900'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Live preview line — shows actual thickness */}
          <div className="flex items-center justify-center mb-3 py-2" style={{ background: '#0f0f1a', borderRadius: 10 }}>
            <svg width="140" height="40" viewBox="0 0 140 40">
              <line x1="10" y1="20" x2="130" y2="20"
                stroke={color}
                strokeWidth={Math.max(1, size * 1.5)}
                strokeLinecap="round" />
            </svg>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="range"
              min={SIZE_MIN}
              max={SIZE_MAX}
              step={1}
              value={size}
              onChange={e => setSize(parseInt(e.target.value))}
              className="flex-1 accent-indigo-500"
            />
            <span className="text-white font-bold text-sm w-6 text-center">{size}</span>
          </div>
          <div className="flex justify-between text-indigo-500 text-[10px] font-bold">
            <span>Fine</span>
            <span>Thick</span>
          </div>
          <button
            onClick={() => { setSize(SIZE_DEFAULT); }}
            className="w-full mt-2 py-1.5 rounded-lg text-xs font-bold text-indigo-300 border border-indigo-700 hover:bg-indigo-900"
          >
            Reset to {SIZE_DEFAULT}
          </button>
        </div>
      )}

      <div className="h-px bg-indigo-800 my-1" />

      <button onClick={onUndo} title="Undo"
        className="w-8 h-8 rounded-xl hover:bg-indigo-900 text-white text-base flex items-center justify-center">↩</button>
      <button onClick={onRedo} title="Redo"
        className="w-8 h-8 rounded-xl hover:bg-indigo-900 text-white text-base flex items-center justify-center">↪</button>
      <button onClick={onClear} title="Clear page"
        className="w-8 h-8 rounded-xl hover:bg-red-900 text-red-400 text-sm flex items-center justify-center font-bold">✕</button>

    </div>
  );
}