import { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Undo2, Redo2, Eraser, Highlighter, Pen, Trash2, X } from 'lucide-react';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';

// Markup overlay for the document camera — reuses the notebook's smooth
// AnnotationCanvas (Catmull-Rom strokes, undo/redo, eraser, highlighter).
// Overlaid on top of the live video feed. Toggled on/off by the teacher.
const DocCamMarkup = forwardRef(function DocCamMarkup({ width, height, onClose }, ref) {
  const canvasRef = useRef(null);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#ef4444');
  const [size, setSize] = useState(6);

  const COLORS = [
    '#ef4444', // red
    '#f97316', // orange
    '#eab308', // yellow
    '#22c55e', // green
    '#3b82f6', // blue
    '#a855f7', // purple
    '#ffffff', // white
    '#000000', // black
  ];

  const SIZES = [3, 6, 12, 20];

  useImperativeHandle(ref, () => ({
    clear: () => canvasRef.current?.clearStrokes(),
  }));

  return (
    <div className="absolute inset-0 z-20">
      {/* Drawing canvas overlay */}
      <AnnotationCanvas
        ref={canvasRef}
        width={width}
        height={height}
        color={color}
        size={size}
        tool={tool}
        mode="draw"
      />

      {/* Toolbar — floating at bottom center, large touch targets */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30">
        <div className="bg-zinc-900/95 backdrop-blur rounded-2xl px-3 py-2.5 flex items-center gap-2 flex-wrap justify-center shadow-2xl border border-white/10">
          {/* Tool selection */}
          <div className="flex gap-1.5">
            <button
              onClick={() => setTool('pen')}
              className={`p-2.5 rounded-xl transition-transform active:scale-90 ${
                tool === 'pen' ? 'bg-white text-black' : 'bg-zinc-700 text-white'
              }`}
              title="Pen"
            >
              <Pen className="w-5 h-5" />
            </button>
            <button
              onClick={() => setTool('highlighter')}
              className={`p-2.5 rounded-xl transition-transform active:scale-90 ${
                tool === 'highlighter' ? 'bg-white text-black' : 'bg-zinc-700 text-white'
              }`}
              title="Highlighter"
            >
              <Highlighter className="w-5 h-5" />
            </button>
            <button
              onClick={() => setTool('eraser_object')}
              className={`p-2.5 rounded-xl transition-transform active:scale-90 ${
                tool === 'eraser_object' || tool === 'eraser_pixel' ? 'bg-white text-black' : 'bg-zinc-700 text-white'
              }`}
              title="Eraser"
            >
              <Eraser className="w-5 h-5" />
            </button>
          </div>

          {/* Divider */}
          <div className="w-px h-8 bg-white/20" />

          {/* Color swatches */}
          <div className="flex gap-1.5">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => { setColor(c); setTool(t => t === 'eraser_object' || t === 'eraser_pixel' ? 'pen' : t); }}
                className={`w-8 h-8 rounded-full border-2 transition-transform active:scale-90 ${
                  color === c && tool !== 'eraser_object' && tool !== 'eraser_pixel'
                    ? 'border-white scale-110'
                    : 'border-white/30'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          {/* Divider */}
          <div className="w-px h-8 bg-white/20" />

          {/* Size selection */}
          <div className="flex gap-1.5 items-center">
            {SIZES.map(s => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className={`flex items-center justify-center w-9 h-9 rounded-xl transition-transform active:scale-90 ${
                  size === s ? 'bg-white' : 'bg-zinc-700'
                }`}
              >
                <div
                  className="rounded-full"
                  style={{
                    width: Math.max(4, s),
                    height: Math.max(4, s),
                    backgroundColor: size === s ? '#000' : '#fff',
                  }}
                />
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="w-px h-8 bg-white/20" />

          {/* Undo / Redo / Clear */}
          <div className="flex gap-1.5">
            <button
              onClick={() => canvasRef.current?.undo()}
              className="p-2.5 rounded-xl bg-zinc-700 text-white transition-transform active:scale-90"
              title="Undo"
            >
              <Undo2 className="w-5 h-5" />
            </button>
            <button
              onClick={() => canvasRef.current?.redo()}
              className="p-2.5 rounded-xl bg-zinc-700 text-white transition-transform active:scale-90"
              title="Redo"
            >
              <Redo2 className="w-5 h-5" />
            </button>
            <button
              onClick={() => canvasRef.current?.clearStrokes()}
              className="p-2.5 rounded-xl bg-red-600 text-white transition-transform active:scale-90"
              title="Clear all"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>

          {/* Divider */}
          <div className="w-px h-8 bg-white/20" />

          {/* Close markup */}
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl bg-zinc-700 text-white transition-transform active:scale-90"
            title="Close markup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
});

export default DocCamMarkup;