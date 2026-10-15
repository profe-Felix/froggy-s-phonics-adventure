import { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Undo2, Redo2, Eraser, Highlighter, Pen, Trash2, MousePointer2 } from 'lucide-react';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';

// Annotation overlay for Google Slides. Toggles between interact mode
// (pointer-events pass through to the iframe) and draw mode (canvas
// captures events). Strokes persist across mode toggles.
const SlideMarkup = forwardRef(function SlideMarkup({ width, height, slideId }, ref) {
  const canvasRef = useRef(null);
  const [drawMode, setDrawMode] = useState(false);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#ef4444');
  const [size, setSize] = useState(4.5);
  const [openPanel, setOpenPanel] = useState(null);

  // Per-slide annotation storage — each slide ID gets its own set of
  // strokes. When the teacher navigates to a different slide, we save the
  // current canvas state and load the destination slide's saved strokes
  // (or clear the canvas if none exist). This eliminates the need to
  // manually clear annotations before moving on.
  const strokesBySlide = useRef(new Map());
  const prevSlideId = useRef(null);

  useEffect(() => {
    if (slideId === prevSlideId.current) return;
    // Save current canvas state under the previous slide ID
    if (prevSlideId.current && canvasRef.current) {
      strokesBySlide.current.set(prevSlideId.current, canvasRef.current.getStrokes());
    }
    // Load the new slide's saved strokes (or clear if none)
    if (canvasRef.current) {
      const saved = strokesBySlide.current.get(slideId);
      canvasRef.current.loadStrokes(saved || null);
    }
    prevSlideId.current = slideId;
  }, [slideId]);

  const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ffffff', '#000000'];
  const SIZES = [3, 4.5, 6, 12, 20];

  useImperativeHandle(ref, () => ({ clear: () => canvasRef.current?.clearStrokes() }));

  return (
    <>
      <div
        className="absolute inset-0 z-20"
        style={{
          pointerEvents: drawMode ? 'auto' : 'none',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <AnnotationCanvas ref={canvasRef} width={width} height={height} color={color} size={size} tool={tool} mode="draw" />
      </div>

      <button
        onClick={() => setDrawMode(m => !m)}
        className={`absolute top-4 right-4 z-30 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform ${
          drawMode ? 'bg-indigo-600 text-white' : 'bg-white/90 text-slate-900'
        }`}
        title={drawMode ? 'Switch to interact mode' : 'Switch to draw mode'}
      >
        {drawMode ? <MousePointer2 className="w-6 h-6" /> : <Pen className="w-6 h-6" />}
      </button>

      {drawMode && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30">
          <div className="bg-zinc-900/95 backdrop-blur rounded-2xl px-2 py-1.5 gap-1 shadow-2xl border border-white/10 flex items-center">
            <div className="flex gap-1">
              <button onClick={() => setTool('pen')} className={`p-1.5 rounded-lg active:scale-90 ${tool === 'pen' ? 'bg-white text-black' : 'bg-zinc-700 text-white'}`} title="Pen"><Pen className="w-4 h-4" /></button>
              <button onClick={() => setTool('highlighter')} className={`p-1.5 rounded-lg active:scale-90 ${tool === 'highlighter' ? 'bg-white text-black' : 'bg-zinc-700 text-white'}`} title="Highlighter"><Highlighter className="w-4 h-4" /></button>
              <button onClick={() => setTool('eraser_object')} className={`p-1.5 rounded-lg active:scale-90 ${tool === 'eraser_object' ? 'bg-white text-black' : 'bg-zinc-700 text-white'}`} title="Eraser"><Eraser className="w-4 h-4" /></button>
            </div>
            <div className="w-px h-6 bg-white/15" />
            <button onClick={() => setOpenPanel(p => p === 'color' ? null : 'color')} className={`w-7 h-7 rounded-full border-2 active:scale-90 ${openPanel === 'color' ? 'border-white' : 'border-white/30'}`} style={{ backgroundColor: color }} title="Color" />
            <button onClick={() => setOpenPanel(p => p === 'size' ? null : 'size')} className={`flex items-center justify-center w-7 h-7 rounded-lg active:scale-90 ${openPanel === 'size' ? 'bg-white' : 'bg-zinc-700'}`} title="Stroke size">
              <div className="rounded-full" style={{ width: Math.max(3, size), height: Math.max(3, size), backgroundColor: openPanel === 'size' ? '#000' : '#fff' }} />
            </button>
            <div className="w-px h-6 bg-white/15" />
            <div className="flex gap-1">
              <button onClick={() => canvasRef.current?.undo()} className="p-1.5 rounded-lg bg-zinc-700 text-white active:scale-90" title="Undo"><Undo2 className="w-4 h-4" /></button>
              <button onClick={() => canvasRef.current?.redo()} className="p-1.5 rounded-lg bg-zinc-700 text-white active:scale-90" title="Redo"><Redo2 className="w-4 h-4" /></button>
              <button onClick={() => canvasRef.current?.clearStrokes()} className="p-1.5 rounded-lg bg-red-600 text-white active:scale-90" title="Clear all"><Trash2 className="w-4 h-4" /></button>
            </div>
            {openPanel === 'color' && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-zinc-900/95 backdrop-blur rounded-xl p-1.5 gap-1 flex shadow-2xl border border-white/10">
                {COLORS.map(c => (
                  <button key={c} onClick={() => { setColor(c); setTool(t => t === 'eraser_object' ? 'pen' : t); setOpenPanel(null); }} className={`w-7 h-7 rounded-full border-2 active:scale-90 ${color === c ? 'border-white scale-110' : 'border-white/30'}`} style={{ backgroundColor: c }} />
                ))}
              </div>
            )}
            {openPanel === 'size' && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-zinc-900/95 backdrop-blur rounded-xl p-1.5 gap-1 flex shadow-2xl border border-white/10">
                {SIZES.map(s => (
                  <button key={s} onClick={() => { setSize(s); setOpenPanel(null); }} className={`flex items-center justify-center w-8 h-8 rounded-lg active:scale-90 ${size === s ? 'bg-white' : 'bg-zinc-700'}`}>
                    <div className="rounded-full" style={{ width: Math.max(3, s), height: Math.max(3, s), backgroundColor: size === s ? '#000' : '#fff' }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
});

export default SlideMarkup;