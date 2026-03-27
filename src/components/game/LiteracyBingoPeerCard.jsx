import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { buildCard, getCardUnion, checkBingo, getPointsForAttempt } from './literacyBingoUtils';

export default function LiteracyBingoPeerCard({ initialGame, playerNumber, className, onBack }) {
  const [game, setGame] = useState(initialGame);
  const [covered, setCovered] = useState(new Set());
  const [respondedItem, setRespondedItem] = useState(null);
  const [attempts, setAttempts] = useState(0); // attempts for current item
  const [feedback, setFeedback] = useState(null); // 'wrong' | 'correct' | 'reveal'
  const [myPoints, setMyPoints] = useState(0);
  const [hasBingo, setHasBingo] = useState(false);
  const audioRef = useRef(null);
  const audioCache = useRef({});

  const playSound = (item, mode) => {
    const path = mode === 'letter_sounds'
      ? `/letter-sounds/${encodeURIComponent(item)}.mp3`
      : `/sight-word-audio/${encodeURIComponent(item)}.mp3`;
    if (!audioCache.current[path]) audioCache.current[path] = new Audio(path);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    audioRef.current = audioCache.current[path];
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
  };

  const isPlayer1 = playerNumber === game.player1_number;
  const myReadyField = isPlayer1 ? 'player1_ready' : 'player2_ready';
  const otherReadyField = isPlayer1 ? 'player2_ready' : 'player1_ready';
  const myPointsField = isPlayer1 ? 'player1_points' : 'player2_points';
  const otherPlayerNumber = isPlayer1 ? game.player2_number : game.player1_number;
  const myReady = game[myReadyField] || false;
  const otherReady = game[otherReadyField] || false;

  useEffect(() => {
    const unsubscribe = base44.entities.LiteracyBingoGame.subscribe((event) => {
      if (event.id === game.id && event.type !== 'delete') {
        setGame(event.data);
      }
    });
    return unsubscribe;
  }, [game.id]);

  // Reset per-round state when item changes
  useEffect(() => {
    if (game.current_item) {
      setRespondedItem(null);
      setAttempts(0);
      setFeedback(null);
      playSound(game.current_item, game.mode);
    }
  }, [game.current_item]);

  const cells = buildCard(playerNumber, className, game.mode);

  const advanceItem = async (currentGame) => {
    const cardUnion = getCardUnion(currentGame.player1_number, currentGame.player2_number, currentGame.class_name, currentGame.mode);
    const remaining = cardUnion.filter(i => !(currentGame.called_items || []).includes(i));
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    await base44.entities.LiteracyBingoGame.update(currentGame.id, {
      current_item: pick,
      called_items: [...(currentGame.called_items || []), pick],
      player1_ready: false,
      player2_ready: false,
    });
  };

  const markReady = async (extraPoints = 0) => {
    if (myReady) return;
    const totalPoints = myPoints + extraPoints;
    const updated = await base44.entities.LiteracyBingoGame.update(game.id, {
      [myReadyField]: true,
      [myPointsField]: totalPoints,
    });
    if (updated[otherReadyField]) {
      await advanceItem(updated);
    }
  };

  const handleNotOnCard = async () => {
    if (!game.current_item || respondedItem === game.current_item || myReady) return;
    setRespondedItem(game.current_item);
    await markReady(0);
  };

  const handleTileClick = async (item, idx) => {
    if (item === 'FREE' || myReady || !game.current_item) return;
    if (respondedItem === game.current_item) return;

    const isCorrect = item === game.current_item;

    if (isCorrect) {
      const pts = getPointsForAttempt(attempts);
      setMyPoints(prev => prev + pts);
      setCovered(prev => {
        const next = new Set(prev);
        next.add(idx);
        return next;
      });
      setFeedback('correct');
      setRespondedItem(game.current_item);

      // Check bingo
      const nextCovered = new Set(covered);
      nextCovered.add(idx);
      const bingo = checkBingo(nextCovered, cells.length);
      if (bingo && !hasBingo) {
        setHasBingo(true);
        await markReady(pts + 5); // +5 for bingo
        return;
      }
      await markReady(pts);
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      if (newAttempts >= 3) {
        // Reveal the answer — highlight correct tile
        setFeedback('reveal');
        setRespondedItem(game.current_item);
        await markReady(0);
      } else {
        setFeedback('wrong');
      }
    }
  };

  const leaveGame = async () => {
    await base44.entities.LiteracyBingoGame.update(game.id, { status: 'finished' });
    onBack();
  };

  if (game.status === 'waiting') {
    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-sm mx-auto w-full">
        <h2 className="text-2xl font-bold text-white">⏳ Waiting for Friend...</h2>
        <div className="bg-white/20 rounded-2xl p-8 text-center w-full">
          <div className="text-5xl mb-4">👋</div>
          <p className="text-white text-lg font-bold">You are #{playerNumber}</p>
          <p className="text-white/70 mt-2">Tell a classmate to join your game!</p>
        </div>
        <button onClick={leaveGame} className="text-white/70 hover:text-white text-sm">← Cancel</button>
      </div>
    );
  }

  if (game.status === 'finished') {
    return (
      <div className="flex flex-col items-center gap-6 p-6">
        <div className="text-6xl">🏆</div>
        <h2 className="text-2xl font-bold text-white">Game Over!</h2>
        <p className="text-white/70">Great game!</p>
        <div className="text-white font-bold text-xl">Your score: {myPoints} pts</div>
        <Button onClick={onBack} className="bg-white text-indigo-700 font-bold">Back to Lobby</Button>
      </div>
    );
  }

  const isSightWords = game.mode === 'sight_words_easy';
  const correctIdx = cells.indexOf(game.current_item);

  return (
    <div className="flex flex-col items-center gap-4 py-4 px-2 w-full">
      {/* Players + points */}
      <div className="flex gap-3 text-sm w-full justify-center">
        <span className={`px-3 py-1 rounded-full font-bold ${isPlayer1 ? 'bg-white text-indigo-700' : 'bg-white/20 text-white'}`}>
          #{game.player1_number}{isPlayer1 ? ' (You)' : ''} {game.player1_ready ? '✅' : ''} · {isPlayer1 ? myPoints : (game.player1_points || 0)}pts
        </span>
        <span className="text-white/40 self-center">vs</span>
        <span className={`px-3 py-1 rounded-full font-bold ${!isPlayer1 ? 'bg-white text-indigo-700' : 'bg-white/20 text-white'}`}>
          #{game.player2_number}{!isPlayer1 ? ' (You)' : ''} {game.player2_ready ? '✅' : ''} · {!isPlayer1 ? myPoints : (game.player2_points || 0)}pts
        </span>
      </div>

      {/* Audio prompt */}
      <div className="bg-white rounded-2xl shadow-lg p-5 flex flex-col items-center gap-3 w-full min-h-[100px] justify-center">
        {game.current_item ? (
          <>
            <button
              onClick={() => playSound(game.current_item, game.mode)}
              className="w-20 h-20 rounded-full bg-indigo-100 hover:bg-indigo-200 active:scale-95 transition flex items-center justify-center text-5xl shadow"
            >
              🔊
            </button>
            <div className="text-xs text-gray-400">Tap to hear again</div>
            {feedback === 'wrong' && (
              <div className="text-red-500 font-bold text-sm">❌ Try again! ({attempts === 1 ? '5' : '1'} pts if correct)</div>
            )}
            {feedback === 'correct' && (
              <div className="text-green-600 font-bold text-sm">✅ Correct! +{getPointsForAttempt(attempts - 1)} pts{hasBingo ? ' + 5 BINGO!' : ''}</div>
            )}
            {feedback === 'reveal' && (
              <div className="text-orange-500 font-bold text-sm">The answer is highlighted below</div>
            )}
            {!respondedItem && !myReady && (
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

      {/* Bingo card */}
      <div className={`grid gap-2 w-full ${isSightWords ? 'grid-cols-3' : 'grid-cols-4'}`}>
        {cells.map((item, idx) => {
          const isCovered = covered.has(idx);
          const isReveal = feedback === 'reveal' && idx === correctIdx;
          return (
            <button
              key={idx}
              onClick={() => handleTileClick(item, idx)}
              className={`relative border-2 rounded-xl bg-white flex items-center justify-center font-bold text-gray-800 shadow select-none px-2 ${isSightWords ? 'h-24' : 'h-16'} ${isReveal ? 'border-orange-400' : 'border-gray-700'}`}
            >
              <span className={`text-center leading-tight break-words w-full ${isSightWords ? 'text-xl font-bold' : 'text-3xl uppercase font-bold'}`}>{item}</span>
              {isCovered && <div className="absolute inset-1 rounded-lg bg-yellow-400/60 border-2 border-yellow-500 pointer-events-none" />}
              {isReveal && <div className="absolute inset-1 rounded-lg bg-orange-300/70 border-2 border-orange-400 pointer-events-none" />}
            </button>
          );
        })}
      </div>

      {/* Ready button */}
      <div className="w-full">
        {myReady ? (
          <div className="text-center text-white font-bold text-lg py-3">
            ✅ Ready! {otherReady ? '➡️ Next...' : `Waiting for #${otherPlayerNumber}...`}
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

      <button onClick={leaveGame} className="text-white/50 hover:text-white text-sm">← Leave Game</button>
    </div>
  );
}