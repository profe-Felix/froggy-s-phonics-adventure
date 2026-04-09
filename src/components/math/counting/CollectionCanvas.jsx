import { useState, useRef, useEffect } from 'react';
import { generateCollection } from './collectionUtils';

const TOOL_TEMPLATES = [
  { type: 'plate', label: '⬤ Plate', emoji: null },
  { type: 'five_frame', label: '5-Frame', emoji: null },
  { type: 'ten_frame', label: '10-Frame', emoji: null },
];

function Plate({ tool, onMove, onRemove }) {
  const ref = useRef(null);
  const startPos = useRef(null);

  const onPointerDown = (e) => {
    if (e.target.closest('[data-remove]')) return;
    e.stopPropagation();
    startPos.current = { mx: e.clientX, my: e.clientY, ox: tool.x, oy: tool.y };
    const onMove2 = (ev) => {
      onMove(tool.id, startPos.current.ox + ev.clientX - startPos.current.mx, startPos.current.oy + ev.clientY - startPos.current.my);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove2);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove2);
    document.addEventListener('pointerup', onUp);
  };

  return (
    <div ref={ref} onPointerDown={onPointerDown}
      style={{ position: 'absolute', left: tool.x, top: tool.y, touchAction: 'none', cursor: 'move', zIndex: 5 }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', border: '3px dashed #94a3b8', background: 'rgba(148,163,184,0.15)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button data-remove="1" onClick={() => onRemove(tool.id)} style={{ position: 'absolute', top: -8, right: -8, width: 18, height: 18, borderRadius: '50%', background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', fontSize: 10, lineHeight: '18px', textAlign: 'center' }}>✕</button>
      </div>
    </div>
  );
}

function FrameContainer({ tool, onMove, onRemove }) {
  const isFive = tool.type === 'five_frame';
  const cols = 5, rows = isFive ? 1 : 2;
  const cellSize = 32;
  const w = cols * cellSize + (cols - 1) * 3 + 16;
  const h = rows * cellSize + (rows > 1 ? 3 : 0) + 16;

  const onPointerDown = (e) => {
    if (e.target.closest('[data-remove]')) return;
    e.stopPropagation();
    const ox = tool.x, oy = tool.y;
    const mx = e.clientX, my = e.clientY;
    const onMove2 = (ev) => onMove(tool.id, ox + ev.clientX - mx, oy + ev.clientY - my);
    const onUp = () => { document.removeEventListener('pointermove', onMove2); document.removeEventListener('pointerup', onUp); };
    document.addEventListener('pointermove', onMove2);
    document.addEventListener('pointerup', onUp);
  };

  return (
    <div onPointerDown={onPointerDown} style={{ position: 'absolute', left: tool.x, top: tool.y, touchAction: 'none', cursor: 'move', zIndex: 5, background: 'rgba(199,210,254,0.3)', border: '2px dashed #6366f1', borderRadius: 10, padding: 8, width: w, height: h }}>
      <button data-remove="1" onClick={() => onRemove(tool.id)} style={{ position: 'absolute', top: -8, right: -8, width: 18, height: 18, borderRadius: '50%', background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', fontSize: 10, lineHeight: '18px', textAlign: 'center' }}>✕</button>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`, gap: 3 }}>
        {Array.from({ length: cols * rows }).map((_, i) => (
          <div key={i} style={{ width: cellSize, height: cellSize, border: '1.5px solid #6366f1', borderRadius: 5, background: 'rgba(255,255,255,0.4)' }} />
        ))}
      </div>
    </div>
  );
}

export default function CollectionCanvas({ seed, count, onDone }) {
  const [items, setItems] = useState(() => generateCollection(seed, count));
  const [placedTools, setPlacedTools] = useState([]);
  const [drawMode, setDrawMode] = useState(false);
  const [strokes, setStrokes] = useState([]);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const currentStroke = useRef([]);
  const nextToolId = useRef(0);

  // Drawing
  useEffect(() => {
    if (!drawMode || !canvasRef.current) return;
    const c = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * dpr;
    c.height = c.offsetHeight * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);

    const redraw = () => {
      ctx.clearRect(0, 0, c.offsetWidth, c.offsetHeight);
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      [...strokes, drawingRef.strokeData].filter(Boolean).forEach(pts => {
        if (!pts || pts.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke();
      });
    };
    redraw();

    const getPos = (e) => {
      const r = c.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      return { x: src.clientX - r.left, y: src.clientY - r.top };
    };

    const onDown = (e) => { e.preventDefault(); drawingRef.current = true; currentStroke.current = [getPos(e)]; drawingRef.strokeData = currentStroke.current; };
    const onMove = (e) => { if (!drawingRef.current) return; e.preventDefault(); currentStroke.current.push(getPos(e)); drawingRef.strokeData = currentStroke.current; redraw(); };
    const onUp = () => { if (!drawingRef.current) return; drawingRef.current = false; setStrokes(s => [...s, [...currentStroke.current]]); currentStroke.current = []; drawingRef.strokeData = null; redraw(); };

    c.addEventListener('mousedown', onDown);
    c.addEventListener('mousemove', onMove);
    c.addEventListener('mouseup', onUp);
    c.addEventListener('touchstart', onDown, { passive: false });
    c.addEventListener('touchmove', onMove, { passive: false });
    c.addEventListener('touchend', onUp);
    return () => {
      c.removeEventListener('mousedown', onDown);
      c.removeEventListener('mousemove', onMove);
      c.removeEventListener('mouseup', onUp);
      c.removeEventListener('touchstart', onDown);
      c.removeEventListener('touchmove', onMove);
      c.removeEventListener('touchend', onUp);
    };
  }, [drawMode, strokes]);

  const addTool = (type) => {
    setPlacedTools(t => [...t, { id: nextToolId.current++, type, x: 20 + (nextToolId.current % 3) * 100, y: 10 }]);
  };

  const moveTool = (id, x, y) => setPlacedTools(t => t.map(tool => tool.id === id ? { ...tool, x, y } : tool));
  const removeTool = (id) => setPlacedTools(t => t.filter(tool => tool.id !== id));

  const moveItem = (id, x, y) => setItems(prev => prev.map(it => it.id === id ? { ...it, x, y } : it));

  return (
    <div className="flex flex-col gap-0 w-full" style={{ userSelect: 'none' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border-b border-indigo-200 rounded-t-2xl flex-wrap">
        <span className="text-xs font-bold text-indigo-600 mr-1">Add tool:</span>
        {TOOL_TEMPLATES.map(t => (
          <button key={t.type} onClick={() => addTool(t.type)}
            className="px-3 py-1.5 bg-white border border-indigo-300 rounded-lg text-sm font-semibold text-indigo-700 hover:bg-indigo-100 shadow-sm">
            {t.label}
          </button>
        ))}
        <button onClick={() => { setDrawMode(d => !d); }}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm border transition-all ${drawMode ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-orange-600 border-orange-300 hover:bg-orange-50'}`}>
          ✏️ {drawMode ? 'Drawing ON' : 'Circle/Draw'}
        </button>
        {strokes.length > 0 && (
          <button onClick={() => setStrokes(s => s.slice(0, -1))} className="px-2 py-1 text-xs text-gray-500 hover:text-red-500">↩ Undo</button>
        )}
        <button onClick={onDone}
          className="ml-auto px-4 py-1.5 bg-green-500 text-white font-bold rounded-lg text-sm shadow hover:bg-green-600">
          ✓ I counted them!
        </button>
      </div>

      {/* Canvas area */}
      <div style={{ position: 'relative', width: '100%', minHeight: 280, background: '#fefce8', borderRadius: '0 0 16px 16px', overflow: 'hidden', border: '1px solid #fde68a' }}>
        {/* Placed organizer tools */}
        {placedTools.map(tool =>
          tool.type === 'plate'
            ? <Plate key={tool.id} tool={tool} onMove={moveTool} onRemove={removeTool} />
            : <FrameContainer key={tool.id} tool={tool} onMove={moveTool} onRemove={removeTool} />
        )}

        {/* Items */}
        {items.map(item => (
          <DraggableItem key={item.id} item={item} onMove={moveItem} frozen={drawMode} />
        ))}

        {/* Draw overlay */}
        {drawMode && (
          <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 20, cursor: 'crosshair' }} />
        )}
        {!drawMode && strokes.length > 0 && (
          <DrawingDisplay strokes={strokes} />
        )}
      </div>
    </div>
  );
}

function DraggableItem({ item, onMove, frozen }) {
  const onPointerDown = (e) => {
    if (frozen) return;
    e.preventDefault();
    e.stopPropagation();
    const ox = item.x, oy = item.y;
    const mx = e.clientX, my = e.clientY;
    const onMoveEvt = (ev) => onMove(item.id, ox + ev.clientX - mx, oy + ev.clientY - my);
    const onUp = () => { document.removeEventListener('pointermove', onMoveEvt); document.removeEventListener('pointerup', onUp); };
    document.addEventListener('pointermove', onMoveEvt);
    document.addEventListener('pointerup', onUp);
  };

  return (
    <div onPointerDown={onPointerDown}
      style={{ position: 'absolute', left: item.x, top: item.y, transform: `rotate(${item.rotation}deg)`, fontSize: 28, cursor: frozen ? 'default' : 'grab', touchAction: 'none', zIndex: 10, lineHeight: 1 }}>
      {item.emoji}
    </div>
  );
}

function DrawingDisplay({ strokes }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * dpr;
    c.height = c.offsetHeight * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, c.offsetWidth, c.offsetHeight);
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    strokes.forEach(pts => {
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    });
  }, [strokes]);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 15, pointerEvents: 'none' }} />;
}