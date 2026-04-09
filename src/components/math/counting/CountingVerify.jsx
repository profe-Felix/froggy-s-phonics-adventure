import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

function HandwritingCanvas() {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const currentStroke = useRef([]);
  const strokesRef = useRef([]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * dpr;
    c.height = c.offsetHeight * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);

    const redraw = () => {
      const W = c.offsetWidth / dpr;
      const H = c.offsetHeight / dpr;
      ctx.clearRect(0, 0, W, H);
      // Primary lines
      const top = H * 0.08, mid = H * 0.5, base = H * 0.88;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#93c5fd'; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(W, top); ctx.stroke();
      ctx.strokeStyle = '#93c5fd'; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#3b82f6';
      ctx.beginPath(); ctx.moveTo(0, base); ctx.lineTo(W, base); ctx.stroke();
      // Strokes
      const all = [...strokesRef.current, currentStroke.current].filter(s => s && s.length >= 2);
      all.forEach(pts => {
        ctx.beginPath(); ctx.strokeStyle = '#1e40af'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
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
    const onDown = (e) => { e.preventDefault(); isDrawing.current = true; currentStroke.current = [getPos(e)]; };
    const onMove = (e) => { if (!isDrawing.current) return; e.preventDefault(); currentStroke.current.push(getPos(e)); redraw(); };
    const onUp = () => {
      if (!isDrawing.current) return;
      isDrawing.current = false;
      if (currentStroke.current.length >= 2) strokesRef.current = [...strokesRef.current, [...currentStroke.current]];
      currentStroke.current = [];
      redraw();
    };
    c.addEventListener('mousedown', onDown); c.addEventListener('mousemove', onMove); c.addEventListener('mouseup', onUp); c.addEventListener('mouseleave', onUp);
    c.addEventListener('touchstart', onDown, { passive: false }); c.addEventListener('touchmove', onMove, { passive: false }); c.addEventListener('touchend', onUp);
    return () => {
      c.removeEventListener('mousedown', onDown); c.removeEventListener('mousemove', onMove); c.removeEventListener('mouseup', onUp); c.removeEventListener('mouseleave', onUp);
      c.removeEventListener('touchstart', onDown); c.removeEventListener('touchmove', onMove); c.removeEventListener('touchend', onUp);
    };
  }, []);

  const clear = () => {
    strokesRef.current = [];
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = c.getContext('2d');
    const W = c.offsetWidth / dpr, H = c.offsetHeight / dpr;
    ctx.clearRect(0, 0, W, H);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-blue-700">✏️ Write the number:</p>
        <button onClick={clear} className="text-xs text-gray-400 hover:text-red-500">Clear</button>
      </div>
      <canvas ref={canvasRef} style={{ width: '100%', height: 70, background: '#f8fafc', borderRadius: 10, border: '2px solid #bfdbfe', cursor: 'crosshair', touchAction: 'none', display: 'block' }} />
    </div>
  );
}

function DigitPad({ onSubmit }) {
  const [val, setVal] = useState('');
  const press = (d) => { if (val.length < 2) setVal(v => v + d); };
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-24 h-16 border-4 border-indigo-400 rounded-2xl flex items-center justify-center text-4xl font-black text-indigo-700 bg-white shadow-inner">
        {val || <span className="text-gray-300">?</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[1,2,3,4,5,6,7,8,9].map(d => (
          <button key={d} onClick={() => press(String(d))}
            className="w-14 h-14 bg-white border-2 border-indigo-200 rounded-xl font-black text-xl text-indigo-700 hover:bg-indigo-50 shadow">
            {d}
          </button>
        ))}
        <button onClick={() => setVal('')} className="w-14 h-14 bg-red-100 border-2 border-red-200 rounded-xl font-bold text-red-600 hover:bg-red-200 shadow">✕</button>
        <button onClick={() => press('0')} className="w-14 h-14 bg-white border-2 border-indigo-200 rounded-xl font-black text-xl text-indigo-700 hover:bg-indigo-50 shadow">0</button>
        <button onClick={() => setVal(v => v.slice(0, -1))} className="w-14 h-14 bg-gray-100 border-2 border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-200 shadow">⌫</button>
      </div>
      <motion.button whileTap={{ scale: 0.95 }} onClick={() => val && onSubmit(parseInt(val))}
        disabled={!val}
        className="bg-indigo-600 text-white font-black text-lg px-8 py-3 rounded-2xl shadow-lg disabled:opacity-40">
        ✓ That's my answer!
      </motion.button>
    </div>
  );
}

// targetCount = real answer, onVerified(answer) called when correct, onGoBack called when wrong
export default function CountingVerify({ targetCount, onVerified, onGoBack }) {
  const [phase, setPhase] = useState('type');
  const [attempt, setAttempt] = useState(null);

  const handleSubmit = (val) => {
    setAttempt(val);
    if (val === targetCount) {
      setPhase('done');
      setTimeout(() => onVerified(val), 800);
    } else {
      setPhase('wrong');
    }
  };

  if (phase === 'done') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
        <div className="text-5xl">🎉</div>
        <p className="text-xl font-black text-green-700">That's right! {targetCount}</p>
      </div>
    );
  }

  if (phase === 'wrong') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-4">
        <div className="text-4xl">🤔</div>
        <p className="text-base font-bold text-red-600">Try again!</p>
        <p className="text-gray-500 text-sm text-center">You said <strong>{attempt}</strong> — look at the collection and recount.</p>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setPhase('type'); if (onGoBack) onGoBack(); }}
          className="bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-2xl shadow">
          ← Recount
        </motion.button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 h-full">
      <p className="text-sm font-bold text-gray-500 uppercase tracking-wide text-center">Write &amp; Enter your count</p>
      <HandwritingCanvas />
      <div className="flex flex-col items-center gap-3 flex-1">
        <p className="text-sm font-bold text-gray-700">How many?</p>
        <DigitPad onSubmit={handleSubmit} />
      </div>
    </div>
  );
}