import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function generateCounters(total) {
  const red = Math.floor(Math.random() * (total - 1)) + 1;
  const yellow = total - red;
  const counters = [...Array(red).fill('red'), ...Array(yellow).fill('yellow')];
  for (let i = counters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [counters[i], counters[j]] = [counters[j], counters[i]];
  }
  return counters;
}
function randomTotal() { return Math.floor(Math.random() * 10) + 11; }

// ── DOM Plate (circle) ──
function DSPlate({ tool, onMove, onRemove }) {
  const onPointerDown = (e) => {
    if (e.target.closest('[data-remove]')) return;
    e.stopPropagation();
    const ox = tool.x, oy = tool.y, mx = e.clientX, my = e.clientY;
    const mv = (ev) => onMove(tool.id, ox + ev.clientX - mx, oy + ev.clientY - my);
    const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  };
  return (
    <div onPointerDown={onPointerDown} style={{ position: 'absolute', left: tool.x, top: tool.y, touchAction: 'none', cursor: 'move', zIndex: 5 }}>
      <div style={{ width: 100, height: 100, borderRadius: '50%', border: '3px dashed #94a3b8', background: 'rgba(148,163,184,0.12)', position: 'relative' }}>
        <button data-remove="1" onClick={() => onRemove(tool.id)} style={{ position: 'absolute', top: -8, right: -8, width: 18, height: 18, borderRadius: '50%', background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', fontSize: 10, lineHeight: '18px', textAlign: 'center' }}>✕</button>
      </div>
    </div>
  );
}

// ── DOM Frame ──
function DSFrame({ tool, onMove, onRemove }) {
  const isFive = tool.type === 'five_frame';
  const cols = 5, rows = isFive ? 1 : 2;
  const cellSize = 32;
  const w = cols * cellSize + (cols - 1) * 3 + 16;
  const h = rows * cellSize + (rows > 1 ? 3 : 0) + 16;
  const onPointerDown = (e) => {
    if (e.target.closest('[data-remove]')) return;
    e.stopPropagation();
    const ox = tool.x, oy = tool.y, mx = e.clientX, my = e.clientY;
    const mv = (ev) => onMove(tool.id, ox + ev.clientX - mx, oy + ev.clientY - my);
    const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
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

// ── Counter (DOM draggable circle) ──
function Counter({ item, frozen, selected, onMove, onGroupDragStart, onGroupDragMove, onGroupDragEnd }) {
  const COUNTER_R = 22;
  const onPointerDown = (e) => {
    if (frozen) return;
    e.preventDefault(); e.stopPropagation();
    const mx = e.clientX, my = e.clientY;
    if (selected && onGroupDragStart) {
      onGroupDragStart(item.id, mx, my);
      const mv = (ev) => onGroupDragMove && onGroupDragMove(ev.clientX - mx, ev.clientY - my);
      const up = () => { onGroupDragEnd && onGroupDragEnd(); document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); };
      document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
    } else {
      const ox = item.x, oy = item.y;
      const mv = (ev) => onMove(item.id, ox + ev.clientX - mx, oy + ev.clientY - my);
      const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); };
      document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
    }
  };
  const bg = item.color === 'red'
    ? 'radial-gradient(circle at 35% 30%, #ff6b6b, #dc2626)'
    : 'radial-gradient(circle at 35% 30%, #fde68a, #ca8a04)';
  const border = item.color === 'red' ? '#991b1b' : '#92400e';
  return (
    <div onPointerDown={onPointerDown} style={{
      position: 'absolute', left: item.x - COUNTER_R, top: item.y - COUNTER_R,
      width: COUNTER_R * 2, height: COUNTER_R * 2, borderRadius: '50%',
      background: bg, border: `3px solid ${selected ? '#6366f1' : border}`,
      boxShadow: selected ? '0 0 0 3px #a5b4fc' : '0 2px 6px rgba(0,0,0,0.2)',
      cursor: frozen ? 'default' : 'grab', touchAction: 'none', zIndex: 10,
      outline: selected ? '2px dashed #6366f1' : 'none',
    }} />
  );
}

// ── Write canvas (for the two side panels) ──
function WriteCanvas({ dotColor }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const strokesRef = useRef([]);
  const currentRef = useRef(null);
  const draw = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.offsetWidth, c.offsetHeight);
    // guide line
    ctx.strokeStyle = '#c7d2fe'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(8, c.offsetHeight / dpr / 2); ctx.lineTo(c.offsetWidth / dpr - 8, c.offsetHeight / dpr / 2); ctx.stroke();
    ctx.setLineDash([]);
    const all = [...strokesRef.current, currentRef.current].filter(Boolean);
    all.forEach(pts => {
      if (!pts || pts.length < 2) return;
      ctx.beginPath(); ctx.strokeStyle = '#1e1b4b'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke();
    });
  }, []);
  useEffect(() => {
    const el = containerRef.current, c = canvasRef.current; if (!el || !c) return;
    const size = () => {
      const dpr = window.devicePixelRatio || 1;
      c.width = el.offsetWidth * dpr; c.height = el.offsetHeight * dpr;
      c.style.width = el.offsetWidth + 'px'; c.style.height = el.offsetHeight + 'px'; draw();
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(el); return () => ro.disconnect();
  }, [draw]);
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const getPos = (e) => { const r = c.getBoundingClientRect(); const src = e.touches ? e.touches[0] : e; return { x: src.clientX - r.left, y: src.clientY - r.top }; };
    const onDown = (e) => { e.preventDefault(); currentRef.current = [getPos(e)]; draw(); };
    const onMove = (e) => { e.preventDefault(); if (!currentRef.current) return; currentRef.current.push(getPos(e)); draw(); };
    const onUp = () => { if (currentRef.current && currentRef.current.length > 1) strokesRef.current.push([...currentRef.current]); currentRef.current = null; draw(); };
    c.addEventListener('mousedown', onDown); c.addEventListener('mousemove', onMove); c.addEventListener('mouseup', onUp); c.addEventListener('mouseleave', onUp);
    c.addEventListener('touchstart', onDown, { passive: false }); c.addEventListener('touchmove', onMove, { passive: false }); c.addEventListener('touchend', onUp);
    return () => { c.removeEventListener('mousedown', onDown); c.removeEventListener('mousemove', onMove); c.removeEventListener('mouseup', onUp); c.removeEventListener('mouseleave', onUp); c.removeEventListener('touchstart', onDown); c.removeEventListener('touchmove', onMove); c.removeEventListener('touchend', onUp); };
  }, [draw]);
  const clear = () => { strokesRef.current = []; currentRef.current = null; draw(); };
  return (
    <div className="flex flex-col gap-1 w-full">
      <div ref={containerRef} style={{ position: 'relative', width: '100%', height: 90, borderRadius: 12, border: `2px solid ${dotColor}33`, background: 'white', overflow: 'hidden' }}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, cursor: 'crosshair', touchAction: 'none' }} />
        <div style={{ position: 'absolute', bottom: 4, left: 0, right: 0, height: 3, background: dotColor, opacity: 0.5, borderRadius: 2 }} />
      </div>
      <button onClick={clear} style={{ fontSize: 10, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'flex-end' }}>🗑 Clear</button>
    </div>
  );
}

// ── Digit pad for count entry ──
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
            if (d === 'del') onChange(Math.floor((value || 0) / 10));
            else if (d !== null) { const next = (value || 0) * 10 + d; if (next <= 99) onChange(next); }
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

// ── Counter canvas with DOM shapes, lasso, draw ──
function CounterCanvas({ counters }) {
  const containerRef = useRef(null);
  const lassoCanvasRef = useRef(null);
  const drawCanvasRef = useRef(null);
  const COUNTER_R = 22;

  const [items, setItems] = useState([]);
  const [placedTools, setPlacedTools] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [activeTool, setActiveTool] = useState('move'); // 'move' | 'draw' | 'eraser'
  const [strokeCount, setStrokeCount] = useState(0);

  const strokesRef = useRef([]);
  const currentStrokeRef = useRef(null);
  const lassoDragRef = useRef(null);
  const nextId = useRef(0);

  const drawMode = activeTool === 'draw' || activeTool === 'eraser';
  const eraserMode = activeTool === 'eraser';

  // Spread counters on spill
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setItems(counters.map((color, i) => ({
      id: i, color,
      x: COUNTER_R + Math.random() * (width - COUNTER_R * 2),
      y: COUNTER_R + Math.random() * (height - COUNTER_R * 2),
    })));
    setSelectedIds(new Set());
  }, [counters]);

  const moveItem = (id, x, y) => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setItems(prev => prev.map(it => it.id === id ? { ...it, x: Math.max(COUNTER_R, Math.min(width - COUNTER_R, x)), y: Math.max(COUNTER_R, Math.min(height - COUNTER_R, y)) } : it));
  };

  const addTool = (type) => {
    setPlacedTools(t => [...t, { id: nextId.current++, type, x: 20 + (nextId.current % 3) * 110, y: 10 }]);
  };
  const moveTool = (id, x, y) => setPlacedTools(t => t.map(tool => tool.id === id ? { ...tool, x, y } : tool));
  const removeTool = (id) => setPlacedTools(t => t.filter(tool => tool.id !== id));

  // Draw canvas (pencil/eraser)
  useEffect(() => {
    if (!drawMode || !drawCanvasRef.current || !containerRef.current) return;
    const c = drawCanvasRef.current;
    const el = containerRef.current;
    const dpr = window.devicePixelRatio || 1;
    c.width = el.offsetWidth * dpr; c.height = el.offsetHeight * dpr;
    c.style.width = el.offsetWidth + 'px'; c.style.height = el.offsetHeight + 'px';
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);

    const redraw = () => {
      ctx.clearRect(0, 0, el.offsetWidth, el.offsetHeight);
      strokesRef.current.forEach(pts => {
        if (pts.length < 2) return;
        ctx.beginPath(); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.moveTo(pts[0].x, pts[0].y); pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke();
      });
      if (currentStrokeRef.current && currentStrokeRef.current.length > 1) {
        ctx.beginPath(); ctx.strokeStyle = eraserMode ? '#fef9c3' : '#3b82f6'; ctx.lineWidth = eraserMode ? 18 : 3;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.moveTo(currentStrokeRef.current[0].x, currentStrokeRef.current[0].y);
        currentStrokeRef.current.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke();
      }
    };
    redraw();
    const getPos = (e) => { const r = c.getBoundingClientRect(); const src = e.touches ? e.touches[0] : e; return { x: src.clientX - r.left, y: src.clientY - r.top }; };
    const onDown = (e) => { e.preventDefault(); currentStrokeRef.current = [getPos(e)]; };
    const onMove = (e) => {
      if (!currentStrokeRef.current) return; e.preventDefault();
      currentStrokeRef.current.push(getPos(e));
      if (eraserMode) {
        const pt = currentStrokeRef.current[currentStrokeRef.current.length - 1];
        strokesRef.current = strokesRef.current.filter(stroke => !stroke.some(p => Math.hypot(p.x - pt.x, p.y - pt.y) < 18));
      }
      redraw();
    };
    const onUp = () => {
      if (!currentStrokeRef.current) return;
      if (!eraserMode && currentStrokeRef.current.length >= 2) { strokesRef.current = [...strokesRef.current, [...currentStrokeRef.current]]; setStrokeCount(n => n + 1); }
      else setStrokeCount(n => n + 1);
      currentStrokeRef.current = null; redraw();
    };
    c.addEventListener('mousedown', onDown); c.addEventListener('mousemove', onMove); c.addEventListener('mouseup', onUp); c.addEventListener('mouseleave', onUp);
    c.addEventListener('touchstart', onDown, { passive: false }); c.addEventListener('touchmove', onMove, { passive: false }); c.addEventListener('touchend', onUp);
    return () => {
      c.removeEventListener('mousedown', onDown); c.removeEventListener('mousemove', onMove); c.removeEventListener('mouseup', onUp); c.removeEventListener('mouseleave', onUp);
      c.removeEventListener('touchstart', onDown); c.removeEventListener('touchmove', onMove); c.removeEventListener('touchend', onUp);
    };
  }, [drawMode, eraserMode]);

  // Lasso canvas (always on when not drawing)
  useEffect(() => {
    if (drawMode || !lassoCanvasRef.current || !containerRef.current) return;
    const c = lassoCanvasRef.current;
    const el = containerRef.current;
    const dpr = window.devicePixelRatio || 1;
    c.width = el.offsetWidth * dpr; c.height = el.offsetHeight * dpr;
    c.style.width = el.offsetWidth + 'px'; c.style.height = el.offsetHeight + 'px';
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);

    let pts = [], dragging = false;
    const getPos = (e) => { const r = c.getBoundingClientRect(); const src = e.touches ? e.touches[0] : e; return { x: src.clientX - r.left, y: src.clientY - r.top }; };
    const redraw = () => {
      ctx.clearRect(0, 0, el.offsetWidth, el.offsetHeight);
      if (pts.length < 2) return;
      ctx.beginPath(); ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.fillStyle = 'rgba(99,102,241,0.08)';
      ctx.moveTo(pts[0].x, pts[0].y); pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
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
    const onDown = (e) => { e.preventDefault(); dragging = true; pts = [getPos(e)]; };
    const onMove = (e) => { if (!dragging) return; e.preventDefault(); pts.push(getPos(e)); redraw(); };
    const onUp = () => {
      if (!dragging) return; dragging = false;
      if (pts.length > 3) {
        setItems(prev => {
          const inside = new Set(prev.filter(it => pointInPoly(it.x, it.y, pts)).map(it => it.id));
          setSelectedIds(inside);
          return prev;
        });
      }
      pts = []; ctx.clearRect(0, 0, el.offsetWidth, el.offsetHeight);
    };
    c.addEventListener('mousedown', onDown); c.addEventListener('mousemove', onMove); c.addEventListener('mouseup', onUp); c.addEventListener('mouseleave', onUp);
    c.addEventListener('touchstart', onDown, { passive: false }); c.addEventListener('touchmove', onMove, { passive: false }); c.addEventListener('touchend', onUp);
    return () => {
      c.removeEventListener('mousedown', onDown); c.removeEventListener('mousemove', onMove); c.removeEventListener('mouseup', onUp); c.removeEventListener('mouseleave', onUp);
      c.removeEventListener('touchstart', onDown); c.removeEventListener('touchmove', onMove); c.removeEventListener('touchend', onUp);
    };
  }, [drawMode]);

  return (
    <div className="flex flex-col w-full h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-amber-50 border-b border-amber-200 flex-wrap">
        <span className="text-[10px] font-bold text-amber-600">Add:</span>
        <button onClick={() => addTool('plate')} className="px-2 py-1 rounded-lg text-xs bg-white border border-amber-200 font-semibold text-amber-700 hover:bg-amber-50">⬤ Plate</button>
        <button onClick={() => addTool('five_frame')} className="px-2 py-1 rounded-lg text-xs bg-white border border-amber-200 font-semibold text-amber-700 hover:bg-amber-50">5-Frame</button>
        <button onClick={() => addTool('ten_frame')} className="px-2 py-1 rounded-lg text-xs bg-white border border-amber-200 font-semibold text-amber-700 hover:bg-amber-50">10-Frame</button>
        <div className="w-px h-4 bg-amber-200 mx-0.5" />
        <button onClick={() => setActiveTool(activeTool === 'draw' ? 'move' : 'draw')}
          className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center border ${activeTool === 'draw' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white border-amber-200'}`}>✏️</button>
        <button onClick={() => setActiveTool(activeTool === 'eraser' ? 'move' : 'eraser')}
          className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center border ${activeTool === 'eraser' ? 'bg-gray-600 text-white border-gray-600' : 'bg-white border-amber-200'}`}>⬜</button>
        {strokeCount > 0 && <>
          <button onClick={() => { strokesRef.current = strokesRef.current.slice(0, -1); setStrokeCount(n => Math.max(0, n - 1)); }} className="text-[10px] text-gray-500 hover:text-red-500">↩</button>
          <button onClick={() => { strokesRef.current = []; setStrokeCount(0); }} className="text-[10px] text-red-400">🗑</button>
        </>}
        {selectedIds.size > 0 && <span className="text-[10px] text-indigo-500 font-bold">{selectedIds.size} sel</span>}
      </div>

      {/* Canvas area */}
      <div ref={containerRef} style={{ position: 'relative', flex: 1, minHeight: 0, background: '#fffbeb', overflow: 'hidden', border: '1px solid #fde68a' }}>
        {/* DOM shapes */}
        {placedTools.map(tool =>
          tool.type === 'plate'
            ? <DSPlate key={tool.id} tool={tool} onMove={moveTool} onRemove={removeTool} />
            : <DSFrame key={tool.id} tool={tool} onMove={moveTool} onRemove={removeTool} />
        )}
        {/* Counters */}
        {items.map(item => (
          <Counter key={item.id} item={item} frozen={drawMode} selected={selectedIds.has(item.id)}
            onMove={moveItem}
            onGroupDragStart={(id, sx, sy) => {
              const group = items.filter(it => selectedIds.has(it.id));
              lassoDragRef.current = { ids: group.map(i => i.id), sx, sy, orig: Object.fromEntries(group.map(i => [i.id, { x: i.x, y: i.y }])) };
            }}
            onGroupDragMove={(dx, dy) => {
              if (!lassoDragRef.current) return;
              const { ids, orig } = lassoDragRef.current;
              const el = containerRef.current;
              const { width, height } = el?.getBoundingClientRect() || { width: 999, height: 999 };
              setItems(prev => prev.map(it => ids.includes(it.id) ? {
                ...it,
                x: Math.max(COUNTER_R, Math.min(width - COUNTER_R, orig[it.id].x + dx)),
                y: Math.max(COUNTER_R, Math.min(height - COUNTER_R, orig[it.id].y + dy)),
              } : it));
            }}
            onGroupDragEnd={() => { lassoDragRef.current = null; }}
          />
        ))}
        {/* Draw canvas */}
        {drawMode && <canvas ref={drawCanvasRef} style={{ position: 'absolute', inset: 0, zIndex: 20, cursor: eraserMode ? 'cell' : 'crosshair', touchAction: 'none' }} />}
        {/* Lasso canvas — always on, behind items only, captures empty-space drags */}
        <canvas ref={lassoCanvasRef} style={{ position: 'absolute', inset: 0, zIndex: drawMode ? -1 : 15, cursor: 'default', pointerEvents: drawMode ? 'none' : 'auto', touchAction: 'none' }} />
      </div>
    </div>
  );
}

// ── Complete the Sentence panel ──
function CompleteSentence({ redCount, yellowCount, onSelect, selected, submitted, feedback }) {
  const COMPARISONS = [
    { label: 'is greater than', symbol: '>' },
    { label: 'is less than', symbol: '<' },
    { label: 'is equal to', symbol: '=' },
  ];
  const correct = redCount > yellowCount ? '>' : redCount < yellowCount ? '<' : '=';
  return (
    <div className="flex flex-col items-center gap-3 bg-white rounded-2xl shadow-xl p-4 mx-2 mb-3">
      <p className="text-xs font-black text-gray-400 tracking-widest uppercase">Complete the Sentence</p>
      {/* Numbers + blank */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-black" style={{ background: '#fef3c7', color: '#92400e' }}>{redCount}</div>
        <div className="w-24 h-10 rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center text-xl font-black text-gray-300">
          {selected ? <span style={{ color: submitted ? (feedback?.compOk ? '#16a34a' : '#dc2626') : '#6366f1' }}>{selected}</span> : '—'}
        </div>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-black" style={{ background: '#fef3c7', color: '#92400e' }}>{yellowCount}</div>
      </div>
      {/* Options */}
      <div className="flex gap-4 flex-wrap justify-center">
        {COMPARISONS.map(opt => {
          let color = '#374151';
          if (submitted && feedback) {
            if (opt.symbol === correct) color = '#16a34a';
            else if (opt.symbol === selected && !feedback.compOk) color = '#dc2626';
          } else if (opt.symbol === selected) color = '#6366f1';
          return (
            <button key={opt.symbol} onClick={() => !submitted && onSelect(opt.symbol)}
              disabled={submitted}
              className="font-black text-sm transition-all"
              style={{ color, background: 'none', border: 'none', cursor: submitted ? 'default' : 'pointer' }}>
              {opt.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-gray-400">🔊 tap to hear • tap to place</p>
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
  const [selectedComparison, setSelectedComparison] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [phase, setPhase] = useState('count'); // 'count' | 'sentence'

  const actualRed = counters.filter(c => c === 'red').length;
  const actualYellow = counters.filter(c => c === 'yellow').length;

  const shake = () => {
    if (shaking) return;
    const t = randomTotal();
    setTotal(t);
    setCounters(generateCounters(t));
    setShaking(true);
    setSpilled(false);
    setSubmitted(false);
    setFeedback(null);
    setSelectedComparison(null);
    setRedInput(null);
    setYellowInput(null);
    setPhase('count');
    setTimeout(() => { setShaking(false); setSpilled(true); }, 800);
  };

  const handleCheck = () => {
    if (!spilled) return;
    const redOk = redInput === actualRed;
    const yellowOk = yellowInput === actualYellow;
    const correctComp = actualRed > actualYellow ? '>' : actualRed < actualYellow ? '<' : '=';
    const compOk = selectedComparison === correctComp;
    setFeedback(prev => ({ ...(prev || {}), redOk, yellowOk, compOk, correctComp, actualRed, actualYellow }));
    setSubmitted(true);
  };

  const handleSentenceCheck = () => {
    const correctComp = actualRed > actualYellow ? '>' : actualRed < actualYellow ? '<' : '=';
    const compOk = selectedComparison === correctComp;
    setFeedback(prev => ({ ...(prev || {}), compOk, correctComp }));
    setSubmitted(true);
  };

  const goToSentence = () => setPhase('sentence');

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde8e8 100%)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2" style={{ background: '#d97706' }}>
        <button onClick={onBack} className="text-white/80 hover:text-white font-bold text-sm">← Back</button>
        <h1 className="text-base font-black text-white flex-1 text-center">🟡🔴 Double-Sided Counters</h1>
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
        {spilled && phase === 'count' && (
          <motion.div key="count" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col" style={{ minHeight: 0 }}>

            {/* Main row: Red panel | Canvas | Yellow panel */}
            <div className="flex flex-row gap-2 px-2 flex-1" style={{ minHeight: 0 }}>

              {/* RED panel */}
              <div className="flex flex-col items-center gap-1 bg-white rounded-2xl shadow-lg px-2 py-2 shrink-0" style={{ width: 110 }}>
                <div className="flex items-center gap-1">
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#dc2626' }} />
                  <span className="text-xs font-black text-red-600">Red</span>
                </div>
                <WriteCanvas dotColor="#dc2626" />
                <DigitPad value={redInput} onChange={setRedInput} color="#dc2626" />
                {submitted && (
                  <span className={`text-xs font-bold ${feedback?.redOk ? 'text-green-600' : 'text-red-500'}`}>
                    {feedback?.redOk ? '✅' : `Ans: ${actualRed}`}
                  </span>
                )}
              </div>

              {/* Canvas */}
              <div className="flex-1 rounded-2xl overflow-hidden shadow-lg flex flex-col" style={{ minHeight: 180 }}>
                <CounterCanvas counters={counters} />
              </div>

              {/* YELLOW panel */}
              <div className="flex flex-col items-center gap-1 bg-white rounded-2xl shadow-lg px-2 py-2 shrink-0" style={{ width: 110 }}>
                <div className="flex items-center gap-1">
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ca8a04' }} />
                  <span className="text-xs font-black text-amber-600">Yellow</span>
                </div>
                <WriteCanvas dotColor="#ca8a04" />
                <DigitPad value={yellowInput} onChange={setYellowInput} color="#ca8a04" />
                {submitted && (
                  <span className={`text-xs font-bold ${feedback?.yellowOk ? 'text-green-600' : 'text-red-500'}`}>
                    {feedback?.yellowOk ? '✅' : `Ans: ${actualYellow}`}
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-center gap-2 py-2 px-2">
              {!submitted ? (
                <button onClick={handleCheck} disabled={redInput === null || yellowInput === null}
                  className="px-5 py-2 rounded-xl font-black text-white text-sm disabled:opacity-40"
                  style={{ background: '#4338ca' }}>
                  ✅ Check My Count
                </button>
              ) : (
                <button onClick={goToSentence}
                  className="px-5 py-2 rounded-xl font-black text-white text-sm"
                  style={{ background: '#0369a1' }}>
                  Next: Complete the Sentence →
                </button>
              )}
            </div>
          </motion.div>
        )}

        {spilled && phase === 'sentence' && (
          <motion.div key="sentence" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col justify-center">
            <CompleteSentence
              redCount={actualRed} yellowCount={actualYellow}
              onSelect={setSelectedComparison}
              selected={selectedComparison}
              submitted={submitted}
              feedback={feedback}
            />
            <div className="flex items-center justify-center gap-2 pb-3">
              {selectedComparison && !submitted && (
                <button onClick={handleSentenceCheck}
                  className="px-5 py-2 rounded-xl font-black text-white text-sm"
                  style={{ background: '#4338ca' }}>
                  ✅ Check
                </button>
              )}
              {submitted && (
                <button onClick={shake}
                  className="px-5 py-2 rounded-xl font-black text-white text-sm"
                  style={{ background: '#d97706' }}>
                  🔄 New Round
                </button>
              )}
              <button onClick={() => setPhase('count')} className="px-4 py-2 rounded-xl text-sm font-bold text-gray-500 bg-white shadow">
                ← Back to counting
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}