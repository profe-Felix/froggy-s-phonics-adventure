import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { buildCard, getCardUnion, checkBingo, getPointsForAttempt } from './literacyBingoUtils';

export default function LiteracyBingoPeerCard({ initialGame, playerNumber, className, onBack }) {
  const [game, setGame] = useState(initialGame);
  const [covered, setCovered] = useState(new Set());
  // Per-round state
  const [roundDone, setRoundDone] = useState(false);   // true once answered (correct or revealed)
  const [attempts, setAttempts] = useState(0);          // wrong attempts so far this round
  const [feedback, setFeedback] = useState(null);       // 'wrong' | 'correct' | 'reveal'
  const [roundPoints, setRoundPoints] = useState(null); // pts earned this round
  const [myPoints, setMyPoints] = useState(0);
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
      setRoundDone(false);
      setAttempts(0);
      setFeedback(null);
      setRoundPoints(null);
      playSound(game.current_item, game.mode);
    }
  }, [game.current_item]);

  const cells = buildCard(playerNumber, className, game.mode);

  const advanceItem = async (currentGame) => {
    const cardUnion = getCardUnion(currentGame.player1_number, currentGame.player2_number, currentGame.class_name, currentGame.mode);
    const remaining = cardUnion.filter(i => !(currentGame.called_items || []).includes(i));
    if (remaining.length === 0) {
      await base44.entities.LiteracyBingoGame.update(currentGame.id, { status: 'finished' });
      return;
    }
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    await base44.entities.LiteracyBingoGame.update(currentGame.id, {
      current_item: pick,
      called_items: [...(currentGame.called_items || []), pick],
      player1_ready: false,
      player2_ready: false,
    });
  };

  const submitReady = async (earnedPoints) => {
    if (myReady) return;
    const newTotal = myPoints + earnedPoints;
    setMyPoints(newTotal);
    const updated = await base44.entities.LiteracyBingoGame.update(game.id, {
      [myReadyField]: true,
      [myPointsField]: newTotal,
    });
    if (updated[otherReadyField]) {
      await advanceItem(updated);
    }
  };

  const handleNotOnCard = async () => {
    if (roundDone || myReady) return;
    const itemIsOnCard = cells.includes(game.current_item);
    if (itemIsOnCard) {
      // Wrong — it IS on their card
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      if (newAttempts >= 3) {
        setFeedback('reveal');
        setRoundDone(true);
        await submitReady(0);
      } else {
        setFeedback('not_on_card_wrong');
      }
    } else {
      // Correct — it really isn't on their card → award 10 pts
      setRoundPoints(10);
      setFeedback('not_on_card_correct');
      setRoundDone(true);
      await submitReady(10);
    }
  };

  const handleTileClick = async (item, idx) => {
    if (roundDone || myReady || !game.current_item) return;

    const isCorrect = item === game.current_item;

    if (isCorrect) {
      const pts = getPointsForAttempt(attempts);
      setRoundPoints(pts);
      setFeedback('correct');
      setRoundDone(true);

      // Cover the tile
      const nextCovered = new Set(covered);
      nextCovered.add(idx);
      setCovered(nextCovered);

      // Check bingo
      const bingo = checkBingo(nextCovered, cells.length);
      await submitReady(pts + (bingo ? 5 : 0));
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);

      if (newAttempts >= 3) {
        // Reveal answer — highlight correct tile, no points
        setFeedback('reveal');
        setRoundDone(true);
        await submitReady(0);
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
        <div className="text-white font-bold text-2xl">Your score: {myPoints} pts</div>
        <Button onClick={onBack} className="bg-white text-indigo-700 font-bold">Back to Lobby</Button>
      </div>
    );
  }

  const isSightWords = game.mode === 'sight_words_easy';
  const correctIdx = cells.indexOf(game.current_item);

  return (
    <div className="flex flex-col items-center gap-4 py-4 px-2 w-full">

      {/* Players + points */}
      <div className="flex gap-2 text-sm w-full justify-center flex-wrap">
        <span className={`px-3 py-1 rounded-full font-bold ${isPlayer1 ? 'bg-white text-indigo-700' : 'bg-white/20 text-white'}`}>
          #{game.player1_number}{isPlayer1 ? ' (You)' : ''} {game.player1_ready ? '✅' : ''}
          <span className="ml-1 bg-yellow-300 text-yellow-900 px-2 rounded-full text-xs font-black">
            {isPlayer1 ? myPoints : (game.player1_points || 0)}pts
          </span>
        </span>
        <span className="text-white/40 self-center">vs</span>
        <span className={`px-3 py-1 rounded-full font-bold ${!isPlayer1 ? 'bg-white text-indigo-700' : 'bg-white/20 text-white'}`}>
          #{game.player2_number}{!isPlayer1 ? ' (You)' : ''} {game.player2_ready ? '✅' : ''}
          <span className="ml-1 bg-yellow-300 text-yellow-900 px-2 rounded-full text-xs font-black">
            {!isPlayer1 ? myPoints : (game.player2_points || 0)}pts
          </span>
        </span>
      </div>

      {/* Audio prompt + feedback */}
      <div className="bg-white rounded-2xl shadow-lg p-5 flex flex-col items-center gap-2 w-full min-h-[110px] justify-center">
        {game.current_item ? (
          <>
            <button
              onClick={() => playSound(game.current_item, game.mode)}
              className="w-16 h-16 rounded-full bg-indigo-100 hover:bg-indigo-200 active:scale-95 transition flex items-center justify-center text-4xl shadow"
            >
              🔊
            </button>
            <div className="text-xs text-gray-400">Tap to hear again</div>

            {(feedback === 'wrong' || feedback === 'not_on_card_wrong') && (
              <div className="text-red-500 font-bold text-sm bg-red-50 rounded-lg px-3 py-1">
                {feedback === 'not_on_card_wrong' ? '🔎 It IS on your card! Look again.' : `❌ Try again! (${attempts === 1 ? '5pts' : '1pt'} if correct next)`}
              </div>
            )}
            {(feedback === 'correct' || feedback === 'not_on_card_correct') && (
              <div className="text-green-600 font-bold text-sm bg-green-50 rounded-lg px-3 py-1">
                ✅ {feedback === 'not_on_card_correct' ? 'Correct — not on your card!' : 'Correct!'} +{roundPoints} pts
              </div>
            )}
            {feedback === 'reveal' && (
              <div className="text-orange-500 font-bold text-sm bg-orange-50 rounded-lg px-3 py-1">
                The answer is highlighted below
              </div>
            )}

            {!roundDone && !myReady && (
              <button
                onClick={handleNotOnCard}
                className="text-sm bg-orange-100 hover:bg-orange-200 text-orange-700 border border-orange-300 rounded-full px-4 py-1 font-medium mt-1"
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
          // Disable clicking if round is done or already covered
          const clickable = !roundDone && !myReady && !isCovered;
          return (
            <button
              key={idx}
              onClick={() => clickable && handleTileClick(item, idx)}
              className={`relative border-2 rounded-xl bg-white flex items-center justify-center font-bold text-gray-800 shadow select-none px-2
                ${isSightWords ? 'h-24' : 'h-16'}
                ${isReveal ? 'border-orange-400' : 'border-gray-700'}
                ${!clickable ? 'cursor-default' : 'active:scale-95 transition-transform'}`}
            >
              <span className={`text-center leading-tight break-words w-full ${isSightWords ? 'text-xl font-bold' : 'text-3xl uppercase font-bold'}`}>
                {item}
              </span>
              {isCovered && <div className="absolute inset-1 rounded-lg bg-yellow-400/70 border-2 border-yellow-500 pointer-events-none" />}
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
            onClick={() => submitReady(0)}
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