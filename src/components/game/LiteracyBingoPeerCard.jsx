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
    // Reset round state immediately so UI is clean
    setRoundDone(false);
    setAttempts(0);
    setFeedback(null);
    setRoundPoints(null);
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
        setFeedback('reveal_wrong');
        setRoundDone(true);
      } else {
        setFeedback('not_on_card_wrong');
      }
    } else {
      setRoundPoints(10);
      setFeedback('not_on_card_correct_show');
      setRoundDone(true);
      setMyPoints(prev => prev + 10);
    }
  };

  const handleTileClick = async (item, idx) => {
    if (roundDone || amReady || !game.current_item) return;
    const isCorrect = item === game.current_item;
    if (isCorrect) {
      const pts = getPointsForAttempt(attempts);
      setRoundPoints(pts);
      setFeedback('correct_show');
      setRoundDone(true);
      const nextCovered = new Set(covered);
      nextCovered.add(idx);
      setCovered(nextCovered);
      const bingo = checkBingo(nextCovered, cells.length);
      if (bingo && !hasBingo) setHasBingo(true);
      setMyPoints(prev => prev + pts + (bingo ? 5 : 0));
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      if (newAttempts >= 3) {
        setFeedback('incorrect_show');
        setRoundDone(true);
      } else {
        setFeedback('wrong');
      }
    }
  };

  const handleContinueAfterFeedback = async () => {
    if (feedback === 'correct_show') {
      const pts = roundPoints || 0;
      const bonus = hasBingo ? 5 : 0;
      await markReady(pts + bonus);
    } else if (feedback === 'not_on_card_correct_show') {
      await markReady(10);
    } else if (feedback === 'reveal_wrong' || feedback === 'incorrect_show') {
      await markReady(0);
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
            {feedback === 'correct_show' && (
              <div className="text-green-600 font-bold text-sm bg-green-50 rounded-lg px-3 py-1">
                ✅ Correct! +{roundPoints} pts{hasBingo ? ' + 5 BINGO!' : ''}
              </div>
            )}
            {feedback === 'not_on_card_correct_show' && (
              <div className="text-green-600 font-bold text-sm bg-green-50 rounded-lg px-3 py-1">
                ✅ Correct — not on your card! +10 pts
              </div>
            )}
            {(feedback === 'reveal_wrong' || feedback === 'incorrect_show') && (
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
      <div className={`grid gap-2 w-full relative ${isSightWords ? 'grid-cols-3' : 'grid-cols-4'}`}>
        {cells.map((item, idx) => {
          const isCovered = covered.has(idx);
          const isCorrect = idx === correctIdx;
          const showCorrectOverlay = (feedback === 'reveal_wrong' || feedback === 'incorrect_show') && isCorrect;
          const showWrongOverlay = (feedback === 'incorrect_show' || feedback === 'not_on_card_correct_show') && idx === cells.indexOf(cells.find((c, i) => i !== correctIdx && !covered.has(i)));
          const clickable = !roundDone && !amReady && !isCovered && feedback !== 'correct_show' && feedback !== 'not_on_card_correct_show' && feedback !== 'reveal_wrong' && feedback !== 'incorrect_show';
          return (
            <button
              key={idx}
              onClick={() => clickable && handleTileClick(item, idx)}
              className={`relative border-2 rounded-xl bg-white flex items-center justify-center font-bold text-gray-800 shadow select-none px-2
                ${isSightWords ? 'h-24' : 'h-16'}
                ${showCorrectOverlay ? 'border-green-500' : 'border-gray-700'}
                ${!clickable ? 'cursor-default' : 'active:scale-95 transition-transform'}`}
            >
              <span className={`text-center leading-tight break-words w-full ${isSightWords ? 'text-xl font-bold' : 'text-3xl uppercase font-bold'}`}>
                {item}
              </span>
              {isCovered && <div className="absolute inset-1 rounded-lg bg-yellow-400/70 border-2 border-yellow-500 pointer-events-none" />}
              {showCorrectOverlay && <div className="absolute inset-1 rounded-lg bg-green-400/70 border-2 border-green-500 pointer-events-none flex items-center justify-center"><span className="text-white font-bold text-sm">✓</span></div>}
            </button>
          );
        })}
      </div>

      {/* Persistent feedback overlay with continue button */}
      {roundDone && (feedback === 'correct_show' || feedback === 'not_on_card_correct_show' || feedback === 'reveal_wrong' || feedback === 'incorrect_show') && (
        <div className="w-full">
          <button
            onClick={handleContinueAfterFeedback}
            className="bg-blue-600 hover:bg-blue-700 text-white text-lg font-bold px-8 py-4 h-auto w-full rounded-2xl"
          >
            ✓ Continue
          </button>
        </div>
      )}

      {/* Ready */}
      {!roundDone && (
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
      )}
      {amReady && (
        <div className="text-center text-white font-bold text-base py-3">
          ✅ Ready! {waitingFor.length > 0 ? `Waiting for ${waitingFor.map(p => '#' + p).join(', ')}…` : '🎲 Next item coming…'}
        </div>
      )}

      <button
        onClick={async () => {
          const remaining = (game.players || []).filter(p => p !== playerNumber);
          if (remaining.length === 0) {
            await base44.entities.LiteracyBingoGame.update(game.id, { status: 'finished' });
          } else {
            await base44.entities.LiteracyBingoGame.update(game.id, {
              players: remaining,
              host_number: game.host_number === playerNumber ? remaining[0] : game.host_number,
              ready_players: (game.ready_players || []).filter(p => p !== playerNumber),
            });
          }
          onBack();
        }}
        className="text-white/50 hover:text-white text-sm"
      >← Leave Game</button>
    </div>
  );
}