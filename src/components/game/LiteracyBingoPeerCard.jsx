import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { buildCard, getCardUnion, checkBingo, getPointsForAttempt } from './literacyBingoUtils';

export default function LiteracyBingoPeerCard({ initialGame, playerNumber, className, onBack }) {
  const [game, setGame] = useState(initialGame);
  const [covered, setCovered] = useState(new Set());
  const [roundDone, setRoundDone] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [roundPoints, setRoundPoints] = useState(null);
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

  const players = game.players || [];
  const readyPlayers = game.ready_players || [];
  const playerPoints = game.player_points || {};
  const amReady = readyPlayers.includes(playerNumber);

  useEffect(() => {
    const unsubscribe = base44.entities.LiteracyBingoGame.subscribe((event) => {
      if (event.id === game.id && event.type !== 'delete') setGame(event.data);
    });
    return unsubscribe;
  }, [game.id]);

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
    const cardUnion = getCardUnion(currentGame.players || [], currentGame.class_name, currentGame.mode);
    const remaining = cardUnion.filter(i => !(currentGame.called_items || []).includes(i));
    if (remaining.length === 0) {
      await base44.entities.LiteracyBingoGame.update(currentGame.id, { status: 'finished', ready_players: [] });
      return;
    }
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    await base44.entities.LiteracyBingoGame.update(currentGame.id, {
      current_item: pick,
      called_items: [...(currentGame.called_items || []), pick],
      ready_players: [],
    });
  };

  const markReady = async (extraPoints = 0) => {
    if (amReady) return;
    const total = myPoints + extraPoints;
    const newReadyPlayers = [...readyPlayers, playerNumber];
    const newPlayerPoints = { ...playerPoints, [String(playerNumber)]: total };

    const updated = await base44.entities.LiteracyBingoGame.update(game.id, {
      ready_players: newReadyPlayers,
      player_points: newPlayerPoints,
    });

    const gamePlayers = updated.players || [];
    const nowReady = updated.ready_players || [];
    const allReady = gamePlayers.length > 0 && gamePlayers.every(p => nowReady.includes(p));
    if (allReady) await advanceItem(updated);
  };

  const handleNotOnCard = async () => {
    if (roundDone || amReady) return;
    const itemIsOnCard = cells.includes(game.current_item);
    if (itemIsOnCard) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      if (newAttempts >= 3) {
        setFeedback('reveal');
        setRoundDone(true);
        await markReady(0);
      } else {
        setFeedback('not_on_card_wrong');
      }
    } else {
      setRoundPoints(10);
      setFeedback('not_on_card_correct');
      setRoundDone(true);
      setMyPoints(prev => prev + 10);
      await markReady(10);
    }
  };

  const handleTileClick = async (item, idx) => {
    if (roundDone || amReady || !game.current_item) return;
    const isCorrect = item === game.current_item;
    if (isCorrect) {
      const pts = getPointsForAttempt(attempts);
      setRoundPoints(pts);
      setFeedback('correct');
      setRoundDone(true);
      const nextCovered = new Set(covered);
      nextCovered.add(idx);
      setCovered(nextCovered);
      const bingo = checkBingo(nextCovered, cells.length);
      if (bingo && !hasBingo) setHasBingo(true);
      setMyPoints(prev => prev + pts + (bingo ? 5 : 0));
      await markReady(pts + (bingo ? 5 : 0));
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      if (newAttempts >= 3) {
        setFeedback('reveal');
        setRoundDone(true);
        await markReady(0);
      } else {
        setFeedback('wrong');
      }
    }
  };

  // Finished screen — stays until student clicks
  if (game.status === 'finished') {
    const sorted = [...players].sort((a, b) =>
      (b === playerNumber ? myPoints : (playerPoints[String(b)] || 0)) -
      (a === playerNumber ? myPoints : (playerPoints[String(a)] || 0))
    );
    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-sm mx-auto w-full">
        <div className="text-6xl">🏆</div>
        <h2 className="text-2xl font-bold text-white">Game Over!</h2>
        <div className="bg-white/20 rounded-2xl p-4 w-full flex flex-col gap-2">
          {sorted.map((p, i) => {
            const pts = p === playerNumber ? myPoints : (playerPoints[String(p)] || 0);
            return (
              <div key={p} className={`flex items-center justify-between px-4 py-2 rounded-xl font-bold ${p === playerNumber ? 'bg-white text-indigo-700' : 'bg-white/20 text-white'}`}>
                <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} #{p}{p === playerNumber ? ' (you)' : ''}</span>
                <span>{pts} pts</span>
              </div>
            );
          })}
        </div>
        <Button onClick={onBack} className="bg-white text-indigo-700 font-bold">Back to Lobby</Button>
      </div>
    );
  }

  const isSightWords = game.mode === 'sight_words_easy';
  const correctIdx = cells.indexOf(game.current_item);
  const waitingFor = players.filter(p => !readyPlayers.includes(p) && p !== playerNumber);

  return (
    <div className="flex flex-col items-center gap-4 py-4 px-2 w-full">

      {/* Scoreboard */}
      <div className="flex flex-wrap gap-2 justify-center w-full">
        {players.map(p => (
          <span key={p} className={`px-3 py-1 rounded-full font-bold text-sm ${p === playerNumber ? 'bg-white text-indigo-700' : 'bg-white/20 text-white'}`}>
            #{p}{p === playerNumber ? ' (You)' : ''} {readyPlayers.includes(p) ? '✅' : ''}
            <span className="ml-1 bg-yellow-300 text-yellow-900 px-2 rounded-full text-xs font-black">
              {p === playerNumber ? myPoints : (playerPoints[String(p)] || 0)}pts
            </span>
          </span>
        ))}
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
                ✅ {feedback === 'not_on_card_correct' ? 'Correct — not on your card!' : 'Correct!'} +{roundPoints} pts{hasBingo ? ' + 5 BINGO!' : ''}
              </div>
            )}
            {feedback === 'reveal' && (
              <div className="text-orange-500 font-bold text-sm bg-orange-50 rounded-lg px-3 py-1">
                The answer is highlighted below
              </div>
            )}

            {!roundDone && !amReady && (
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
          const clickable = !roundDone && !amReady && !isCovered;
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

      {/* Ready */}
      <div className="w-full">
        {amReady ? (
          <div className="text-center text-white font-bold text-base py-3">
            ✅ Ready! {waitingFor.length > 0 ? `Waiting for ${waitingFor.map(p => '#' + p).join(', ')}…` : '🎲 Next item coming…'}
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
          await base44.entities.LiteracyBingoGame.update(game.id, { status: 'finished' });
          onBack();
        }}
        className="text-white/50 hover:text-white text-sm"
      >← Leave Game</button>
    </div>
  );
}