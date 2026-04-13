import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import CollectionCanvas from './CollectionCanvas';
import CountingVerify from './CountingVerify';

function randomSeed() { return Math.floor(Math.random() * 1000000); }
function randomCount() { return Math.floor(Math.random() * 10) + 11; }

const LABEL_MAP = { is_greater_than: 'is greater than', is_less_than: 'is less than', is_equal_to: 'is equal to' };

// ── Compare phase shown INLINE below the canvases ──────────────────
function ComparePhase({ myNumber, theirNumber, myLabel, theirLabel, onNewRound, onLeave }) {
  const [selected, setSelected] = useState(null);
  const [placed, setPlaced] = useState(null);
  const [result, setResult] = useState(null);
  const dropRef = useRef(null);

  const correctValue = myNumber > theirNumber ? 'is_greater_than' : myNumber < theirNumber ? 'is_less_than' : 'is_equal_to';

  const handlePlace = (val) => {
    if (placed) return;
    const correct = val === correctValue;
    setPlaced(LABEL_MAP[val]);
    setResult(correct ? 'correct' : 'wrong');
  };

  const submitted = !!placed;

  return (
    <div className="flex flex-col gap-3 p-4 bg-white rounded-2xl shadow-lg mt-2">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest text-center">Complete the sentence!</p>

      {/* Side-by-side number display */}
      <div className="flex items-center justify-center gap-4 text-2xl font-black flex-wrap">
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-teal-600 font-bold">You</span>
          <span className="bg-teal-100 px-4 py-2 rounded-xl text-teal-800">{myNumber}</span>
        </div>

        {/* Drop zone */}
        <div ref={dropRef}
          onClick={() => { if (!submitted && selected) handlePlace(selected); }}
          className={`min-w-[130px] h-12 rounded-2xl border-4 border-dashed flex items-center justify-center font-bold text-sm transition-all cursor-pointer
            ${submitted && result === 'correct' ? 'border-green-500 bg-green-50 text-green-700'
              : submitted && result === 'wrong' ? 'border-red-400 bg-red-50 text-red-600'
              : placed ? 'border-teal-500 bg-teal-100 text-teal-700'
              : selected ? 'border-teal-400 bg-teal-50 text-teal-500'
              : 'border-gray-300 bg-gray-50 text-gray-400'}`}>
          {placed || (selected ? 'tap to place' : 'pick a word')}
        </div>

        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-orange-600 font-bold">{theirLabel}</span>
          <span className="bg-orange-100 px-4 py-2 rounded-xl text-orange-800">{theirNumber}</span>
        </div>
      </div>

      {/* Word choices */}
      {!submitted && (
        <div className="flex flex-wrap gap-2 justify-center">
          {Object.entries(LABEL_MAP).map(([val, label]) => (
            <button key={val}
              onClick={() => setSelected(s => s === val ? null : val)}
              className={`px-3 py-2 rounded-xl font-bold text-sm shadow transition-all
                ${selected === val ? 'bg-teal-600 text-white border-2 border-teal-700' : 'bg-white text-teal-700 border-2 border-teal-300 hover:bg-teal-50'}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`rounded-2xl p-4 text-center ${result === 'correct' ? 'bg-green-50 border-2 border-green-400' : 'bg-red-50 border-2 border-red-300'}`}>
          <div className="text-3xl mb-1">{result === 'correct' ? '🎉' : '🤔'}</div>
          <p className="text-lg font-black">{result === 'correct' ? 'Correct!' : `Answer: ${myNumber} ${LABEL_MAP[correctValue]} ${theirNumber}`}</p>
          <div className="flex gap-2 justify-center mt-3">
            <button onClick={onNewRound} className="bg-teal-600 text-white font-bold px-6 py-2 rounded-xl shadow">
              🔄 New Round
            </button>
            <button onClick={onLeave} className="text-gray-400 hover:text-gray-600 text-sm px-4 py-2">← Leave</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── GameView ─────────────────────────────────────────────────────
function GameView({ game, studentNumber, onLeave, refetch }) {
  const isP1 = game.player1_number === studentNumber;
  const mySeed = isP1 ? game.player1_seed : game.player2_seed;
  const myCount = isP1 ? game.player1_count : game.player2_count;
  const myAnswer = isP1 ? game.player1_answer : game.player2_answer;
  const theirAnswer = isP1 ? game.player2_answer : game.player1_answer;
  const partnerNum = isP1 ? game.player2_number : game.player1_number;
  const theirSeed = isP1 ? game.player2_seed : game.player1_seed;
  const theirCount = isP1 ? game.player2_count : game.player1_count;

  const [phase, setPhase] = useState('count'); // count | verify | compare_wait | compare
  const [localMyAnswer, setLocalMyAnswer] = useState(null);
  const roundNum = game.round_number || 1;

  const handleVerified = async (answer) => {
    setLocalMyAnswer(answer);
    const update = isP1 ? { player1_answer: answer } : { player2_answer: answer };
    await base44.entities.CountingCollectionPartnerGame.update(game.id, update);
    refetch();
    setPhase('compare_wait');
  };

  // Poll until both answered
  useQuery({
    queryKey: ['ccpg-wait', game.id, phase],
    queryFn: () => base44.entities.CountingCollectionPartnerGame.filter({ class_name: game.class_name }),
    refetchInterval: phase === 'compare_wait' ? 2000 : false,
    onSuccess: (data) => {
      const g = data.find(x => x.id === game.id);
      if (g && g.player1_answer && g.player2_answer && phase === 'compare_wait') {
        setPhase('compare');
        refetch();
      }
    }
  });

  const handleNextRound = async () => {
    await base44.entities.CountingCollectionPartnerGame.update(game.id, {
      player1_seed: randomSeed(), player2_seed: randomSeed(),
      player1_count: randomCount(), player2_count: randomCount(),
      player1_answer: null, player2_answer: null,
      player1_comparison: null, player2_comparison: null,
      round_number: roundNum + 1, status: 'counting',
    });
    setLocalMyAnswer(null);
    setPhase('count');
    refetch();
  };

  // Determine live answers for compare phase
  const liveMyAnswer = localMyAnswer ?? myAnswer;

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button onClick={onLeave} className="text-teal-900/70 hover:text-teal-900 font-medium text-sm">← Leave</button>
        <h1 className="text-lg font-black text-teal-900">🔢 Count & Compare</h1>
        <span className="text-teal-700 text-sm">Round {roundNum}</span>
      </div>

      {/* Counting phase — full canvas */}
      {phase === 'count' && (
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden" style={{ height: 420 }}>
          <CollectionCanvas seed={mySeed} count={myCount} onDone={() => setPhase('verify')} />
        </div>
      )}

      {/* Verify */}
      {phase === 'verify' && (
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <CountingVerify targetCount={myCount} onVerified={handleVerified} />
        </div>
      )}

      {/* Waiting for partner */}
      {phase === 'compare_wait' && (
        <div className="flex flex-col gap-3">
          {/* Show my canvas above while waiting */}
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden" style={{ height: 300 }}>
            <CollectionCanvas seed={mySeed} count={myCount} hideButton />
          </div>
          <div className="bg-white rounded-2xl shadow-xl p-5 flex flex-col items-center gap-2">
            <div className="text-3xl">⭐</div>
            <p className="text-lg font-bold text-teal-700">You counted <strong>{liveMyAnswer}</strong>!</p>
            <p className="text-gray-400 animate-pulse text-sm">Waiting for #{partnerNum} to finish…</p>
          </div>
        </div>
      )}

      {/* Compare — side-by-side canvases + comparison widget */}
      {phase === 'compare' && (
        <div className="flex flex-col gap-2">
          {/* Side-by-side canvases */}
          <div className="flex gap-2">
            <div className="flex-1 bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col" style={{ minHeight: 260 }}>
              <div className="px-3 py-1.5 bg-teal-50 border-b border-teal-200 text-xs font-bold text-teal-700">
                You (#{studentNumber}) — counted {liveMyAnswer ?? myAnswer}
              </div>
              <div className="flex-1">
                <CollectionCanvas seed={mySeed} count={myCount} hideButton />
              </div>
            </div>
            <div className="flex-1 bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col" style={{ minHeight: 260 }}>
              <div className="px-3 py-1.5 bg-orange-50 border-b border-orange-200 text-xs font-bold text-orange-700">
                Partner #{partnerNum} — counted {theirAnswer}
              </div>
              <div className="flex-1">
                <CollectionCanvas seed={theirSeed} count={theirCount} hideButton />
              </div>
            </div>
          </div>
          {/* Comparison widget */}
          <ComparePhase
            myNumber={liveMyAnswer ?? myAnswer}
            theirNumber={theirAnswer}
            myLabel={`You (#${studentNumber})`}
            theirLabel={`Partner #${partnerNum}`}
            onNewRound={handleNextRound}
            onLeave={onLeave}
          />
        </div>
      )}
    </div>
  );
}

// ── Lobby ─────────────────────────────────────────────────────────
export default function CountingCollectionPartner({ studentNumber, className: cls, onBack }) {
  const [activeGameId, setActiveGameId] = useState(null);

  const { data: allGames = [], refetch } = useQuery({
    queryKey: ['counting-partner', cls],
    queryFn: () => base44.entities.CountingCollectionPartnerGame.filter({ class_name: cls }),
    refetchInterval: 2000,
  });

  const myGame = allGames.find(g =>
    (g.player1_number === studentNumber || g.player2_number === studentNumber) && g.status !== 'done'
  ) || (activeGameId ? allGames.find(g => g.id === activeGameId) : null);

  const joinableGames = allGames.filter(g =>
    g.status === 'waiting' && g.player1_number !== studentNumber && !g.player2_number
  );

  const createGame = async () => {
    if (myGame) return;
    const g = await base44.entities.CountingCollectionPartnerGame.create({
      class_name: cls,
      player1_number: studentNumber,
      player1_seed: randomSeed(), player2_seed: randomSeed(),
      player1_count: randomCount(), player2_count: randomCount(),
      status: 'waiting', round_number: 1,
    });
    setActiveGameId(g.id);
    refetch();
  };

  const joinGame = async (openGame) => {
    await base44.entities.CountingCollectionPartnerGame.update(openGame.id, { player2_number: studentNumber, status: 'counting' });
    setActiveGameId(openGame.id);
    refetch();
  };

  const leaveGame = async (game) => {
    await base44.entities.CountingCollectionPartnerGame.delete(game.id);
    setActiveGameId(null);
    refetch();
  };

  if (myGame && (myGame.status === 'counting' || myGame.status === 'comparing')) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-teal-200 to-green-300 flex flex-col items-start py-4 px-3 overflow-y-auto">
        <GameView game={myGame} studentNumber={studentNumber} onLeave={() => leaveGame(myGame)} refetch={refetch} />
      </div>
    );
  }

  if (myGame && myGame.status === 'waiting') {
    const isHost = myGame.player1_number === studentNumber;
    const players = [myGame.player1_number, myGame.player2_number].filter(Boolean);
    return (
      <div className="min-h-screen bg-gradient-to-b from-teal-400 to-green-500 flex flex-col items-center justify-center gap-6 p-6">
        <h2 className="text-2xl font-bold text-white">🔢 Waiting Room</h2>
        <div className="bg-white/20 rounded-2xl p-5 w-full max-w-xs flex flex-col gap-3">
          {players.map(p => (
            <div key={p} className="flex items-center justify-between bg-white/20 rounded-xl px-4 py-2">
              <span className="text-white font-bold">#{p}</span>
              {p === myGame.player1_number && <span className="text-yellow-300 text-xs font-bold">HOST</span>}
            </div>
          ))}
          {players.length < 2 && <p className="text-white/50 text-sm text-center animate-pulse">Waiting for partner…</p>}
        </div>
        {isHost && (
          <motion.button whileTap={{ scale: 0.95 }}
            onClick={() => base44.entities.CountingCollectionPartnerGame.update(myGame.id, { status: 'counting' }).then(refetch)}
            disabled={players.length < 2}
            className="bg-green-500 disabled:opacity-40 text-white font-bold text-xl py-4 rounded-2xl shadow-lg w-full max-w-xs">
            {players.length < 2 ? 'Waiting…' : '▶ Start!'}
          </motion.button>
        )}
        <button onClick={() => leaveGame(myGame)} className="text-white/50 hover:text-white text-sm">← Leave</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-400 to-green-500 flex flex-col items-center justify-center gap-6 p-6">
      <button onClick={onBack} className="text-white/80 self-start hover:text-white">← Back</button>
      <div className="text-5xl">🔢</div>
      <h2 className="text-2xl font-bold text-white">Count & Compare Lobby</h2>
      <p className="text-white/70">Class: {cls} · You are #{studentNumber}</p>
      {joinableGames.length > 0 ? (
        <div className="w-full max-w-xs flex flex-col gap-3">
          <p className="text-white font-semibold">Open rooms:</p>
          {joinableGames.map(g => (
            <motion.button key={g.id} whileTap={{ scale: 0.95 }} onClick={() => joinGame(g)}
              className="bg-white text-teal-700 font-bold text-lg py-4 rounded-2xl shadow-lg w-full">
              #{g.player1_number}'s room
            </motion.button>
          ))}
          <div className="text-white/40 text-center text-sm">— or —</div>
          <motion.button whileTap={{ scale: 0.95 }} onClick={createGame}
            className="bg-white/20 hover:bg-white/30 text-white font-bold text-lg py-3 rounded-2xl border border-white/30">
            + Create My Room
          </motion.button>
        </div>
      ) : (
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} onClick={createGame}
          className="bg-white text-teal-700 font-bold text-2xl py-6 rounded-2xl shadow-lg w-full max-w-xs">
          + Create a Room
        </motion.button>
      )}
    </div>
  );
}