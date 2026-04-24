import React, { useState, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import SimpleWritingCanvas from './SimpleWritingCanvas';

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

const LABEL_MAP = { greater: 'is greater than', less: 'is less than', equal: 'is equal to' };
const AUDIO_MAP = { greater: 'is_greater_than', less: 'is_less_than', equal: 'is_equal_to' };
const DIGITS_ROW = [1,2,3,4,5,6,7,8,9,null,0,'del'];

function playSeq(srcs) {
  Promise.all(srcs.map(src => fetch(src).then(r => r.blob()).then(b => URL.createObjectURL(b))))
    .then(urls => {
      let i = 0;
      const next = () => { if (i >= urls.length) return; const url = urls[i++]; const a = new Audio(url); a.onended = () => { URL.revokeObjectURL(url); next(); }; a.play().catch(next); };
      next();
    }).catch(() => {});
}

function NumberEntry({ onConfirm }) {
  const [step, setStep] = useState('write');
  const [drawnUrl, setDrawnUrl] = useState(null);
  const [typed, setTyped] = useState('');
  const handleCanvasDone = (_, url) => { setDrawnUrl(url); setStep('type'); setTyped(''); };
  const handleDigit = (d) => { if (typed.length < 2) setTyped(t => t + String(d)); };
  const handleUndo = () => setTyped(t => t.slice(0, -1));
  return (
    <div style={{ background: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: 16, boxShadow: '0 8px 20px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, minWidth: 220 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase' }}>
        {step === 'write' ? 'Write My Number' : 'Type the number you wrote'}
      </div>
      {step === 'write' && <SimpleWritingCanvas onDone={handleCanvasDone} />}
      {step === 'type' && (
        <>
          {drawnUrl && <img src={drawnUrl} alt="written" style={{ width: 120, height: 80, objectFit: 'contain', borderRadius: 10, border: '2px solid #c7d2fe', background: '#f8fbff' }} />}
          <div style={{ width: 64, height: 64, borderRadius: 16, border: typed ? '3px solid #6366f1' : '3px dashed #a5b4fc', background: typed ? '#eef2ff' : '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900, color: '#4f46e5' }}>{typed || '?'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, width: '100%' }}>
            {DIGITS_ROW.map((d, i) => (
              <button key={i} onClick={() => { if (d === 'del') handleUndo(); else if (d !== null) handleDigit(d); }}
                disabled={d === null || (d !== 'del' && typed.length >= 2)}
                style={{ height: 38, borderRadius: 8, border: d === null ? 'none' : '1px solid #e2e8f0', background: d === 'del' ? '#fee2e2' : d === null ? 'transparent' : '#f1f5f9', color: d === 'del' ? '#dc2626' : '#334155', fontWeight: 700, fontSize: 14, cursor: d === null ? 'default' : 'pointer', opacity: d !== null && d !== 'del' && typed.length >= 2 ? 0.4 : 1 }}>
                {d === 'del' ? '⌫' : d === null ? '' : d}
              </button>
            ))}
          </div>
          <button onClick={() => { if (typed) onConfirm(parseInt(typed)); }} disabled={!typed}
            style={{ width: '100%', padding: '10px 0', background: typed ? '#4f46e5' : '#a5b4fc', color: 'white', border: 0, borderRadius: 12, fontWeight: 900, fontSize: 16, cursor: typed ? 'pointer' : 'default' }}>
            ✓ That's My Number
          </button>
        </>
      )}
    </div>
  );
}

function DropZoneSolo({ filled, selected, onPlace, dropRef, isCorrect, submitted }) {
  let border = '3px dashed #cbd5e1', bg = '#f8fafc', color = '#94a3b8';
  if (filled && submitted) { border = `3px solid ${isCorrect ? '#22c55e' : '#ef4444'}`; bg = isCorrect ? '#dcfce7' : '#fee2e2'; color = isCorrect ? '#15803d' : '#b91c1c'; }
  else if (filled) { border = '3px solid #6366f1'; bg = '#eef2ff'; color = '#4338ca'; }
  else if (selected) { border = '3px solid #818cf8'; bg = '#eef2ff'; color = '#6366f1'; }
  return (
    <div ref={dropRef} onClick={() => { if (!filled && selected) onPlace(selected); }}
      style={{ minWidth: 130, height: 40, borderRadius: 12, border, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, cursor: (!filled && selected) ? 'pointer' : 'default', transition: 'all 0.15s', padding: '0 8px', textAlign: 'center' }}>
      {filled || (selected ? 'tap to place' : '—')}
    </div>
  );
}

function DragWordSolo({ label, value, dropped, selected, onSelect, onDrop, dropRef }) {
  const handlePointerDown = (e) => {
    if (dropped) return;
    e.preventDefault();
    onSelect(value);
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    const clone = document.createElement('div');
    clone.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;padding:8px 14px;background:#4f46e5;color:white;font-weight:900;border-radius:12px;font-size:13px;white-space:nowrap;';
    clone.textContent = label; document.body.appendChild(clone);
    const move = (cx, cy) => { clone.style.left = (cx - clone.offsetWidth / 2) + 'px'; clone.style.top = (cy - 18) + 'px'; };
    move(e.clientX, e.clientY);
    const onMove = (ev) => {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX; const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      if (Math.abs(cx - startX) > 6 || Math.abs(cy - startY) > 6) moved = true; move(cx, cy);
    };
    const onUp = (ev) => {
      const cx = ev.changedTouches ? ev.changedTouches[0].clientX : ev.clientX; const cy = ev.changedTouches ? ev.changedTouches[0].clientY : ev.clientY;
      clone.remove();
      if (!moved) { new Audio(`/audio/${AUDIO_MAP[value]}.mp3`).play().catch(() => {}); }
      else if (dropRef?.current) { const rect = dropRef.current.getBoundingClientRect(); if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) onDrop(value); }
      document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove, { passive: true }); document.addEventListener('pointerup', onUp);
  };
  let st = { background: dropped ? '#e2e8f0' : selected ? '#eef2ff' : '#ffffff', color: dropped ? '#9ca3af' : selected ? '#4338ca' : '#374151', border: `2px solid ${dropped ? '#e2e8f0' : selected ? '#6366f1' : '#e2e8f0'}`, opacity: dropped ? 0.5 : 1, cursor: dropped ? 'not-allowed' : 'grab' };
  return (
    <div onPointerDown={handlePointerDown} style={{ ...st, padding: '8px 14px', borderRadius: 12, fontWeight: 700, fontSize: 14, userSelect: 'none', touchAction: 'none', transition: 'all 0.1s' }}>{label}</div>
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
  const [enteredNumber, setEnteredNumber] = useState(null);
  const [sentencePhase, setSentencePhase] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [wasCorrect, setWasCorrect] = useState(null);
  const [roundNum, setRoundNum] = useState(1);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [placed, setPlaced] = useState(null);
  const [selectedWord, setSelectedWord] = useState(null);
  const dropRef = useRef(null);

  const { myNumber, compNumber, seed } = round;
  const correct = myNumber > compNumber ? 'greater' : myNumber < compNumber ? 'less' : 'equal';
  const mySeedBase = useMemo(() => hashString(`my-${myNumber}-${seed}`), [myNumber, seed]);
  const compSeedBase = useMemo(() => hashString(`comp-${compNumber}-${seed}`), [compNumber, seed]);

  const handlePlace = (val) => {
    if (placed) return;
    setPlaced(LABEL_MAP[val]);
    const isCorrect = val === correct;
    setWasCorrect(isCorrect);
    setRevealed(true);
    playSeq([`/numbers-audio/${myNumber}.mp3`, `/audio/${AUDIO_MAP[correct]}.mp3`, `/numbers-audio/${compNumber}.mp3`]);
    if (isCorrect) { setScore(s => s + 1); setStreak(s => s + 1); } else { setStreak(0); }
  };

  const handleNext = () => {
    setRound(newRound());
    setEnteredNumber(null);
    setSentencePhase(false);
    setRevealed(false);
    setWasCorrect(null);
    setPlaced(null);
    setSelectedWord(null);
    setRoundNum(r => r + 1);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #dbeafe 0%, #e0f2fe 55%, #dcfce7 100%)', padding: 16, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontWeight: 800, fontSize: 18, cursor: 'pointer' }}>← Back</button>
        <span style={{ fontWeight: 900, color: '#166534', fontSize: 16 }}>
          {streak >= 3 ? '🏆' : streak >= 2 ? `🔥${streak}` : ''} ⭐ {score} &nbsp; Round {roundNum}
        </span>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', fontSize: 36, fontWeight: 900, color: '#166534', marginBottom: 16 }}>Compare My Number</div>

        {/* Ten frames SIDE BY SIDE */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
          <DoubleTenFrame value={myNumber} title="My Number" seedBase={mySeedBase} />
          <DoubleTenFrame value={compNumber} title="Computer's Number" seedBase={compSeedBase} />
        </div>

        {/* Step 1: Write + type my number */}
        {enteredNumber === null && !sentencePhase && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <NumberEntry onConfirm={(n) => { setEnteredNumber(n); setSentencePhase(true); }} />
          </motion.div>
        )}

        {/* Step 2: Complete the sentence */}
        {sentencePhase && !revealed && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: '#ffffff', borderRadius: 20, padding: 16, boxShadow: '0 8px 20px rgba(0,0,0,0.08)', maxWidth: 700, margin: '0 auto 20px' }}>
            <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Complete the Sentence</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ background: '#fef3c7', padding: '6px 14px', borderRadius: 10, fontWeight: 900, fontSize: 22 }}>{myNumber}</span>
              <DropZoneSolo filled={placed} selected={selectedWord ? LABEL_MAP[selectedWord] : null}
                onPlace={() => handlePlace(selectedWord)} dropRef={dropRef}
                isCorrect={wasCorrect} submitted={revealed} />
              <span style={{ background: '#fef3c7', padding: '6px 14px', borderRadius: 10, fontWeight: 900, fontSize: 22 }}>{compNumber}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 8 }}>
              {['greater', 'less', 'equal'].map(v => (
                <DragWordSolo key={v} label={LABEL_MAP[v]} value={v} dropped={false} selected={selectedWord === v}
                  onSelect={setSelectedWord} onDrop={(val) => { handlePlace(val); setSelectedWord(null); }} dropRef={dropRef} />
              ))}
            </div>
            <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>🔊 tap to hear • drag or tap to place</div>
          </motion.div>
        )}

        {/* Result */}
        {revealed && (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            style={{ maxWidth: 700, margin: '0 auto', background: wasCorrect ? '#f0fdf4' : '#fef2f2', borderRadius: 20, padding: 20, textAlign: 'center', boxShadow: '0 8px 20px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: wasCorrect ? '#16a34a' : '#dc2626', marginBottom: 10 }}>
              {wasCorrect ? '🎉 Correct! +1 ⭐' : '❌ Not quite'}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#374151', marginBottom: 16 }}>
              {myNumber} {LABEL_MAP[correct]} {compNumber}
            </div>
            <button onClick={handleNext}
              style={{ background: '#16a34a', color: '#fff', border: 0, borderRadius: 16, padding: '14px 32px', fontWeight: 900, fontSize: 18, cursor: 'pointer' }}>
              🔄 Next Round
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}