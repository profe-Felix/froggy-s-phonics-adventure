import React, { useState, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';

// ── Seeded helpers (copied from TenFrameCompareStudentLesson) ──────
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
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

// ── Frame components (copied from TenFrameCompareStudentLesson) ────
function Frame10({ value, seed }) {
  const positions = Array.from({ length: 10 }, (_, i) => i);
  const shuffled = seededShuffle(positions, seed);
  const filledPositions = new Set(shuffled.slice(0, value));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, border: '3px solid #1f2937', borderRadius: 12, padding: 8, background: '#ffffff' }}>
      {positions.map(i => (
        <div key={i} style={{ width: 42, height: 42, border: '2px solid #9ca3af', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, boxSizing: 'border-box' }}>
          {filledPositions.has(i) && <div style={{ width: 24, height: 24, borderRadius: '999px', background: '#111827' }} />}
        </div>
      ))}
    </div>
  );
}

function DoubleTenFrame({ value, title, seedBase }) {
  const top = Math.min(value, 10);
  const bottom = Math.max(0, value - 10);
  return (
    <div style={{ background: 'rgba(255,255,255,0.9)', borderRadius: 28, padding: 20, boxShadow: '0 10px 30px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, minWidth: 280 }}>
      <div style={{ fontSize: 30, fontWeight: 900, color: '#166534', textAlign: 'center' }}>{title}</div>
      <Frame10 value={top} seed={seedBase + 11} />
      <Frame10 value={bottom} seed={seedBase + 29} />
    </div>
  );
}

// ── Drag-and-drop sentence (copied from TenFrameCompareStudentLesson pattern) ──
const LABEL_MAP = {
  greater: 'is greater than',
  less: 'is less than',
  equal: 'is equal to',
};

function BigChoiceButton({ label, symbol, disabled, selected, onClick }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        border: selected ? '5px solid #2563eb' : '4px solid #cbd5e1',
        background: selected ? '#dbeafe' : '#ffffff',
        color: '#1f2937', borderRadius: 28, padding: '20px 16px',
        minWidth: 180, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled && !selected ? 0.65 : 1,
        boxShadow: '0 8px 20px rgba(0,0,0,0.08)', fontWeight: 900,
      }}>
      <div style={{ fontSize: 54, lineHeight: 1, marginBottom: 10 }}>{symbol}</div>
      <div style={{ fontSize: 26 }}>{label}</div>
    </button>
  );
}

function newRound() {
  return {
    myNumber: Math.floor(Math.random() * 21),
    compNumber: Math.floor(Math.random() * 21),
    seed: Math.floor(Math.random() * 1000000),
  };
}

export default function TenFrameCompareSolo({ onBack }) {
  const [round, setRound] = useState(() => newRound());
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [roundNum, setRoundNum] = useState(1);
  const [score, setScore] = useState(0);

  const { myNumber, compNumber, seed } = round;

  const correct = myNumber > compNumber ? 'greater' : myNumber < compNumber ? 'less' : 'equal';

  const mySeedBase = useMemo(() => hashString(`my-${myNumber}-${seed}`), [myNumber, seed]);
  const compSeedBase = useMemo(() => hashString(`comp-${compNumber}-${seed}`), [compNumber, seed]);

  const answerLocked = revealed && selected !== null;

  const handleSelect = (val) => {
    if (answerLocked) return;
    setSelected(val);
    setRevealed(true);
    if (val === correct) setScore(s => s + 1);
  };

  const handleNext = () => {
    setRound(newRound());
    setSelected(null);
    setRevealed(false);
    setRoundNum(r => r + 1);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #dbeafe 0%, #e0f2fe 55%, #dcfce7 100%)', padding: 16, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontWeight: 800, fontSize: 18, cursor: 'pointer' }}>← Back</button>
        <span style={{ fontWeight: 900, color: '#166534', fontSize: 16 }}>⭐ {score} &nbsp; Round {roundNum}</span>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', fontSize: 40, fontWeight: 900, color: '#166534', marginBottom: 8 }}>
          Compare My Number
        </div>
        <div style={{ textAlign: 'center', fontSize: 22, color: '#374151', marginBottom: 18, fontWeight: 700 }}>
          Is my number greater than, less than, or equal to the computer's number?
        </div>

        {/* Ten frames SIDE BY SIDE */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
          <DoubleTenFrame value={myNumber} title="My Number" seedBase={mySeedBase} />
          <DoubleTenFrame value={compNumber} title="Computer's Number" seedBase={compSeedBase} />
        </div>

        {/* Choice buttons */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <BigChoiceButton label="Greater" symbol=">" selected={selected === 'greater'} disabled={answerLocked} onClick={() => handleSelect('greater')} />
          <BigChoiceButton label="Less" symbol="<" selected={selected === 'less'} disabled={answerLocked} onClick={() => handleSelect('less')} />
          <BigChoiceButton label="Equal" symbol="=" selected={selected === 'equal'} disabled={answerLocked} onClick={() => handleSelect('equal')} />
        </div>

        {/* Feedback */}
        {revealed && selected && (
          <div style={{ maxWidth: 760, margin: '0 auto', background: '#ffffff', borderRadius: 24, padding: 20, textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.10)' }}>
            <div style={{ fontSize: 34, fontWeight: 900, color: selected === correct ? '#16a34a' : '#dc2626', marginBottom: 10 }}>
              {selected === correct ? '🎉 Correct! +1 ⭐' : '❌ Not quite'}
            </div>
            {selected !== correct && (
              <div style={{ fontSize: 22, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
                {myNumber} {LABEL_MAP[correct]} {compNumber}
              </div>
            )}
            {selected === correct && (
              <div style={{ fontSize: 22, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
                {myNumber} {LABEL_MAP[correct]} {compNumber}
              </div>
            )}
            <button onClick={handleNext}
              style={{ background: '#16a34a', color: '#fff', border: 0, borderRadius: 16, padding: '14px 32px', fontWeight: 900, fontSize: 18, cursor: 'pointer', marginTop: 8 }}>
              🔄 Next Round
            </button>
          </div>
        )}
      </div>
    </div>
  );
}