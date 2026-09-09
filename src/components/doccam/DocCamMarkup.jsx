import { useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Undo2, Redo2, Eraser, Highlighter, Pen, Trash2, X, GripVertical, PenTool } from 'lucide-react';
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
  // Bar visibility — when false the toolbar is hidden but the ink stays on
  // screen until explicitly cleared. A small floating button reopens the bar.
  const [barVisible, setBarVisible] = useState(true);
  // Which inline popover is open: 'color' | 'size' | null. Keeps the bar
  // compact — color/size choices live in a small popover, not the main row.
  const [openPanel, setOpenPanel] = useState(null);

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
    setOpenPanel(null);
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

  const divider = isVertical ? 'h-px w-7 bg-white/15' : 'w-px h-6 bg-white/15';

  return (
    <div
      className="absolute inset-0 z-20"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
      onContextMenu={(e) => e.preventDefault()}
    >
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

      {/* Toolbar — a single compact row of icon buttons. Color and size
          collapse into small popover triggers so the bar stays tiny. */}
      {barVisible && (
      <div
        ref={toolbarRef}
        className="absolute z-30"
        style={toolbarPos}
      >
        <div className={`relative bg-zinc-900/95 backdrop-blur rounded-2xl px-1.5 py-1.5 gap-1 shadow-2xl border border-white/10 flex ${
          isVertical ? 'flex-col items-center' : 'flex-row items-center'
        }`}>
          {/* Drag grip — reposition the toolbar; snaps on release */}
          <button
            onPointerDown={onGripDown}
            onPointerMove={onGripMove}
            onPointerUp={onGripUp}
            onPointerCancel={onGripUp}
            className="p-1.5 rounded-lg bg-zinc-700 text-white/50 cursor-grab active:cursor-grabbing touch-none flex items-center"
            title="Drag to reposition"
          >
            <GripVertical className="w-4 h-4" />
          </button>

          <div className={divider} />

          {/* Tool selection */}
          <div className="flex gap-1">
            <button onClick={() => setTool('pen')} className={`p-1.5 rounded-lg transition-transform active:scale-90 ${tool === 'pen' ? 'bg-white text-black' : 'bg-zinc-700 text-white'}`} title="Pen"><Pen className="w-4 h-4" /></button>
            <button onClick={() => setTool('highlighter')} className={`p-1.5 rounded-lg transition-transform active:scale-90 ${tool === 'highlighter' ? 'bg-white text-black' : 'bg-zinc-700 text-white'}`} title="Highlighter"><Highlighter className="w-4 h-4" /></button>
            <button onClick={() => setTool('eraser_object')} className={`p-1.5 rounded-lg transition-transform active:scale-90 ${tool === 'eraser_object' || tool === 'eraser_pixel' ? 'bg-white text-black' : 'bg-zinc-700 text-white'}`} title="Eraser"><Eraser className="w-4 h-4" /></button>
          </div>

          <div className={divider} />

          {/* Color + size — compact triggers; choices open in a popover */}
          <div className="flex gap-1 items-center">
            <button
              onClick={() => setOpenPanel(p => p === 'color' ? null : 'color')}
              className={`w-7 h-7 rounded-full border-2 transition-transform active:scale-90 ${openPanel === 'color' ? 'border-white' : 'border-white/30'}`}
              style={{ backgroundColor: color }}
              title="Color"
            />
            <button
              onClick={() => setOpenPanel(p => p === 'size' ? null : 'size')}
              className={`flex items-center justify-center w-7 h-7 rounded-lg transition-transform active:scale-90 ${openPanel === 'size' ? 'bg-white' : 'bg-zinc-700'}`}
              title="Stroke size"
            >
              <div className="rounded-full" style={{ width: Math.max(3, size), height: Math.max(3, size), backgroundColor: openPanel === 'size' ? '#000' : '#fff' }} />
            </button>
          </div>

          <div className={divider} />

          {/* Undo / Redo / Clear */}
          <div className="flex gap-1">
            <button onClick={() => canvasRef.current?.undo()} className="p-1.5 rounded-lg bg-zinc-700 text-white transition-transform active:scale-90" title="Undo"><Undo2 className="w-4 h-4" /></button>
            <button onClick={() => canvasRef.current?.redo()} className="p-1.5 rounded-lg bg-zinc-700 text-white transition-transform active:scale-90" title="Redo"><Redo2 className="w-4 h-4" /></button>
            <button onClick={() => canvasRef.current?.clearStrokes()} className="p-1.5 rounded-lg bg-red-600 text-white transition-transform active:scale-90" title="Clear all"><Trash2 className="w-4 h-4" /></button>
          </div>

          <div className={divider} />

          {/* Hide bar — keeps ink on screen; reopen via the floating button */}
          <button
            onClick={() => setBarVisible(false)}
            className="p-1.5 rounded-lg bg-zinc-700 text-white transition-transform active:scale-90"
            title="Hide toolbar (ink stays)"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Color popover */}
          {openPanel === 'color' && (
            <div className={`absolute z-40 bg-zinc-900/95 backdrop-blur rounded-xl p-1.5 gap-1 flex shadow-2xl border border-white/10 ${
              isVertical ? 'flex-col left-full ml-2 top-0' : 'flex-row bottom-full mb-2 left-1/2 -translate-x-1/2'
            }`}>
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => { setColor(c); setTool(t => t === 'eraser_object' || t === 'eraser_pixel' ? 'pen' : t); setOpenPanel(null); }}
                  className={`w-7 h-7 rounded-full border-2 transition-transform active:scale-90 ${color === c ? 'border-white scale-110' : 'border-white/30'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          )}

          {/* Size popover */}
          {openPanel === 'size' && (
            <div className={`absolute z-40 bg-zinc-900/95 backdrop-blur rounded-xl p-1.5 gap-1 flex shadow-2xl border border-white/10 ${
              isVertical ? 'flex-col left-full ml-2 top-0' : 'flex-row bottom-full mb-2 left-1/2 -translate-x-1/2'
            }`}>
              {SIZES.map(s => (
                <button
                  key={s}
                  onClick={() => { setSize(s); setOpenPanel(null); }}
                  className={`flex items-center justify-center w-8 h-8 rounded-lg transition-transform active:scale-90 ${size === s ? 'bg-white' : 'bg-zinc-700'}`}
                >
                  <div className="rounded-full" style={{ width: Math.max(3, s), height: Math.max(3, s), backgroundColor: size === s ? '#000' : '#fff' }} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Floating reopen button — shown when the toolbar is hidden so the
          teacher can bring the tools back without losing the ink on screen. */}
      {!barVisible && (
        <button
          onClick={() => setBarVisible(true)}
          onContextMenu={(e) => e.preventDefault()}
          className="absolute bottom-5 right-5 z-30 w-14 h-14 rounded-full bg-indigo-600 text-white shadow-2xl flex items-center justify-center active:scale-90 transition-transform"
          title="Show markup tools"
        >
          <PenTool className="w-6 h-6" />
        </button>
      )}
    </div>
  );
});

export default DocCamMarkup;