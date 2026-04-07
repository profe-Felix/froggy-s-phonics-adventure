import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';

// ── Cookie SVG visual ──────────────────────────────────────────────
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

function CookieTenFrame({ count }) {
  return (
    <div className="flex flex-col gap-1">
      {[0, 1].map(row => (
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

function DropZone({ onDrop, filled }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const val = e.dataTransfer.getData('comparison'); if (val) onDrop(val); }}
      className={`min-w-[160px] h-14 rounded-2xl border-4 border-dashed flex items-center justify-center font-black text-lg transition-all
        ${filled ? 'border-indigo-500 bg-indigo-100 text-indigo-700' : over ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 bg-gray-50 text-gray-400'}`}
    >
      {filled || 'drop here'}
    </div>
  );
}

function DragWord({ label, value, onDrop, dropped }) {
  return (
    <motion.div
      draggable={!dropped}
      onDragStart={(e) => e.dataTransfer.setData('comparison', value)}
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

// ── Game view (once both players are in and game is active) ────────
function GameView({ game, studentNumber, onLeave }) {
  const [rolling, setRolling] = useState(false);
  const [placed, setPlaced] = useState(null);
  const [result, setResult] = useState(null);

  const isPlayer1 = game.player1_number === studentNumber;
  const myRoll = isPlayer1 ? game.player1_roll : game.player2_roll;
  const theirRoll = isPlayer1 ? game.player2_roll : game.player1_roll;
  const partnerNumber = isPlayer1 ? game.player2_number : game.player1_number;
  const bothRolled = !!(game.player1_roll && game.player2_roll);

  const handleRoll = async () => {
    if (rolling || myRoll) return;
    setRolling(true);
    const roll = Math.floor(Math.random() * 12) + 9;
    setTimeout(async () => {
      setRolling(false);
      const update = isPlayer1 ? { player1_roll: roll } : { player2_roll: roll };
      await base44.entities.RollComparePairGame.update(game.id, update);
    }, 700);
  };

  const handlePlace = (value) => {
    if (!myRoll || !theirRoll || placed) return;
    const correct = myRoll > theirRoll ? 'is_greater_than' : 'is_less_than';
    setPlaced(value === 'is_greater_than' ? 'is greater than' : 'is less than');
    setResult(value === correct ? 'correct' : 'wrong');
  };

  const handleNextRound = async () => {
    await base44.entities.RollComparePairGame.update(game.id, {
      player1_roll: null, player2_roll: null,
      comparison_answer: null,
      round_number: (game.round_number || 1) + 1,
    });
    setPlaced(null);
    setResult(null);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onLeave} className="text-amber-900/70 hover:text-amber-900 font-medium">← Leave</button>
        <h1 className="text-xl font-black text-amber-900">🍪 Roll & Compare</h1>
        <span className="text-amber-900/60 text-sm">Round {game.round_number || 1}</span>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-xl flex items-center justify-around mb-4">
        <div className="flex flex-col items-center gap-3">
          <p className="font-black text-gray-500 text-sm uppercase">You #{studentNumber}</p>
          <DiceFace value={myRoll} rolling={rolling} />
          {!myRoll && (
            <motion.button whileTap={{ scale: 0.9 }} onClick={handleRoll} disabled={rolling}
              className="bg-amber-500 text-white font-black text-lg px-6 py-3 rounded-2xl shadow-lg disabled:opacity-50">
              🎲 Roll!
            </motion.button>
          )}
        </div>
        <div className="text-4xl font-black text-gray-300">VS</div>
        <div className="flex flex-col items-center gap-3">
          <p className="font-black text-gray-500 text-sm uppercase">Partner #{partnerNumber}</p>
          <DiceFace value={theirRoll} rolling={!theirRoll} />
          {!theirRoll && <p className="text-sm text-gray-400 animate-pulse">Rolling…</p>}
        </div>
      </div>

      <AnimatePresence>
        {bothRolled && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-5 shadow-xl mb-4">
            <p className="text-center text-sm font-bold text-gray-400 uppercase mb-4">Build your set with cookies!</p>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-start gap-1">
                <span className="text-xs font-bold text-amber-700">You — {myRoll} cookies</span>
                <CookieTenFrame count={myRoll} />
              </div>
              <div className="flex flex-col items-start gap-1">
                <span className="text-xs font-bold text-orange-700">Partner — {theirRoll} cookies</span>
                <CookieTenFrame count={theirRoll} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {bothRolled && !result && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-5 shadow-xl mb-4">
            <p className="text-center text-sm font-bold text-gray-400 uppercase mb-4">Complete the sentence!</p>
            <div className="flex flex-wrap items-center justify-center gap-3 text-2xl font-black text-gray-800 mb-5">
              <span className="bg-amber-100 px-3 py-2 rounded-xl">{myRoll}</span>
              <DropZone filled={placed} onDrop={handlePlace} />
              <span className="bg-orange-100 px-3 py-2 rounded-xl">{theirRoll}</span>
            </div>
            <div className="flex gap-3 justify-center">
              <DragWord label="is greater than" value="is_greater_than" onDrop={handlePlace} dropped={!!placed} />
              <DragWord label="is less than" value="is_less_than" onDrop={handlePlace} dropped={!!placed} />
            </div>
            <p className="text-center text-xs text-gray-400 mt-3">Tap or drag a word into the blank</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {result && (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className={`rounded-3xl p-6 shadow-xl text-center ${result === 'correct' ? 'bg-green-100 border-4 border-green-400' : 'bg-red-100 border-4 border-red-400'}`}>
            <div className="text-6xl mb-2">{result === 'correct' ? '🎉' : '🤔'}</div>
            <p className={`text-2xl font-black ${result === 'correct' ? 'text-green-700' : 'text-red-700'}`}>
              {result === 'correct' ? 'Correct!' : 'Not quite!'}
            </p>
            <p className="text-gray-600 mt-2 text-lg font-semibold">
              {myRoll} {myRoll > theirRoll ? 'is greater than' : 'is less than'} {theirRoll}
            </p>
            <motion.button whileTap={{ scale: 0.95 }} onClick={handleNextRound}
              className="mt-5 bg-amber-500 text-white font-black text-xl px-8 py-4 rounded-2xl shadow-lg">
              🎲 Next Round!
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main lobby + game orchestrator ────────────────────────────────
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
    g.player2_number !== studentNumber
  );

  const createGame = async () => {
    if (myGame) return;
    const g = await base44.entities.RollComparePairGame.create({
      class_name: classProp,
      player1_number: studentNumber,
      status: 'waiting',
      round_number: 1,
    });
    setActiveGameId(g.id);
    refetch();
  };

  const joinGame = async (openGame) => {
    await base44.entities.RollComparePairGame.update(openGame.id, {
      player2_number: studentNumber,
      status: 'rolling',
    });
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

  // Active game
  if (myGame && (myGame.status === 'rolling' || myGame.status === 'comparing')) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-200 to-orange-300 flex flex-col items-center py-6 px-3">
        <GameView game={myGame} studentNumber={studentNumber} onLeave={() => leaveGame(myGame)} />
      </div>
    );
  }

  // Waiting room
  if (myGame && myGame.status === 'waiting') {
    const isHost = myGame.player1_number === studentNumber;
    const players = [myGame.player1_number, myGame.player2_number].filter(Boolean);
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
            {players.length < 2 && (
              <div className="text-center text-white/50 text-sm animate-pulse">Waiting for a partner…</div>
            )}
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

  // Lobby
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