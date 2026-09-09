import { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Undo2, Redo2, Eraser, Highlighter, Pen, Trash2, X, GripVertical } from 'lucide-react';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';

// Markup overlay for the document camera — reuses the notebook's smooth
// AnnotationCanvas (Catmull-Rom strokes, undo/redo, eraser, highlighter).
// Overlaid on top of the live video feed. Toggled on/off by the teacher.
// The toolbar can be dragged by its grip and snaps to the left, center, or
// right edge so it stays out of the way of whatever the teacher is showing.
const DocCamMarkup = forwardRef(function DocCamMarkup({ width, height, onClose }, ref) {
  const canvasRef = useRef(null);
  const toolbarRef = useRef(null);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#ef4444');
  const [size, setSize] = useState(3); // default to smallest pen

  // Toolbar dock position + drag state.
  const [dock, setDock] = useState('center'); // 'left' | 'center' | 'right'
  const [drag, setDrag] = useState(null); // { grabOffset, tbW, parentW, left } while dragging

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

  // Five sizes: added 4.5 between the smallest (3) and the former second (6).
  const SIZES = [3, 4.5, 6, 12, 20];

  useImperativeHandle(ref, () => ({
    clear: () => canvasRef.current?.clearStrokes(),
  }));

  // --- Toolbar drag-to-snap (2D) ---
  // Drag freely; on release snap to the nearest horizontal third. Docking
  // left or right orients the toolbar VERTICALLY (stacked sections) so it
  // hugs the edge as a narrow column; center keeps it horizontal at bottom.
  const onGripDown = (e) => {
    const tb = toolbarRef.current;
    const parent = tb?.parentElement;
    if (!tb || !parent) return;
    const tbRect = tb.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    setDrag({
      grabOffsetX: e.clientX - tbRect.left,
      grabOffsetY: e.clientY - tbRect.top,
      tbW: tbRect.width,
      tbH: tbRect.height,
      parentW: parentRect.width,
      parentH: parentRect.height,
      left: tbRect.left - parentRect.left,
      top: tbRect.top - parentRect.top,
      vertical: dock === 'left' || dock === 'right',
    });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };

  const onGripMove = (e) => {
    if (!drag) return;
    const parent = toolbarRef.current?.parentElement;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    let left = e.clientX - parentRect.left - drag.grabOffsetX;
    let top = e.clientY - parentRect.top - drag.grabOffsetY;
    left = Math.max(8, Math.min(left, parentRect.width - drag.tbW - 8));
    top = Math.max(8, Math.min(top, parentRect.height - drag.tbH - 8));
    setDrag({ ...drag, left, top });
  };

  const onGripUp = (e) => {
    if (!drag) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    const centerX = drag.left + drag.tbW / 2;
    const third = drag.parentW / 3;
    if (centerX < third) setDock('left');
    else if (centerX > 2 * third) setDock('right');
    else setDock('center');
    setDrag(null);
  };

  const isVertical = drag ? drag.vertical : (dock === 'left' || dock === 'right');

  const toolbarPos = drag
    ? { left: drag.left, top: drag.top, right: 'auto', bottom: 'auto', transform: 'none' }
    : dock === 'left'
      ? { left: 16, top: '50%', right: 'auto', bottom: 'auto', transform: 'translateY(-50%)' }
      : dock === 'right'
        ? { right: 16, top: '50%', left: 'auto', bottom: 'auto', transform: 'translateY(-50%)' }
        : { left: '50%', bottom: 16, top: 'auto', right: 'auto', transform: 'translateX(-50%)' };

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

      {/* Toolbar — draggable, snaps to left / center / right. Large touch targets. */}
      <div
        ref={toolbarRef}
        className="absolute bottom-4 z-30"
        style={toolbarPos}
      >
        <div className={`bg-zinc-900/95 backdrop-blur rounded-2xl px-3 py-2.5 gap-2 justify-center shadow-2xl border border-white/10 flex ${
          isVertical ? 'flex-col items-center' : 'flex-wrap items-center'
        }`}>
          {/* Drag grip — reposition the toolbar; snaps on release */}
          <button
            onPointerDown={onGripDown}
            onPointerMove={onGripMove}
            onPointerUp={onGripUp}
            onPointerCancel={onGripUp}
            className="p-2.5 rounded-xl bg-zinc-700 text-white/50 cursor-grab active:cursor-grabbing touch-none flex items-center"
            title="Drag to reposition"
          >
            <GripVertical className="w-5 h-5" />
          </button>

          {/* Divider */}
          <div className={isVertical ? 'h-px w-10 bg-white/20' : 'w-px h-8 bg-white/20'} />

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
          <div className={isVertical ? 'h-px w-10 bg-white/20' : 'w-px h-8 bg-white/20'} />

          {/* Color swatches */}
          <div className={`flex gap-1.5 ${isVertical ? 'flex-wrap max-w-[180px] justify-center' : ''}`}>
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
          <div className={isVertical ? 'h-px w-10 bg-white/20' : 'w-px h-8 bg-white/20'} />

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
                    width: Math.max(3, s),
                    height: Math.max(3, s),
                    backgroundColor: size === s ? '#000' : '#fff',
                  }}
                />
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className={isVertical ? 'h-px w-10 bg-white/20' : 'w-px h-8 bg-white/20'} />

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
          <div className={isVertical ? 'h-px w-10 bg-white/20' : 'w-px h-8 bg-white/20'} />

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