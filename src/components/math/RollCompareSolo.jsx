import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BuildCheckOverlay from './BuildCheckOverlay';
import SimpleWritingCanvas from './SimpleWritingCanvas';

function Cookie({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="18" fill="#c8854a" stroke="#8B5E3C" strokeWidth="1.5"/>
      <ellipse cx="13" cy="14" rx="3.5" ry="2.5" fill="#3b1f09" transform="rotate(-10 13 14)"/>
      <ellipse cx="26" cy="12" rx="3" ry="2" fill="#3b1f09" transform="rotate(5 26 12)"/>
      <ellipse cx="10" cy="26" rx="2.5" ry="2" fill="#3b1f09" transform="rotate(-15 10 26)"/>
      <ellipse cx="24" cy="28" rx="3.5" ry="2.5" fill="#3b1f09" transform="rotate(8 24 28)"/>
      <ellipse cx="19" cy="21" rx="3" ry="2" fill="#3b1f09" transform="rotate(-5 19 21)"/>
    </svg>
  );
}

function DoubleTenFrame({ count, onChange }) {
  const trayRef = useRef(null);

  const handlePointerDown = (e) => {
    if (!onChange) return;
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    const clone = document.createElement('div');
    clone.style.cssText = 'position:fixed;width:32px;height:32px;pointer-events:none;z-index:9999;';
    clone.innerHTML = `<svg width="28" height="28" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#c8854a" stroke="#8B5E3C" stroke-width="1.5"/><ellipse cx="19" cy="21" rx="3" ry="2" fill="#3b1f09"/></svg>`;
    document.body.appendChild(clone);
    const move = (ex, ey) => { clone.style.left = (ex - 16) + 'px'; clone.style.top = (ey - 16) + 'px'; };
    move(e.clientX, e.clientY);
    const onMove = (ev) => {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      if (Math.abs(cx - startX) > 8 || Math.abs(cy - startY) > 8) moved = true;
      move(cx, cy);
    };
    const onUp = (ev) => {
      const cx = ev.changedTouches ? ev.changedTouches[0].clientX : ev.clientX;
      const cy = ev.changedTouches ? ev.changedTouches[0].clientY : ev.clientY;
      clone.remove();
      if (!moved) {
        onChange(Math.min(count + 1, 20));
      } else if (trayRef.current) {
        const rect = trayRef.current.getBoundingClientRect();
        if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) onChange(Math.min(count + 1, 20));
      }
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp);
  };

  return (
    <div className="flex flex-col gap-2">
      {onChange && (
        <div className="flex gap-2 items-center flex-wrap">
          {[1, 5, 10].map(n => (
            <button key={n}
              onPointerDown={n === 1 ? handlePointerDown : undefined}
              onClick={n !== 1 ? () => onChange(Math.min(count + n, 20)) : undefined}
              style={n === 1 ? { touchAction: 'none', userSelect: 'none', cursor: 'grab' } : {}}
              className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100">
              <Cookie size={18} />
              <span className="text-xs font-bold text-amber-700 leading-none">+{n}</span>
            </button>
          ))}
          {count > 0 && (
            <button onClick={() => onChange(0)} className="px-2 py-1 text-xs text-red-400 hover:text-red-600 font-bold">✕ clear</button>
          )}
        </div>
      )}
      <div ref={trayRef} className="flex flex-col gap-2 p-2 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50">
        {[0, 1].map(frame => (
          <div key={frame} className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(5, 30px)' }}>
            {Array.from({ length: 10 }).map((_, cell) => {
              const idx = frame * 10 + cell;
              const filled = idx < count;
              return filled ? (
                <button key={cell} onClick={() => onChange && onChange(count - 1)}
                  disabled={!onChange}
                  style={{ width: 30, height: 30, padding: 0, cursor: onChange ? 'pointer' : 'default', background: 'none', border: 'none' }}>
                  <Cookie size={28} />
                </button>
              ) : (
                <div key={cell} style={{ width: 30, height: 30 }}
                  className="rounded border border-dashed border-amber-200 bg-amber-100/30" />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function SlotRoller({ onResult, label }) {
  const [spinning, setSpinning] = useState(false);
  const [display, setDisplay] = useState('?');
  const [done, setDone] = useState(false);
  const intervalRef = useRef(null);

  const spin = () => {
    if (spinning || done) return;
    setSpinning(true);
    let count = 0;
    const total = 20 + Math.floor(Math.random() * 10);
    intervalRef.current = setInterval(() => {
      setDisplay(Math.floor(Math.random() * 12) + 9);
      count++;
      if (count >= total) {
        clearInterval(intervalRef.current);
        const result = Math.floor(Math.random() * 12) + 9;
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
        className={`w-24 h-24 rounded-2xl shadow-2xl border-4 flex items-center justify-center text-4xl font-black select-none transition-colors
          ${done ? 'border-green-400 bg-green-50 text-green-700' : spinning ? 'border-amber-300 bg-amber-50 text-amber-600' : 'border-amber-400 bg-white text-amber-700'}`}
      >
        {display}
      </motion.div>
      {!done && (
        <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.05 }}
          onClick={spin} disabled={spinning}
          className="bg-amber-500 text-white font-black text-base px-5 py-2 rounded-2xl shadow-lg disabled:opacity-50">
          {spinning ? '🎰 Rolling…' : '🎰 Spin!'}
        </motion.button>
      )}
    </div>
  );
}

function DropZone({ filled, selected, onPlace, dropRef }) {
  return (
    <div
      ref={dropRef}
      onClick={() => { if (!filled && selected) onPlace(selected); }}
      className={`min-w-[130px] h-10 rounded-xl border-4 border-dashed flex items-center justify-center font-black text-sm transition-all
        ${filled ? 'border-indigo-500 bg-indigo-100 text-indigo-700'
          : selected ? 'border-indigo-400 bg-indigo-50 text-indigo-500 cursor-pointer'
          : 'border-gray-300 bg-gray-50 text-gray-400'}`}>
      {filled || (selected ? 'tap' : '—')}
    </div>
  );
}

function DragWord({ label, value, dropped, selected, onSelect, onDrop, dropRef }) {
  const handlePointerDown = (e) => {
    if (dropped) return;
    e.preventDefault();
    onSelect(value);

    const startX = e.clientX, startY = e.clientY;
    let moved = false;

    const clone = document.createElement('div');
    clone.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;padding:8px 14px;background:#4f46e5;color:white;font-weight:900;border-radius:12px;font-size:13px;white-space:nowrap;';
    clone.textContent = label;
    document.body.appendChild(clone);
    const move = (cx, cy) => { clone.style.left = (cx - clone.offsetWidth / 2) + 'px'; clone.style.top = (cy - 18) + 'px'; };
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
      if (!moved) {
        new Audio(`/audio/${value}.mp3`).play().catch(() => {});
      } else if (dropRef?.current) {
        const rect = dropRef.current.getBoundingClientRect();
        if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
          onDrop(value);
        }
      }
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp);
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      style={{ touchAction: 'none', userSelect: 'none' }}
      className={`px-3 py-2 rounded-lg font-semibold text-sm select-none transition-all cursor-grab
        ${dropped ? 'opacity-30 cursor-not-allowed text-gray-400'
          : selected ? 'bg-indigo-50 text-indigo-700 border-2 border-indigo-400 font-black'
          : 'text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 border-2 border-transparent'}`}
    >
      {label}
    </div>
  );
}

const LABEL_MAP = {
  is_greater_than: 'is greater than',
  is_less_than: 'is less than',
  is_equal_to: 'is equal to',
};

function playSequence(srcs) {
  Promise.all(srcs.map(src => fetch(src).then(r => r.blob()).then(b => URL.createObjectURL(b))))
    .then(urls => {
      let i = 0;
      const next = () => {
        if (i >= urls.length) return;
        const url = urls[i++];
        const a = new Audio(url);
        a.onended = () => { URL.revokeObjectURL(url); next(); };
        a.play().catch(next);
      };
      next();
    });
}

const DIGITS = [0,1,2,3,4,5,6,7,8,9];

// --- Build section (stays visible after done) ---
function BuildSection({ label, targetNumber, locked, onDone }) {
  const [count, setCount] = useState(0);
  const [wrong, setWrong] = useState(false);
  const [verified, setVerified] = useState(false);
  const [step, setStep] = useState('build'); // build | write | type | done
  const [drawnUrl, setDrawnUrl] = useState(null);
  const [typedDigits, setTypedDigits] = useState('');

  const handleBuildSubmit = () => {
    if (count !== targetNumber) { setWrong(true); }
    else { setVerified(true); setStep('write'); }
  };

  const handleCanvasDone = (strokes, dataUrl) => {
    setDrawnUrl(dataUrl);
    setStep('type');
    setTypedDigits('');
  };

  const handleDigit = (d) => { if (typedDigits.length < 2) setTypedDigits(t => t + String(d)); };
  const handleUndo = () => setTypedDigits(t => t.slice(0, -1));
  const handleTypeSubmit = () => {
    if (parseInt(typedDigits) === targetNumber) { setStep('done'); onDone(); }
    else { setStep('write'); setDrawnUrl(null); setTypedDigits(''); }
  };

  return (
    <div className={`bg-white rounded-3xl p-5 shadow-xl mb-4 transition-opacity ${locked ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-gray-400 uppercase">{label}</p>
        <span className="text-2xl font-black text-indigo-700 bg-indigo-50 px-3 py-1 rounded-xl">{targetNumber}</span>
      </div>

      {wrong ? (
        <BuildCheckOverlay studentCount={count} targetCount={targetNumber} onTryAgain={() => { setCount(0); setWrong(false); }} />
      ) : (
        <>
          {/* Top row: ten frame + canvas area */}
          <div className="flex gap-3 items-start">
            <div className="flex-shrink-0">
              <DoubleTenFrame count={count} onChange={step === 'build' ? setCount : undefined} />
            </div>
            <div className="flex-1 flex flex-col gap-2">
              {step === 'write' && (
                <>
                  <p className="text-xs font-bold text-gray-400 uppercase text-center">Write the number {targetNumber}</p>
                  <SimpleWritingCanvas onDone={handleCanvasDone} />
                </>
              )}
              {(step === 'type' || step === 'done') && drawnUrl && (
                <>
                  <p className="text-xs font-bold text-gray-400 uppercase text-center">You wrote:</p>
                  <img src={drawnUrl} alt="written number"
                    className="rounded-xl border-2 border-indigo-200 w-full"
                    style={{ height: 100, objectFit: 'contain', background: '#f8fbff' }} />
                </>
              )}
              {step === 'done' && (
                <div className="flex flex-col items-center gap-1 text-green-600 font-bold text-sm mt-1">
                  <span className="text-2xl">✅</span>
                  <span>{targetNumber} — done!</span>
                </div>
              )}
            </div>
          </div>

          {/* Full-width digit pad below */}
          {step === 'type' && (
            <div className="mt-4 flex flex-col gap-2">
              <p className="text-xs font-bold text-gray-400 uppercase text-center">Type the number you built</p>
              <div className={`w-16 h-16 rounded-2xl border-4 flex items-center justify-center text-3xl font-bold mx-auto
                ${typedDigits ? 'border-sky-400 bg-white text-sky-700' : 'border-dashed border-sky-300 bg-sky-50 text-sky-200'}`}>
                {typedDigits || '?'}
              </div>
              <div className="grid grid-cols-5 gap-2">
                {DIGITS.map(d => (
                  <motion.button key={d} whileTap={{ scale: 0.85 }}
                    onClick={() => handleDigit(d)}
                    disabled={typedDigits.length >= 2}
                    className="h-11 rounded-xl bg-white shadow text-lg font-bold text-indigo-700 border-2 border-indigo-200 disabled:opacity-40">
                    {d}
                  </motion.button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={handleUndo} disabled={!typedDigits}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold disabled:opacity-30 text-lg">⌫</button>
                <button onClick={handleTypeSubmit} disabled={!typedDigits}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-30 text-lg">✓</button>
              </div>
            </div>
          )}

          {step === 'build' && (
            <div className="flex justify-end mt-3">
              <motion.button whileTap={{ scale: 0.95 }}
                onClick={handleBuildSubmit}
                disabled={count === 0 || locked}
                className="bg-indigo-600 text-white font-black text-base px-5 py-2.5 rounded-2xl shadow-lg disabled:opacity-40">
                ✓ Done building
              </motion.button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function RollCompareSolo({ studentNumber, onBack }) {
  const [myRoll, setMyRoll] = useState(null);
  const [computerRoll, setComputerRoll] = useState(null);
  const [myBuildDone, setMyBuildDone] = useState(false);
  const [computerBuildDone, setComputerBuildDone] = useState(false);
  const [placed, setPlaced] = useState(null);
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [roundNum, setRoundNum] = useState(1);
  const dropRef = useRef(null);

  const bothRolled = myRoll !== null && computerRoll !== null;
  const bothBuilt = myBuildDone && computerBuildDone;

  const correctValue = myRoll && computerRoll
    ? (myRoll > computerRoll ? 'is_greater_than' : myRoll < computerRoll ? 'is_less_than' : 'is_equal_to')
    : null;

  const handlePlace = (value) => {
    if (placed) return;
    setPlaced(LABEL_MAP[value]);
    setResult(value === correctValue ? 'correct' : 'wrong');
    playSequence([
      `/numbers-audio/${myRoll}.mp3`,
      `/audio/${correctValue}.mp3`,
      `/numbers-audio/${computerRoll}.mp3`,
    ]);
  };

  const handleNextRound = () => {
    setMyRoll(null);
    setComputerRoll(null);
    setMyBuildDone(false);
    setComputerBuildDone(false);
    setPlaced(null);
    setSelected(null);
    setResult(null);
    setRoundNum(r => r + 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-200 to-orange-300 flex flex-col items-center py-6 px-3">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="text-amber-900/70 hover:text-amber-900 font-medium">← Back</button>
          <h1 className="text-xl font-black text-amber-900">🍪 Solo Practice</h1>
          <span className="text-amber-900/60 text-sm">Round {roundNum}</span>
        </div>

        {/* Roll phase */}
        <div className="bg-white rounded-2xl px-6 py-3 shadow-xl flex items-center justify-around mb-4">
          <div className="flex flex-col items-center">
            {myRoll !== null ? (
              <>
                <p className="font-black text-gray-500 text-xs uppercase mb-1">You</p>
                <div className="w-14 h-14 rounded-xl shadow border-4 border-green-400 bg-green-50 flex items-center justify-center text-2xl font-black text-green-700">{myRoll}</div>
              </>
            ) : (
              <SlotRoller onResult={setMyRoll} label="You" />
            )}
          </div>
          <div className="text-2xl font-black text-gray-300">VS</div>
          <div className="flex flex-col items-center">
            {computerRoll !== null ? (
              <>
                <p className="font-black text-gray-500 text-xs uppercase mb-1">Computer</p>
                <div className="w-14 h-14 rounded-xl shadow border-4 border-green-400 bg-green-50 flex items-center justify-center text-2xl font-black text-green-700">{computerRoll}</div>
              </>
            ) : (
              <SlotRoller onResult={setComputerRoll} label="Computer" />
            )}
          </div>
        </div>

        {/* Build both sets — side by side */}
        {/* Student builds computer's number; computer builds student's number */}
        {bothRolled && (
          <div className="flex gap-3 mb-0">
            <div className="flex-1 min-w-0">
              <BuildSection
                label="Build the computer's cookies"
                targetNumber={computerRoll}
                locked={false}
                onDone={() => setMyBuildDone(true)}
              />
            </div>
            <div className="flex-1 min-w-0">
              <BuildSection
                label="Build your cookies"
                targetNumber={myRoll}
                locked={!myBuildDone}
                onDone={() => setComputerBuildDone(true)}
              />
            </div>
          </div>
        )}

        {/* Sentence completion */}
        {bothBuilt && !result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-5 shadow-xl mb-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest text-center mb-4">Complete the sentence</p>
            <div className="flex flex-wrap items-center justify-center gap-2 text-lg font-black text-gray-800 mb-5">
              <span className="bg-amber-100 px-3 py-1.5 rounded-lg">{myRoll}</span>
              <DropZone filled={placed} selected={selected} onPlace={(v) => { handlePlace(v); setSelected(null); }} dropRef={dropRef} />
              <span className="bg-orange-100 px-3 py-1.5 rounded-lg">{computerRoll}</span>
            </div>
            <div className="flex flex-wrap gap-1 justify-center mb-3">
              {['is_greater_than', 'is_less_than', 'is_equal_to'].map(v => (
                <DragWord key={v} label={LABEL_MAP[v]} value={v}
                  dropped={!!placed} selected={selected === v}
                  onSelect={setSelected}
                  onDrop={(val) => { handlePlace(val); setSelected(null); }}
                  dropRef={dropRef} />
              ))}
            </div>
            <p className="text-center text-xs text-gray-400">🔊 tap to hear • drag or tap to place</p>
          </motion.div>
        )}

        {/* Result — inline */}
        {result && (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className={`rounded-3xl p-5 shadow-xl mb-4 ${result === 'correct' ? 'bg-green-100' : 'bg-red-50'}`}>
            {result === 'correct' ? (
              <div className="text-center">
                <div className="text-4xl mb-1">🎉</div>
                <p className="text-xl font-black text-green-700">Correct!</p>
                <p className="text-lg font-bold text-gray-700 mt-1">{myRoll} {placed} {computerRoll}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="p-3 rounded-xl bg-red-100 border-2 border-red-400 text-center">
                  <p className="text-base font-black text-red-700">✗ {myRoll} {placed} {computerRoll}</p>
                </div>
                <div className="p-3 rounded-xl bg-green-100 border-2 border-green-400 text-center">
                  <p className="text-base font-black text-green-700">✓ {myRoll} {LABEL_MAP[correctValue]} {computerRoll}</p>
                </div>
              </div>
            )}
            <motion.button whileTap={{ scale: 0.95 }} onClick={handleNextRound}
              className="mt-4 w-full bg-green-600 text-white font-black text-lg py-3 rounded-2xl shadow-lg">
              🎰 Next Round!
            </motion.button>
          </motion.div>
        )}
      </div>
    </div>
  );
}