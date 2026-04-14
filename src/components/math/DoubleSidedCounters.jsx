import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const COUNTER_R = 14;

// Compute frame dimensions (same formula as FrameContainer)
const CELL = 32;
function frameDims(type) {
  const cols = 5, rows = type === 'five_frame' ? 1 : 2;
  return { w: cols * CELL + (cols - 1) * 3 + 16, h: rows * CELL + (rows > 1 ? 3 : 0) + 16 };
}
const PLATE_SIZE = 120;

function generateCounters(total) {
  // Bias toward balanced splits: each color gets 30-70% of total
  const minRed = Math.max(1, Math.round(total * 0.30));
  const maxRed = Math.min(total - 1, Math.round(total * 0.70));
  const red = minRed + Math.floor(Math.random() * (maxRed - minRed + 1));
  const yellow = total - red;
  const arr = [...Array(red).fill('red'), ...Array(yellow).fill('yellow')];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function randomTotal() { return Math.floor(Math.random() * 6) + 25; }

// ── Plate (copied from CollectionCanvas Plate) ──
function Plate({ tool, onMove, onRemove }) {
  const startPos = useRef(null);
  const onPointerDown = (e) => {
    if (e.target.closest('[data-remove]')) return;
    e.stopPropagation();
    startPos.current = { mx: e.clientX, my: e.clientY, ox: tool.x, oy: tool.y };
    const onMove2 = (ev) => onMove(tool.id, startPos.current.ox + ev.clientX - startPos.current.mx, startPos.current.oy + ev.clientY - startPos.current.my);
    const onUp = () => { document.removeEventListener('pointermove', onMove2); document.removeEventListener('pointerup', onUp); };
    document.addEventListener('pointermove', onMove2);
    document.addEventListener('pointerup', onUp);
  };
  return (
    <div onPointerDown={onPointerDown} style={{ position: 'absolute', left: tool.x, top: tool.y, touchAction: 'none', cursor: 'move', zIndex: 5 }}>
      <div style={{ width: 120, height: 120, borderRadius: '50%', border: '3px dashed #94a3b8', background: 'rgba(148,163,184,0.15)', position: 'relative' }}>
        <button data-remove="1" onClick={() => onRemove(tool.id)} style={{ position: 'absolute', top: -8, right: -8, width: 18, height: 18, borderRadius: '50%', background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', fontSize: 10, lineHeight: '18px', textAlign: 'center' }}>✕</button>
      </div>
    </div>
  );
}

// ── Frame (copied from CollectionCanvas FrameContainer) ──
function FrameContainer({ tool, onMove, onRemove }) {
  const isFive = tool.type === 'five_frame';
  const cols = 5, rows = isFive ? 1 : 2;
  const cellSize = 32;
  const w = cols * cellSize + (cols - 1) * 3 + 16;
  const h = rows * cellSize + (rows > 1 ? 3 : 0) + 16;
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
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`, gap: 3 }}>
        {Array.from({ length: cols * rows }).map((_, i) => (
          <div key={i} style={{ width: cellSize, height: cellSize, border: '1.5px solid #6366f1', borderRadius: 5, background: 'rgba(255,255,255,0.4)' }} />
        ))}
      </div>
    </div>
  );
}

// ── Counter item (same drag logic as CollectionCanvas DraggableItem) ──
function CounterItem({ item, frozen, selected, onMove, onGroupDragStart, onGroupDragMove, onGroupDragEnd }) {
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
  const bg = item.color === 'red'
    ? 'radial-gradient(circle at 35% 30%, #ff6b6b, #dc2626)'
    : 'radial-gradient(circle at 35% 30%, #fde68a, #ca8a04)';
  const border = item.color === 'red' ? '#991b1b' : '#92400e';
  const size = COUNTER_R * 2;
  return (
    <div onPointerDown={onPointerDown} style={{
      position: 'absolute', left: item.x, top: item.y,
      width: size, height: size, borderRadius: '50%',
      background: bg,
      border: `2px solid ${selected ? '#6366f1' : border}`,
      boxShadow: selected ? '0 0 0 2px #a5b4fc' : '0 1px 4px rgba(0,0,0,0.25)',
      cursor: frozen ? 'default' : 'grab',
      touchAction: 'none', zIndex: 10,
    }} />
  );
}

// ── WriteCanvas — copied exactly from SimpleWritingCanvas lines, but inline ──
function WriteCanvas() {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const allStrokes = useRef([]);
  const currentStroke = useRef([]);

  const getPos = (e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const scaleX = c.width / rect.width;
    const scaleY = c.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
  };

  const startDraw = (e) => {
    e.preventDefault();
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos;
    currentStroke.current = [pos];
    drawing.current = true;
  };

  const draw = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#4338ca';
    const prev = lastPos.current;
    const midX = (prev.x + pos.x) / 2;
    const midY = (prev.y + pos.y) / 2;
    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(midX, midY);
    lastPos.current = pos;
    currentStroke.current.push(pos);
  };

  const endDraw = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    drawing.current = false;
    if (currentStroke.current.length > 0) {
      allStrokes.current = [...allStrokes.current, currentStroke.current];
      currentStroke.current = [];
    }
  };

  const clear = () => {
    const c = canvasRef.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    allStrokes.current = [];
    currentStroke.current = [];
  };

  return (
    <div className="flex flex-col items-center gap-1 select-none w-full">
      <div className="relative rounded-2xl border-4 overflow-hidden w-full" style={{ height: 90, background: '#f8fbff', borderColor: '#c7d2fe' }}>
        <svg className="absolute inset-0 pointer-events-none" width="100%" height="90">
          <line x1="0" y1="18"  x2="100%" y2="18"  stroke="#aac4e0" strokeWidth="1" />
          <line x1="0" y1="45"  x2="100%" y2="45"  stroke="#aac4e0" strokeWidth="1" strokeDasharray="6,4" />
          <line x1="0" y1="72" x2="100%" y2="72" stroke="#3b82f6" strokeWidth="1.5" />
          <line x1="0" y1="86" x2="100%" y2="86" stroke="#aac4e0" strokeWidth="1" />
        </svg>
        <canvas
          ref={canvasRef}
          width={200}
          height={120}
          className="absolute inset-0 touch-none w-full h-full"
          style={{ background: 'transparent', cursor: 'crosshair' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      <button onClick={clear} className="text-[10px] text-gray-400 self-end" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>🗑 Clear</button>
    </div>
  );
}

// ── Digit display + numpad ──
function DigitPad({ value, onChange, color }) {
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'];
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-12 h-12 rounded-2xl border-4 flex items-center justify-center text-2xl font-black"
        style={{ borderColor: color, color }}>
        {value ?? '?'}
      </div>
      <div className="grid grid-cols-3 gap-0.5">
        {digits.map((d, i) => (
          <button key={i} onClick={() => {
            if (d === 'del') onChange(value !== null && value >= 10 ? Math.floor(value / 10) : null);
            else if (d !== null) { const next = (value ?? 0) * 10 + d; if (next <= 99) onChange(next); }
          }} disabled={d === null}
            className="w-8 h-8 rounded-lg font-bold text-sm flex items-center justify-center transition-all active:scale-90"
            style={{ background: d === null ? 'transparent' : d === 'del' ? '#fee2e2' : '#f1f5f9', color: d === 'del' ? '#dc2626' : '#334155', border: d === null ? 'none' : '1px solid #e2e8f0' }}>
            {d === 'del' ? '⌫' : d === null ? '' : d}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── EraserCursor (copied from CollectionCanvas) ──
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

// ── DrawingDisplay (copied from CollectionCanvas) ──
function DrawingDisplay({ strokes, strokeCount }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * dpr; c.height = c.offsetHeight * dpr;
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, c.offsetWidth, c.offsetHeight);
    ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    strokes.forEach(pts => {
      if (pts.length < 2) return;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke();
    });
  }, [strokes, strokeCount]);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 15, pointerEvents: 'none' }} />;
}

// ── Counter canvas area ──
function CounterCanvas({ counters }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);      // draw strokes
  const lassoCanvasRef = useRef(null); // lasso overlay
  const isDrawing = useRef(false);
  const currentStroke = useRef([]);
  const strokesRef = useRef([]);
  const nextToolId = useRef(0);
  const lassoDragRef = useRef(null);

  const [items, setItems] = useState([]);
  const itemsRef = useRef([]);
  const [placedTools, setPlacedTools] = useState([]);
  const selectedIdsRef = useRef(new Set());
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());
  const [activeTool, setActiveTool] = useState('move');
  const [strokeCount, setStrokeCount] = useState(0);

  const drawMode = activeTool === 'draw' || activeTool === 'eraser';
  const eraserMode = activeTool === 'eraser';

  // Spread counters — random in the center zone (leave edges for tools)
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const size = COUNTER_R * 2;
    // Reserve ~160px on left and right for frames/plates, ~60px top/bottom
    const marginX = Math.min(160, width * 0.22);
    const marginY = Math.min(60, height * 0.15);
    const areaX = marginX, areaW = width - marginX * 2 - size;
    const areaY = marginY, areaH = height - marginY * 2 - size;
    const placed = [];
    counters.forEach((color, i) => {
      let x, y, tries = 0;
      do {
        x = areaX + Math.random() * Math.max(1, areaW);
        y = areaY + Math.random() * Math.max(1, areaH);
        tries++;
      } while (tries < 300 && placed.some(p => Math.hypot(p.x - x, p.y - y) < size + 3));
      // Clamp to canvas
      x = Math.max(0, Math.min(width - size, x));
      y = Math.max(0, Math.min(height - size, y));
      placed.push({ id: i, color, x, y });
    });
    itemsRef.current = placed;
    setItems(placed);
    selectedIdsRef.current = new Set();
    setSelectedItemIds(new Set());
  }, [counters]);

  const moveItem = (id, x, y) => {
    const el = containerRef.current; if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setItems(prev => {
      const next = prev.map(it => it.id === id ? {
        ...it,
        x: Math.max(0, Math.min(width - COUNTER_R * 2, x)),
        y: Math.max(0, Math.min(height - COUNTER_R * 2, y)),
      } : it);
      itemsRef.current = next;
      return next;
    });
  };

  const addTool = (type) => {
    // Place new tools staggered in the top-left area so they don't land on counters
    const el = containerRef.current;
    const count = placedTools.length;
    const offset = count * 20;
    const x = 8 + offset;
    const y = 8 + offset;
    setPlacedTools(t => [...t, { id: nextToolId.current++, type, x, y }]);
  };

  const moveTool = (id, x, y) => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPlacedTools(t => t.map(tool => {
      if (tool.id !== id) return tool;
      const dims = tool.type === 'plate'
        ? { w: PLATE_SIZE, h: PLATE_SIZE }
        : frameDims(tool.type);
      return {
        ...tool,
        x: Math.max(0, Math.min(width - dims.w, x)),
        y: Math.max(0, Math.min(height - dims.h, y)),
      };
    }));
  };

  const removeTool = (id) => setPlacedTools(t => t.filter(tool => tool.id !== id));

  // Lasso canvas — active when NOT drawing (exact copy from CollectionCanvas)
  useEffect(() => {
    if (drawMode || !lassoCanvasRef.current) return;
    const c = lassoCanvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * dpr;
    c.height = c.offsetHeight * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);

    let lassoPoints = [], dragging = false, startPt = null;
    const TAP_THRESHOLD = 8; // px — less than this = tap, not drag

    const getPos = (e) => {
      const r = c.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      return { x: src.clientX - r.left, y: src.clientY - r.top };
    };

    const isTap = (pts) => {
      if (!startPt || pts.length < 2) return true;
      const last = pts[pts.length - 1];
      return Math.hypot(last.x - startPt.x, last.y - startPt.y) < TAP_THRESHOLD;
    };

    const redrawLasso = () => {
      ctx.clearRect(0, 0, c.offsetWidth, c.offsetHeight);
      if (lassoPoints.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]); ctx.fillStyle = 'rgba(99,102,241,0.08)';
      ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
      lassoPoints.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    };

    const onDown = (e) => {
      e.preventDefault();
      dragging = true;
      startPt = getPos(e);
      lassoPoints = [startPt];
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
    const onMove = (e) => { if (!dragging) return; e.preventDefault(); lassoPoints.push(getPos(e)); redrawLasso(); };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (isTap(lassoPoints)) {
        // Tap on empty space — clear selection
        c.dispatchEvent(new CustomEvent('lasso-clear', { bubbles: true }));
      } else {
        c.dispatchEvent(new CustomEvent('lasso-complete', { bubbles: true, detail: { poly: lassoPoints } }));
      }
      lassoPoints = []; startPt = null;
      ctx.clearRect(0, 0, c.offsetWidth, c.offsetHeight);
    };
    const onTouchStart = (e) => { e.preventDefault(); dragging = true; startPt = getPos(e); lassoPoints = [startPt]; };
    const onTouchMove = (e) => { if (!dragging) return; e.preventDefault(); lassoPoints.push(getPos(e)); redrawLasso(); };
    const onTouchEnd = () => {
      if (!dragging) return;
      dragging = false;
      if (isTap(lassoPoints)) {
        c.dispatchEvent(new CustomEvent('lasso-clear', { bubbles: true }));
      } else {
        c.dispatchEvent(new CustomEvent('lasso-complete', { bubbles: true, detail: { poly: lassoPoints } }));
      }
      lassoPoints = []; startPt = null;
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

  // Listen for lasso-complete
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
      const inside = new Set(itemsRef.current.filter(it => pointInPoly(it.x + COUNTER_R, it.y + COUNTER_R, poly)).map(it => it.id));
      selectedIdsRef.current = inside;
      setSelectedItemIds(new Set(inside));
    };
    const clearHandler = () => {
      selectedIdsRef.current = new Set();
      setSelectedItemIds(new Set());
    };
    c.addEventListener('lasso-complete', handler);
    c.addEventListener('lasso-clear', clearHandler);
    return () => { c.removeEventListener('lasso-complete', handler); c.removeEventListener('lasso-clear', clearHandler); };
  }, [drawMode]);

  // Draw canvas (copied from CollectionCanvas)
  useEffect(() => {
    if (!drawMode || !canvasRef.current) return;
    const c = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * dpr; c.height = c.offsetHeight * dpr;
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);

    const redraw = () => {
      ctx.clearRect(0, 0, c.offsetWidth, c.offsetHeight);
      const all = [...strokesRef.current, ...(eraserMode ? [] : [currentStroke.current])].filter(s => s && s.length >= 2);
      all.forEach(pts => {
        ctx.beginPath(); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.moveTo(pts[0].x, pts[0].y); pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke();
      });
    };
    redraw();

    const getPos = (e) => {
      const r = c.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      return { x: src.clientX - r.left, y: src.clientY - r.top };
    };

    const onDown = (e) => { e.preventDefault(); isDrawing.current = true; currentStroke.current = [getPos(e)]; };
    const onMove = (e) => {
      if (!isDrawing.current) return; e.preventDefault();
      currentStroke.current.push(getPos(e));
      if (eraserMode) {
        const pt = currentStroke.current[currentStroke.current.length - 1];
        strokesRef.current = strokesRef.current.filter(s => !s.some(p => Math.hypot(p.x - pt.x, p.y - pt.y) < 18));
        setStrokeCount(n => n);
      }
      redraw();
    };
    const onUp = () => {
      if (!isDrawing.current) return; isDrawing.current = false;
      if (!eraserMode && currentStroke.current.length >= 2) {
        strokesRef.current = [...strokesRef.current, [...currentStroke.current]];
        setStrokeCount(n => n + 1);
      } else { setStrokeCount(n => n + 1); }
      currentStroke.current = []; redraw();
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
      {/* Toolbar — same style as CollectionCanvas */}
      <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border-b border-indigo-200 rounded-t-2xl flex-wrap">
        <span className="text-xs font-bold text-indigo-600 mr-1">Add:</span>
        <button onClick={() => addTool('plate')} className="px-3 py-1.5 bg-white border border-indigo-300 rounded-lg text-sm font-semibold text-indigo-700 hover:bg-indigo-100 shadow-sm" title="Click to add, then drag to position">⬤ Plate</button>
        <button onClick={() => addTool('five_frame')} className="px-3 py-1.5 bg-white border border-indigo-300 rounded-lg text-sm font-semibold text-indigo-700 hover:bg-indigo-100 shadow-sm" title="Click to add, then drag to position">5-Frame</button>
        <button onClick={() => addTool('ten_frame')} className="px-3 py-1.5 bg-white border border-indigo-300 rounded-lg text-sm font-semibold text-indigo-700 hover:bg-indigo-100 shadow-sm" title="Click to add, then drag to position">10-Frame</button>
        <div className="w-px h-5 bg-indigo-200 mx-1" />
        <button onClick={() => setActiveTool(activeTool === 'draw' ? 'move' : 'draw')}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm border transition-all ${activeTool === 'draw' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-blue-600 border-blue-300 hover:bg-blue-50'}`}>
          ✏️ Draw
        </button>
        <button onClick={() => setActiveTool(activeTool === 'eraser' ? 'move' : 'eraser')}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm border transition-all ${activeTool === 'eraser' ? 'bg-gray-600 text-white border-gray-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
          ⬜ Eraser
        </button>
        {selectedItemIds.size > 0 && <span className="text-xs text-indigo-500 font-bold">Group selected — drag to move</span>}
        {strokeCount > 0 && <>
          <button onClick={() => { strokesRef.current = strokesRef.current.slice(0, -1); setStrokeCount(n => Math.max(0, n - 1)); }} className="px-2 py-1 text-xs text-gray-500 hover:text-red-500">↩ Undo</button>
          <button onClick={() => { strokesRef.current = []; setStrokeCount(0); }} className="px-2 py-1 text-xs text-red-400 hover:text-red-600">🗑 Clear</button>
        </>}
      </div>

      {/* Canvas area */}
      <div ref={containerRef} style={{ position: 'relative', flex: 1, minHeight: 0, background: '#fefce8', borderRadius: '0 0 16px 16px', overflow: 'hidden', border: '1px solid #fde68a' }}>
        {placedTools.map(tool =>
          tool.type === 'plate'
            ? <Plate key={tool.id} tool={tool} onMove={moveTool} onRemove={removeTool} />
            : <FrameContainer key={tool.id} tool={tool} onMove={moveTool} onRemove={removeTool} />
        )}
        {items.map(item => (
          <CounterItem key={item.id} item={item} frozen={drawMode} selected={selectedItemIds.has(item.id)}
            onMove={moveItem}
            onGroupDragStart={(id) => {
              const curItems = itemsRef.current;
              const curSel = selectedIdsRef.current;
              const group = curItems.filter(it => curSel.has(it.id));
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
        {/* Lasso canvas sits BEHIND items (zIndex 2) so items get pointer events first */}
        <canvas ref={lassoCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 2, cursor: 'crosshair', pointerEvents: drawMode ? 'none' : 'auto' }} />
        {drawMode && eraserMode && <EraserCursor />}
        {drawMode && (
          <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 20, cursor: eraserMode ? 'none' : 'crosshair' }} />
        )}
        {strokeCount > 0 && !drawMode && <DrawingDisplay strokes={strokesRef.current} strokeCount={strokeCount} />}
      </div>
    </div>
  );
}

// ── DropZone + DragWord — copied from RollCompareGame ──
function DropZone({ filled, selected, onPlace, dropRef, feedback, submitted }) {
  let borderColor = 'border-gray-300';
  let bg = 'bg-gray-50';
  let textColor = 'text-gray-400';
  if (filled && submitted) {
    borderColor = feedback?.compOk ? 'border-green-500' : 'border-red-400';
    bg = feedback?.compOk ? 'bg-green-50' : 'bg-red-50';
    textColor = feedback?.compOk ? 'text-green-700' : 'text-red-600';
  } else if (filled) {
    borderColor = 'border-indigo-500'; bg = 'bg-indigo-100'; textColor = 'text-indigo-700';
  } else if (selected) {
    borderColor = 'border-indigo-400'; bg = 'bg-indigo-50'; textColor = 'text-indigo-500';
  }
  return (
    <div ref={dropRef} onClick={() => { if (!filled && selected) onPlace(selected); }}
      className={`min-w-[110px] h-10 rounded-xl border-4 border-dashed flex items-center justify-center font-black text-xs transition-all ${borderColor} ${bg} ${textColor} ${(!filled && selected) ? 'cursor-pointer' : ''}`}>
      {filled || (selected ? 'tap to place' : 'drag or tap')}
    </div>
  );
}

function DragWord({ label, value, dropped, selected, onSelect, onDrop, dropRef, correct, submitted }) {
  const handlePointerDown = (e) => {
    if (dropped) return;
    e.preventDefault();
    new Audio(`/audio/${value}.mp3`).play().catch(() => {});
    onSelect(value);
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    const clone = document.createElement('div');
    clone.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;padding:10px 14px;background:#4f46e5;color:white;font-weight:900;border-radius:14px;font-size:13px;white-space:nowrap;';
    clone.textContent = label;
    document.body.appendChild(clone);
    const move = (cx, cy) => { clone.style.left = (cx - clone.offsetWidth / 2) + 'px'; clone.style.top = (cy - 24) + 'px'; };
    move(e.clientX, e.clientY);
    const onMove = (ev) => {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      if (Math.abs(cx - startX) > 6 || Math.abs(cy - startY) > 6) moved = true;
      move(cx, cy);
    };
    const onUp = (ev) => {
      const cx = ev.changedTouches ? ev.changedTouches[0].clientX : ev.clientX;
      const cy = ev.changedTouches ? ev.changedTouches[0].clientY : ev.clientY;
      clone.remove();
      if (moved && dropRef?.current) {
        const rect = dropRef.current.getBoundingClientRect();
        if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) onDrop(value);
      }
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp);
  };

  let style = 'bg-indigo-600 text-white hover:bg-indigo-700';
  if (submitted) {
    if (correct) style = 'bg-green-500 text-white';
    else if (dropped) style = 'bg-red-400 text-white';
    else style = 'bg-gray-200 text-gray-500';
  } else if (dropped) {
    style = 'opacity-30 cursor-not-allowed bg-indigo-200 text-indigo-400';
  } else if (selected) {
    style = 'bg-white text-indigo-700 border-4 border-indigo-500';
  }

  return (
    <div onPointerDown={handlePointerDown} style={{ touchAction: 'none', userSelect: 'none' }}
      className={`px-4 py-3 rounded-2xl font-black text-sm select-none shadow-lg transition-all cursor-grab ${style}`}>
      {label}
    </div>
  );
}

// ── Sentence phase ──
function SentencePhase({ redCount, yellowCount, attempts, onAttempt, onNewRound }) {
  const [placed, setPlaced] = useState(null);
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const dropRef = useRef(null);

  const CORRECT_VALUE = redCount > yellowCount ? 'is_greater_than' : redCount < yellowCount ? 'is_less_than' : 'is_equal_to';
  const CORRECT_LABEL = { is_greater_than: 'is greater than', is_less_than: 'is less than', is_equal_to: 'is equal to' }[CORRECT_VALUE];
  const LABEL_MAP = { is_greater_than: 'is greater than', is_less_than: 'is less than', is_equal_to: 'is equal to' };

  const handlePlace = (value) => {
    if (placed) return;
    const correct = value === CORRECT_VALUE;
    setPlaced(LABEL_MAP[value]);
    setResult(correct ? 'correct' : 'wrong');
    onAttempt(attempts + 1, correct);
  };

  const submitted = !!placed;
  const showAnswer = result === 'wrong' && attempts >= 2;

  return (
    <div className="flex flex-col items-center gap-2 bg-white rounded-2xl px-3 py-3 shadow-lg mx-2 mb-2">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Complete the Sentence!</p>

      {/* Numbers + blank */}
      <div className="flex flex-wrap items-center justify-center gap-2 text-xl font-black text-gray-800">
        <span className="bg-amber-100 px-2 py-1 rounded-lg">{redCount}</span>
        <DropZone filled={placed} selected={selected ? LABEL_MAP[selected] : null}
          onPlace={() => handlePlace(selected)}
          dropRef={dropRef}
          feedback={{ compOk: result === 'correct' }}
          submitted={submitted} />
        <span className="bg-amber-100 px-2 py-1 rounded-lg">{yellowCount}</span>
      </div>

      {/* Drag words */}
      {!submitted && (
        <div className="flex flex-wrap gap-1.5 justify-center">
          {['is_greater_than', 'is_less_than', 'is_equal_to'].map(v => (
            <DragWord key={v} label={LABEL_MAP[v]} value={v}
              dropped={false} selected={selected === v}
              onSelect={setSelected}
              onDrop={(val) => { handlePlace(val); setSelected(null); }}
              dropRef={dropRef}
              correct={v === CORRECT_VALUE}
              submitted={false} />
          ))}
        </div>
      )}

      {/* Result */}
      {result && (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className={`w-full rounded-xl px-3 py-2 flex items-center justify-between gap-2 ${result === 'correct' ? 'bg-green-50 border-2 border-green-400' : 'bg-red-50 border-2 border-red-300'}`}>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{result === 'correct' ? '🎉' : '🤔'}</span>
            <div>
              <p className="font-black text-sm">{result === 'correct' ? 'Correct!' : 'Not quite…'}</p>
              {showAnswer && <p className="text-xs text-gray-500">Answer: <strong>{CORRECT_LABEL}</strong></p>}
            </div>
          </div>
          {result === 'correct' || showAnswer ? (
            <button onClick={onNewRound}
              className="bg-indigo-600 text-white font-black text-xs px-4 py-2 rounded-xl shadow">
              🔄 New Round
            </button>
          ) : (
            <button onClick={() => { setPlaced(null); setSelected(null); setResult(null); }}
              className="bg-orange-500 text-white font-black text-xs px-4 py-2 rounded-xl shadow">
              Try Again
            </button>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ── Main ──
export default function DoubleSidedCounters({ onBack }) {
  const [counters, setCounters] = useState([]);
  const [shaking, setShaking] = useState(false);
  const [spilled, setSpilled] = useState(false);
  const [total, setTotal] = useState(null);
  const [redInput, setRedInput] = useState(null);
  const [yellowInput, setYellowInput] = useState(null);
  const [countSubmitted, setCountSubmitted] = useState(false);
  const [countFeedback, setCountFeedback] = useState(null);
  const [sentenceAttempts, setSentenceAttempts] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [streak, setStreak] = useState(0);

  const actualRed = counters.filter(c => c === 'red').length;
  const actualYellow = counters.filter(c => c === 'yellow').length;

  const shake = () => {
    if (shaking) return;
    const t = randomTotal();
    setTotal(t);
    setCounters(generateCounters(t));
    setShaking(true);
    setSpilled(false);
    setCountSubmitted(false);
    setCountFeedback(null);
    setRedInput(null);
    setYellowInput(null);
    setSentenceAttempts(0);
    setTimeout(() => { setShaking(false); setSpilled(true); }, 800);
  };

  const handleCheckCount = () => {
    const redOk = redInput === actualRed;
    const yellowOk = yellowInput === actualYellow;
    setCountFeedback({ redOk, yellowOk });
    setCountSubmitted(true);
    if (!redOk || !yellowOk) setStreak(0);
  };

  const handleFixCount = () => {
    // Allow student to correct wrong answers — keep correct ones locked
    if (countFeedback?.redOk) { /* keep red locked */ } else { setRedInput(null); }
    if (countFeedback?.yellowOk) { /* keep yellow locked */ } else { setYellowInput(null); }
    setCountSubmitted(false);
    setCountFeedback(null);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde8e8 100%)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2" style={{ background: '#d97706' }}>
        <button onClick={onBack} className="text-white/80 hover:text-white font-bold text-sm">← Back</button>
        <h1 className="text-base font-black text-white flex-1 text-center">🟡🔴 Double-Sided Counters</h1>
        <div className="flex items-center gap-2">
          {streak >= 2 && <span className="text-sm font-black">🔥{streak}</span>}
          <span className="text-sm font-black text-yellow-200">⭐{totalPoints}</span>
        </div>
      </div>

      {/* Cup + Shake */}
      <div className="flex items-center justify-center gap-3 py-2">
        <motion.div animate={shaking ? { rotate: [0, -20, 20, -20, 20, 0], y: [0, -8, 4, -8, 4, 0] } : {}} transition={{ duration: 0.7 }}>
          <svg width="50" height="58" viewBox="0 0 100 110">
            <path d="M15 10 L85 10 L72 100 L28 100 Z" fill="#d97706" stroke="#92400e" strokeWidth="3" />
            <path d="M15 10 L85 10" stroke="#92400e" strokeWidth="4" strokeLinecap="round" />
            {!spilled && Array.from({ length: Math.min(total || 0, 6) }).map((_, i) => (
              <circle key={i} cx={30 + (i % 3) * 18} cy={50 + Math.floor(i / 3) * 16} r="7" fill={i % 2 === 0 ? '#dc2626' : '#ca8a04'} stroke="#fff" strokeWidth="1.5" />
            ))}
          </svg>
        </motion.div>
        <button onClick={shake} disabled={shaking}
          className="px-5 py-2 rounded-2xl font-black text-white text-sm shadow-lg active:scale-95 transition-all disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #d97706, #dc2626)' }}>
          {shaking ? '🫙 Shaking…' : spilled ? '🔄 Shake Again' : '🫙 Shake & Spill!'}
        </button>
        {total && <span className="text-sm font-black text-amber-700">{total} counters</span>}
      </div>

      <AnimatePresence mode="wait">
        {spilled && (
          <motion.div key="count" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col overflow-y-auto" style={{ minHeight: 0 }}>

            {/* Main row: Red panel | Canvas | Yellow panel */}
            <div className="flex flex-row gap-2 px-2" style={{ minHeight: 320, height: 'clamp(320px, 45vh, 480px)', flexShrink: 0 }}>

              {/* RED panel */}
              <div className="flex flex-col items-center gap-1 bg-white rounded-2xl shadow-lg px-2 py-2 shrink-0" style={{ width: 112 }}>
                <div className="flex items-center gap-1">
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#dc2626' }} />
                  <span className="text-xs font-black text-red-600">Red</span>
                </div>
                <WriteCanvas />
                <DigitPad value={redInput} onChange={setRedInput} color="#dc2626" />
                {countSubmitted && (
                  <span className={`text-xs font-bold ${countFeedback?.redOk ? 'text-green-600' : 'text-red-500'}`}>
                    {countFeedback?.redOk ? '✅' : `Ans: ${actualRed}`}
                  </span>
                )}
              </div>

              {/* Counter canvas */}
              <div className="flex-1 rounded-2xl overflow-hidden shadow-lg flex flex-col" style={{ minHeight: 180 }}>
                <CounterCanvas counters={counters} />
              </div>

              {/* YELLOW panel */}
              <div className="flex flex-col items-center gap-1 bg-white rounded-2xl shadow-lg px-2 py-2 shrink-0" style={{ width: 112 }}>
                <div className="flex items-center gap-1">
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ca8a04' }} />
                  <span className="text-xs font-black text-amber-600">Yellow</span>
                </div>
                <WriteCanvas />
                <DigitPad value={yellowInput} onChange={setYellowInput} color="#ca8a04" />
                {countSubmitted && (
                  <span className={`text-xs font-bold ${countFeedback?.yellowOk ? 'text-green-600' : 'text-red-500'}`}>
                    {countFeedback?.yellowOk ? '✅' : `Ans: ${actualYellow}`}
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-center gap-2 py-2 px-2">
              {!countSubmitted && (
                <button onClick={handleCheckCount} disabled={redInput === null || yellowInput === null}
                  className="px-5 py-2 rounded-xl font-black text-white text-sm disabled:opacity-40"
                  style={{ background: '#4338ca' }}>
                  ✅ Check My Count
                </button>
              )}
              {countSubmitted && countFeedback && !(countFeedback.redOk && countFeedback.yellowOk) && (
                <div className="flex flex-col items-center gap-1">
                  <p className="text-sm font-black text-red-600">
                    {!countFeedback.redOk && !countFeedback.yellowOk ? '❌ Both counts are wrong — try again!' :
                     !countFeedback.redOk ? '❌ Red count is wrong — fix it!' :
                     '❌ Yellow count is wrong — fix it!'}
                  </p>
                  <button onClick={handleFixCount}
                    className="px-5 py-2 rounded-xl font-black text-white text-sm"
                    style={{ background: '#ea580c' }}>
                    ✏️ Fix My Count
                  </button>
                </div>
              )}
            </div>
            {/* Sentence phase only shows once both counts are correct */}
            {countSubmitted && countFeedback?.redOk && countFeedback?.yellowOk && (
              <SentencePhase
                redCount={actualRed}
                yellowCount={actualYellow}
                attempts={sentenceAttempts}
                onAttempt={(newAttempts, correct) => {
                  setSentenceAttempts(newAttempts);
                  if (correct) {
                    const pts = newAttempts === 1 ? 10 : newAttempts === 2 ? 5 : 0;
                    if (pts > 0) setTotalPoints(p => p + pts);
                    setStreak(s => s + 1);
                  } else {
                    setStreak(0);
                  }
                }}
                onNewRound={shake}
              />
            )}
          </motion.div>
        )}


      </AnimatePresence>
    </div>
  );
}