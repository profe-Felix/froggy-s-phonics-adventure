import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { LETTER_SOUNDS } from '@/components/data/letterSounds';
import { SIGHT_WORDS_EASY } from '@/components/data/sightWords';

function getItemList(mode) {
  if (mode === 'letter_sounds') return LETTER_SOUNDS;
  if (mode === 'sight_words_easy') return SIGHT_WORDS_EASY;
  return [];
}

function buildCard(playerNumber, className, mode) {
  const items = getItemList(mode);

  function shuffle(arr, seed) {
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
  const shuffled = shuffle(items, seed);
  // 4x4 = 16 cells, no FREE space
  return shuffled.slice(0, 16);
}



export default function LiteracyBingoPeerCard({ initialGame, playerNumber, className, onBack }) {
  const [game, setGame] = useState(initialGame);
  const [covered, setCovered] = useState(new Set());
  const [respondedItem, setRespondedItem] = useState(null);
  const audioRef = useRef(null);
  const audioCache = useRef({});

  const playSound = (item, mode) => {
    const path = mode === 'letter_sounds'
      ? `/letter-sounds/${encodeURIComponent(item)}.mp3`
      : `/sight-word-audio/${encodeURIComponent(item)}.mp3`;
    if (!audioCache.current[path]) {
      audioCache.current[path] = new Audio(path);
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    audioRef.current = audioCache.current[path];
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
  };

  const isPlayer1 = playerNumber === game.player1_number;
  const myReadyField = isPlayer1 ? 'player1_ready' : 'player2_ready';
  const otherReadyField = isPlayer1 ? 'player2_ready' : 'player1_ready';
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

  useEffect(() => {
    if (game.current_item) {
      setRespondedItem(null);
      playSound(game.current_item, game.mode);
    }
  }, [game.current_item]);

  const cells = buildCard(playerNumber, className, game.mode);

  const advanceItem = async (currentGame) => {
    const items = getItemList(currentGame.mode);
    const remaining = items.filter(i => !(currentGame.called_items || []).includes(i));
    if (remaining.length === 0) {
      await base44.entities.LiteracyBingoGame.update(currentGame.id, {
        status: 'finished', player1_ready: false, player2_ready: false,
      });
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

  const markReady = async () => {
    if (myReady) return;
    const updated = await base44.entities.LiteracyBingoGame.update(game.id, { [myReadyField]: true });
    if (updated[otherReadyField]) {
      await advanceItem(updated);
    }
  };

  const handleNotOnCard = async () => {
    if (!game.current_item || respondedItem === game.current_item) return;
    setRespondedItem(game.current_item);
    await markReady();
  };

  const handleTileClick = (item, idx) => {
    if (item === 'FREE') {
      setCovered(prev => {
        const next = new Set(prev);
        next.has(idx) ? next.delete(idx) : next.add(idx);
        return next;
      });
      return;
    }
    setCovered(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
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
        <Button onClick={onBack} className="bg-white text-indigo-700 font-bold">Back to Lobby</Button>
      </div>
    );
  }



  return (
    <div className="flex flex-col items-center gap-4 py-4 px-4 w-full max-w-sm mx-auto">
      {/* Players */}
      <div className="flex gap-3 text-sm w-full justify-center">
        <span className={`px-3 py-1 rounded-full font-bold ${isPlayer1 ? 'bg-white text-indigo-700' : 'bg-white/20 text-white'}`}>
          #{game.player1_number}{isPlayer1 ? ' (You)' : ''} {game.player1_ready ? '✅' : ''}
        </span>
        <span className="text-white/40 self-center">vs</span>
        <span className={`px-3 py-1 rounded-full font-bold ${!isPlayer1 ? 'bg-white text-indigo-700' : 'bg-white/20 text-white'}`}>
          #{game.player2_number}{!isPlayer1 ? ' (You)' : ''} {game.player2_ready ? '✅' : ''}
        </span>
      </div>

      {/* Current item display — speaker only, no text */}
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
            {respondedItem !== game.current_item && !myReady && (
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

      {/* Bingo card 4x4 */}
      <div className="grid grid-cols-4 gap-1.5">
        {cells.map((item, idx) => {
          const isCovered = covered.has(idx);
          return (
            <button
              key={idx}
              onClick={() => handleTileClick(item, idx)}
              className="relative w-16 h-16 border-2 border-gray-700 rounded-lg bg-white flex items-center justify-center font-bold text-gray-800 shadow select-none"
            >
              <span className="text-sm text-center leading-tight px-1 uppercase">{item}</span>
              {isCovered && <div className="absolute inset-1 rounded-md bg-yellow-400/60 border-2 border-yellow-500 pointer-events-none" />}
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
            onClick={markReady}
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