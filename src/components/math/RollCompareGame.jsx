import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';

// ── Cookie SVG ────────────────────────────────────────────────────
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

// ── Double Ten-Frame (tap to add, tap cookie to remove) ──────────
function DoubleTenFrame({ count, onChange }) {
  const trayRef = useRef(null);

  const handlePointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;

    const clone = document.createElement('div');
    clone.style.cssText = 'position:fixed;width:32px;height:32px;pointer-events:none;z-index:9999;display:flex;align-items:center;justify-content:center;';
    clone.innerHTML = `<svg width="24" height="24" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#c8854a" stroke="#8B5E3C" stroke-width="1.5"/><ellipse cx="13" cy="14" rx="3.5" ry="2.5" fill="#3b1f09" transform="rotate(-10 13 14)"/><ellipse cx="19" cy="21" rx="3" ry="2" fill="#3b1f09" transform="rotate(-5 19 21)"/></svg>`;
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
        if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
          onChange(Math.min(count + 1, 20));
        }
      }
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Bank button */}
      <div className="flex gap-2 items-center">
        <button
          onPointerDown={handlePointerDown}
          style={{ touchAction: 'none', userSelect: 'none', cursor: 'grab' }}
          className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100"
        >
          <Cookie size={18} />
          <span className="text-xs font-bold text-amber-700 leading-none">+1</span>
        </button>
        <button
          onClick={() => onChange(Math.min(count + 5, 20))}
          className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100"
        >
          <Cookie size={18} />
          <span className="text-xs font-bold text-amber-700 leading-none">+5</span>
        </button>
        <button
          onClick={() => onChange(Math.min(count + 10, 20))}
          className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100"
        >
          <Cookie size={18} />
          <span className="text-xs font-bold text-amber-700 leading-none">+10</span>
        </button>
        {count > 0 && (
          <button onClick={() => onChange(0)} className="px-2 py-1 text-xs text-red-400 hover:text-red-600 font-bold">✕ clear</button>
        )}
      </div>
      {/* Tray */}
      <div ref={trayRef} className="flex flex-col gap-1 p-2 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50">
        {[0, 1].map(row => (
          <div key={row} className="flex gap-1">
            {Array.from({ length: 10 }).map((_, col) => {
              const idx = row * 10 + col;
              const filled = idx < count;
              return filled ? (
                <button key={col} onClick={() => onChange(count - 1)}
                  style={{ width: 28, height: 28, padding: 0, cursor: 'pointer', background: 'none', border: 'none' }}>
                  <Cookie size={26} />
                </button>
              ) : (
                <div key={col} style={{ width: 28, height: 28 }}
                  className="rounded border border-dashed border-amber-200 bg-amber-100/30" />
              );
            })}
          </div>
        ))}
      </div>

    </div>
  );
}

// ── Slot machine randomizer ───────────────────────────────────────
function SlotRoller({ onResult }) {
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
      <motion.div
        animate={spinning ? { scale: [1, 1.05, 0.97, 1.03, 1] } : {}}
        transition={{ repeat: Infinity, duration: 0.15 }}
        className={`w-28 h-28 rounded-2xl shadow-2xl border-4 flex items-center justify-center text-5xl font-black select-none transition-colors
          ${done ? 'border-green-400 bg-green-50 text-green-700' : spinning ? 'border-amber-300 bg-amber-50 text-amber-600' : 'border-amber-400 bg-white text-amber-700'}`}
      >
        {display}
      </motion.div>
      {!done && (
        <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.05 }}
          onClick={spin} disabled={spinning}
          className="bg-amber-500 text-white font-black text-lg px-6 py-3 rounded-2xl shadow-lg disabled:opacity-50">
          {spinning ? '🎰 Rolling…' : '🎰 Spin!'}
        </motion.button>
      )}
    </div>
  );
}

// ── Drop zone ─────────────────────────────────────────────────────
function DropZone({ filled, selected, onPlace }) {
  return (
    <div
      onClick={() => { if (!filled && selected) onPlace(selected); }}
      className={`min-w-[160px] h-14 rounded-2xl border-4 border-dashed flex items-center justify-center font-black text-base transition-all
        ${filled ? 'border-indigo-500 bg-indigo-100 text-indigo-700'
          : selected ? 'border-indigo-400 bg-indigo-50 text-indigo-500 cursor-pointer'
          : 'border-gray-300 bg-gray-50 text-gray-400'}`}>
      {filled || (selected ? `tap to place` : 'select a word')}
    </div>
  );
}

function DragWord({ label, value, dropped, selected, onSelect }) {
  return (
    <motion.button
      whileHover={{ scale: dropped ? 1 : 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => {
        if (dropped) return;
        new Audio(`/audio/${value}.mp3`).play().catch(() => {});
        onSelect(value);
      }}
      disabled={dropped}
      className={`px-4 py-3 rounded-2xl font-black text-base select-none shadow-lg transition-all
        ${dropped ? 'opacity-30 cursor-not-allowed'
          : selected ? 'bg-white text-indigo-700 border-4 border-indigo-500 cursor-pointer'
          : 'bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer'}`}
    >
      {label}
    </motion.button>
  );
}

// ── Game view ─────────────────────────────────────────────────────
function GameView({ game, studentNumber, onLeave, refetch }) {
  const [myRoll, setMyRoll] = useState(null);
  const [builtCount, setBuiltCount] = useState(0);
  const [placed, setPlaced] = useState(null);
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const roundNum = game.round_number || 1;

  // Reset local state on new round
  useEffect(() => {
    setMyRoll(null);
    setBuiltCount(0);
    setPlaced(null);
    setSelected(null);
    setResult(null);
  }, [roundNum]);

  const isPlayer1 = game.player1_number === studentNumber;
  const storedMyRoll = isPlayer1 ? game.player1_roll : game.player2_roll;
  const storedTheirRoll = isPlayer1 ? game.player2_roll : game.player1_roll;
  const myAnswer = isPlayer1 ? game.player1_answer : game.player2_answer;
  const theirAnswer = isPlayer1 ? game.player2_answer : game.player1_answer;
  const partnerNumber = isPlayer1 ? game.player2_number : game.player1_number;

  const displayMyRoll = storedMyRoll ?? myRoll;
  const bothRolled = !!(game.player1_roll && game.player2_roll);
  const bothAnswered = !!(game.player1_answer && game.player2_answer);

  const handleRollResult = async (roll) => {
    setMyRoll(roll);
    const update = isPlayer1 ? { player1_roll: roll } : { player2_roll: roll };
    await base44.entities.RollComparePairGame.update(game.id, update);
    refetch();
  };

  const handlePlace = async (value) => {
    if (!displayMyRoll || !storedTheirRoll || placed || submitting) return;
    setSubmitting(true);
    const myVal = displayMyRoll;
    const theirVal = storedTheirRoll;
    const correct = myVal > theirVal ? 'is_greater_than' : myVal < theirVal ? 'is_less_than' : 'is_equal_to';
    const labelMap = { is_greater_than: 'is greater than', is_less_than: 'is less than', is_equal_to: 'is equal to' };
    setPlaced(labelMap[value]);
    setResult(value === correct ? 'correct' : 'wrong');
    const update = isPlayer1 ? { player1_answer: value } : { player2_answer: value };
    await base44.entities.RollComparePairGame.update(game.id, update);
    setSubmitting(false);
    refetch();
  };

  const handleNextRound = async () => {
    if (!bothAnswered) return;
    await base44.entities.RollComparePairGame.update(game.id, {
      player1_roll: null, player2_roll: null,
      player1_answer: null, player2_answer: null,
      round_number: roundNum + 1,
    });
    refetch();
  };

  const correctLabel = displayMyRoll && storedTheirRoll
    ? (displayMyRoll > storedTheirRoll ? 'is greater than' : displayMyRoll < storedTheirRoll ? 'is less than' : 'is equal to')
    : '';

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onLeave} className="text-amber-900/70 hover:text-amber-900 font-medium">← Leave</button>
        <h1 className="text-xl font-black text-amber-900">🍪 Roll & Compare</h1>
        <span className="text-amber-900/60 text-sm">Round {roundNum}</span>
      </div>

      {/* Roll phase */}
      <div className="bg-white rounded-3xl p-6 shadow-xl flex items-center justify-around mb-4">
        <div className="flex flex-col items-center gap-3">
          <p className="font-black text-gray-500 text-sm uppercase">You #{studentNumber}</p>
          {storedMyRoll ? (
            <div className="w-28 h-28 rounded-2xl shadow-2xl border-4 border-green-400 bg-green-50 flex items-center justify-center text-5xl font-black text-green-700">
              {storedMyRoll}
            </div>
          ) : (
            <SlotRoller onResult={handleRollResult} />
          )}
        </div>
        <div className="text-4xl font-black text-gray-300">VS</div>
        <div className="flex flex-col items-center gap-3">
          <p className="font-black text-gray-500 text-sm uppercase">Partner #{partnerNumber}</p>
          {storedTheirRoll ? (
            <div className="w-28 h-28 rounded-2xl shadow-2xl border-4 border-green-400 bg-green-50 flex items-center justify-center text-5xl font-black text-green-700">
              {storedTheirRoll}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-28 h-28 rounded-2xl shadow-2xl border-4 border-gray-300 bg-gray-50 flex items-center justify-center text-5xl font-black text-gray-300">?</div>
              <p className="text-sm text-gray-400 animate-pulse">Spinning…</p>
            </div>
          )}
        </div>
      </div>

      {/* Build phase */}
      <AnimatePresence>
        {bothRolled && !result && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-5 shadow-xl mb-4">
            <p className="text-center text-sm font-bold text-gray-400 uppercase mb-4">Build your cookies!</p>
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-xs font-bold text-amber-700 mb-2">Your number: {storedMyRoll}</p>
                <DoubleTenFrame count={builtCount} onChange={setBuiltCount} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compare phase */}
      <AnimatePresence>
        {bothRolled && !result && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-5 shadow-xl mb-4">
            <p className="text-center text-sm font-bold text-gray-400 uppercase mb-4">Complete the sentence!</p>
            <div className="flex flex-wrap items-center justify-center gap-3 text-2xl font-black text-gray-800 mb-5">
              <span className="bg-amber-100 px-3 py-2 rounded-xl">{storedMyRoll}</span>
              <DropZone filled={placed} selected={selected} onPlace={(v) => { handlePlace(v); setSelected(null); }} />
              <span className="bg-orange-100 px-3 py-2 rounded-xl">{storedTheirRoll}</span>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              <DragWord label="is greater than" value="is_greater_than" dropped={!!placed} selected={selected === 'is_greater_than'} onSelect={setSelected} />
              <DragWord label="is less than" value="is_less_than" dropped={!!placed} selected={selected === 'is_less_than'} onSelect={setSelected} />
              <DragWord label="is equal to" value="is_equal_to" dropped={!!placed} selected={selected === 'is_equal_to'} onSelect={setSelected} />
            </div>
            <p className="text-center text-xs text-gray-400 mt-3">Tap a word to hear it · tap again or the blank to place it</p>
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
              {displayMyRoll} {correctLabel} {storedTheirRoll}
            </p>
            {!bothAnswered ? (
              <p className="mt-4 text-amber-600 font-bold animate-pulse">⏳ Waiting for partner to finish…</p>
            ) : (
              <motion.button whileTap={{ scale: 0.95 }} onClick={handleNextRound}
                className="mt-5 bg-amber-500 text-white font-black text-xl px-8 py-4 rounded-2xl shadow-lg">
                🎰 Next Round!
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Lobby ─────────────────────────────────────────────────────────
export default function RollCompareGame({ studentNumber, className: classProp, onBack }) {
  const [activeGameId, setActiveGameId] = useState(null);

  const { data: allGames = [], refetch } = useQuery({
    queryKey: ['roll-compare-games', classProp],
    queryFn: () => base44.entities.RollComparePairGame.filter({ class_name: classProp }),
    refetchInterval: 2000,
  });

  const myGame = allGames.find(g =>
    (g.player1_number === studentNumber || g.player2_number === studentNumber) &&
    g.status !== 'done'
  ) || (activeGameId && allGames.find(g => g.id === activeGameId));

  const joinableGames = allGames.filter(g =>
    g.status === 'waiting' &&
    g.player1_number !== studentNumber &&
    !g.player2_number
  );

  const createGame = async () => {
    if (myGame) return;
    const g = await base44.entities.RollComparePairGame.create({
      class_name: classProp, player1_number: studentNumber,
      status: 'waiting', round_number: 1,
    });
    setActiveGameId(g.id);
    refetch();
  };

  const joinGame = async (openGame) => {
    await base44.entities.RollComparePairGame.update(openGame.id, { player2_number: studentNumber, status: 'rolling' });
    setActiveGameId(openGame.id);
    refetch();
  };

  const startGame = async (game) => {
    await base44.entities.RollComparePairGame.update(game.id, { status: 'rolling' });
    refetch();
  };

  const leaveGame = async (game) => {
    await base44.entities.RollComparePairGame.delete(game.id);
    setActiveGameId(null);
    refetch();
  };

  if (myGame && (myGame.status === 'rolling' || myGame.status === 'comparing')) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-200 to-orange-300 flex flex-col items-center py-6 px-3">
        <GameView game={myGame} studentNumber={studentNumber} onLeave={() => leaveGame(myGame)} refetch={refetch} />
      </div>
    );
  }

  if (myGame && myGame.status === 'waiting') {
    const players = [myGame.player1_number, myGame.player2_number].filter(Boolean);
    const isHost = myGame.player1_number === studentNumber;
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-300 to-orange-400 flex flex-col items-center justify-center gap-6 p-6">
        <div className="flex flex-col items-center gap-6 max-w-sm mx-auto w-full">
          <h2 className="text-2xl font-bold text-white">🍪 Waiting Room</h2>
          <div className="bg-white/20 rounded-2xl p-5 w-full flex flex-col gap-3">
            <p className="text-white font-semibold text-center">{players.length} / 2 players joined:</p>
            {players.map(p => (
              <div key={p} className="flex items-center justify-between bg-white/20 rounded-xl px-4 py-2">
                <span className="text-white font-bold text-lg">#{p}</span>
                {p === myGame.player1_number && <span className="text-yellow-300 text-xs font-bold">HOST</span>}
                {p === studentNumber && <span className="text-white/60 text-xs">(you)</span>}
              </div>
            ))}
            {players.length < 2 && <div className="text-center text-white/50 text-sm animate-pulse">Waiting for a partner…</div>}
          </div>
          {isHost ? (
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => startGame(myGame)}
              disabled={players.length < 2}
              className="bg-green-500 hover:bg-green-400 disabled:opacity-40 text-white font-bold text-xl py-4 rounded-2xl shadow-lg w-full">
              {players.length < 2 ? 'Waiting for partner…' : '▶ Start Game!'}
            </motion.button>
          ) : (
            <div className="text-white/70 text-center">Waiting for the host to start…</div>
          )}
          <button onClick={() => leaveGame(myGame)} className="text-white/50 hover:text-white text-sm">← Leave Room</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-300 to-orange-400 flex flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-6 max-w-sm mx-auto w-full">
        <button onClick={onBack} className="text-white/80 self-start hover:text-white">← Back</button>
        <div className="text-5xl">🍪</div>
        <h2 className="text-2xl font-bold text-white">Roll & Compare Lobby</h2>
        <p className="text-white/70">Class: {classProp} · You are #{studentNumber}</p>
        {joinableGames.length > 0 ? (
          <div className="w-full flex flex-col gap-3">
            <p className="text-white font-semibold">Open rooms:</p>
            {joinableGames.map(g => (
              <motion.button key={g.id} whileTap={{ scale: 0.95 }} onClick={() => joinGame(g)}
                className="bg-white text-orange-700 font-bold text-lg py-4 rounded-2xl shadow-lg w-full flex flex-col items-center gap-1">
                <span>#{g.player1_number}'s room</span>
                <span className="text-sm font-normal text-orange-400">1 player waiting</span>
              </motion.button>
            ))}
            <div className="text-white/40 text-center text-sm">— or —</div>
            <motion.button whileTap={{ scale: 0.95 }} onClick={createGame}
              className="bg-white/20 hover:bg-white/30 text-white font-bold text-lg py-3 rounded-2xl w-full border border-white/30">
              + Create My Own Room
            </motion.button>
          </div>
        ) : (
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} onClick={createGame}
            className="bg-white text-orange-700 font-bold text-2xl py-6 rounded-2xl shadow-lg w-full">
            + Create a Room
          </motion.button>
        )}
        <p className="text-white/40 text-xs text-center">Pairs only · 2 players per game</p>
      </div>
    </div>
  );
}