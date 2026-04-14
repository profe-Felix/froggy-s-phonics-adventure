import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import TenFrame from './TenFrame';
import { Button } from '@/components/ui/button';
import { getPointsForAttempt } from '@/components/game/literacyBingoUtils';

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

function checkBingo(coveredSet, cells) {
  const size = 3;
  for (let r = 0; r < size; r++) {
    if ([0, 1, 2].map(c => r * size + c).every(i => coveredSet.has(i))) return true;
  }
  for (let c = 0; c < size; c++) {
    if ([0, 1, 2].map(r => r * size + c).every(i => coveredSet.has(i))) return true;
  }
  if ([0, 4, 8].every(i => coveredSet.has(i))) return true;
  if ([2, 4, 6].every(i => coveredSet.has(i))) return true;
  return false;
}

export default function BingoPeerCard({ initialGame, playerNumber, className, onBack }) {
  const [game, setGame] = useState(initialGame);
  const [covered, setCovered] = useState(new Set());
  const [respondedNumber, setRespondedNumber] = useState(null);
  const [attempts, setAttempts] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [myPoints, setMyPoints] = useState(0);
  const [hasBingo, setHasBingo] = useState(false);
  const calledAtRef = useRef(null);

  const players = game.players || [];
  const readyPlayers = game.ready_players || [];
  const playerPoints = game.player_points || {};
  const amReady = readyPlayers.includes(playerNumber);

  useEffect(() => {
    const unsubscribe = base44.entities.MathBingoPeerGame.subscribe((event) => {
      if (event.id === game.id && event.type !== 'delete') {
        setGame(event.data);
      }
    });
    return unsubscribe;
  }, [game.id]);

  useEffect(() => {
    if (game.current_number) {
      calledAtRef.current = Date.now();
      setRespondedNumber(null);
      setAttempts(0);
      setFeedback(null);
    }
  }, [game.current_number]);

  const cells = buildCells(playerNumber, className, game.min_number ?? 10, game.max_number ?? 20, game.free_space ?? true);

  const advanceNumber = async (currentGame) => {
    const allNums = [];
    for (let n = (currentGame.min_number ?? 10); n <= (currentGame.max_number ?? 20); n++) allNums.push(n);
    const remaining = allNums.filter(n => !(currentGame.called_numbers || []).includes(n));
    if (remaining.length === 0) {
      await base44.entities.MathBingoPeerGame.update(currentGame.id, {
        status: 'finished',
        ready_players: [],
      });
      return;
    }
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    await base44.entities.MathBingoPeerGame.update(currentGame.id, {
      current_number: pick,
      called_numbers: [...(currentGame.called_numbers || []), pick],
      ten_frame_seed: Math.floor(Math.random() * 999999),
      ready_players: [],
    });
  };

  const markReady = async (extraPoints = 0) => {
    if (amReady) return;
    const totalPoints = myPoints + extraPoints;
    const newReadyPlayers = [...readyPlayers, playerNumber];
    const newPlayerPoints = { ...playerPoints, [String(playerNumber)]: totalPoints };

    const updated = await base44.entities.MathBingoPeerGame.update(game.id, {
      ready_players: newReadyPlayers,
      player_points: newPlayerPoints,
    });

    // If all players are ready, advance
    const gamePlayers = updated.players || [];
    const nowReady = updated.ready_players || [];
    const allReady = gamePlayers.length > 0 && gamePlayers.every(p => nowReady.includes(p));
    if (allReady) {
      await advanceNumber(updated);
    }
  };

  // Watchdog: if ALL players show ready in the live game state but number hasn't advanced,
  // the player who submitted last may have missed the allReady check due to a race.
  // Lowest-numbered player breaks the tie and calls advanceNumber.
  useEffect(() => {
    if (game.status !== 'active') return;
    const gamePlayers = game.players || [];
    const nowReady = game.ready_players || [];
    const allReady = gamePlayers.length > 0 && gamePlayers.every(p => nowReady.includes(p));
    if (!allReady) return;
    // Only the lowest-numbered player acts as tiebreaker
    const lowestPlayer = Math.min(...gamePlayers);
    if (playerNumber !== lowestPlayer) return;
    const timer = setTimeout(() => {
      // Re-fetch freshest state before acting
      base44.entities.MathBingoPeerGame.filter({ class_name: game.class_name }).then(games => {
        const fresh = games.find(g => g.id === game.id);
        if (!fresh) return;
        const fp = fresh.players || [];
        const fr = fresh.ready_players || [];
        if (fp.length > 0 && fp.every(p => fr.includes(p))) {
          advanceNumber(fresh);
        }
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [game.ready_players, game.players, game.status]);

  const handleNotOnCard = async () => {
    if (!game.current_number || respondedNumber === game.current_number || amReady) return;
    const numberOnCard = cells.some(c => c === game.current_number);
    if (numberOnCard) {
      // Wrong — it IS on their card, penalize like a wrong tile click
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      if (newAttempts >= 3) {
        setFeedback('reveal');
        setRespondedNumber(game.current_number);
        await base44.entities.MathBingoResponse.create({
          game_id: game.id, class_name: className, student_number: playerNumber,
          called_number: game.current_number, clicked_number: null,
          is_correct: false, response_time_ms: calledAtRef.current ? Date.now() - calledAtRef.current : null,
          not_on_card: true, free_space_click: false,
        });
        await markReady(0);
      } else {
        setFeedback('check_again');
      }
      return;
    }
    // Correct — it's genuinely not on their card
    setRespondedNumber(game.current_number);
    const pts = getPointsForAttempt(attempts);
    setMyPoints(prev => prev + pts);
    setFeedback('correct');
    await base44.entities.MathBingoResponse.create({
      game_id: game.id, class_name: className, student_number: playerNumber,
      called_number: game.current_number, clicked_number: null,
      is_correct: true, response_time_ms: calledAtRef.current ? Date.now() - calledAtRef.current : null,
      not_on_card: true, free_space_click: false,
    });
    await markReady(pts);
  };

  const handleTileClick = async (num, idx) => {
    const isFree = num === 'FREE';
    if (isFree || !game.current_number || amReady) return;
    if (respondedNumber === game.current_number) return;

    const isCorrect = num === game.current_number;
    const responseTimeMs = calledAtRef.current ? Date.now() - calledAtRef.current : null;

    await base44.entities.MathBingoResponse.create({
      game_id: game.id, class_name: className, student_number: playerNumber,
      called_number: game.current_number, clicked_number: num,
      is_correct: isCorrect, response_time_ms: responseTimeMs,
      not_on_card: false, free_space_click: false,
    });

    if (isCorrect) {
      const pts = getPointsForAttempt(attempts);
      setMyPoints(prev => prev + pts);
      setCovered(prev => { const next = new Set(prev); next.add(idx); return next; });
      setFeedback('correct');
      setRespondedNumber(game.current_number);
      const nextCovered = new Set(covered);
      nextCovered.add(idx);
      if (checkBingo(nextCovered, cells) && !hasBingo) {
        setHasBingo(true);
        await markReady(pts + 5);
        return;
      }
      await markReady(pts);
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      if (newAttempts >= 3) {
        setFeedback('reveal');
        setRespondedNumber(game.current_number);
        await markReady(0);
      } else {
        setFeedback('wrong');
      }
    }
  };

  if (game.status === 'finished') {
    // Sort players by points descending
    const sorted = [...players].sort((a, b) => (playerPoints[String(b)] || 0) - (playerPoints[String(a)] || 0));
    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-sm mx-auto w-full">
        <div className="text-6xl">🏆</div>
        <h2 className="text-2xl font-bold text-white">Game Over!</h2>
        <div className="bg-white/20 rounded-2xl p-4 w-full flex flex-col gap-2">
          {sorted.map((p, i) => (
            <div key={p} className={`flex items-center justify-between px-4 py-2 rounded-xl font-bold ${p === playerNumber ? 'bg-white text-indigo-700' : 'bg-white/20 text-white'}`}>
              <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} #{p}{p === playerNumber ? ' (you)' : ''}</span>
              <span>{playerPoints[String(p)] || 0} pts</span>
            </div>
          ))}
        </div>
        <Button onClick={onBack} className="bg-white text-indigo-700 font-bold">Back to Lobby</Button>
      </div>
    );
  }

  const correctIdx = cells.indexOf(game.current_number);
  const waitingFor = players.filter(p => !readyPlayers.includes(p) && p !== playerNumber);

  return (
    <div className="flex flex-col items-center gap-4 py-4 px-4 w-full max-w-sm mx-auto">

      {/* All players scoreboard */}
      <div className="flex flex-wrap gap-2 justify-center w-full">
        {players.map(p => (
          <span key={p} className={`px-3 py-1 rounded-full font-bold text-sm ${p === playerNumber ? 'bg-white text-indigo-700' : 'bg-white/20 text-white'}`}>
            #{p}{p === playerNumber ? ' (You)' : ''} {readyPlayers.includes(p) ? '✅' : ''} · {p === playerNumber ? myPoints : (playerPoints[String(p)] || 0)}pts
          </span>
        ))}
      </div>

      {/* Ten frame display */}
      <div className="bg-white rounded-2xl shadow-lg p-5 flex flex-col items-center gap-3 w-full">
        {game.current_number ? (
          <>
            <TenFrame value={game.current_number} size="md" seed={game.ten_frame_seed ?? 42} />
            {feedback === 'wrong' && (
              <div className="text-red-500 font-bold text-sm">❌ Try again! ({attempts === 1 ? '5' : '1'} pts if correct)</div>
            )}
            {feedback === 'check_again' && (
              <div className="text-orange-500 font-bold text-sm">👀 Check again — it IS on your card! ({attempts === 1 ? '5' : '1'} pts if correct)</div>
            )}
            {feedback === 'correct' && (
              <div className="text-green-600 font-bold text-sm">✅ Correct! +{getPointsForAttempt(attempts)} pts{hasBingo ? ' + 5 BINGO!' : ''}</div>
            )}
            {feedback === 'reveal' && (
              <div className="text-orange-500 font-bold text-sm">The answer is highlighted below</div>
            )}
            {respondedNumber !== game.current_number && !amReady && (
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
          const isReveal = feedback === 'reveal' && idx === correctIdx;
          return (
            <button
              key={idx}
              onClick={() => handleTileClick(num, idx)}
              className={`relative w-20 h-20 border-2 rounded-lg bg-white flex items-center justify-center font-bold text-2xl text-gray-800 shadow select-none ${isReveal ? 'border-orange-400' : 'border-gray-700'}`}
            >
              {isFree ? <span className="text-xs font-bold text-green-600">FREE</span> : num}
              {isCovered && <div className="absolute inset-1 rounded-md bg-yellow-400/60 border-2 border-yellow-500 pointer-events-none" />}
              {isFree && !isCovered && <div className="absolute inset-0 rounded-md bg-green-100/60 pointer-events-none" />}
              {isReveal && <div className="absolute inset-1 rounded-md bg-orange-300/70 border-2 border-orange-400 pointer-events-none" />}
            </button>
          );
        })}
      </div>

      {/* Ready status */}
      <div className="w-full">
        {amReady ? (
          <div className="text-center text-white font-bold text-base py-3">
            ✅ Ready! {waitingFor.length > 0 ? `Waiting for ${waitingFor.map(p => '#' + p).join(', ')}…` : '🎲 Next number coming…'}
          </div>
        ) : (
          <Button
            onClick={() => markReady(0)}
            className="bg-green-500 hover:bg-green-600 text-white text-lg px-8 py-4 h-auto w-full rounded-2xl"
          >
            ✅ Ready for Next
          </Button>
        )}
      </div>

      <button
        onClick={async () => {
          await base44.entities.MathBingoPeerGame.update(game.id, { status: 'finished' });
          onBack();
        }}
        className="text-white/50 hover:text-white text-sm"
      >← Leave Game</button>
    </div>
  );
}