import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';

// ── Cookie SVG visual ──────────────────────────────────────────────
function Cookie({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="18" fill="#c8854a" stroke="#8B5E3C" strokeWidth="1.5"/>
      <circle cx="20" cy="20" r="18" fill="url(#grain)" opacity="0.3"/>
      {/* chips */}
      <ellipse cx="13" cy="14" rx="3.5" ry="2.5" fill="#3b1f09" transform="rotate(-10 13 14)"/>
      <ellipse cx="26" cy="12" rx="3" ry="2" fill="#3b1f09" transform="rotate(5 26 12)"/>
      <ellipse cx="10" cy="26" rx="2.5" ry="2" fill="#3b1f09" transform="rotate(-15 10 26)"/>
      <ellipse cx="24" cy="28" rx="3.5" ry="2.5" fill="#3b1f09" transform="rotate(8 24 28)"/>
      <ellipse cx="19" cy="21" rx="3" ry="2" fill="#3b1f09" transform="rotate(-5 19 21)"/>
      <defs>
        <pattern id="grain" patternUnits="userSpaceOnUse" width="4" height="4">
          <circle cx="1" cy="1" r="0.5" fill="#fff"/>
        </pattern>
      </defs>
    </svg>
  );
}

// ── Ten-frame of cookies ──────────────────────────────────────────
function CookieTenFrame({ count }) {
  const rows = [0, 1];
  return (
    <div className="flex flex-col gap-1">
      {rows.map(row => (
        <div key={row} className="flex gap-1">
          {Array.from({ length: 10 }).map((_, col) => {
            const idx = row * 10 + col;
            return (
              <div key={col} style={{ width: 32, height: 32 }}
                className={`rounded-lg border-2 flex items-center justify-center ${idx < count ? 'border-amber-400 bg-amber-50' : 'border-dashed border-amber-200 bg-amber-50/30'}`}>
                {idx < count && <Cookie size={24} />}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Dice face ─────────────────────────────────────────────────────
function DiceFace({ value, rolling }) {
  return (
    <motion.div
      animate={rolling ? { rotate: [0, 20, -20, 15, -10, 5, 0], scale: [1, 1.1, 0.95, 1.05, 1] } : {}}
      transition={{ duration: 0.6 }}
      className="w-28 h-28 bg-white rounded-2xl shadow-2xl border-4 border-amber-400 flex items-center justify-center text-5xl font-black text-amber-700 select-none"
    >
      {rolling ? '🎲' : (value ?? '?')}
    </motion.div>
  );
}

// ── Draggable comparison word ─────────────────────────────────────
function DragWord({ label, value, onDrop, dropped }) {
  const handleDragStart = (e) => {
    e.dataTransfer.setData('comparison', value);
  };
  return (
    <motion.div
      draggable={!dropped}
      onDragStart={handleDragStart}
      whileHover={{ scale: dropped ? 1 : 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => !dropped && onDrop(value)}
      className={`px-5 py-3 rounded-2xl font-black text-lg cursor-grab select-none shadow-lg transition-all
        ${dropped ? 'opacity-30 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'}`}
    >
      {label}
    </motion.div>
  );
}

// ── Drop zone ─────────────────────────────────────────────────────
function DropZone({ onDrop, filled }) {
  const [over, setOver] = useState(false);
  const handleDragOver = (e) => { e.preventDefault(); setOver(true); };
  const handleDragLeave = () => setOver(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setOver(false);
    const val = e.dataTransfer.getData('comparison');
    if (val) onDrop(val);
  };
  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`min-w-[160px] h-14 rounded-2xl border-4 border-dashed flex items-center justify-center font-black text-lg transition-all
        ${filled ? 'border-indigo-500 bg-indigo-100 text-indigo-700' : over ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 bg-gray-50 text-gray-400'}`}
    >
      {filled || 'drop here'}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────
export default function RollCompareGame({ studentNumber, className: classProp, onBack }) {
  const [game, setGame] = useState(null);
  const [myRoll, setMyRoll] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [placed, setPlaced] = useState(null); // the comparison word placed
  const [result, setResult] = useState(null); // 'correct' | 'wrong'
  const [roundKey, setRoundKey] = useState(0);
  const [creating, setCreating] = useState(false);

  const isPlayer1 = game?.player1_number === studentNumber;
  const isPlayer2 = game?.player2_number === studentNumber;
  const partnerRoll = isPlayer1 ? game?.player2_roll : game?.player1_roll;
  const myStoredRoll = isPlayer1 ? game?.player1_roll : game?.player2_roll;

  // Poll for game updates
  useQuery({
    queryKey: ['roll-compare', classProp, studentNumber],
    queryFn: async () => {
      const games = await base44.entities.RollComparePairGame.filter({
        class_name: classProp,
        status: ['waiting', 'rolling', 'comparing'],
      });
      const mine = games.find(g => g.player1_number === studentNumber || g.player2_number === studentNumber);
      if (mine && mine.id !== game?.id) {
        setGame(mine);
        setMyRoll(null); setPlaced(null); setResult(null);
        setRoundKey(k => k + 1);
      } else if (mine) {
        setGame(mine);
      }
      return mine || null;
    },
    refetchInterval: 1500,
    enabled: true,
  });

  const findOrCreateGame = async () => {
    if (creating) return;
    setCreating(true);
    // look for an open game waiting for a partner
    const games = await base44.entities.RollComparePairGame.filter({ class_name: classProp, status: 'waiting' });
    const open = games.find(g => !g.player2_number && g.player1_number !== studentNumber);
    if (open) {
      const updated = await base44.entities.RollComparePairGame.update(open.id, { player2_number: studentNumber, status: 'rolling' });
      setGame(updated);
    } else {
      const created = await base44.entities.RollComparePairGame.create({ class_name: classProp, player1_number: studentNumber, status: 'waiting', round_number: 1 });
      setGame(created);
    }
    setCreating(false);
  };

  const handleRoll = async () => {
    if (!game || rolling || myStoredRoll) return;
    setRolling(true);
    const roll = Math.floor(Math.random() * 12) + 9; // 9–20
    setTimeout(async () => {
      setMyRoll(roll);
      setRolling(false);
      const update = isPlayer1 ? { player1_roll: roll } : { player2_roll: roll };
      // if partner already rolled, set to comparing
      const bothDone = isPlayer1 ? !!game.player2_roll : !!game.player1_roll;
      if (bothDone) update.status = 'comparing';
      const updated = await base44.entities.RollComparePairGame.update(game.id, update);
      setGame(updated);
    }, 700);
  };

  const handlePlace = async (value) => {
    if (!game || placed || result) return;
    const p1 = game.player1_roll;
    const p2 = game.player2_roll;
    if (!p1 || !p2) return;
    const myRollVal = isPlayer1 ? p1 : p2;
    const theirRoll = isPlayer1 ? p2 : p1;
    const correctAnswer = myRollVal > theirRoll ? 'is_greater_than' : 'is_less_than';
    const isCorrect = value === correctAnswer;
    setPlaced(value === 'is_greater_than' ? 'is greater than' : 'is less than');
    setResult(isCorrect ? 'correct' : 'wrong');
  };

  const handleNextRound = async () => {
    if (!game) return;
    const updated = await base44.entities.RollComparePairGame.update(game.id, {
      player1_roll: null, player2_roll: null,
      comparison_answer: null, status: 'rolling',
      round_number: (game.round_number || 1) + 1,
    });
    setGame(updated);
    setMyRoll(null); setPlaced(null); setResult(null);
    setRoundKey(k => k + 1);
  };

  const myRollDisplay = myRoll ?? myStoredRoll ?? null;
  const bothRolled = !!(game?.player1_roll && game?.player2_roll);
  const p1Roll = game?.player1_roll;
  const p2Roll = game?.player2_roll;
  const myRollFinal = isPlayer1 ? p1Roll : p2Roll;
  const theirRollFinal = isPlayer1 ? p2Roll : p1Roll;

  // ── Lobby ──
  if (!game) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-300 to-orange-400 flex flex-col items-center justify-center gap-6 p-6">
        <button onClick={onBack} className="text-white/80 self-start hover:text-white">← Back</button>
        <div className="text-6xl">🍪</div>
        <h1 className="text-3xl font-black text-white text-center">Roll & Compare</h1>
        <p className="text-white/80 text-center">Find a partner and see whose number is bigger!</p>
        <motion.button
          whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.03 }}
          onClick={findOrCreateGame}
          disabled={creating}
          className="bg-white text-orange-600 font-black text-2xl px-10 py-5 rounded-2xl shadow-xl disabled:opacity-60"
        >
          {creating ? 'Finding partner…' : '🎲 Find a Partner'}
        </motion.button>
      </div>
    );
  }

  // ── Waiting for partner ──
  if (game.status === 'waiting' && !game.player2_number) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-300 to-orange-400 flex flex-col items-center justify-center gap-6 p-6">
        <button onClick={onBack} className="text-white/80 self-start hover:text-white">← Back</button>
        <div className="text-6xl animate-bounce">🍪</div>
        <p className="text-2xl font-black text-white text-center">Waiting for a partner to join…</p>
        <p className="text-white/60 text-sm">#{studentNumber} · {classProp}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-200 to-orange-300 flex flex-col items-center py-6 px-3">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="text-amber-900/70 hover:text-amber-900 font-medium">← Back</button>
          <h1 className="text-xl font-black text-amber-900">🍪 Roll & Compare</h1>
          <span className="text-amber-900/60 text-sm">Round {game.round_number || 1}</span>
        </div>

        {/* The two dice side by side */}
        <div className="bg-white rounded-3xl p-6 shadow-xl flex items-center justify-around mb-4">
          {/* Me */}
          <div className="flex flex-col items-center gap-3">
            <p className="font-black text-gray-500 text-sm uppercase">You #{studentNumber}</p>
            <DiceFace value={myRollDisplay} rolling={rolling} />
            {!myStoredRoll && !myRoll && (
              <motion.button
                whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.05 }}
                onClick={handleRoll} disabled={rolling}
                className="bg-amber-500 text-white font-black text-lg px-6 py-3 rounded-2xl shadow-lg disabled:opacity-50"
              >
                🎲 Roll!
              </motion.button>
            )}
          </div>

          <div className="text-4xl font-black text-gray-300">VS</div>

          {/* Partner */}
          <div className="flex flex-col items-center gap-3">
            <p className="font-black text-gray-500 text-sm uppercase">Partner #{isPlayer1 ? game.player2_number : game.player1_number}</p>
            <DiceFace value={partnerRoll || null} rolling={!partnerRoll} />
            {!partnerRoll && <p className="text-sm text-gray-400 animate-pulse">Rolling…</p>}
          </div>
        </div>

        {/* Cookie displays — shown once both rolled */}
        <AnimatePresence>
          {bothRolled && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-5 shadow-xl mb-4">
              <p className="text-center text-sm font-bold text-gray-400 uppercase mb-4">Build your set with cookies!</p>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col items-start gap-1">
                  <span className="text-xs font-bold text-amber-700">You — {myRollFinal} cookies</span>
                  <CookieTenFrame count={myRollFinal} />
                </div>
                <div className="flex flex-col items-start gap-1">
                  <span className="text-xs font-bold text-orange-700">Partner — {theirRollFinal} cookies</span>
                  <CookieTenFrame count={theirRollFinal} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Comparison sentence builder */}
        <AnimatePresence>
          {bothRolled && !result && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-5 shadow-xl mb-4">
              <p className="text-center text-sm font-bold text-gray-400 uppercase mb-4">Complete the sentence!</p>
              <div className="flex flex-wrap items-center justify-center gap-3 text-2xl font-black text-gray-800 mb-5">
                <span className="bg-amber-100 px-3 py-2 rounded-xl">{myRollFinal}</span>
                <DropZone filled={placed} onDrop={handlePlace} />
                <span className="bg-orange-100 px-3 py-2 rounded-xl">{theirRollFinal}</span>
              </div>
              <div className="flex gap-3 justify-center">
                <DragWord label="is greater than" value="is_greater_than" onDrop={handlePlace} dropped={!!placed} />
                <DragWord label="is less than" value="is_less_than" onDrop={handlePlace} dropped={!!placed} />
              </div>
              <p className="text-center text-xs text-gray-400 mt-3">Tap or drag a word to fill in the blank</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className={`rounded-3xl p-6 shadow-xl text-center ${result === 'correct' ? 'bg-green-100 border-4 border-green-400' : 'bg-red-100 border-4 border-red-400'}`}
            >
              <div className="text-6xl mb-2">{result === 'correct' ? '🎉' : '🤔'}</div>
              <p className={`text-2xl font-black ${result === 'correct' ? 'text-green-700' : 'text-red-700'}`}>
                {result === 'correct' ? 'Correct!' : 'Not quite!'}
              </p>
              <p className="text-gray-600 mt-2 text-lg font-semibold">
                {myRollFinal} {myRollFinal > theirRollFinal ? 'is greater than' : 'is less than'} {theirRollFinal}
              </p>
              <motion.button
                whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.03 }}
                onClick={handleNextRound}
                className="mt-5 bg-amber-500 text-white font-black text-xl px-8 py-4 rounded-2xl shadow-lg"
              >
                🎲 Next Round!
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}