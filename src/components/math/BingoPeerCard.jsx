import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import TenFrame from './TenFrame';
import { Button } from '@/components/ui/button';

function buildCells(playerNumber, className, minNumber, maxNumber, freeSpace) {
  const allNums = [];
  for (let n = minNumber; n <= maxNumber; n++) allNums.push(n);

  function uniqueShuffle(arr, seed) {
    const a = [...arr];
    let s = seed;
    for (let i = a.length - 1; i > 0; i--) {
      s = ((s ^ (s << 13)) ^ (s >> 7) ^ (s << 17)) >>> 0;
      const j = s % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const classSeed = (className || '').split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 7), 0);
  const seed = ((playerNumber || 1) * 999983 + classSeed * 31337 + 1234567) >>> 0;
  const shuffled = uniqueShuffle(allNums, seed);

  if (freeSpace) {
    const eight = shuffled.slice(0, 8);
    return [...eight.slice(0, 4), 'FREE', ...eight.slice(4)];
  }
  return shuffled.slice(0, 9);
}

export default function BingoPeerCard({ initialGame, playerNumber, className, onBack }) {
  const [game, setGame] = useState(initialGame);
  const [covered, setCovered] = useState(new Set());
  const [respondedNumber, setRespondedNumber] = useState(null);
  const calledAtRef = useRef(null);

  const isPlayer1 = playerNumber === game.player1_number;
  const myReadyField = isPlayer1 ? 'player1_ready' : 'player2_ready';
  const otherReadyField = isPlayer1 ? 'player2_ready' : 'player1_ready';
  const otherPlayerNumber = isPlayer1 ? game.player2_number : game.player1_number;
  const myReady = game[myReadyField] || false;
  const otherReady = game[otherReadyField] || false;

  // Real-time sync via subscription
  useEffect(() => {
    const unsubscribe = base44.entities.MathBingoPeerGame.subscribe((event) => {
      if (event.id === game.id && event.type !== 'delete') {
        setGame(event.data);
      }
    });
    return unsubscribe;
  }, [game.id]);

  // Reset response state on new number
  useEffect(() => {
    if (game.current_number) {
      calledAtRef.current = Date.now();
      setRespondedNumber(null);
    }
  }, [game.current_number]);

  const cells = buildCells(playerNumber, className, game.min_number ?? 10, game.max_number ?? 20, game.free_space ?? true);

  const advanceNumber = async (currentGame) => {
    const allNums = [];
    for (let n = (currentGame.min_number ?? 10); n <= (currentGame.max_number ?? 20); n++) allNums.push(n);
    const remaining = allNums.filter(n => !(currentGame.called_numbers || []).includes(n));
    if (remaining.length === 0) {
      await base44.entities.MathBingoPeerGame.update(currentGame.id, {
        status: 'finished', player1_ready: false, player2_ready: false,
      });
      return;
    }
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    await base44.entities.MathBingoPeerGame.update(currentGame.id, {
      current_number: pick,
      called_numbers: [...(currentGame.called_numbers || []), pick],
      ten_frame_seed: Math.floor(Math.random() * 999999),
      player1_ready: false,
      player2_ready: false,
    });
  };

  const markReady = async () => {
    if (myReady) return;
    const updated = await base44.entities.MathBingoPeerGame.update(game.id, { [myReadyField]: true });
    if (updated[otherReadyField]) {
      await advanceNumber(updated);
    }
  };

  const handleNotOnCard = async () => {
    if (!game.current_number || respondedNumber === game.current_number) return;
    setRespondedNumber(game.current_number);
    const responseTimeMs = calledAtRef.current ? Date.now() - calledAtRef.current : null;
    await base44.entities.MathBingoResponse.create({
      game_id: game.id,
      class_name: className,
      student_number: playerNumber,
      called_number: game.current_number,
      clicked_number: null,
      is_correct: false,
      response_time_ms: responseTimeMs,
      not_on_card: true,
      free_space_click: false,
    });
    await markReady();
  };

  const handleTileClick = async (num, idx) => {
    setCovered(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
    const isFree = num === 'FREE';
    if (!game.current_number || isFree) return;
    if (respondedNumber === game.current_number) return;
    setRespondedNumber(game.current_number);
    const responseTimeMs = calledAtRef.current ? Date.now() - calledAtRef.current : null;
    await base44.entities.MathBingoResponse.create({
      game_id: game.id,
      class_name: className,
      student_number: playerNumber,
      called_number: game.current_number,
      clicked_number: num,
      is_correct: num === game.current_number,
      response_time_ms: responseTimeMs,
      not_on_card: false,
      free_space_click: false,
    });
  };

  // Waiting for player 2
  if (game.status === 'waiting') {
    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-sm mx-auto w-full">
        <h2 className="text-2xl font-bold text-white">⏳ Waiting for Friend...</h2>
        <div className="bg-white/20 rounded-2xl p-8 text-center w-full">
          <div className="text-5xl mb-4">👋</div>
          <p className="text-white text-lg font-bold">You are #{playerNumber}</p>
          <p className="text-white/70 mt-2">Tell a classmate to join your game in the lobby!</p>
        </div>
        <button onClick={onBack} className="text-white/70 hover:text-white text-sm">← Cancel</button>
      </div>
    );
  }

  if (game.status === 'finished') {
    return (
      <div className="flex flex-col items-center gap-6 p-6">
        <div className="text-6xl">🏆</div>
        <h2 className="text-2xl font-bold text-white">All numbers called!</h2>
        <p className="text-white/70">Great game!</p>
        <Button onClick={onBack} className="bg-white text-indigo-700 font-bold">Back to Lobby</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-4 px-4 w-full max-w-sm mx-auto">
      {/* Players status */}
      <div className="flex gap-3 text-sm w-full justify-center">
        <span className={`px-3 py-1 rounded-full font-bold ${isPlayer1 ? 'bg-white text-indigo-700' : 'bg-white/20 text-white'}`}>
          #{game.player1_number}{isPlayer1 ? ' (You)' : ''} {game.player1_ready ? '✅' : ''}
        </span>
        <span className="text-white/40 self-center">vs</span>
        <span className={`px-3 py-1 rounded-full font-bold ${!isPlayer1 ? 'bg-white text-indigo-700' : 'bg-white/20 text-white'}`}>
          #{game.player2_number}{!isPlayer1 ? ' (You)' : ''} {game.player2_ready ? '✅' : ''}
        </span>
      </div>

      {/* Ten frame display */}
      <div className="bg-white rounded-2xl shadow-lg p-5 flex flex-col items-center gap-3 w-full">
        {game.current_number ? (
          <>
            <TenFrame value={game.current_number} size="md" seed={game.ten_frame_seed ?? 42} />
            {respondedNumber !== game.current_number && !myReady && (
              <button
                onClick={handleNotOnCard}
                className="text-sm bg-orange-100 hover:bg-orange-200 text-orange-700 border border-orange-300 rounded-full px-4 py-1 font-medium"
              >
                Not on my card
              </button>
            )}
          </>
        ) : (
          <div className="text-gray-400">Waiting...</div>
        )}
      </div>

      {/* Bingo grid */}
      <div className="grid grid-cols-3 gap-2">
        {cells.map((num, idx) => {
          const isCovered = covered.has(idx);
          const isFree = num === 'FREE';
          return (
            <button
              key={idx}
              onClick={() => handleTileClick(num, idx)}
              className="relative w-20 h-20 border-2 border-gray-700 rounded-lg bg-white flex items-center justify-center font-bold text-2xl text-gray-800 shadow select-none"
            >
              {isFree ? <span className="text-xs font-bold text-green-600">FREE</span> : num}
              {isCovered && <div className="absolute inset-1 rounded-md bg-yellow-400/60 border-2 border-yellow-500 pointer-events-none" />}
              {isFree && !isCovered && <div className="absolute inset-0 rounded-md bg-green-100/60 pointer-events-none" />}
            </button>
          );
        })}
      </div>

      {/* Ready button */}
      <div className="w-full">
        {myReady ? (
          <div className="text-center text-white font-bold text-lg py-3">
            ✅ Ready! {otherReady ? '🎲 Next number coming...' : `Waiting for #${otherPlayerNumber}...`}
          </div>
        ) : (
          <Button
            onClick={markReady}
            className="bg-green-500 hover:bg-green-600 text-white text-lg px-8 py-4 h-auto w-full rounded-2xl"
          >
            ✅ Ready for Next
          </Button>
        )}
      </div>

      {/* Called numbers */}
      {(game.called_numbers || []).length > 0 && (
        <div className="bg-white/20 rounded-xl p-3 w-full">
          <div className="text-white/70 text-xs mb-1">Called: {(game.called_numbers || []).length}</div>
          <div className="flex flex-wrap gap-1">
            {(game.called_numbers || []).map(n => (
              <span key={n} className={`px-2 py-0.5 rounded-full text-xs font-bold ${n === game.current_number ? 'bg-yellow-400 text-gray-900' : 'bg-white/70 text-gray-700'}`}>
                {n}
              </span>
            ))}
          </div>
        </div>
      )}

      <button onClick={onBack} className="text-white/50 hover:text-white text-sm">← Leave Game</button>
    </div>
  );
}