import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';

// ── Seeded helpers ─────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, seed) {
  const a = [...arr]; let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = ((s ^ (s << 13)) ^ (s >> 7) ^ (s << 17)) >>> 0;
    const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── TenFrame ──────────────────────────────────────────────────────
function Frame10({ value, seed }) {
  const positions = Array.from({ length: 10 }, (_, i) => i);
  const shuffled = seededShuffle(positions, seed);
  const filled = new Set(shuffled.slice(0, value));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, border: '3px solid #1f2937', borderRadius: 10, padding: 8, background: '#fff' }}>
      {positions.map(i => (
        <div key={i} style={{ width: 38, height: 38, border: '2px solid #9ca3af', borderRadius: 7, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {filled.has(i) && <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#111827' }} />}
        </div>
      ))}
    </div>
  );
}

function DoubleTenFrame({ value, title, seedBase, color = '#166534' }) {
  const top = Math.min(value, 10);
  const bottom = Math.max(0, value - 10);
  return (
    <div style={{ background: 'rgba(255,255,255,0.95)', borderRadius: 24, padding: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ fontSize: 22, fontWeight: 900, color }}>{title}</div>
      <Frame10 value={top} seed={seedBase + 11} />
      <Frame10 value={bottom} seed={seedBase + 29} />
    </div>
  );
}

// ── SlotRoller ────────────────────────────────────────────────────
function SlotRoller({ onResult, label }) {
  const [spinning, setSpinning] = useState(false);
  const [display, setDisplay] = useState('?');
  const [done, setDone] = useState(false);
  const iRef = useRef(null);

  const spin = () => {
    if (spinning || done) return;
    setSpinning(true);
    let count = 0;
    const total = 18 + Math.floor(Math.random() * 10);
    iRef.current = setInterval(() => {
      setDisplay(Math.floor(Math.random() * 21));
      count++;
      if (count >= total) {
        clearInterval(iRef.current);
        const result = Math.floor(Math.random() * 21);
        setDisplay(result);
        setSpinning(false);
        setDone(true);
        onResult(result);
      }
    }, 60);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="font-black text-gray-500 text-sm uppercase">{label}</p>
      <motion.div
        animate={spinning ? { scale: [1, 1.05, 0.97, 1.03, 1] } : {}}
        transition={{ repeat: Infinity, duration: 0.15 }}
        className={`w-20 h-20 rounded-2xl shadow-xl border-4 flex items-center justify-center text-3xl font-black select-none
          ${done ? 'border-green-400 bg-green-50 text-green-700' : spinning ? 'border-blue-300 bg-blue-50 text-blue-600' : 'border-blue-400 bg-white text-blue-700'}`}
      >{display}</motion.div>
      {!done && (
        <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.05 }}
          onClick={spin} disabled={spinning}
          className="bg-blue-500 text-white font-black text-base px-5 py-2 rounded-2xl shadow-lg disabled:opacity-50">
          {spinning ? '🎰 Rolling…' : '🎰 Spin!'}
        </motion.button>
      )}
    </div>
  );
}

const LABEL_MAP = {
  is_greater_than: 'is greater than',
  is_less_than: 'is less than',
  is_equal_to: 'is equal to',
};

export default function TenFrameCompareSolo({ onBack }) {
  const [myRoll, setMyRoll] = useState(null);
  const [compRoll, setCompRoll] = useState(null);
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [roundNum, setRoundNum] = useState(1);
  const [score, setScore] = useState(0);

  const bothRolled = myRoll !== null && compRoll !== null;

  const correct = myRoll !== null && compRoll !== null
    ? (myRoll > compRoll ? 'is_greater_than' : myRoll < compRoll ? 'is_less_than' : 'is_equal_to')
    : null;

  const handleSelect = (val) => {
    if (revealed) return;
    setSelected(val);
    setRevealed(true);
    if (val === correct) setScore(s => s + 1);
  };

  const handleNext = () => {
    setMyRoll(null);
    setCompRoll(null);
    setSelected(null);
    setRevealed(false);
    setRoundNum(r => r + 1);
  };

  const seedBase = (myRoll ?? 0) * 1000 + (compRoll ?? 0) * 37 + roundNum * 7;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(180deg, #dbeafe 0%, #e0f2fe 55%, #dcfce7 100%)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={onBack} className="font-bold text-gray-600 hover:text-gray-900">← Back</button>
        <h1 className="text-lg font-black text-teal-800">🟦 Ten Frame Compare — Solo</h1>
        <div className="flex items-center gap-2 text-sm font-black text-teal-700">
          <span>⭐ {score}</span>
          <span className="text-gray-400">Rd {roundNum}</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center gap-5 px-4 py-4 max-w-xl mx-auto w-full">

        {/* Roll phase */}
        <div className="bg-white rounded-2xl px-6 py-4 shadow-xl w-full flex items-center justify-around gap-4">
          <div className="flex flex-col items-center">
            {myRoll !== null
              ? <><p className="font-black text-gray-500 text-xs uppercase mb-1">You</p>
                  <div className="w-14 h-14 rounded-xl border-4 border-green-400 bg-green-50 flex items-center justify-center text-2xl font-black text-green-700">{myRoll}</div></>
              : <SlotRoller onResult={setMyRoll} label="You" />}
          </div>
          <div className="text-2xl font-black text-gray-300">VS</div>
          <div className="flex flex-col items-center">
            {compRoll !== null
              ? <><p className="font-black text-gray-500 text-xs uppercase mb-1">Computer</p>
                  <div className="w-14 h-14 rounded-xl border-4 border-blue-400 bg-blue-50 flex items-center justify-center text-2xl font-black text-blue-700">{compRoll}</div></>
              : <SlotRoller onResult={setCompRoll} label="Computer" />}
          </div>
        </div>

        {/* Ten frame displays */}
        {bothRolled && !revealed && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="flex gap-4 flex-wrap justify-center w-full">
            <DoubleTenFrame value={myRoll} title="My Number" seedBase={seedBase} color="#166534" />
            <DoubleTenFrame value={compRoll} title="Computer's Number" seedBase={seedBase + 100} color="#1d4ed8" />
          </motion.div>
        )}

        {/* Answer buttons */}
        {bothRolled && !revealed && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap gap-3 justify-center">
            {['is_greater_than', 'is_less_than', 'is_equal_to'].map(v => (
              <button key={v} onClick={() => handleSelect(v)}
                className="px-5 py-3 rounded-2xl font-black text-base bg-white border-4 border-blue-300 text-blue-700 shadow-lg hover:bg-blue-50 active:scale-95 transition-all">
                My number {LABEL_MAP[v]} the computer's
              </button>
            ))}
          </motion.div>
        )}

        {/* Result */}
        {revealed && selected && (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="w-full">
            <div className="flex gap-4 flex-wrap justify-center mb-4">
              <DoubleTenFrame value={myRoll} title="My Number" seedBase={seedBase} color="#166534" />
              <DoubleTenFrame value={compRoll} title="Computer's Number" seedBase={seedBase + 100} color="#1d4ed8" />
            </div>
            <div className={`rounded-2xl p-5 shadow-xl text-center ${selected === correct ? 'bg-green-100' : 'bg-red-50'}`}>
              {selected === correct ? (
                <>
                  <div className="text-3xl mb-1">🎉</div>
                  <p className="text-xl font-black text-green-700">Correct! +1 ⭐</p>
                  <p className="text-base font-bold text-gray-700 mt-1">{myRoll} {LABEL_MAP[correct]} {compRoll}</p>
                </>
              ) : (
                <>
                  <p className="text-base font-black text-red-600 mb-2">❌ My number {LABEL_MAP[selected]} {compRoll}</p>
                  <p className="text-base font-black text-green-700">✓ My number {LABEL_MAP[correct]} {compRoll}</p>
                </>
              )}
              <button onClick={handleNext}
                className="mt-4 w-full bg-teal-600 text-white font-black text-lg py-3 rounded-2xl shadow-lg hover:bg-teal-700">
                🔄 Next Round
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}