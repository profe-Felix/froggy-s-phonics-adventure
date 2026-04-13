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
      <div style={{ width: 120, height: 120, borderRadius: '50%', border: '3px dashed #94a3b8', background: 'rgba(148,163,184,0.15)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

export default function CollectionCanvas({ seed, count, onDone, hideButton }) {
  const [items, setItems] = useState(() => generateCollection(seed, count));
  const [placedTools, setPlacedTools] = useState([]);
  const [activeTool, setActiveTool] = useState('move'); // 'move' | 'draw' | 'eraser'
  const drawMode = activeTool === 'draw' || activeTool === 'eraser';
  const eraserMode = activeTool === 'eraser';
  const lassoMode = true; // always-on lasso when not in draw mode and clicking empty space
  const [strokeCount, setStrokeCount] = useState(0);
  const strokesRef = useRef([]);
  const canvasRef = useRef(null);   // draw canvas
  const lassoCanvasRef = useRef(null); // lasso overlay
  const isDrawing = useRef(false);
  const currentStroke = useRef([]);
  const nextToolId = useRef(0);
  const ctxRef = useRef(null);
  const containerRef = useRef(null);
  // Lasso state
  const lassoPathRef = useRef([]);
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());
  const lassoDragRef = useRef(null); // {ids, startX, startY, origPositions}
  const [lassoActive, setLassoActive] = useState(false);

  // Lasso canvas — always active when NOT in draw mode
  useEffect(() => {
    if (drawMode || !lassoCanvasRef.current) return;
    const c = lassoCanvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * dpr;
    c.height = c.offsetHeight * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctxRef.current = ctx;

    let lassoPoints = [];
    let dragging = false;

    const getPos = (e) => {
      const r = c.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      return { x: src.clientX - r.left, y: src.clientY - r.top };
    };

    const redrawLasso = () => {
      ctx.clearRect(0, 0, c.offsetWidth, c.offsetHeight);
      if (lassoPoints.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.fillStyle = 'rgba(99,102,241,0.08)';
      ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
      lassoPoints.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const pointInPoly = (px, py, poly) => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    };

    const onDown = (e) => {
      // Don't start lasso if clicking an item (items handle their own drag via stopPropagation on pointerdown)
      // The canvas is behind items (zIndex 20 but items are DOM elements above), so if we get this event
      // the user clicked empty space → start lasso
      e.preventDefault();
      dragging = true;
      lassoPoints = [getPos(e)];
    };
    const onMove = (e) => { if (!dragging) return; e.preventDefault(); lassoPoints.push(getPos(e)); redrawLasso(); };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      // compute bounds of each item element for hit testing — use item positions from state
      // We'll dispatch a custom event with the lasso polygon
      c.dispatchEvent(new CustomEvent('lasso-complete', { bubbles: true, detail: { poly: lassoPoints } }));
      lassoPoints = [];
      ctx.clearRect(0, 0, c.offsetWidth, c.offsetHeight);
    };

    c.addEventListener('mousedown', onDown);
    c.addEventListener('mousemove', onMove);
    c.addEventListener('mouseup', onUp);
    c.addEventListener('mouseleave', onUp);
    c.addEventListener('touchstart', onDown, { passive: false });
    c.addEventListener('touchmove', onMove, { passive: false });
    c.addEventListener('touchend', onUp);
    return () => {
      c.removeEventListener('mousedown', onDown);
      c.removeEventListener('mousemove', onMove);
      c.removeEventListener('mouseup', onUp);
      c.removeEventListener('mouseleave', onUp);
      c.removeEventListener('touchstart', onDown);
      c.removeEventListener('touchmove', onMove);
      c.removeEventListener('touchend', onUp);
    };
  }, [drawMode]);

  // Setup canvas only when drawMode changes (avoids clearing on each stroke)
  useEffect(() => {
    if (!drawMode || !canvasRef.current) return;
    const c = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * dpr;
    c.height = c.offsetHeight * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctxRef.current = ctx;

    const redraw = () => {
      ctx.clearRect(0, 0, c.offsetWidth, c.offsetHeight);
      const all = [...strokesRef.current, ...(eraserMode ? [] : [currentStroke.current])].filter(s => s && s.length >= 2);
      all.forEach(pts => {
        ctx.beginPath(); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.moveTo(pts[0].x, pts[0].y);
        pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke();
      });
    };

    // draw existing strokes immediately
    redraw();

    const getPos = (e) => {
      const r = c.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      return { x: src.clientX - r.left, y: src.clientY - r.top };
    };

    const onDown = (e) => { e.preventDefault(); isDrawing.current = true; currentStroke.current = [getPos(e)]; };
    const onMove = (e) => {
      if (!isDrawing.current) return;
      e.preventDefault();
      currentStroke.current.push(getPos(e));
      if (eraserMode) {
        // erase strokes that come near current pointer
        const pt = currentStroke.current[currentStroke.current.length - 1];
        strokesRef.current = strokesRef.current.filter(stroke =>
          !stroke.some(p => Math.hypot(p.x - pt.x, p.y - pt.y) < 18)
        );
        setStrokeCount(n => n); // trigger redraw
      }
      redraw();
    };
    const onUp = () => {
      if (!isDrawing.current) return;
      isDrawing.current = false;
      if (!eraserMode && currentStroke.current.length >= 2) {
        strokesRef.current = [...strokesRef.current, [...currentStroke.current]];
        setStrokeCount(n => n + 1);
      } else {
        setStrokeCount(n => n + 1); // force redraw after erase
      }
      currentStroke.current = [];
      redraw();
    };

    c.addEventListener('mousedown', onDown);
    c.addEventListener('mousemove', onMove);
    c.addEventListener('mouseup', onUp);
    c.addEventListener('mouseleave', onUp);
    c.addEventListener('touchstart', onDown, { passive: false });
    c.addEventListener('touchmove', onMove, { passive: false });
    c.addEventListener('touchend', onUp);
    return () => {
      c.removeEventListener('mousedown', onDown);
      c.removeEventListener('mousemove', onMove);
      c.removeEventListener('mouseup', onUp);
      c.removeEventListener('mouseleave', onUp);
      c.removeEventListener('touchstart', onDown);
      c.removeEventListener('touchmove', onMove);
      c.removeEventListener('touchend', onUp);
    };
  }, [drawMode, eraserMode]);

  const addTool = (type) => {
    setPlacedTools(t => [...t, { id: nextToolId.current++, type, x: 20 + (nextToolId.current % 3) * 100, y: 10 }]);
  };

  const moveTool = (id, x, y) => setPlacedTools(t => t.map(tool => tool.id === id ? { ...tool, x, y } : tool));
  const removeTool = (id) => setPlacedTools(t => t.filter(tool => tool.id !== id));

  const clamp = (x, y) => {
    const el = containerRef.current;
    if (!el) return { x, y };
    const { width, height } = el.getBoundingClientRect();
    return { x: Math.max(0, Math.min(x, width - 36)), y: Math.max(0, Math.min(y, height - 36)) };
  };

  const moveItem = (id, x, y) => {
    const c = clamp(x, y);
    setItems(prev => prev.map(it => it.id === id ? { ...it, x: c.x, y: c.y } : it));
  };

  // Listen for lasso-complete events from the lasso canvas
  useEffect(() => {
    const c = lassoCanvasRef.current;
    if (!c) return;
    const handler = (e) => {
      const poly = e.detail?.poly || [];
      if (!poly.length) return;
      const pointInPoly = (px, py, pts) => {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
          const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
          if (intersect) inside = !inside;
        }
        return inside;
      };
      setItems(prev => {
        const inside = new Set(prev.filter(it => pointInPoly(it.x, it.y, poly)).map(it => it.id));
        setSelectedItemIds(inside);
        return prev;
      });
    };
    c.addEventListener('lasso-complete', handler);
    return () => c.removeEventListener('lasso-complete', handler);
  }, [drawMode]);

  // Re-clamp all items when container resizes (e.g. orientation change)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      setItems(prev => prev.map(it => ({
        ...it,
        x: Math.max(0, Math.min(it.x, width - 36)),
        y: Math.max(0, Math.min(it.y, height - 36)),
      })));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex flex-col gap-0 w-full h-full" style={{ userSelect: 'none' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border-b border-indigo-200 rounded-t-2xl flex-wrap">
        <span className="text-xs font-bold text-indigo-600 mr-1">Add:</span>
        {TOOL_TEMPLATES.map(t => (
          <button key={t.type} onClick={() => addTool(t.type)}
            className="px-3 py-1.5 bg-white border border-indigo-300 rounded-lg text-sm font-semibold text-indigo-700 hover:bg-indigo-100 shadow-sm">
            {t.label}
          </button>
        ))}
        <div className="w-px h-5 bg-indigo-200 mx-1" />
        <button onClick={() => setActiveTool(activeTool === 'draw' ? 'move' : 'draw')}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm border transition-all ${activeTool === 'draw' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-blue-600 border-blue-300 hover:bg-blue-50'}`}>
          ✏️ Draw
        </button>
        <button onClick={() => setActiveTool(activeTool === 'eraser' ? 'move' : 'eraser')}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm border transition-all ${activeTool === 'eraser' ? 'bg-gray-600 text-white border-gray-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
          ⬜ Eraser
        </button>
        {selectedItemIds.size > 0 && (
          <span className="text-xs text-indigo-500 font-bold">{selectedItemIds.size} selected — drag to move</span>
        )}
        {strokeCount > 0 && (
          <>
            <button onClick={() => { strokesRef.current = strokesRef.current.slice(0, -1); setStrokeCount(n => Math.max(0, n - 1)); }} className="px-2 py-1 text-xs text-gray-500 hover:text-red-500">↩ Undo</button>
            <button onClick={() => { strokesRef.current = []; setStrokeCount(0); }} className="px-2 py-1 text-xs text-red-400 hover:text-red-600">🗑 Clear</button>
          </>
        )}
        {!hideButton && (
          <button onClick={onDone}
            className="ml-auto px-4 py-1.5 bg-green-500 text-white font-bold rounded-lg text-sm shadow hover:bg-green-600">
            ✓ I counted them!
          </button>
        )}
      </div>

      {/* Canvas area */}
      <div ref={containerRef}
        style={{ position: 'relative', flex: 1, minHeight: 0, background: '#fefce8', borderRadius: '0 0 16px 16px', overflow: 'hidden', border: '1px solid #fde68a' }}>
        {/* Placed organizer tools */}
        {placedTools.map(tool =>
          tool.type === 'plate'
            ? <Plate key={tool.id} tool={tool} onMove={moveTool} onRemove={removeTool} />
            : <FrameContainer key={tool.id} tool={tool} onMove={moveTool} onRemove={removeTool} />
        )}

        {/* Items */}
        {items.map(item => (
          <DraggableItem key={item.id} item={item} onMove={moveItem}
            frozen={drawMode || lassoMode}
            selected={selectedItemIds.has(item.id)}
            onGroupDragStart={(id, startX, startY) => {
              // Store original positions for entire group
              const group = items.filter(it => selectedItemIds.has(it.id));
              lassoDragRef.current = { ids: group.map(i => i.id), startX, startY, origPositions: Object.fromEntries(group.map(i => [i.id, { x: i.x, y: i.y }])) };
            }}
            onGroupDragMove={(dx, dy) => {
              if (!lassoDragRef.current) return;
              const { ids, origPositions } = lassoDragRef.current;
              setItems(prev => prev.map(it => ids.includes(it.id) ? { ...it, x: origPositions[it.id].x + dx, y: origPositions[it.id].y + dy } : it));
            }}
            onGroupDragEnd={() => { lassoDragRef.current = null; }}
          />
        ))}

        {/* Draw overlay */}
        {drawMode && eraserMode && <EraserCursor />}
        {drawMode && (
          <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 20, cursor: eraserMode ? 'none' : 'crosshair' }} />
        )}
        {/* Lasso canvas — always present and on top, transparent to pointer only when drawing */}
        <canvas ref={lassoCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 25, cursor: 'default', pointerEvents: drawMode ? 'none' : 'auto' }} />
        {strokeCount > 0 && !drawMode && (
          <DrawingDisplay strokes={strokesRef.current} strokeCount={strokeCount} />
        )}
      </div>
    </div>
  );
}

function DraggableItem({ item, onMove, frozen, selected, onGroupDragStart, onGroupDragMove, onGroupDragEnd }) {
  const onPointerDown = (e) => {
    if (frozen) return;
    e.preventDefault();
    e.stopPropagation();
    const mx = e.clientX, my = e.clientY;
    if (selected && onGroupDragStart) {
      onGroupDragStart(item.id, mx, my);
      const onMoveEvt = (ev) => onGroupDragMove && onGroupDragMove(ev.clientX - mx, ev.clientY - my);
      const onUp = () => {
        onGroupDragEnd && onGroupDragEnd();
        document.removeEventListener('pointermove', onMoveEvt);
        document.removeEventListener('pointerup', onUp);
      };
      document.addEventListener('pointermove', onMoveEvt);
      document.addEventListener('pointerup', onUp);
    } else {
      const ox = item.x, oy = item.y;
      const onMoveEvt = (ev) => onMove(item.id, ox + ev.clientX - mx, oy + ev.clientY - my);
      const onUp = () => { document.removeEventListener('pointermove', onMoveEvt); document.removeEventListener('pointerup', onUp); };
      document.addEventListener('pointermove', onMoveEvt);
      document.addEventListener('pointerup', onUp);
    }
  };

  return (
    <div onPointerDown={onPointerDown}
      style={{
        position: 'absolute', left: item.x, top: item.y,
        transform: `rotate(${item.rotation}deg)`,
        fontSize: 28, cursor: frozen ? 'default' : 'grab',
        touchAction: 'none', zIndex: 10, lineHeight: 1,
        outline: selected ? '3px dashed #6366f1' : 'none',
        borderRadius: 6,
      }}>
      {item.emoji}
    </div>
  );
}

function EraserCursor() {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  useEffect(() => {
    const move = (e) => {
      const src = e.touches ? e.touches[0] : e;
      setPos({ x: src.clientX, y: src.clientY });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('touchmove', move, { passive: true });
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('touchmove', move); };
  }, []);
  return (
    <div style={{ position: 'fixed', left: pos.x - 18, top: pos.y - 18, width: 36, height: 36, borderRadius: '50%', background: 'rgba(150,150,150,0.5)', border: '2px solid #999', pointerEvents: 'none', zIndex: 9999 }} />
  );
}

function DrawingDisplay({ strokes, strokeCount }) {
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
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    strokes.forEach(pts => {
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    });
  }, [strokes, strokeCount]);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 15, pointerEvents: 'none' }} />;
}