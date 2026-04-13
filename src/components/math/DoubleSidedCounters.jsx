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
    <div className="flex flex-col items-center gap-1.5">
      <div className="w-16 h-16 rounded-2xl border-4 flex items-center justify-center text-3xl font-black"
        style={{ borderColor: color, color }}>
        {value ?? '?'}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {digits.map((d, i) => (
          <button key={i} onClick={() => handleDigit(d)}
            disabled={d === null}
            className="w-9 h-9 rounded-xl font-bold text-base flex items-center justify-center shadow-sm transition-all active:scale-90"
            style={{
              background: d === null ? 'transparent' : d === 'del' ? '#fee2e2' : '#f1f5f9',
              color: d === 'del' ? '#dc2626' : '#334155',
              border: d === null ? 'none' : '1.5px solid #e2e8f0',
            }}>
            {d === 'del' ? '⌫' : d === null ? '' : d}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Counter Canvas ──
function CounterCanvas({ counters, onCountsChange }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const itemsRef = useRef([]);
  const lassoRef = useRef(null);
  const isDraggingRef = useRef(false);
  const isLassoRef = useRef(false);
  const dragGroupRef = useRef([]); // [{id, offsetX, offsetY}]
  const dragStartRef = useRef(null);
  const toolRef = useRef('move'); // 'move' | 'lasso'
  const [tool, setToolState] = useState('move');
  const [lassoActive, setLassoActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const animRef = useRef(null);
  const COUNTER_R = 22;

  const setTool = (t) => {
    toolRef.current = t;
    setToolState(t);
    if (t === 'move') {
      lassoRef.current = null;
      setLassoActive(false);
    }
    setSelectedIds(new Set());
  };

  // Spread counters randomly across canvas on first render / when counters change
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    itemsRef.current = counters.map((color, i) => ({
      id: i,
      color,
      x: COUNTER_R + Math.random() * (width - COUNTER_R * 2),
      y: COUNTER_R + Math.random() * (height - COUNTER_R * 2),
      rotation: Math.random() * 30 - 15,
    }));
    draw();
  }, [counters]);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);

    // Draw counters
    for (const item of itemsRef.current) {
      const selected = selectedIds.has(item.id);
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate((item.rotation * Math.PI) / 180);
      // Shadow
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      // Fill
      const grad = ctx.createRadialGradient(-8, -8, 2, 0, 0, COUNTER_R);
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
      // Border
      ctx.strokeStyle = item.color === 'red' ? '#991b1b' : '#92400e';
      ctx.lineWidth = selected ? 3.5 : 2.5;
      ctx.stroke();
      // Selection ring
      if (selected) {
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 3;
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
  }, [selectedIds]);

  // Redraw whenever selectedIds changes
  useEffect(() => { draw(); }, [selectedIds, draw]);

  const getPos = (e, c) => {
    const r = c.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  };

  const hitTest = (x, y) => {
    // find topmost counter under point
    for (let i = itemsRef.current.length - 1; i >= 0; i--) {
      const it = itemsRef.current[i];
      if (Math.hypot(x - it.x, y - it.y) <= COUNTER_R + 2) return it.id;
    }
    return null;
  };

  const pointInPoly = (px, py, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  // Report counts up
  const reportCounts = useCallback(() => {
    const red = itemsRef.current.filter(i => i.color === 'red').length;
    const yellow = itemsRef.current.filter(i => i.color === 'yellow').length;
    onCountsChange && onCountsChange(red, yellow);
  }, [onCountsChange]);

  useEffect(() => {
    const c = canvasRef.current;
    const el = containerRef.current;
    if (!c || !el) return;

    // Size canvas
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

    const onDown = (e) => {
      e.preventDefault();
      const pos = getPos(e, c);
      dragStartRef.current = pos;

      if (toolRef.current === 'lasso') {
        isLassoRef.current = true;
        lassoRef.current = [pos];
        setLassoActive(true);
        draw();
        return;
      }

      // Move tool — check if clicking a selected counter (group drag) or a single counter
      const hitId = hitTest(pos.x, pos.y);
      if (hitId !== null) {
        isDraggingRef.current = true;
        let ids;
        if (selectedIds.has(hitId)) {
          ids = [...selectedIds];
        } else {
          ids = [hitId];
          setSelectedIds(new Set([hitId]));
        }
        dragGroupRef.current = ids.map(id => {
          const it = itemsRef.current.find(x => x.id === id);
          return { id, offsetX: pos.x - it.x, offsetY: pos.y - it.y };
        });
      } else {
        // Clicked empty space — deselect
        setSelectedIds(new Set());
      }
    };

    const onMove = (e) => {
      e.preventDefault();
      const pos = getPos(e, c);

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

    const onUp = (e) => {
      if (isLassoRef.current && lassoRef.current) {
        // Select all counters inside lasso
        const poly = lassoRef.current;
        const inside = new Set(
          itemsRef.current.filter(it => pointInPoly(it.x, it.y, poly)).map(it => it.id)
        );
        setSelectedIds(inside);
        lassoRef.current = null;
        isLassoRef.current = false;
        setLassoActive(false);
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
      ro.disconnect();
      c.removeEventListener('mousedown', onDown);
      c.removeEventListener('mousemove', onMove);
      c.removeEventListener('mouseup', onUp);
      c.removeEventListener('mouseleave', onUp);
      c.removeEventListener('touchstart', onDown);
      c.removeEventListener('touchmove', onMove);
      c.removeEventListener('touchend', onUp);
    };
  }, [selectedIds, draw]);

  const cursorStyle = tool === 'lasso' ? 'crosshair' : 'grab';

  return (
    <div className="flex flex-col w-full h-full">
      {/* Mini toolbar */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-amber-50 border-b border-amber-200 rounded-t-2xl">
        <button onClick={() => setTool('move')}
          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${tool === 'move' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-700 border-amber-300'}`}>
          ✋ Move
        </button>
        <button onClick={() => setTool('lasso')}
          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${tool === 'lasso' ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-indigo-700 border-indigo-300'}`}>
          🪤 Lasso
        </button>
        {selectedIds.size > 0 && (
          <span className="text-xs text-indigo-500 font-bold">{selectedIds.size} selected — drag to move group</span>
        )}
      </div>
      <div ref={containerRef} className="flex-1 relative rounded-b-2xl overflow-hidden"
        style={{ background: '#fefce8', border: '2px dashed #fbbf24', minHeight: 180 }}>
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
    const correctComp = actualRed > actualYellow ? 'Greater Than'
      : actualRed < actualYellow ? 'Less Than' : 'Equal To';
    const compOk = selectedComparison === correctComp;
    setFeedback({ redOk, yellowOk, compOk, correctComp, actualRed, actualYellow });
    setSubmitted(true);
    setRounds(r => [...r, { red: actualRed, yellow: actualYellow, studentRed: redInput, studentYellow: yellowInput, comparison: selectedComparison, correctComp, redOk, yellowOk, compOk }]);
  };

  const COMPARISON_OPTIONS = [
    { label: 'Greater Than', symbol: '>' },
    { label: 'Less Than', symbol: '<' },
    { label: 'Equal To', symbol: '=' },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde8e8 100%)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: '#d97706' }}>
        <button onClick={onBack} className="text-white/80 hover:text-white font-bold text-sm">← Back</button>
        <h1 className="text-lg font-black text-white flex-1 text-center">🟡🔴 Double-Sided Counters</h1>
      </div>

      {/* Cup + Shake */}
      <div className="flex flex-col items-center gap-2 py-3">
        <motion.div
          animate={shaking ? { rotate: [0, -20, 20, -20, 20, 0], y: [0, -10, 5, -10, 5, 0] } : {}}
          transition={{ duration: 0.7 }}
        >
          <svg width="80" height="90" viewBox="0 0 100 110">
            <path d="M15 10 L85 10 L72 100 L28 100 Z" fill="#d97706" stroke="#92400e" strokeWidth="3" />
            <path d="M15 10 L85 10" stroke="#92400e" strokeWidth="4" strokeLinecap="round" />
            {!spilled && Array.from({ length: Math.min(total || 0, 6) }).map((_, i) => (
              <circle key={i} cx={30 + (i % 3) * 18} cy={50 + Math.floor(i / 3) * 16}
                r="7" fill={i % 2 === 0 ? '#dc2626' : '#ca8a04'} stroke="#fff" strokeWidth="1.5" />
            ))}
          </svg>
        </motion.div>
        <button onClick={shake} disabled={shaking}
          className="px-8 py-2.5 rounded-2xl font-black text-white text-base shadow-lg active:scale-95 transition-all disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #d97706, #dc2626)' }}>
          {shaking ? '🫙 Shaking…' : spilled ? '🔄 Shake Again' : '🫙 Shake & Spill!'}
        </button>
      </div>

      {/* Main content area: canvas + input side by side on tablet+ */}
      <AnimatePresence>
        {spilled && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col md:flex-row gap-3 px-3 pb-4" style={{ minHeight: 0 }}>

            {/* Canvas */}
            <div className="flex-1 rounded-2xl overflow-hidden shadow-lg flex flex-col" style={{ minHeight: 240 }}>
              <p className="text-center text-xs font-bold text-amber-700 py-1 bg-amber-50">
                {total} counters — sort & count them!
              </p>
              <div className="flex-1">
                <CounterCanvas counters={counters} />
              </div>
            </div>

            {/* Input panel */}
            <div className="flex flex-col items-center gap-4 bg-white rounded-2xl shadow-xl p-4 w-full md:w-64">
              {/* Red count */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-sm font-black text-red-600">🔴 Red</span>
                <DigitPad value={redInput} onChange={setRedInput} color="#dc2626" />
              </div>

              {/* VS + Comparison stacked */}
              <div className="flex flex-col items-center gap-2 w-full">
                <span className="text-xs font-black text-gray-400">VERSUS</span>
                {COMPARISON_OPTIONS.map(opt => {
                  let bg = 'bg-gray-100 text-gray-600 border-gray-200';
                  if (selectedComparison === opt.label && !submitted) bg = 'bg-indigo-500 text-white border-indigo-500';
                  if (submitted && feedback) {
                    if (opt.label === feedback.correctComp) bg = 'bg-green-500 text-white border-green-500';
                    else if (opt.label === selectedComparison && !feedback.compOk) bg = 'bg-red-400 text-white border-red-400';
                    else bg = 'bg-gray-100 text-gray-300 border-gray-200';
                  }
                  return (
                    <button key={opt.label} onClick={() => !submitted && setSelectedComparison(opt.label)} disabled={submitted}
                      className={`w-full py-2 rounded-xl font-bold border-2 text-sm transition-all ${bg}`}>
                      {opt.symbol} {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* Yellow count */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-sm font-black text-amber-600">🟡 Yellow</span>
                <DigitPad value={yellowInput} onChange={setYellowInput} color="#ca8a04" />
              </div>

              {/* Feedback */}
              {submitted && feedback && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  className="rounded-xl p-3 text-center w-full"
                  style={{ background: (feedback.redOk && feedback.yellowOk && feedback.compOk) ? '#dcfce7' : '#fef2f2' }}>
                  <p className="font-black text-base">
                    {feedback.redOk && feedback.yellowOk && feedback.compOk ? '🎉 Perfect!' : '📝 Check it!'}
                  </p>
                  <div className="text-xs font-bold mt-1 space-y-0.5">
                    <p className={feedback.redOk ? 'text-green-600' : 'text-red-500'}>
                      Red: {feedback.actualRed} {!feedback.redOk && `(you: ${redInput})`}
                    </p>
                    <p className={feedback.yellowOk ? 'text-green-600' : 'text-red-500'}>
                      Yellow: {feedback.actualYellow} {!feedback.yellowOk && `(you: ${yellowInput})`}
                    </p>
                    {!feedback.compOk && <p className="text-red-500">Answer: {feedback.correctComp}</p>}
                  </div>
                </motion.div>
              )}

              {/* Submit / Next */}
              {!submitted ? (
                <button onClick={handleSubmit} disabled={selectedComparison === null}
                  className="w-full py-2.5 rounded-xl font-black text-white text-sm disabled:opacity-40 transition-all"
                  style={{ background: 'linear-gradient(135deg, #4338ca, #7c3aed)' }}>
                  ✅ Check Answer
                </button>
              ) : (
                <button onClick={shake}
                  className="w-full py-2.5 rounded-xl font-black text-white text-sm"
                  style={{ background: 'linear-gradient(135deg, #d97706, #dc2626)' }}>
                  🔄 New Round
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Round history */}
      {rounds.length > 0 && (
        <div className="mx-3 mb-4 bg-white rounded-2xl shadow p-3">
          <p className="font-black text-gray-600 mb-2 text-xs">📋 Round History</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="py-1 px-2 text-red-500">Red</th>
                  <th className="py-1 px-2 text-gray-500">Comparison</th>
                  <th className="py-1 px-2 text-amber-600">Yellow</th>
                  <th className="py-1 px-2 text-gray-400">✓</th>
                </tr>
              </thead>
              <tbody>
                {rounds.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 text-center">
                    <td className={`py-1.5 px-2 font-bold ${r.redOk ? 'text-green-600' : 'text-red-400'}`}>{r.actualRed}</td>
                    <td className={`py-1.5 px-2 font-bold ${r.compOk ? 'text-green-600' : 'text-red-400'}`}>{r.comparison}</td>
                    <td className={`py-1.5 px-2 font-bold ${r.yellowOk ? 'text-green-600' : 'text-amber-400'}`}>{r.actualYellow}</td>
                    <td className="py-1.5 px-2">{r.redOk && r.yellowOk && r.compOk ? '✅' : '❌'}</td>
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