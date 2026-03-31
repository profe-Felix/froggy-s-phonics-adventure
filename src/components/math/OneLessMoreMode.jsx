import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import OneLessMoreSpinner from './OneLessMoreSpinner';
import SimpleWritingCanvas from './SimpleWritingCanvas';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function SingleDigitEntry({ onSubmit }) {
  const [built, setBuilt] = useState('');
  const [done, setDone] = useState(false);
  const handleDigit = (d) => { if (!done && built.length < 2) setBuilt(b => b + String(d)); };
  const handleUndo = () => { if (!done) setBuilt(b => b.slice(0, -1)); };
  const handleSubmit = () => { if (!built || done) return; setDone(true); onSubmit(parseInt(built)); };
  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className={`w-16 h-16 rounded-2xl border-4 flex items-center justify-center text-3xl font-bold
        ${done ? 'border-green-400 bg-green-50 text-green-700' : built ? 'border-sky-400 bg-white text-sky-700' : 'border-dashed border-sky-300 bg-sky-50 text-sky-200'}`}>
        {built || '?'}
      </div>
      <div className="grid grid-cols-5 gap-1.5 w-full">
        {DIGITS.map(d => (
          <motion.button key={d} whileTap={{ scale: 0.85 }}
            onClick={() => handleDigit(d)}
            disabled={done || built.length >= 2}
            className="h-10 rounded-xl bg-white shadow text-lg font-bold text-indigo-700 border-2 border-indigo-200 disabled:opacity-40">
            {d}
          </motion.button>
        ))}
      </div>
      <div className="flex gap-2 w-full">
        <button onClick={handleUndo} disabled={done || !built}
          className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-600 font-bold disabled:opacity-30">⌫</button>
        <button onClick={handleSubmit} disabled={done || !built}
          className="flex-1 py-2 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-30">✓</button>
      </div>
    </div>
  );
}

// The 3D cube visual
function CubeVisual({ color = 'blue', size = 26, fluid = false }) {
  const c = color === 'green'
    ? { top: '#4ade80', dk: '#166534', front: '#16a34a' }
    : { top: '#60a5fa', dk: '#1e3a8a', front: '#2d4fa1' };
  if (fluid) {
    return (
      <div style={{ width: '100%', paddingBottom: '100%', position: 'relative', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', top: 0, left: '12%', right: 0, height: '19%', background: c.top, clipPath: 'polygon(0 100%, 12% 0, 100% 0, 88% 100%)', borderTop: `1px solid ${c.dk}` }} />
          <div style={{ position: 'absolute', top: '19%', left: 0, right: '12%', bottom: 0, background: c.front, border: `1px solid ${c.dk}`, borderRadius: 1 }} />
          <div style={{ position: 'absolute', top: '19%', right: 0, width: '12%', bottom: 0, background: c.dk }} />
        </div>
      </div>
    );
  }
  const topH = Math.round(size * 0.19);
  const side = Math.round(size * 0.12);
  const off  = Math.round(size * 0.12);
  return (
    <div style={{ width: size, height: size, position: 'relative', flexShrink: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: 0, left: off, right: 0, height: topH, background: c.top, clipPath: `polygon(0 100%, ${off}px 0, 100% 0, calc(100% - ${off}px) 100%)`, borderTop: `1px solid ${c.dk}` }} />
      <div style={{ position: 'absolute', top: topH, left: 0, right: side, bottom: 0, background: c.front, border: `1px solid ${c.dk}`, borderRadius: 1 }} />
      <div style={{ position: 'absolute', top: topH, right: 0, width: side, bottom: 0, background: c.dk, borderRadius: '0 1px 1px 0' }} />
    </div>
  );
}

// A bank cube that clones on drag using raw pointer events
function BankCube({ trayRef, onDrop, count = 1 }) {
  const cubeRef = useRef(null);

  const handlePointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const clone = document.createElement('div');
    clone.style.cssText = `position:fixed;width:26px;height:26px;pointer-events:none;z-index:9999;touch-action:none;`;
    clone.innerHTML = `
      <div style="position:absolute;top:0;left:3px;right:0;height:5px;background:#60a5fa;clip-path:polygon(0 100%, 3px 0, 100% 0, calc(100% - 3px) 100%);border-top:1px solid #1e3a8a"></div>
      <div style="position:absolute;top:5px;left:0;right:3px;bottom:0;background:#2d4fa1;border:1px solid #1e3a8a;border-radius:1px"></div>
      <div style="position:absolute;top:5px;right:0;width:3px;bottom:0;background:#1e3a8a;border-radius:0 1px 1px 0"></div>
    `;
    document.body.appendChild(clone);

    const move = (ex, ey) => { clone.style.left = (ex - 13) + 'px'; clone.style.top = (ey - 13) + 'px'; };
    move(e.clientX, e.clientY);

    const onMove = (ev) => { const cx = ev.touches ? ev.touches[0].clientX : ev.clientX; const cy = ev.touches ? ev.touches[0].clientY : ev.clientY; move(cx, cy); };
    const onUp = (ev) => {
      const cx = ev.changedTouches ? ev.changedTouches[0].clientX : ev.clientX;
      const cy = ev.changedTouches ? ev.changedTouches[0].clientY : ev.clientY;
      clone.remove();
      if (trayRef.current) {
        const rect = trayRef.current.getBoundingClientRect();
        if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) onDrop();
      }
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp);
  };

  return (
    <button
      ref={cubeRef}
      onPointerDown={handlePointerDown}
      style={{ touchAction: 'none', userSelect: 'none', cursor: 'grab' }}
      className="flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100"
    >
      <CubeVisual color="blue" size={18} />
      <span className="text-xs font-bold text-blue-700 leading-none">+{count}</span>
    </button>
  );
}

export default function OneLessMoreMode({ studentNumber, className: classProp, onBack }) {
  const [roundKey, setRoundKey] = useState(0);
  const [startNumber, setStartNumber] = useState(() => Math.floor(Math.random() * 17) + 2);
  const [spinDone, setSpinDone] = useState(false);
  const [spinResult, setSpinResult] = useState(null);
  const [targetNumber, setTargetNumber] = useState(null);
  const [builtCount, setBuiltCount] = useState(0);
  const [startWritePhase, setStartWritePhase] = useState('write');
  const [startWritten, setStartWritten] = useState(null);
  const [startStrokes, setStartStrokes] = useState(null);
  const [resultWritePhase, setResultWritePhase] = useState('write');
  const [resultWritten, setResultWritten] = useState(null);
  const [resultStrokes, setResultStrokes] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const trayRef = useRef(null);

  const resetRound = () => {
    setStartNumber(Math.floor(Math.random() * 17) + 2);
    setSpinDone(false); setSpinResult(null); setTargetNumber(null);
    setBuiltCount(0);
    setStartWritePhase('write'); setStartWritten(null); setStartStrokes(null);
    setResultWritePhase('write'); setResultWritten(null); setResultStrokes(null);
    setSaving(false); setSaved(false);
    setRoundKey(k => k + 1);
  };

  const handleSpinResult = (result) => {
    setSpinResult(result);
    setSpinDone(true);
    setTargetNumber(result === 'more' ? startNumber + 1 : startNumber - 1);
  };

  const handleDrop = () => {
    setBuiltCount(c => Math.min(c + 1, 20));
  };

  const removeCube = (idx) => {
    // Remove the last cube (or by index — simplest: remove last)
    setBuiltCount(c => Math.max(0, c - 1));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.OneLessMoreAttempt.create({
        student_number: studentNumber, class_name: classProp,
        starting_number: startNumber, spinner_result: spinResult, target_number: targetNumber,
        student_wrote_start: startWritten, student_wrote_result: resultWritten,
        is_correct_start: startWritten === startNumber, is_correct_result: resultWritten === targetNumber,
        start_strokes_data: startStrokes ? JSON.stringify(startStrokes) : null,
        result_strokes_data: resultStrokes ? JSON.stringify(resultStrokes) : null,
      });
    } catch (e) { console.error(e); }
    setSaving(false); setSaved(true);
  };

  const showResult = resultWritePhase === 'done' && resultWritten !== null;
  const CS = 26;

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-400 to-indigo-500 flex flex-col items-center py-6 px-3"
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
      <div className="w-full max-w-5xl">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="text-white/80 hover:text-white font-medium">← Back</button>
          <h1 className="text-xl font-bold text-white">🧊 1 More / 1 Less</h1>
          <span className="text-white/70 text-sm">#{studentNumber}</span>
        </div>

        <div className="grid grid-cols-3 gap-4 items-start">

          {/* LEFT — Starting number */}
          <div className="bg-white rounded-3xl p-4 shadow-xl flex flex-col items-center gap-3">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">Starting</p>
            <div className="bg-sky-50 rounded-xl p-3 border border-sky-200 w-full overflow-hidden">
              {(() => {
                const count = startNumber;
                const SLOT_H = 24;
                const FilledSlot = (i) => (
                  <div key={i} style={{ flex: 1, height: '100%', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 0, left: 3, right: 0, height: 5, background: '#4a6fc7', clipPath: 'polygon(0 100%, 3px 0, 100% 0, calc(100% - 3px) 100%)', borderTop: '1px solid #1e3a8a' }} />
                    <div style={{ position: 'absolute', top: 5, left: 0, right: 3, bottom: 0, background: '#2d4fa1', border: '1px solid #1e3a8a', borderRadius: 1 }} />
                    <div style={{ position: 'absolute', top: 5, right: 0, width: 3, bottom: 0, background: '#1e3a8a' }} />
                  </div>
                );
                const GhostSlot = (i) => <div key={`g${i}`} style={{ flex: 1, height: '100%' }} className="rounded border border-dashed border-blue-300 bg-blue-100/40" />;
                const r1 = Math.min(count, 10), r2 = Math.max(0, count - 10);
                return (
                  <div className="flex flex-col w-full" style={{ gap: 8 }}>
                    <div className="flex gap-0.5 w-full" style={{ height: SLOT_H }}>{Array.from({ length: 10 }).map((_, i) => i < r1 ? FilledSlot(i) : GhostSlot(i))}</div>
                    <div className="flex gap-0.5 w-full" style={{ height: SLOT_H }}>{Array.from({ length: 10 }).map((_, i) => i < r2 ? FilledSlot(i + 10) : GhostSlot(i + 10))}</div>
                  </div>
                );
              })()}
            </div>
            <div className="w-full flex flex-col items-center gap-2">
              <p className="text-xs text-gray-400">Write the number you see:</p>
              <SimpleWritingCanvas key={`start-${roundKey}`} onDone={(strokes) => { setStartStrokes(strokes); setStartWritePhase('enter'); }} />
            </div>
            {startWritePhase === 'enter' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full">
                <p className="text-xs text-gray-400 text-center mb-2">Now type it:</p>
                <SingleDigitEntry onSubmit={(n) => { setStartWritten(n); setStartWritePhase('done'); }} />
              </motion.div>
            )}
            {startWritePhase === 'done' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className={`text-3xl font-bold px-4 py-2 rounded-xl ${startWritten === startNumber ? 'text-green-600 bg-green-50' : 'text-red-500 bg-red-50'}`}>
                {startWritten} {startWritten === startNumber ? '✓' : '✗'}
                {startWritten !== startNumber && <span className="text-base ml-1 text-gray-400">(was {startNumber})</span>}
              </motion.div>
            )}
          </div>

          {/* CENTER — Spinner */}
          <div className="bg-white rounded-3xl p-4 shadow-xl flex flex-col items-center gap-3">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">Spin!</p>
            <OneLessMoreSpinner key={`spinner-${roundKey}`} onResult={handleSpinResult} />
          </div>

          {/* RIGHT — Build area */}
          <div className={`bg-white rounded-3xl p-4 shadow-xl flex flex-col gap-3 transition-opacity ${spinDone ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wide text-center">Build It!</p>
            {spinDone && (
              <div className={`text-center text-base font-bold px-3 py-1.5 rounded-xl ${spinResult === 'more' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                1 {spinResult === 'more' ? 'More ➕' : 'Less ➖'}
              </div>
            )}

            {/* Tray + vertical bank side by side */}
            <div className="flex gap-2 items-start">
              {/* Left: vertical bank */}
              <div className="flex flex-col gap-1.5 flex-shrink-0 items-center">
                <p className="text-xs text-gray-400 font-semibold">Add</p>
                {[1, 5, 10].map(n => (
                  <BankCube key={n} count={n} trayRef={trayRef} onDrop={() => setBuiltCount(c => Math.min(c + n, 20))} />
                ))}
              </div>
              {/* Right: drop tray */}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 font-semibold mb-1">Your build ({builtCount})</p>
                <div ref={trayRef} className="flex flex-col gap-1 p-1.5 rounded-xl border-2 border-dashed border-green-300 bg-green-50" style={{ overflowX: 'auto' }}>
                  {[0, 1].map(row => (
                    <div key={row} style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 26px)', gap: 2, height: 26 }}>
                      {Array.from({ length: 10 }).map((_, col) => {
                        const idx = row * 10 + col;
                        const filled = idx < builtCount;
                        return filled ? (
                          <button key={col} onClick={() => removeCube(idx)}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', width: 26, height: 26 }}>
                            <CubeVisual color="green" size={26} />
                          </button>
                        ) : (
                          <div key={col} style={{ width: 26, height: 26 }}
                            className="rounded border border-dashed border-green-200 bg-green-100/30" />
                        );
                      })}
                    </div>
                  ))}
                  <p className="text-xs text-gray-300 mt-0.5 text-center">Tap to remove</p>
                </div>
              </div>
            </div>

            {/* Writing canvas — scaled down */}
            <div className="flex flex-col items-center gap-1">
              <p className="text-xs text-gray-400">Write how many you built:</p>
              <div style={{ transform: 'scale(0.75)', transformOrigin: 'top center', width: '133%', marginLeft: '-16.5%', marginBottom: '-44px' }}>
                <SimpleWritingCanvas key={`result-${roundKey}`} onDone={(strokes) => { setResultStrokes(strokes); setResultWritePhase('enter'); }} />
              </div>
            </div>

            {resultWritePhase === 'enter' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <p className="text-xs text-gray-400 text-center mb-2">Now type it:</p>
                <SingleDigitEntry onSubmit={(n) => { setResultWritten(n); setResultWritePhase('done'); }} />
              </motion.div>
            )}
            {showResult && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className={`text-3xl font-bold text-center px-4 py-2 rounded-xl ${resultWritten === targetNumber ? 'text-green-600 bg-green-50' : 'text-red-500 bg-red-50'}`}>
                {resultWritten} {resultWritten === targetNumber ? '✓' : '✗'}
                {resultWritten !== targetNumber && <span className="text-base ml-1 text-gray-400">(answer: {targetNumber})</span>}
              </motion.div>
            )}
          </div>
        </div>

        {showResult && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center gap-4 mt-6">
            {!saved ? (
              <button onClick={handleSave} disabled={saving}
                className="px-8 py-4 bg-white text-indigo-700 font-bold text-lg rounded-2xl hover:bg-indigo-50 shadow-lg disabled:opacity-50">
                {saving ? 'Saving…' : '💾 Save & Next'}
              </button>
            ) : (
              <button onClick={resetRound}
                className="px-8 py-4 bg-indigo-600 text-white font-bold text-xl rounded-2xl hover:bg-indigo-700 active:scale-95 shadow-lg">
                Next Round 🎲
              </button>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}