import { useState, useRef, useEffect } from 'react';
import { generateCollection } from './collectionUtils';

const CELL = 32;
const PLATE_SIZE = 120;

function frameDims(type) {
  const cols = 5, rows = type === 'five_frame' ? 1 : 2;
  return { w: cols * CELL + (cols - 1) * 3 + 16, h: rows * CELL + (rows > 1 ? 3 : 0) + 16 };
}

function Plate({ tool, onMove, onRemove }) {
  const onPointerDown = (e) => {
    if (e.target.closest('[data-remove]')) return;
    e.stopPropagation();
    const ox = tool.x, oy = tool.y, mx = e.clientX, my = e.clientY;
    const onMove2 = (ev) => onMove(tool.id, ox + ev.clientX - mx, oy + ev.clientY - my);
    const onUp = () => { document.removeEventListener('pointermove', onMove2); document.removeEventListener('pointerup', onUp); };
    document.addEventListener('pointermove', onMove2);
    document.addEventListener('pointerup', onUp);
  };
  return (
    <div onPointerDown={onPointerDown} style={{ position: 'absolute', left: tool.x, top: tool.y, touchAction: 'none', cursor: 'move', zIndex: 5 }}>
      <div style={{ width: PLATE_SIZE, height: PLATE_SIZE, borderRadius: '50%', border: '3px dashed #94a3b8', background: 'rgba(148,163,184,0.15)', position: 'relative' }}>
        <button data-remove="1" onClick={() => onRemove(tool.id)} style={{ position: 'absolute', top: -8, right: -8, width: 18, height: 18, borderRadius: '50%', background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', fontSize: 10, lineHeight: '18px', textAlign: 'center' }}>✕</button>
      </div>
    </div>
  );
}

function FrameContainer({ tool, onMove, onRemove }) {
  const isFive = tool.type === 'five_frame';
  const cols = 5, rows = isFive ? 1 : 2;
  const { w, h } = frameDims(tool.type);
  const onPointerDown = (e) => {
    if (e.target.closest('[data-remove]')) return;
    e.stopPropagation();
    const ox = tool.x, oy = tool.y, mx = e.clientX, my = e.clientY;
    const onMove2 = (ev) => onMove(tool.id, ox + ev.clientX - mx, oy + ev.clientY - my);
    const onUp = () => { document.removeEventListener('pointermove', onMove2); document.removeEventListener('pointerup', onUp); };
    document.addEventListener('pointermove', onMove2);
    document.addEventListener('pointerup', onUp);
  };
  return (
    <div onPointerDown={onPointerDown} style={{ position: 'absolute', left: tool.x, top: tool.y, touchAction: 'none', cursor: 'move', zIndex: 5, background: 'rgba(199,210,254,0.3)', border: '2px dashed #6366f1', borderRadius: 10, padding: 8, width: w, height: h }}>
      <button data-remove="1" onClick={() => onRemove(tool.id)} style={{ position: 'absolute', top: -8, right: -8, width: 18, height: 18, borderRadius: '50%', background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', fontSize: 10, lineHeight: '18px', textAlign: 'center' }}>✕</button>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${CELL}px)`, gap: 3 }}>
        {Array.from({ length: cols * rows }).map((_, i) => (
          <div key={i} style={{ width: CELL, height: CELL, border: '1.5px solid #6366f1', borderRadius: 5, background: 'rgba(255,255,255,0.4)' }} />
        ))}
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
      const onUp = () => { onGroupDragEnd && onGroupDragEnd(); document.removeEventListener('pointermove', onMoveEvt); document.removeEventListener('pointerup', onUp); };
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
    <div onPointerDown={onPointerDown} style={{
      position: 'absolute', left: item.x, top: item.y,
      transform: `rotate(${item.rotation}deg)`,
      fontSize: 28, cursor: frozen ? 'default' : 'grab',
      touchAction: 'none', zIndex: 10, lineHeight: 1,
      outline: selected ? '3px dashed #6366f1' : 'none', borderRadius: 6,
    }}>
      {item.emoji}
    </div>
  );
}

function EraserCursor() {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  useEffect(() => {
    const move = (e) => { const src = e.touches ? e.touches[0] : e; setPos({ x: src.clientX, y: src.clientY }); };
    window.addEventListener('mousemove', move);
    window.addEventListener('touchmove', move, { passive: true });
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('touchmove', move); };
  }, []);
  return <div style={{ position: 'fixed', left: pos.x - 18, top: pos.y - 18, width: 36, height: 36, borderRadius: '50%', background: 'rgba(150,150,150,0.5)', border: '2px solid #999', pointerEvents: 'none', zIndex: 9999 }} />;
}

// strokes are stored as normalized {x,y} in [0,1] — multiply by canvas CSS size to draw
function drawNormalizedStrokes(ctx, strokes, w, h, currentStroke) {
  ctx.clearRect(0, 0, w, h);
  const all = [...strokes, ...(currentStroke ? [currentStroke] : [])].filter(s => s && s.length >= 2);
  all.forEach(pts => {
    ctx.beginPath(); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.moveTo(pts[0].x * w, pts[0].y * h);
    pts.slice(1).forEach(p => ctx.lineTo(p.x * w, p.y * h));
    ctx.stroke();
  });
}

function DrawingDisplay({ strokes, strokeCount }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.offsetWidth, h = c.offsetHeight;
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
    drawNormalizedStrokes(ctx, strokes, w, h, null);
  }, [strokes, strokeCount]);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 15, pointerEvents: 'none' }} />;
}

export default function CollectionCanvas({ seed, count, onDone, hideButton }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const lassoCanvasRef = useRef(null);
  const isDrawing = useRef(false);
  const currentStroke = useRef([]);
  const strokesRef = useRef([]);
  const nextToolId = useRef(0);
  const lassoDragRef = useRef(null);
  const selectedIdsRef = useRef(new Set());
  const itemsRef = useRef([]);

  const [items, setItems] = useState([]);
  const [placedTools, setPlacedTools] = useState([]);
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());
  const [activeTool, setActiveTool] = useState('move');
  const [strokeCount, setStrokeCount] = useState(0);

  const drawMode = activeTool === 'draw' || activeTool === 'eraser';
  const eraserMode = activeTool === 'eraser';

  // Place items centered in canvas, leaving edges for tools
  useEffect(() => {
    const el = containerRef.current;
    const doPlace = () => {
      const { width, height } = el.getBoundingClientRect();
      const collection = generateCollection(seed, count);
      const marginX = Math.min(170, width * 0.22);
      const marginY = Math.min(60, height * 0.15);
      const areaX = marginX, areaW = width - marginX * 2 - 36;
      const areaY = marginY, areaH = height - marginY * 2 - 36;
      const placed = [];
      collection.forEach((item, i) => {
        let x, y, tries = 0;
        do {
          x = areaX + Math.random() * Math.max(1, areaW);
          y = areaY + Math.random() * Math.max(1, areaH);
          tries++;
        } while (tries < 300 && placed.some(p => Math.hypot(p.x - x, p.y - y) < 38));
        x = Math.max(0, Math.min(width - 36, x));
        y = Math.max(0, Math.min(height - 36, y));
        placed.push({ ...item, x, y });
      });
      itemsRef.current = placed;
      setItems(placed);
      selectedIdsRef.current = new Set();
      setSelectedItemIds(new Set());
    };
    if (!el) return;
    if (el.clientWidth > 0) { doPlace(); return; }
    // wait for layout
    const ro = new ResizeObserver(() => { if (el.clientWidth > 0) { ro.disconnect(); doPlace(); } });
    ro.observe(el);
    return () => ro.disconnect();
  }, [seed, count]);

  // Clamp all items into bounds when container resizes (orientation change, zoom)
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      setItems(prev => {
        const next = prev.map(it => ({
          ...it,
          x: Math.max(0, Math.min(width - 36, it.x)),
          y: Math.max(0, Math.min(height - 36, it.y)),
        }));
        itemsRef.current = next;
        return next;
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const moveItem = (id, x, y) => {
    const el = containerRef.current; if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setItems(prev => {
      const next = prev.map(it => it.id === id ? {
        ...it,
        x: Math.max(0, Math.min(width - 36, x)),
        y: Math.max(0, Math.min(height - 36, y)),
      } : it);
      itemsRef.current = next;
      return next;
    });
  };

  const addTool = (type) => {
    const count = placedTools.length;
    setPlacedTools(t => [...t, { id: nextToolId.current++, type, x: 8 + count * 18, y: 8 + count * 18 }]);
  };

  const moveTool = (id, x, y) => {
    const el = containerRef.current; if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPlacedTools(t => t.map(tool => {
      if (tool.id !== id) return tool;
      const dims = tool.type === 'plate' ? { w: PLATE_SIZE, h: PLATE_SIZE } : frameDims(tool.type);
      return { ...tool, x: Math.max(0, Math.min(width - dims.w, x)), y: Math.max(0, Math.min(height - dims.h, y)) };
    }));
  };

  const removeTool = (id) => setPlacedTools(t => t.filter(tool => tool.id !== id));

  // Lasso canvas — sits BEHIND items (zIndex 2) when not drawing
  useEffect(() => {
    if (drawMode || !lassoCanvasRef.current) return;
    const c = lassoCanvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * dpr; c.height = c.offsetHeight * dpr;
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);

    let lassoPoints = [], dragging = false;

    const getPos = (e) => {
      const r = c.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      return { x: src.clientX - r.left, y: src.clientY - r.top };
    };

    const redrawLasso = () => {
      ctx.clearRect(0, 0, c.offsetWidth, c.offsetHeight);
      if (lassoPoints.length < 2) return;
      ctx.beginPath(); ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]); ctx.fillStyle = 'rgba(99,102,241,0.08)';
      ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
      lassoPoints.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    };

    const onDown = (e) => {
      e.preventDefault();
      dragging = true;
      lassoPoints = [getPos(e)];
      // attach move/up to document so moving outside canvas doesn't abort lasso
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
    const onMove = (e) => {
      if (!dragging) return;
      e.preventDefault();
      lassoPoints.push(getPos(e));
      redrawLasso();
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      c.dispatchEvent(new CustomEvent('lasso-complete', { bubbles: true, detail: { poly: lassoPoints } }));
      lassoPoints = [];
      ctx.clearRect(0, 0, c.offsetWidth, c.offsetHeight);
    };
    const onTouchStart = (e) => { e.preventDefault(); dragging = true; lassoPoints = [getPos(e)]; };
    const onTouchMove = (e) => { if (!dragging) return; e.preventDefault(); lassoPoints.push(getPos(e)); redrawLasso(); };
    const onTouchEnd = () => {
      if (!dragging) return;
      dragging = false;
      c.dispatchEvent(new CustomEvent('lasso-complete', { bubbles: true, detail: { poly: lassoPoints } }));
      lassoPoints = [];
      ctx.clearRect(0, 0, c.offsetWidth, c.offsetHeight);
    };

    c.addEventListener('mousedown', onDown);
    c.addEventListener('touchstart', onTouchStart, { passive: false });
    c.addEventListener('touchmove', onTouchMove, { passive: false });
    c.addEventListener('touchend', onTouchEnd);
    return () => {
      c.removeEventListener('mousedown', onDown);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      c.removeEventListener('touchstart', onTouchStart);
      c.removeEventListener('touchmove', onTouchMove);
      c.removeEventListener('touchend', onTouchEnd);
    };
  }, [drawMode]);

  // Listen for lasso-complete — use refs for fresh data
  useEffect(() => {
    const c = lassoCanvasRef.current; if (!c) return;
    const pointInPoly = (px, py, poly) => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    };
    const handler = (e) => {
      const poly = e.detail?.poly || [];
      if (poly.length < 3) return;
      const inside = new Set(itemsRef.current.filter(it => pointInPoly(it.x + 14, it.y + 14, poly)).map(it => it.id));
      selectedIdsRef.current = inside;
      setSelectedItemIds(new Set(inside));
    };
    c.addEventListener('lasso-complete', handler);
    return () => c.removeEventListener('lasso-complete', handler);
  }, [drawMode]);

  // Persistent draw canvas — always mounted, always listening to container resize
  // Strokes in normalized [0,1] space so they survive any resize/rotation
  const setupCanvas = () => {
    const c = canvasRef.current; if (!c) return null;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    return { ctx, w: rect.width, h: rect.height };
  };

  const redrawCanvas = () => {
    const c = canvasRef.current; if (!c) return;
    const setup = setupCanvas(); if (!setup) return;
    const { ctx, w, h } = setup;
    drawNormalizedStrokes(ctx, strokesRef.current, w, h, eraserMode ? null : currentStroke.current);
  };

  // Redraw whenever drawMode or eraserMode changes, and on mount
  useEffect(() => {
    redrawCanvas();
  }, [drawMode, eraserMode, strokeCount]);

  // Container ResizeObserver re-setups the pixel buffer and redraws
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const ro = new ResizeObserver(() => {
      // Use rAF so layout is fully committed before we read dimensions
      requestAnimationFrame(() => redrawCanvas());
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;

    const getPos = (e) => {
      const r = c.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      return { x: (src.clientX - r.left) / r.width, y: (src.clientY - r.top) / r.height };
    };

    const onDown = (e) => {
      if (!drawMode) return;
      e.preventDefault(); isDrawing.current = true; currentStroke.current = [getPos(e)];
    };
    const onMove = (e) => {
      if (!isDrawing.current) return; e.preventDefault();
      currentStroke.current.push(getPos(e));
      if (eraserMode) {
        const pt = currentStroke.current[currentStroke.current.length - 1];
        strokesRef.current = strokesRef.current.filter(s => !s.some(p => Math.hypot(p.x - pt.x, p.y - pt.y) < 0.05));
        setStrokeCount(n => n);
      }
      redrawCanvas();
    };
    const onUp = () => {
      if (!isDrawing.current) return; isDrawing.current = false;
      if (!eraserMode && currentStroke.current.length >= 2) {
        strokesRef.current = [...strokesRef.current, [...currentStroke.current]];
        setStrokeCount(n => n + 1);
      } else { setStrokeCount(n => n + 1); }
      currentStroke.current = []; redrawCanvas();
    };

    c.addEventListener('mousedown', onDown); c.addEventListener('mousemove', onMove);
    c.addEventListener('mouseup', onUp); c.addEventListener('mouseleave', onUp);
    c.addEventListener('touchstart', onDown, { passive: false }); c.addEventListener('touchmove', onMove, { passive: false });
    c.addEventListener('touchend', onUp);
    return () => {
      c.removeEventListener('mousedown', onDown); c.removeEventListener('mousemove', onMove);
      c.removeEventListener('mouseup', onUp); c.removeEventListener('mouseleave', onUp);
      c.removeEventListener('touchstart', onDown); c.removeEventListener('touchmove', onMove);
      c.removeEventListener('touchend', onUp);
    };
  }, [drawMode, eraserMode]);

  return (
    <div className="flex flex-col gap-0 w-full h-full" style={{ userSelect: 'none' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border-b border-indigo-200 rounded-t-2xl flex-wrap">
        <span className="text-xs font-bold text-indigo-600 mr-1">Add tool:</span>
        <button onClick={() => addTool('plate')} title="Click to add, drag to position"
          className="px-3 py-1.5 bg-white border border-indigo-300 rounded-lg text-sm font-semibold text-indigo-700 hover:bg-indigo-100 shadow-sm">⬤ Plate</button>
        <button onClick={() => addTool('five_frame')} title="Click to add, drag to position"
          className="px-3 py-1.5 bg-white border border-indigo-300 rounded-lg text-sm font-semibold text-indigo-700 hover:bg-indigo-100 shadow-sm">5-Frame</button>
        <button onClick={() => addTool('ten_frame')} title="Click to add, drag to position"
          className="px-3 py-1.5 bg-white border border-indigo-300 rounded-lg text-sm font-semibold text-indigo-700 hover:bg-indigo-100 shadow-sm">10-Frame</button>
        <div className="w-px h-5 bg-indigo-200 mx-1" />
        <button onClick={() => setActiveTool(activeTool === 'draw' ? 'move' : 'draw')}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm border transition-all ${activeTool === 'draw' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-blue-600 border-blue-300 hover:bg-blue-50'}`}>
          ✏️ Draw
        </button>
        <button onClick={() => setActiveTool(activeTool === 'eraser' ? 'move' : 'eraser')}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm border transition-all ${activeTool === 'eraser' ? 'bg-gray-600 text-white border-gray-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
          ⬜ Eraser
        </button>
        {selectedItemIds.size > 0 && <span className="text-xs text-indigo-500 font-bold">Group — drag to move</span>}
        {strokeCount > 0 && <>
          <button onClick={() => { strokesRef.current = strokesRef.current.slice(0, -1); setStrokeCount(n => Math.max(0, n - 1)); }} className="px-2 py-1 text-xs text-gray-500 hover:text-red-500">↩ Undo</button>
          <button onClick={() => { strokesRef.current = []; setStrokeCount(0); }} className="px-2 py-1 text-xs text-red-400 hover:text-red-600">🗑 Clear</button>
        </>}
        {!hideButton && (
          <button onClick={onDone} className="ml-auto px-4 py-1.5 bg-green-500 text-white font-bold rounded-lg text-sm shadow hover:bg-green-600">
            ✓ I counted them!
          </button>
        )}
      </div>

      {/* Canvas area */}
      <div ref={containerRef} style={{ position: 'relative', flex: 1, minHeight: 0, background: '#fefce8', borderRadius: '0 0 16px 16px', overflow: 'hidden', border: '1px solid #fde68a' }}>
        {placedTools.map(tool =>
          tool.type === 'plate'
            ? <Plate key={tool.id} tool={tool} onMove={moveTool} onRemove={removeTool} />
            : <FrameContainer key={tool.id} tool={tool} onMove={moveTool} onRemove={removeTool} />
        )}
        {items.map(item => (
          <DraggableItem key={item.id} item={item} onMove={moveItem}
            frozen={drawMode}
            selected={selectedItemIds.has(item.id)}
            onGroupDragStart={(id) => {
              const group = itemsRef.current.filter(it => selectedIdsRef.current.has(it.id));
              lassoDragRef.current = { ids: group.map(i => i.id), origPositions: Object.fromEntries(group.map(i => [i.id, { x: i.x, y: i.y }])) };
            }}
            onGroupDragMove={(dx, dy) => {
              if (!lassoDragRef.current) return;
              const { ids, origPositions } = lassoDragRef.current;
              setItems(prev => {
                const next = prev.map(it => ids.includes(it.id) ? { ...it, x: origPositions[it.id].x + dx, y: origPositions[it.id].y + dy } : it);
                itemsRef.current = next;
                return next;
              });
            }}
            onGroupDragEnd={() => { lassoDragRef.current = null; }}
          />
        ))}
        {/* Lasso canvas behind items */}
        <canvas ref={lassoCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 2, cursor: 'crosshair', pointerEvents: drawMode ? 'none' : 'auto' }} />
        {drawMode && eraserMode && <EraserCursor />}
        {/* Draw canvas — always mounted so strokes persist; pointer-events toggled by drawMode */}
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 20, cursor: eraserMode ? 'none' : 'crosshair', pointerEvents: drawMode ? 'auto' : 'none' }} />
        {strokeCount > 0 && !drawMode && <DrawingDisplay strokes={strokesRef.current} strokeCount={strokeCount} />}
      </div>
    </div>
  );
}