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

function randomTotal() {
  return Math.floor(Math.random() * 10) + 11; // 11-20
}

// ── Digit Pad ──
function DigitPad({ value, onChange, color }) {
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'];
  const handleDigit = (d) => {
    if (d === 'del') {
      onChange(Math.floor((value || 0) / 10));
    } else if (d !== null) {
      const next = (value || 0) * 10 + d;
      if (next <= 99) onChange(next);
    }
  };
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-14 h-14 rounded-2xl border-4 flex items-center justify-center text-3xl font-black"
        style={{ borderColor: color, color }}>
        {value ?? '?'}
      </div>
      <div className="grid grid-cols-3 gap-0.5">
        {digits.map((d, i) => (
          <button key={i} onClick={() => handleDigit(d)}
            disabled={d === null}
            className="w-8 h-8 rounded-lg font-bold text-sm flex items-center justify-center shadow-sm transition-all active:scale-90"
            style={{
              background: d === null ? 'transparent' : d === 'del' ? '#fee2e2' : '#f1f5f9',
              color: d === 'del' ? '#dc2626' : '#334155',
              border: d === null ? 'none' : '1px solid #e2e8f0',
            }}>
            {d === 'del' ? '⌫' : d === null ? '' : d}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Counter Canvas with tools ──
function CounterCanvas({ counters }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const itemsRef = useRef([]);
  const strokesRef = useRef([]); // [{pts, color, width}]
  const currentStrokeRef = useRef(null);
  const lassoRef = useRef(null);
  const isDraggingRef = useRef(false);
  const isLassoRef = useRef(false);
  const isDrawingRef = useRef(false);
  const dragGroupRef = useRef([]);
  const selectedIdsRef = useRef(new Set());
  const toolRef = useRef('move');
  const drawColorRef = useRef('#2563eb');
  const drawWidthRef = useRef(3);
  const [tool, setToolState] = useState('move');
  const [selectedCount, setSelectedCount] = useState(0);
  const [strokeCount, setStrokeCount] = useState(0);
  const COUNTER_R = 18;

  const setTool = (t) => {
    toolRef.current = t;
    setToolState(t);
    if (t !== 'lasso') {
      lassoRef.current = null;
    }
    selectedIdsRef.current = new Set();
    setSelectedCount(0);
    draw();
  };

  // Draw five-frame (1x5 grid)
  const drawFiveFrame = (ctx, x, y, w = 110, h = 44) => {
    ctx.strokeStyle = '#1e40af'; ctx.lineWidth = 2; ctx.fillStyle = 'white';
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
    for (let i = 1; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(x + i * w / 5, y); ctx.lineTo(x + i * w / 5, y + h); ctx.stroke();
    }
  };

  // Draw ten-frame (2x5 grid)
  const drawTenFrame = (ctx, x, y, w = 110, h = 80) => {
    ctx.strokeStyle = '#1e40af'; ctx.lineWidth = 2; ctx.fillStyle = 'white';
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
    for (let i = 1; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(x + i * w / 5, y); ctx.lineTo(x + i * w / 5, y + h); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
  };

  // Draw circle
  const drawCircle = (ctx, x, y, r = 30) => {
    ctx.strokeStyle = '#1e40af'; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(219,234,254,0.5)';
    ctx.beginPath(); ctx.arc(x + r, y + r, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  };

  const placedShapesRef = useRef([]); // [{type, x, y}]

  const addShape = (type) => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    placedShapesRef.current = [...placedShapesRef.current, { type, x: width / 2 - 55, y: height / 2 - 40, id: Date.now() }];
    draw();
  };

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);

    // Draw shapes
    for (const shape of placedShapesRef.current) {
      if (shape.type === 'fiveframe') drawFiveFrame(ctx, shape.x, shape.y);
      else if (shape.type === 'tenframe') drawTenFrame(ctx, shape.x, shape.y);
      else if (shape.type === 'circle') drawCircle(ctx, shape.x, shape.y);
    }

    // Draw strokes
    for (const stroke of strokesRef.current) {
      if (!stroke.pts || stroke.pts.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color || '#2563eb';
      ctx.lineWidth = stroke.width || 3;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.moveTo(stroke.pts[0].x, stroke.pts[0].y);
      stroke.pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }
    // Current stroke
    if (currentStrokeRef.current && currentStrokeRef.current.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = toolRef.current === 'eraser' ? '#f1f5f9' : drawColorRef.current;
      ctx.lineWidth = toolRef.current === 'eraser' ? 18 : drawWidthRef.current;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.moveTo(currentStrokeRef.current[0].x, currentStrokeRef.current[0].y);
      currentStrokeRef.current.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }

    // Draw counters
    for (const item of itemsRef.current) {
      const selected = selectedIdsRef.current.has(item.id);
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.shadowColor = 'rgba(0,0,0,0.2)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 2;
      const grad = ctx.createRadialGradient(-6, -6, 2, 0, 0, COUNTER_R);
      if (item.color === 'red') {
        grad.addColorStop(0, '#ff6b6b');
        grad.addColorStop(1, '#dc2626');
      } else {
        grad.addColorStop(0, '#fde68a');
        grad.addColorStop(1, '#ca8a04');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, COUNTER_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = item.color === 'red' ? '#991b1b' : '#92400e';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (selected) {
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(0, 0, COUNTER_R + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    // Draw lasso
    if (lassoRef.current && lassoRef.current.length > 1) {
      ctx.save();
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.fillStyle = 'rgba(99,102,241,0.08)';
      ctx.beginPath();
      ctx.moveTo(lassoRef.current[0].x, lassoRef.current[0].y);
      lassoRef.current.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    const el = containerRef.current;
    if (!c || !el) return;
    const sizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      c.width = el.offsetWidth * dpr;
      c.height = el.offsetHeight * dpr;
      c.style.width = el.offsetWidth + 'px';
      c.style.height = el.offsetHeight + 'px';
      draw();
    };
    sizeCanvas();
    const ro = new ResizeObserver(sizeCanvas);
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    itemsRef.current = counters.map((color, i) => ({
      id: i, color,
      x: COUNTER_R + Math.random() * (width - COUNTER_R * 2),
      y: COUNTER_R + Math.random() * (height - COUNTER_R * 2),
    }));
    draw();
  }, [counters, draw]);

  const getPos = (e, c) => {
    const r = c.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  };

  const hitTest = (x, y) => {
    for (let i = itemsRef.current.length - 1; i >= 0; i--) {
      const it = itemsRef.current[i];
      if (Math.hypot(x - it.x, y - it.y) <= COUNTER_R + 2) return it.id;
    }
    return null;
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

  useEffect(() => {
    const c = canvasRef.current;
    const el = containerRef.current;
    if (!c || !el) return;

    const onDown = (e) => {
      e.preventDefault();
      const pos = getPos(e, c);

      // Draw / eraser
      if (toolRef.current === 'pencil' || toolRef.current === 'eraser') {
        isDrawingRef.current = true;
        currentStrokeRef.current = [pos];
        draw();
        return;
      }

      // Lasso tool
      if (toolRef.current === 'lasso') {
        const hitId = hitTest(pos.x, pos.y);
        // If clicking a selected item in lasso mode → start drag instead
        if (hitId !== null && selectedIdsRef.current.has(hitId)) {
          isDraggingRef.current = true;
          const ids = [...selectedIdsRef.current];
          dragGroupRef.current = ids.map(id => {
            const it = itemsRef.current.find(x => x.id === id);
            return { id, offsetX: pos.x - it.x, offsetY: pos.y - it.y };
          });
          return;
        }
        // Otherwise start a new lasso
        isLassoRef.current = true;
        lassoRef.current = [pos];
        selectedIdsRef.current = new Set();
        setSelectedCount(0);
        draw();
        return;
      }

      // Move tool
      const hitId = hitTest(pos.x, pos.y);
      if (hitId !== null) {
        isDraggingRef.current = true;
        let ids;
        if (selectedIdsRef.current.has(hitId)) {
          ids = [...selectedIdsRef.current];
        } else {
          ids = [hitId];
          selectedIdsRef.current = new Set([hitId]);
          setSelectedCount(1);
        }
        dragGroupRef.current = ids.map(id => {
          const it = itemsRef.current.find(x => x.id === id);
          return { id, offsetX: pos.x - it.x, offsetY: pos.y - it.y };
        });
      } else {
        selectedIdsRef.current = new Set();
        setSelectedCount(0);
        draw();
      }
    };

    const onMove = (e) => {
      e.preventDefault();
      const pos = getPos(e, c);

      if (isDrawingRef.current) {
        currentStrokeRef.current.push(pos);
        draw();
        return;
      }

      if (isLassoRef.current && lassoRef.current) {
        lassoRef.current.push(pos);
        draw();
        return;
      }

      if (isDraggingRef.current && dragGroupRef.current.length) {
        for (const g of dragGroupRef.current) {
          const it = itemsRef.current.find(x => x.id === g.id);
          if (it) {
            it.x = Math.max(COUNTER_R, Math.min(el.offsetWidth - COUNTER_R, pos.x - g.offsetX));
            it.y = Math.max(COUNTER_R, Math.min(el.offsetHeight - COUNTER_R, pos.y - g.offsetY));
          }
        }
        draw();
      }
    };

    const onUp = () => {
      if (isDrawingRef.current) {
        if (currentStrokeRef.current && currentStrokeRef.current.length > 1) {
          const color = toolRef.current === 'eraser' ? '#f1f5f9' : drawColorRef.current;
          const width = toolRef.current === 'eraser' ? 18 : drawWidthRef.current;
          strokesRef.current = [...strokesRef.current, { pts: [...currentStrokeRef.current], color, width }];
          setStrokeCount(n => n + 1);
        }
        currentStrokeRef.current = null;
        isDrawingRef.current = false;
        draw();
        return;
      }

      if (isLassoRef.current && lassoRef.current) {
        const poly = lassoRef.current;
        const inside = new Set(itemsRef.current.filter(it => pointInPoly(it.x, it.y, poly)).map(it => it.id));
        selectedIdsRef.current = inside;
        setSelectedCount(inside.size);
        lassoRef.current = null;
        isLassoRef.current = false;
        draw();
        return;
      }

      isDraggingRef.current = false;
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
  }, [draw]);

  const cursorStyle = tool === 'lasso' ? 'crosshair' : tool === 'pencil' ? 'crosshair' : tool === 'eraser' ? 'cell' : 'grab';

  const TOOLS = [
    { id: 'move', label: '✋' },
    { id: 'lasso', label: '🪤' },
    { id: 'pencil', label: '✏️' },
    { id: 'eraser', label: '⬜' },
  ];

  return (
    <div className="flex flex-col w-full h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-amber-50 border-b border-amber-200 flex-wrap">
        {TOOLS.map(t => (
          <button key={t.id} onClick={() => setTool(t.id)} title={t.id}
            className={`w-8 h-8 rounded-lg text-base flex items-center justify-center border transition-all ${tool === t.id ? 'bg-amber-500 border-amber-500 shadow-inner' : 'bg-white border-amber-200 hover:bg-amber-100'}`}>
            {t.label}
          </button>
        ))}
        <div className="w-px h-5 bg-amber-200 mx-0.5" />
        <button onClick={() => addShape('circle')} className="px-2 py-1 rounded-lg text-xs bg-white border border-amber-200 hover:bg-amber-50 font-bold text-amber-700">⭕ Circle</button>
        <button onClick={() => addShape('fiveframe')} className="px-2 py-1 rounded-lg text-xs bg-white border border-amber-200 hover:bg-amber-50 font-bold text-amber-700">5-Frame</button>
        <button onClick={() => addShape('tenframe')} className="px-2 py-1 rounded-lg text-xs bg-white border border-amber-200 hover:bg-amber-50 font-bold text-amber-700">10-Frame</button>
        {strokeCount > 0 && <>
          <button onClick={() => { strokesRef.current = strokesRef.current.slice(0, -1); setStrokeCount(n => Math.max(0, n - 1)); draw(); }} className="px-2 py-1 text-xs text-gray-500 hover:text-orange-500 font-bold">↩ Undo</button>
          <button onClick={() => { strokesRef.current = []; setStrokeCount(0); placedShapesRef.current = []; draw(); }} className="px-2 py-1 text-xs text-red-400 hover:text-red-600 font-bold">🗑 Clear</button>
        </>}
        {selectedCount > 0 && <span className="text-xs text-indigo-500 font-bold ml-1">{selectedCount} selected</span>}
      </div>
      <div ref={containerRef} className="flex-1 relative rounded-b-2xl overflow-hidden"
        style={{ background: '#fffbeb', border: '2px dashed #fbbf24', minHeight: 0 }}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, cursor: cursorStyle, touchAction: 'none' }} />
      </div>
    </div>
  );
}

export default function DoubleSidedCounters({ onBack }) {
  const [counters, setCounters] = useState([]);
  const [shaking, setShaking] = useState(false);
  const [spilled, setSpilled] = useState(false);
  const [total, setTotal] = useState(null);
  const [redInput, setRedInput] = useState(0);
  const [yellowInput, setYellowInput] = useState(0);
  const [selectedComparison, setSelectedComparison] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [rounds, setRounds] = useState([]);

  const actualRed = counters.filter(c => c === 'red').length;
  const actualYellow = counters.filter(c => c === 'yellow').length;

  const shake = () => {
    if (shaking) return;
    const t = randomTotal();
    const c = generateCounters(t);
    setTotal(t);
    setCounters(c);
    setShaking(true);
    setSpilled(false);
    setSubmitted(false);
    setFeedback(null);
    setSelectedComparison(null);
    setRedInput(0);
    setYellowInput(0);
    setTimeout(() => { setShaking(false); setSpilled(true); }, 800);
  };

  const handleSubmit = () => {
    if (!spilled || selectedComparison === null) return;
    const redOk = redInput === actualRed;
    const yellowOk = yellowInput === actualYellow;
    const correctComp = actualRed > actualYellow ? '>' : actualRed < actualYellow ? '<' : '=';
    const compOk = selectedComparison === correctComp;
    setFeedback({ redOk, yellowOk, compOk, correctComp, actualRed, actualYellow });
    setSubmitted(true);
    setRounds(r => [...r, { red: actualRed, yellow: actualYellow, studentRed: redInput, studentYellow: yellowInput, comparison: selectedComparison, correctComp, redOk, yellowOk, compOk }]);
  };

  const COMPARISONS = [
    { label: 'Greater Than', symbol: '>' },
    { label: 'Less Than', symbol: '<' },
    { label: 'Equal To', symbol: '=' },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde8e8 100%)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5" style={{ background: '#d97706' }}>
        <button onClick={onBack} className="text-white/80 hover:text-white font-bold text-sm">← Back</button>
        <h1 className="text-base font-black text-white flex-1 text-center">🟡🔴 Double-Sided Counters</h1>
      </div>

      {/* Cup + Shake — compact */}
      <div className="flex items-center justify-center gap-4 py-2">
        <motion.div
          animate={shaking ? { rotate: [0, -20, 20, -20, 20, 0], y: [0, -10, 5, -10, 5, 0] } : {}}
          transition={{ duration: 0.7 }}>
          <svg width="56" height="64" viewBox="0 0 100 110">
            <path d="M15 10 L85 10 L72 100 L28 100 Z" fill="#d97706" stroke="#92400e" strokeWidth="3" />
            <path d="M15 10 L85 10" stroke="#92400e" strokeWidth="4" strokeLinecap="round" />
            {!spilled && Array.from({ length: Math.min(total || 0, 6) }).map((_, i) => (
              <circle key={i} cx={30 + (i % 3) * 18} cy={50 + Math.floor(i / 3) * 16}
                r="7" fill={i % 2 === 0 ? '#dc2626' : '#ca8a04'} stroke="#fff" strokeWidth="1.5" />
            ))}
          </svg>
        </motion.div>
        <button onClick={shake} disabled={shaking}
          className="px-6 py-2 rounded-2xl font-black text-white text-sm shadow-lg active:scale-95 transition-all disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #d97706, #dc2626)' }}>
          {shaking ? '🫙 Shaking…' : spilled ? '🔄 Shake Again' : '🫙 Shake & Spill!'}
        </button>
        {total && <span className="text-sm font-black text-amber-700">{total} counters</span>}
      </div>

      {/* Main area: RED pad | CANVAS | COMPARISON | YELLOW pad */}
      <AnimatePresence>
        {spilled && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-row gap-2 px-2 pb-3" style={{ minHeight: 0 }}>

            {/* RED side */}
            <div className="flex flex-col items-center justify-center gap-1 bg-white rounded-2xl shadow-lg px-2 py-2 shrink-0">
              <span className="text-xs font-black text-red-600">🔴 Red</span>
              <DigitPad value={redInput} onChange={setRedInput} color="#dc2626" />
              {submitted && (
                <span className={`text-xs font-bold ${feedback?.redOk ? 'text-green-600' : 'text-red-500'}`}>
                  {feedback?.redOk ? '✅' : `Ans: ${actualRed}`}
                </span>
              )}
            </div>

            {/* Canvas — center, takes remaining space */}
            <div className="flex-1 rounded-2xl overflow-hidden shadow-lg flex flex-col" style={{ minHeight: 200 }}>
              <CounterCanvas counters={counters} />
            </div>

            {/* COMPARISON — middle column */}
            <div className="flex flex-col items-center justify-center gap-1.5 shrink-0">
              <span className="text-[10px] font-black text-gray-400">VS</span>
              {COMPARISONS.map(opt => {
                let bg = '#f1f5f9', color = '#475569', border = '#cbd5e1';
                if (selectedComparison === opt.symbol && !submitted) { bg = '#6366f1'; color = 'white'; border = '#6366f1'; }
                if (submitted && feedback) {
                  if (opt.symbol === feedback.correctComp) { bg = '#22c55e'; color = 'white'; border = '#22c55e'; }
                  else if (opt.symbol === selectedComparison && !feedback.compOk) { bg = '#ef4444'; color = 'white'; border = '#ef4444'; }
                  else { bg = '#f1f5f9'; color = '#9ca3af'; border = '#e5e7eb'; }
                }
                return (
                  <button key={opt.symbol} onClick={() => !submitted && setSelectedComparison(opt.symbol)}
                    disabled={submitted}
                    style={{ background: bg, color, border: `2px solid ${border}`, width: 52, height: 44 }}
                    className="rounded-xl font-black text-xl transition-all active:scale-95">
                    {opt.symbol}
                  </button>
                );
              })}
              {!submitted ? (
                <button onClick={handleSubmit} disabled={selectedComparison === null}
                  className="mt-1 px-2 py-1.5 rounded-xl font-black text-white text-xs disabled:opacity-40"
                  style={{ background: '#4338ca', fontSize: 10 }}>
                  ✅ Check
                </button>
              ) : (
                <button onClick={shake}
                  className="mt-1 px-2 py-1.5 rounded-xl font-black text-white text-xs"
                  style={{ background: '#d97706', fontSize: 10 }}>
                  🔄 New
                </button>
              )}
            </div>

            {/* YELLOW side */}
            <div className="flex flex-col items-center justify-center gap-1 bg-white rounded-2xl shadow-lg px-2 py-2 shrink-0">
              <span className="text-xs font-black text-amber-600">🟡 Yellow</span>
              <DigitPad value={yellowInput} onChange={setYellowInput} color="#ca8a04" />
              {submitted && (
                <span className={`text-xs font-bold ${feedback?.yellowOk ? 'text-green-600' : 'text-red-500'}`}>
                  {feedback?.yellowOk ? '✅' : `Ans: ${actualYellow}`}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Round history */}
      {rounds.length > 0 && (
        <div className="mx-2 mb-3 bg-white rounded-2xl shadow p-2">
          <p className="font-black text-gray-600 mb-1 text-xs">📋 History</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="py-1 px-2 text-red-500">Red</th>
                  <th className="py-1 px-2 text-gray-500">vs</th>
                  <th className="py-1 px-2 text-amber-600">Yellow</th>
                  <th className="py-1 px-2 text-gray-400">✓</th>
                </tr>
              </thead>
              <tbody>
                {rounds.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 text-center">
                    <td className={`py-1 px-2 font-bold ${r.redOk ? 'text-green-600' : 'text-red-400'}`}>{r.actualRed}</td>
                    <td className={`py-1 px-2 font-bold ${r.compOk ? 'text-green-600' : 'text-red-400'}`}>{r.comparison}</td>
                    <td className={`py-1 px-2 font-bold ${r.yellowOk ? 'text-green-600' : 'text-amber-400'}`}>{r.actualYellow}</td>
                    <td className="py-1 px-2">{r.redOk && r.yellowOk && r.compOk ? '✅' : '❌'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}