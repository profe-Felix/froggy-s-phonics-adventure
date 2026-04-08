import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BuildCheckOverlay from './BuildCheckOverlay';

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
      <div className="flex gap-2 items-center flex-wrap">
        {[1, 5, 10].map(n => (
          <button key={n}
            onPointerDown={n === 1 ? handlePointerDown : undefined}
            onClick={n !== 1 ? () => onChange && onChange(Math.min(count + n, 20)) : undefined}
            style={n === 1 ? { touchAction: 'none', userSelect: 'none', cursor: onChange ? 'grab' : 'default' } : {}}
            disabled={!onChange}
            className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 disabled:opacity-50">
            <Cookie size={18} />
            <span className="text-xs font-bold text-amber-700 leading-none">+{n}</span>
          </button>
        ))}
        {count > 0 && onChange && (
          <button onClick={() => onChange(0)} className="px-2 py-1 text-xs text-red-400 hover:text-red-600 font-bold">✕ clear</button>
        )}
      </div>
      <div ref={trayRef} className="flex flex-col gap-4 p-2 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50">
        {[0, 1].map(frame => (
          <div key={frame} className="grid gap-1" style={{ gridTemplateColumns: 'repeat(5, 42px)' }}>
            {Array.from({ length: 10 }).map((_, cell) => {
              const idx = frame * 10 + cell;
              const filled = idx < count;
              return filled ? (
                <button key={cell} onClick={() => onChange && onChange(count - 1)}
                  disabled={!onChange}
                  style={{ width: 42, height: 42, padding: 0, cursor: onChange ? 'pointer' : 'default', background: 'none', border: 'none' }}>
                  <Cookie size={40} />
                </button>
              ) : (
                <div key={cell} style={{ width: 42, height: 42 }}
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
      className={`min-w-[140px] h-12 rounded-2xl border-4 border-dashed flex items-center justify-center font-black text-sm transition-all
        ${filled ? 'border-indigo-500 bg-indigo-100 text-indigo-700'
          : selected ? 'border-indigo-400 bg-indigo-50 text-indigo-500 cursor-pointer'
          : 'border-gray-300 bg-gray-50 text-gray-400'}`}>
      {filled || (selected ? 'tap to place' : 'drag or tap')}
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
    clone.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;padding:10px 14px;background:#4f46e5;color:white;font-weight:900;border-radius:14px;font-size:13px;white-space:nowrap;';
    clone.textContent = label;
    document.body.appendChild(clone);
    const move = (cx, cy) => { clone.style.left = (cx - clone.offsetWidth / 2) + 'px'; clone.style.top = (cy - 20) + 'px'; };
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
      className={`px-3 py-2 rounded-xl font-black text-sm select-none shadow-lg transition-all cursor-grab
        ${dropped ? 'opacity-30 cursor-not-allowed'
          : selected ? 'bg-white text-indigo-700 border-4 border-indigo-500'
          : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
    >
      {label}
    </div>
  );
}

export default function RollCompareSolo({ studentNumber, onBack }) {
  const [myRoll, setMyRoll] = useState(null);
  const [computerRoll, setComputerRoll] = useState(null);
  const [builtCount, setBuiltCount] = useState(0);
  const [builtSubmitted, setBuiltSubmitted] = useState(false);
  const [buildWrong, setBuildWrong] = useState(false);
  const [placed, setPlaced] = useState(null);
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [roundNum, setRoundNum] = useState(1);
  const dropRef = useRef(null);

  const bothRolled = myRoll !== null && computerRoll !== null;

  const playSequence = (srcs) => {
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
  };

  const handlePlace = (value) => {
    if (!builtCount || !computerRoll || placed) return;
    const correct = builtCount > computerRoll ? 'is_greater_than' : builtCount < computerRoll ? 'is_less_than' : 'is_equal_to';
    const labelMap = { is_greater_than: 'is greater than', is_less_than: 'is less than', is_equal_to: 'is equal to' };
    setPlaced(labelMap[value]);
    setResult(value === correct ? 'correct' : 'wrong');
    playSequence([
      `/numbers-audio/${builtCount}.mp3`,
      `/audio/${value}.mp3`,
      `/numbers-audio/${computerRoll}.mp3`,
    ]);
  };

  const handleBuildSubmit = () => {
    if (builtCount !== myRoll) {
      setBuildWrong(true);
    } else {
      setBuiltSubmitted(true);
      setBuildWrong(false);
    }
  };

  const handleTryAgain = () => {
    setBuiltCount(0);
    setBuildWrong(false);
  };

  const handleNextRound = () => {
    setMyRoll(null);
    setComputerRoll(null);
    setBuiltCount(0);
    setBuiltSubmitted(false);
    setBuildWrong(false);
    setPlaced(null);
    setSelected(null);
    setResult(null);
    setRoundNum(r => r + 1);
  };

  const correctLabel = builtCount && computerRoll
    ? (builtCount > computerRoll ? 'is greater than' : builtCount < computerRoll ? 'is less than' : 'is equal to')
    : '';

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-200 to-orange-300 flex flex-col items-center py-6 px-3">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="text-amber-900/70 hover:text-amber-900 font-medium">← Back</button>
          <h1 className="text-xl font-black text-amber-900">🍪 Solo Practice</h1>
          <span className="text-amber-900/60 text-sm">Round {roundNum}</span>
        </div>

        {/* Roll phase */}
        <div className="bg-white rounded-3xl p-5 shadow-xl flex items-center justify-around mb-4">
          <div className="flex flex-col items-center">
            {myRoll !== null ? (
              <>
                <p className="font-black text-gray-500 text-sm uppercase mb-2">You</p>
                <div className="w-24 h-24 rounded-2xl shadow-2xl border-4 border-green-400 bg-green-50 flex items-center justify-center text-4xl font-black text-green-700">
                  {myRoll}
                </div>
              </>
            ) : (
              <SlotRoller onResult={setMyRoll} label="You" />
            )}
          </div>
          <div className="text-3xl font-black text-gray-300">VS</div>
          <div className="flex flex-col items-center">
            {computerRoll !== null ? (
              <>
                <p className="font-black text-gray-500 text-sm uppercase mb-2">Computer</p>
                <div className="w-24 h-24 rounded-2xl shadow-2xl border-4 border-green-400 bg-green-50 flex items-center justify-center text-4xl font-black text-green-700">
                  {computerRoll}
                </div>
              </>
            ) : (
              <SlotRoller onResult={setComputerRoll} label="Computer" />
            )}
          </div>
        </div>

        {/* Build + Compare phase */}
        <AnimatePresence>
          {bothRolled && !result && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-5 shadow-xl mb-4">
              <p className="text-center text-sm font-bold text-gray-400 uppercase mb-4">Build your cookies!</p>
              {buildWrong ? (
                <BuildCheckOverlay studentCount={builtCount} targetCount={myRoll} onTryAgain={handleTryAgain} />
              ) : (
                <>
                  <div className="mb-4">
                    <p className="text-xs font-bold text-amber-700 mb-2">Your number: {myRoll}</p>
                    <DoubleTenFrame count={builtCount} onChange={builtSubmitted ? undefined : setBuiltCount} />
                  </div>
                  {builtSubmitted ? (
                    <div className="mt-4">
                      <p className="text-center text-sm font-bold text-gray-400 uppercase mb-3">Complete the sentence!</p>
                      <div className="flex flex-wrap items-center justify-center gap-2 text-xl font-black text-gray-800 mb-4">
                        <span className="bg-amber-100 px-3 py-2 rounded-xl">{builtCount}</span>
                        <DropZone filled={placed} selected={selected} onPlace={(v) => { handlePlace(v); setSelected(null); }} dropRef={dropRef} />
                        <span className="bg-orange-100 px-3 py-2 rounded-xl">{computerRoll}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 justify-center">
                        <DragWord label="is greater than" value="is_greater_than" dropped={!!placed} selected={selected === 'is_greater_than'} onSelect={setSelected} onDrop={(v) => { handlePlace(v); setSelected(null); }} dropRef={dropRef} />
                        <DragWord label="is less than" value="is_less_than" dropped={!!placed} selected={selected === 'is_less_than'} onSelect={setSelected} onDrop={(v) => { handlePlace(v); setSelected(null); }} dropRef={dropRef} />
                        <DragWord label="is equal to" value="is_equal_to" dropped={!!placed} selected={selected === 'is_equal_to'} onSelect={setSelected} onDrop={(v) => { handlePlace(v); setSelected(null); }} dropRef={dropRef} />
                      </div>
                      <p className="text-center text-xs text-gray-400 mt-3">Tap a word to hear it</p>
                    </div>
                  ) : (
                    <div className="flex justify-end mt-3">
                      <motion.button whileTap={{ scale: 0.95 }}
                        onClick={handleBuildSubmit}
                        disabled={builtCount === 0}
                        className="bg-indigo-600 text-white font-black text-lg px-6 py-3 rounded-2xl shadow-lg disabled:opacity-40">
                        ✓ I'm done building!
                      </motion.button>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result */}
        <AnimatePresence>
          {result && (
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className={`rounded-3xl p-6 shadow-xl text-center ${result === 'correct' ? 'bg-green-100 border-4 border-green-400' : 'bg-red-100 border-4 border-red-400'}`}>
              <div className="text-5xl mb-2">{result === 'correct' ? '🎉' : '🤔'}</div>
              <p className={`text-2xl font-black ${result === 'correct' ? 'text-green-700' : 'text-red-700'}`}>
                {result === 'correct' ? 'Correct!' : 'Not quite!'}
              </p>
              <p className="text-gray-600 mt-2 text-lg font-semibold">
                {builtCount} {correctLabel} {computerRoll}
              </p>
              <motion.button whileTap={{ scale: 0.95 }} onClick={handleNextRound}
                className="mt-5 bg-amber-500 text-white font-black text-xl px-8 py-4 rounded-2xl shadow-lg">
                🎰 Next Round!
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}