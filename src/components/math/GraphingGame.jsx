import { useState, useRef, useEffect, useCallback } from 'react';

// ── Seeded RNG ─────────────────────────────────────────────────────
function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const TRIO_SETS = [
  [['🐶','dogs'], ['🐱','cats'], ['🐭','mice']],
  [['🍎','apples'], ['🍊','oranges'], ['🍋','lemons']],
  [['🦋','butterflies'], ['🐝','bees'], ['🐞','ladybugs']],
  [['⭐','stars'], ['🌙','moons'], ['☀️','suns']],
  [['🧁','cupcakes'], ['🍩','donuts'], ['🍪','cookies']],
  [['🚗','cars'], ['🚕','taxis'], ['🚙','trucks']],
];

const MAX_ROWS = 10;
const ITEM_SIZE = 0.10; // normalized min separation (~10% of canvas)

// Pick 3 counts 1-10, biased to avoid repeats
function pickCounts() {
  const pool = [1,2,3,4,5,6,7,8,9,10];
  // shuffle pool
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [pool[0], pool[1], pool[2]];
}

function generateItems(seed, counts) {
  const rng = seededRng(seed);
  const setIdx = Math.floor(rng() * TRIO_SETS.length);
  const trio = TRIO_SETS[setIdx];
  const allPlaced = [];
  let id = 0;
  const items = [];
  counts.forEach((count, typeIdx) => {
    const [emoji] = trio[typeIdx];
    for (let i = 0; i < count; i++) {
      let nx, ny, tries = 0;
      do {
        nx = 0.05 + rng() * 0.85;
        ny = 0.05 + rng() * 0.85;
        tries++;
      } while (tries < 500 && allPlaced.some(p => Math.hypot(p.nx - nx, p.ny - ny) < ITEM_SIZE));
      allPlaced.push({ nx, ny });
      items.push({ id: id++, emoji, typeIdx, nx, ny, rotation: (rng() - 0.5) * 20 });
    }
  });
  // shuffle display order
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return { items, trio };
}

// ── EraserCursor ───────────────────────────────────────────────────
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

// ── Collection Canvas with toolbar + lasso ─────────────────────────
function CollectionCanvas({ items, containerRef, onMove, trio, xAxisLabels, startLabelDrag, COL_COLORS }) {
  const canvasRef = useRef(null);
  const lassoCanvasRef = useRef(null);
  const isDrawing = useRef(false);
  const currentStroke = useRef([]);
  const strokesRef = useRef([]);
  const lassoDragRef = useRef(null);
  const selectedIdsRef = useRef(new Set());
  const itemsRef = useRef(items);
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());
  const [activeTool, setActiveTool] = useState('move');
  const [strokeCount, setStrokeCount] = useState(0);

  const drawMode = activeTool === 'draw' || activeTool === 'eraser';
  const eraserMode = activeTool === 'eraser';

  // keep itemsRef in sync
  useEffect(() => { itemsRef.current = items; }, [items]);

  const setupCanvas = () => {
    const c = canvasRef.current; if (!c) return null;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr; c.height = rect.height * dpr;
    const ctx = c.getContext('2d');
    ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr, dpr);
    return { ctx, w: rect.width, h: rect.height };
  };

  const redrawCanvas = useCallback(() => {
    const setup = setupCanvas(); if (!setup) return;
    const { ctx, w, h } = setup;
    drawNormalizedStrokes(ctx, strokesRef.current, w, h, eraserMode ? null : currentStroke.current);
  }, [eraserMode]);

  useEffect(() => { redrawCanvas(); }, [drawMode, eraserMode, strokeCount, redrawCanvas]);

  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const ro = new ResizeObserver(() => requestAnimationFrame(() => redrawCanvas()));
    ro.observe(el); return () => ro.disconnect();
  }, [redrawCanvas, containerRef]);

  // Draw canvas pointer events
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const getPos = (e) => {
      const r = c.getBoundingClientRect(); const src = e.touches ? e.touches[0] : e;
      return { x: (src.clientX - r.left) / r.width, y: (src.clientY - r.top) / r.height };
    };
    const onDown = (e) => { if (!drawMode) return; e.preventDefault(); isDrawing.current = true; currentStroke.current = [getPos(e)]; };
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
      if (!eraserMode && currentStroke.current.length >= 2) { strokesRef.current = [...strokesRef.current, [...currentStroke.current]]; setStrokeCount(n => n + 1); }
      else setStrokeCount(n => n + 1);
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
  }, [drawMode, eraserMode, redrawCanvas]);

  // Lasso canvas
  useEffect(() => {
    if (drawMode || !lassoCanvasRef.current) return;
    const c = lassoCanvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * dpr; c.height = c.offsetHeight * dpr;
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
    let lassoPoints = [], dragging = false, startPt = null;
    const TAP_THRESHOLD = 8;
    const getPos = (e) => { const r = c.getBoundingClientRect(); const src = e.touches ? e.touches[0] : e; return { x: src.clientX - r.left, y: src.clientY - r.top }; };
    const isTap = (pts) => { if (!startPt || pts.length < 2) return true; const last = pts[pts.length-1]; return Math.hypot(last.x - startPt.x, last.y - startPt.y) < TAP_THRESHOLD; };
    const redrawLasso = () => {
      ctx.clearRect(0, 0, c.offsetWidth, c.offsetHeight);
      if (lassoPoints.length < 2) return;
      ctx.beginPath(); ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 2; ctx.setLineDash([5,4]); ctx.fillStyle = 'rgba(99,102,241,0.08)';
      ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y); lassoPoints.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    };
    const onDown = (e) => { e.preventDefault(); dragging = true; startPt = getPos(e); lassoPoints = [startPt]; document.addEventListener('mousemove', onMoveDoc); document.addEventListener('mouseup', onUp); };
    const onMoveDoc = (e) => { if (!dragging) return; e.preventDefault(); lassoPoints.push(getPos(e)); redrawLasso(); };
    const onUp = () => {
      if (!dragging) return; dragging = false;
      document.removeEventListener('mousemove', onMoveDoc); document.removeEventListener('mouseup', onUp);
      if (isTap(lassoPoints)) { c.dispatchEvent(new CustomEvent('lasso-clear', { bubbles: true })); }
      else { c.dispatchEvent(new CustomEvent('lasso-complete', { bubbles: true, detail: { poly: lassoPoints } })); }
      lassoPoints = []; startPt = null; ctx.clearRect(0, 0, c.offsetWidth, c.offsetHeight);
    };
    const onTouchStart = (e) => { e.preventDefault(); dragging = true; startPt = getPos(e); lassoPoints = [startPt]; };
    const onTouchMove = (e) => { if (!dragging) return; e.preventDefault(); lassoPoints.push(getPos(e)); redrawLasso(); };
    const onTouchEnd = () => {
      if (!dragging) return; dragging = false;
      if (isTap(lassoPoints)) c.dispatchEvent(new CustomEvent('lasso-clear', { bubbles: true }));
      else c.dispatchEvent(new CustomEvent('lasso-complete', { bubbles: true, detail: { poly: lassoPoints } }));
      lassoPoints = []; startPt = null; ctx.clearRect(0, 0, c.offsetWidth, c.offsetHeight);
    };
    c.addEventListener('mousedown', onDown);
    c.addEventListener('touchstart', onTouchStart, { passive: false });
    c.addEventListener('touchmove', onTouchMove, { passive: false });
    c.addEventListener('touchend', onTouchEnd);
    return () => {
      c.removeEventListener('mousedown', onDown); document.removeEventListener('mousemove', onMoveDoc); document.removeEventListener('mouseup', onUp);
      c.removeEventListener('touchstart', onTouchStart); c.removeEventListener('touchmove', onTouchMove); c.removeEventListener('touchend', onTouchEnd);
    };
  }, [drawMode]);

  // Lasso complete handler
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
      const poly = e.detail?.poly || []; if (poly.length < 3) return;
      const rect = containerRef.current?.getBoundingClientRect(); if (!rect) return;
      const inside = new Set(itemsRef.current.filter(it => pointInPoly(it.nx * rect.width + 14, it.ny * rect.height + 14, poly)).map(it => it.id));
      selectedIdsRef.current = inside; setSelectedItemIds(new Set(inside));
    };
    const clearHandler = () => { selectedIdsRef.current = new Set(); setSelectedItemIds(new Set()); };
    c.addEventListener('lasso-complete', handler);
    c.addEventListener('lasso-clear', clearHandler);
    return () => { c.removeEventListener('lasso-complete', handler); c.removeEventListener('lasso-clear', clearHandler); };
  }, [drawMode, containerRef]);

  const handleItemMove = (id, nx, ny) => {
    if (selectedIdsRef.current.has(id) && lassoDragRef.current) return; // handled by group drag
    onMove(id, nx, ny);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: '#eef2ff', borderBottom: '1px solid #c7d2fe', borderRadius: '12px 12px 0 0', flexWrap: 'wrap' }}>
        <button onClick={() => setActiveTool(activeTool === 'draw' ? 'move' : 'draw')}
          style={{ padding: '4px 10px', borderRadius: 8, fontWeight: 700, fontSize: 12, border: '1px solid', cursor: 'pointer', background: activeTool === 'draw' ? '#3b82f6' : 'white', color: activeTool === 'draw' ? 'white' : '#3b82f6', borderColor: activeTool === 'draw' ? '#3b82f6' : '#93c5fd' }}>
          ✏️ Draw
        </button>
        <button onClick={() => setActiveTool(activeTool === 'eraser' ? 'move' : 'eraser')}
          style={{ padding: '4px 10px', borderRadius: 8, fontWeight: 700, fontSize: 12, border: '1px solid', cursor: 'pointer', background: activeTool === 'eraser' ? '#6b7280' : 'white', color: activeTool === 'eraser' ? 'white' : '#6b7280', borderColor: activeTool === 'eraser' ? '#6b7280' : '#d1d5db' }}>
          ⬜ Eraser
        </button>
        {selectedItemIds.size > 0 && <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 700 }}>Group selected</span>}
        {strokeCount > 0 && <>
          <button onClick={() => { strokesRef.current = strokesRef.current.slice(0, -1); setStrokeCount(n => Math.max(0, n - 1)); }} style={{ padding: '4px 8px', fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>↩ Undo</button>
          <button onClick={() => { strokesRef.current = []; setStrokeCount(0); }} style={{ padding: '4px 8px', fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>🗑 Clear</button>
        </>}
      </div>

      {/* Canvas */}
      <div ref={containerRef} style={{ flex: 1, background: '#fefce8', borderRadius: '0 0 12px 12px', border: '2px solid #fde68a', borderTop: 'none', position: 'relative', overflow: 'hidden', minHeight: 180 }}>
        {items.map(item => {
          const selected = selectedItemIds.has(item.id);
          const frozen = drawMode;
          return (
            <div key={item.id}
              onPointerDown={(e) => {
                if (frozen) return;
                e.preventDefault(); e.stopPropagation();
                const mx = e.clientX, my = e.clientY;
                if (selected && selectedIdsRef.current.size > 1) {
                  // group drag
                  const origPositions = Object.fromEntries(itemsRef.current.filter(it => selectedIdsRef.current.has(it.id)).map(it => [it.id, { nx: it.nx, ny: it.ny }]));
                  lassoDragRef.current = { origPositions };
                  const onMoveEvt = (ev) => {
                    const rect = containerRef.current?.getBoundingClientRect(); if (!rect) return;
                    const dnx = (ev.clientX - mx) / rect.width, dny = (ev.clientY - my) / rect.height;
                    selectedIdsRef.current.forEach(sid => {
                      const orig = origPositions[sid]; if (!orig) return;
                      onMove(sid, Math.max(0, Math.min(0.95, orig.nx + dnx)), Math.max(0, Math.min(0.95, orig.ny + dny)));
                    });
                  };
                  const onUp = () => { lassoDragRef.current = null; document.removeEventListener('pointermove', onMoveEvt); document.removeEventListener('pointerup', onUp); };
                  document.addEventListener('pointermove', onMoveEvt);
                  document.addEventListener('pointerup', onUp);
                } else {
                  const ox = item.nx, oy = item.ny;
                  const onMoveEvt = (ev) => {
                    const rect = containerRef.current?.getBoundingClientRect(); if (!rect) return;
                    onMove(item.id, Math.max(0, Math.min(0.95, ox + (ev.clientX - mx) / rect.width)), Math.max(0, Math.min(0.95, oy + (ev.clientY - my) / rect.height)));
                  };
                  const onUp = () => { document.removeEventListener('pointermove', onMoveEvt); document.removeEventListener('pointerup', onUp); };
                  document.addEventListener('pointermove', onMoveEvt);
                  document.addEventListener('pointerup', onUp);
                }
              }}
              style={{
                position: 'absolute', left: `${item.nx * 100}%`, top: `${item.ny * 100}%`,
                fontSize: 26, transform: `rotate(${item.rotation}deg)`,
                cursor: frozen ? 'default' : 'grab', touchAction: 'none', zIndex: 10, lineHeight: 1, userSelect: 'none',
                outline: selected ? '3px dashed #6366f1' : 'none', borderRadius: 4,
              }}>
              {item.emoji}
            </div>
          );
        })}
        {/* Lasso canvas */}
        <canvas ref={lassoCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 2, cursor: 'crosshair', pointerEvents: drawMode ? 'none' : 'auto' }} />
        {drawMode && eraserMode && <EraserCursor />}
        {/* Draw canvas */}
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 20, cursor: eraserMode ? 'none' : 'crosshair', pointerEvents: drawMode ? 'auto' : 'none' }} />
      </div>

      {/* Emoji label chips */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginTop: 6 }}>
        <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, marginBottom: 6, textAlign: 'center' }}>DRAG TO GRAPH X-AXIS →</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          {trio.map(([emoji, label], typeIdx) => {
            const alreadyPlaced = Object.values(xAxisLabels).some(v => v?.typeIdx === typeIdx);
            if (alreadyPlaced) return <div key={typeIdx} style={{ flex: 1, minWidth: 48 }} />;
            return (
              <div key={typeIdx} onPointerDown={(e) => { e.preventDefault(); startLabelDrag(typeIdx, e.clientX, e.clientY); }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: COL_COLORS[typeIdx] + '22', border: `2px solid ${COL_COLORS[typeIdx]}`, borderRadius: 10, padding: '6px 10px', cursor: 'grab', touchAction: 'none', fontSize: 22 }}>
                {emoji}
                <span style={{ fontSize: 9, fontWeight: 700, color: COL_COLORS[typeIdx] }}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Mini number write panel ────────────────────────────────────────
function MiniNumberWrite({ onDrop }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const allStrokes = useRef([]);
  const currentStroke = useRef([]);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [writtenN, setWrittenN] = useState(null);

  const getPos = (e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * (c.width / rect.width), y: (src.clientY - rect.top) * (c.height / rect.height) };
  };
  const onDown = (e) => {
    e.preventDefault(); setWrittenN(null);
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos; currentStroke.current = [pos]; drawing.current = true; setHasDrawn(true);
  };
  const onMove = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1e40af';
    const prev = lastPos.current;
    ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + pos.x) / 2, (prev.y + pos.y) / 2);
    ctx.stroke(); ctx.beginPath(); ctx.moveTo((prev.x + pos.x) / 2, (prev.y + pos.y) / 2);
    lastPos.current = pos; currentStroke.current.push(pos);
  };
  const onUp = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    drawing.current = false;
    if (currentStroke.current.length > 0) { allStrokes.current = [...allStrokes.current, currentStroke.current]; currentStroke.current = []; }
  };
  const clear = () => {
    const c = canvasRef.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    allStrokes.current = []; setHasDrawn(false); setWrittenN(null);
  };

  // Number buttons 0-10 overlay after "confirm"
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <canvas ref={canvasRef} width={90} height={70}
            style={{ background: '#f0f7ff', borderRadius: 8, border: '2px solid #93c5fd', cursor: 'crosshair', touchAction: 'none', width: 90, height: 70 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={clear} style={{ fontSize: 10, padding: '2px 6px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 5, cursor: 'pointer', fontWeight: 700 }}>✕</button>
            <button disabled={!hasDrawn} onClick={() => setShowPicker(true)}
              style={{ fontSize: 10, padding: '2px 8px', background: hasDrawn ? '#6366f1' : '#e2e8f0', color: hasDrawn ? 'white' : '#94a3b8', border: 'none', borderRadius: 5, cursor: hasDrawn ? 'pointer' : 'default', fontWeight: 700 }}>
              What # is this?
            </button>
          </div>
        </div>
        {writtenN !== null && (
          <div
            onPointerDown={(e) => { e.preventDefault(); onDrop(writtenN, e.clientX, e.clientY); }}
            style={{ width: 40, height: 40, borderRadius: 10, background: '#6366f1', color: 'white', fontWeight: 900, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', touchAction: 'none', userSelect: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.25)', alignSelf: 'center' }}>
            {writtenN}
          </div>
        )}
      </div>
      {showPicker && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, background: '#eef2ff', borderRadius: 8, padding: 6 }}>
          <div style={{ width: '100%', fontSize: 9, fontWeight: 700, color: '#6366f1', marginBottom: 2 }}>Tap the number you wrote:</div>
          {Array.from({ length: 11 }, (_, i) => i).map(n => (
            <button key={n} onClick={() => { setWrittenN(n); setShowPicker(false); }}
              style={{ width: 28, height: 28, borderRadius: 6, background: '#6366f1', color: 'white', fontWeight: 900, fontSize: 13, border: 'none', cursor: 'pointer' }}>
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Mini writing canvas for numbers (kept for reference) ──────────────────────────────
function MiniWriteCanvas({ onNumberWritten }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const allStrokes = useRef([]);
  const currentStroke = useRef([]);
  const [hasDrawn, setHasDrawn] = useState(false);

  const getPos = (e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * (c.width / rect.width), y: (src.clientY - rect.top) * (c.height / rect.height) };
  };

  const onDown = (e) => {
    e.preventDefault();
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos; currentStroke.current = [pos]; drawing.current = true; setHasDrawn(true);
  };
  const onMove = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1e40af';
    const prev = lastPos.current;
    ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + pos.x) / 2, (prev.y + pos.y) / 2);
    ctx.stroke(); ctx.beginPath(); ctx.moveTo((prev.x + pos.x) / 2, (prev.y + pos.y) / 2);
    lastPos.current = pos; currentStroke.current.push(pos);
  };
  const onUp = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    drawing.current = false;
    if (currentStroke.current.length > 0) { allStrokes.current = [...allStrokes.current, currentStroke.current]; currentStroke.current = []; }
  };
  const clear = () => {
    const c = canvasRef.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    allStrokes.current = []; setHasDrawn(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: '#f0f7ff', borderRadius: 10, padding: '6px 8px', border: '2px solid #bfdbfe' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#3b82f6', marginBottom: 2 }}>WRITE A NUMBER</div>
      <canvas ref={canvasRef} width={80} height={60}
        style={{ background: 'white', borderRadius: 6, border: '1.5px solid #93c5fd', cursor: 'crosshair', touchAction: 'none', width: 80, height: 60 }}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
        onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
      />
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={clear} style={{ fontSize: 10, padding: '2px 6px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 5, cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>✕ Clear</button>
        <button disabled={!hasDrawn} onClick={() => { /* Teacher drags to axis */ }} style={{ fontSize: 10, padding: '2px 6px', background: hasDrawn ? '#6366f1' : '#e2e8f0', color: hasDrawn ? 'white' : '#94a3b8', border: 'none', borderRadius: 5, cursor: hasDrawn ? 'pointer' : 'default', fontWeight: 700 }}>Use →</button>
      </div>
    </div>
  );
}

// ── Number drag chip ───────────────────────────────────────────────
function NumberChip({ n, onDragStart }) {
  return (
    <div onPointerDown={(e) => { e.preventDefault(); onDragStart(n, e.clientX, e.clientY); }}
      style={{ width: 32, height: 32, borderRadius: 8, background: '#6366f1', color: 'white', fontWeight: 900, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', touchAction: 'none', userSelect: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
      {n}
    </div>
  );
}

// ── Y-axis mini write box ──────────────────────────────────────────
function YAxisBox({ lineNum, val, onDrop, onYLabelDrop }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const [active, setActive] = useState(false);

  const getPos = (e) => {
    const c = canvasRef.current; const r = c.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - r.left) * (c.width / r.width), y: (src.clientY - r.top) * (c.height / r.height) };
  };
  const onDown = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (window.__draggingNumber !== undefined) { onYLabelDrop(lineNum, window.__draggingNumber); return; }
    const c = canvasRef.current; const ctx = c.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos; drawing.current = true; setActive(true);
  };
  const onMove = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!drawing.current) return;
    const pos = getPos(e); const ctx = canvasRef.current.getContext('2d');
    const prev = lastPos.current;
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#6366f1';
    ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + pos.x) / 2, (prev.y + pos.y) / 2);
    ctx.stroke(); ctx.beginPath(); ctx.moveTo((prev.x + pos.x) / 2, (prev.y + pos.y) / 2);
    lastPos.current = pos;
  };
  const onUp = (e) => { e.preventDefault(); e.stopPropagation(); drawing.current = false; };
  const clearCanvas = (e) => {
    e.preventDefault(); e.stopPropagation();
    const c = canvasRef.current; c.getContext('2d').clearRect(0, 0, c.width, c.height);
    onDrop(lineNum, undefined); setActive(false);
  };

  return (
    <div data-yrow={lineNum}
      style={{ position: 'absolute', bottom: `${(lineNum / 10) * 100}%`, left: 0, right: 0, height: 28, transform: 'translateY(50%)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
      <div style={{ position: 'relative', width: 34, height: 26 }}>
        <canvas ref={canvasRef} width={68} height={52}
          style={{ width: 34, height: 26, borderRadius: 5, border: val !== undefined ? '2px solid #6366f1' : '2px dashed #94a3b8', background: val !== undefined ? '#eef2ff' : 'rgba(248,250,252,0.9)', cursor: 'crosshair', touchAction: 'none', display: 'block' }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        />
        {active && (
          <button onPointerDown={clearCanvas}
            style={{ position: 'absolute', top: -6, right: -6, width: 12, height: 12, borderRadius: '50%', background: '#ef4444', color: 'white', fontSize: 7, fontWeight: 900, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0, zIndex: 10 }}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

// ── Bar graph ──────────────────────────────────────────────────────
function BarGraph({ filledCells, onToggle, yAxisLabels, onYLabelDrop, xAxisLabels, onXLabelDrop, feedback }) {
  const COL_COLORS = ['#ef4444', '#f59e0b', '#3b82f6'];
  const COL_LIGHT = ['#fee2e2', '#fef3c7', '#dbeafe'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px 4px 0 4px' }}>
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        {/* Y-axis */}
        <div style={{ width: 40, flexShrink: 0, position: 'relative', borderRight: '2px solid #374151' }}>
          {Array.from({ length: MAX_ROWS + 1 }, (_, i) => i).map(lineNum => (
            <YAxisBox key={lineNum} lineNum={lineNum} val={yAxisLabels[lineNum]}
              onDrop={(row, val) => onYLabelDrop(row, val)}
              onYLabelDrop={onYLabelDrop}
            />
          ))}
        </div>
        {/* Grid */}
        <div style={{ display: 'flex', flex: 1, gap: 2, padding: '0 2px' }}>
          {[0, 1, 2].map(colIdx => (
            <div key={colIdx} style={{ flex: 1, display: 'flex', flexDirection: 'column-reverse', gap: 2 }}>
              {Array.from({ length: MAX_ROWS }, (_, i) => i + 1).map(row => {
                const filled = filledCells[colIdx]?.has(row);
                return (
                  <div key={row} onClick={() => onToggle(colIdx, row)}
                    style={{ flex: 1, border: `1.5px solid ${filled ? COL_COLORS[colIdx] : '#cbd5e1'}`, background: filled ? COL_COLORS[colIdx] : COL_LIGHT[colIdx] + '40', borderRadius: 3, cursor: 'pointer', transition: 'background 0.1s' }} />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {/* X-axis line */}
      <div style={{ height: 2, background: '#374151', margin: '0 0 0 42px' }} />
      {/* X-axis slots */}
      <div style={{ display: 'flex', gap: 2, padding: '4px 2px 0 44px' }}>
        {[0, 1, 2].map(colIdx => {
          const dropped = xAxisLabels[colIdx];
          const fb = feedback?.xAxis?.[colIdx];
          return (
            <div key={colIdx} style={{ flex: 1 }}>
              <div data-xslot={colIdx}
                onClick={() => { if (window.__draggingLabel !== undefined) onXLabelDrop(colIdx, window.__draggingLabel); }}
                style={{ minHeight: 48, border: dropped ? `2px solid ${fb === false ? '#ef4444' : fb === true ? '#22c55e' : '#6366f1'}` : '2px dashed #94a3b8', borderRadius: 8, background: dropped ? (fb === false ? '#fee2e2' : fb === true ? '#dcfce7' : '#eef2ff') : '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 22, gap: 1 }}>
                {dropped ? (
                  <><span>{dropped.emoji}</span>{fb === false && <span style={{ fontSize: 16 }}>✗</span>}{fb === true && <span style={{ fontSize: 14 }}>✓</span>}</>
                ) : (
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>drop here</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Generate fresh game state ─────────────────────────────────────
function freshGame() {
  const counts = pickCounts();
  const seed = Math.floor(Math.random() * 999999);
  const { items, trio } = generateItems(seed, counts);
  return { counts, seed, items, trio };
}

// ── Main ───────────────────────────────────────────────────────────
export default function GraphingGame({ onBack }) {
  const [game, setGame] = useState(() => freshGame());
  const { counts, items: initialItems, trio } = game;
  const [items, setItems] = useState(initialItems);
  const containerRef = useRef(null);

  const [filledCells, setFilledCells] = useState([new Set(), new Set(), new Set()]);
  const [yAxisLabels, setYAxisLabels] = useState({});
  const [xAxisLabels, setXAxisLabels] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [graphChecked, setGraphChecked] = useState(false);

  const COL_COLORS = ['#ef4444', '#f59e0b', '#3b82f6'];

  const newGame = () => {
    const g = freshGame();
    setGame(g);
    setItems(g.items);
    setFilledCells([new Set(), new Set(), new Set()]);
    setYAxisLabels({});
    setXAxisLabels({});
    setFeedback(null);
    setGraphChecked(false);
  };

  // ── Number drag ────────────────────────────────────────────────
  const startNumberDrag = (n, startX, startY) => {
    window.__draggingNumber = n;
    const ghost = document.createElement('div');
    ghost.style.cssText = `position:fixed;pointer-events:none;z-index:9999;width:32px;height:32px;border-radius:8px;background:#6366f1;color:white;font-weight:900;font-size:14px;display:flex;align-items:center;justify-content:center;`;
    ghost.textContent = n; document.body.appendChild(ghost);
    const move = (x, y) => { ghost.style.left = (x-16)+'px'; ghost.style.top = (y-16)+'px'; };
    move(startX, startY);
    const onMove = (e) => { move(e.touches ? e.touches[0].clientX : e.clientX, e.touches ? e.touches[0].clientY : e.clientY); };
    const onUp = (e) => {
      ghost.remove();
      const x = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
      const y = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
      document.querySelectorAll('[data-yrow]').forEach(slot => {
        const r = slot.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          setYAxisLabels(prev => ({ ...prev, [parseInt(slot.getAttribute('data-yrow'))]: n }));
        }
      });
      window.__draggingNumber = undefined;
      document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove, { passive: true }); document.addEventListener('pointerup', onUp);
  };

  // ── Label drag ─────────────────────────────────────────────────
  const startLabelDrag = (typeIdx, startX, startY) => {
    const [emoji] = trio[typeIdx];
    window.__draggingLabel = { emoji, typeIdx };
    const ghost = document.createElement('div');
    ghost.style.cssText = `position:fixed;pointer-events:none;z-index:9999;font-size:28px;`;
    ghost.textContent = emoji; document.body.appendChild(ghost);
    const move = (x, y) => { ghost.style.left = (x-16)+'px'; ghost.style.top = (y-16)+'px'; };
    move(startX, startY);
    const onMove = (e) => { move(e.touches ? e.touches[0].clientX : e.clientX, e.touches ? e.touches[0].clientY : e.clientY); };
    const onUp = (e) => {
      ghost.remove();
      const x = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
      const y = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
      document.querySelectorAll('[data-xslot]').forEach(slot => {
        const r = slot.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          setXAxisLabels(prev => ({ ...prev, [parseInt(slot.getAttribute('data-xslot'))]: { emoji, typeIdx } }));
          setFeedback(null); setGraphChecked(false);
        }
      });
      window.__draggingLabel = undefined;
      document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove, { passive: true }); document.addEventListener('pointerup', onUp);
  };

  const moveItem = (id, nx, ny) => setItems(prev => prev.map(it => it.id === id ? { ...it, nx, ny } : it));
  const toggleCell = (colIdx, row) => { setFilledCells(prev => { const next = prev.map(s => new Set(s)); if (next[colIdx].has(row)) next[colIdx].delete(row); else next[colIdx].add(row); return next; }); setGraphChecked(false); setFeedback(null); };

  const allXAxisFilled = [0,1,2].every(col => xAxisLabels[col]);

  const checkGraph = () => {
    const xFb = {}, barFb = {};
    for (let col = 0; col < 3; col++) {
      const placed = xAxisLabels[col]; if (!placed) continue;
      xFb[col] = true;
      barFb[col] = (filledCells[col]?.size ?? 0) === counts[placed.typeIdx];
    }
    setFeedback({ xAxis: xFb, bars: barFb }); setGraphChecked(true);
  };

  const [yInputMode, setYInputMode] = useState('tiles'); // 'tiles' | 'write'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)', userSelect: 'none' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: '#16a34a', color: 'white' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>← Back</button>
        <h1 style={{ flex: 1, textAlign: 'center', fontWeight: 900, fontSize: 16, margin: 0 }}>📊 Graphing</h1>
        <button onClick={newGame} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer', borderRadius: 8, padding: '4px 10px' }}>🔄 New</button>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 6, padding: 6 }}>
        {/* LEFT */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', fontSize: 11, color: '#64748b', textAlign: 'center', fontWeight: 600 }}>
            Count and sort the objects
          </div>
          <CollectionCanvas
            items={items}
            containerRef={containerRef}
            onMove={moveItem}
            trio={trio}
            xAxisLabels={xAxisLabels}
            startLabelDrag={startLabelDrag}
            COL_COLORS={COL_COLORS}
          />
          {/* Number tray */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, flex: 1, textAlign: 'center' }}>
                {yInputMode === 'tiles' ? 'DRAG NUMBERS TO Y-AXIS →' : 'WRITE & DRAG TO Y-AXIS →'}
              </div>
              <button onClick={() => setYInputMode(m => m === 'tiles' ? 'write' : 'tiles')}
                style={{ fontSize: 9, padding: '2px 7px', borderRadius: 8, border: '1.5px solid #a5b4fc', background: '#eef2ff', color: '#6366f1', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {yInputMode === 'tiles' ? '✏️ Write' : '🔢 Tiles'}
              </button>
            </div>
            {yInputMode === 'tiles' ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {Array.from({ length: 11 }, (_, i) => i).map(n => <NumberChip key={n} n={n} onDragStart={startNumberDrag} />)}
              </div>
            ) : (
              <MiniNumberWrite onDrop={(n, x, y) => startNumberDrag(n, x, y)} />
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', fontSize: 11, color: '#64748b', textAlign: 'center', fontWeight: 600 }}>
            Tap squares to color · drag labels &amp; numbers to graph
          </div>
          <div style={{ flex: 1, background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden', minHeight: 280 }}>
            <BarGraph filledCells={filledCells} onToggle={toggleCell} yAxisLabels={yAxisLabels} onYLabelDrop={(row, n) => setYAxisLabels(prev => { if (n === undefined) { const next = {...prev}; delete next[row]; return next; } return { ...prev, [row]: n }; })} xAxisLabels={xAxisLabels} onXLabelDrop={(col, label) => { setXAxisLabels(prev => ({ ...prev, [col]: label })); setFeedback(null); setGraphChecked(false); }} feedback={feedback} />
          </div>
          <div style={{ background: '#fff', borderRadius: 12, padding: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            {!graphChecked ? (
              <button onClick={checkGraph} disabled={!allXAxisFilled}
                style={{ width: '100%', padding: '10px 0', background: allXAxisFilled ? '#16a34a' : '#94a3b8', color: 'white', fontWeight: 900, fontSize: 14, borderRadius: 10, border: 'none', cursor: allXAxisFilled ? 'pointer' : 'not-allowed', opacity: allXAxisFilled ? 1 : 0.7 }}>
                {allXAxisFilled ? '✓ Check My Graph' : 'Drag all 3 labels to x-axis first'}
              </button>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  {[0,1,2].map(col => {
                    const barOk = feedback?.bars?.[col];
                    const placed = xAxisLabels[col];
                    if (!placed) return <div key={col} style={{ flex: 1 }} />;
                    return (
                      <div key={col} style={{ flex: 1, textAlign: 'center', padding: '4px 2px', borderRadius: 8, background: barOk ? '#dcfce7' : '#fee2e2', border: `2px solid ${barOk ? '#22c55e' : '#ef4444'}` }}>
                        <div style={{ fontSize: 18 }}>{placed.emoji}</div>
                        <div style={{ fontSize: 18 }}>{barOk ? '✓' : '✗'}</div>
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => { setGraphChecked(false); setFeedback(null); }}
                  style={{ width: '100%', padding: '8px 0', background: '#f59e0b', color: 'white', fontWeight: 900, fontSize: 12, borderRadius: 10, border: 'none', cursor: 'pointer' }}>
                  ✏️ Keep Working
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}