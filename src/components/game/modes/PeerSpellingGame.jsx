import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { SPELLING_WORDS } from '@/components/data/spellingWords';
import { SIGHT_WORDS_SPELLING } from '@/components/data/sightWords';


const BOARD_LENGTH = 20;

function getWordList(mode) {
  if (mode === 'spelling') return SPELLING_WORDS.map(w => ({ word: w }));
  if (mode === 'sight_words_spelling') return SIGHT_WORDS_SPELLING.map(w => ({ word: w }));
  return [];
}

function selectRandomWord(mode) {
  const words = getWordList(mode);
  return words[Math.floor(Math.random() * words.length)].word;
}

export default function PeerSpellingGame({ initialGame, playerNumber, className, mode, onBack }) {
  const [game, setGame] = useState(initialGame);
  const [submitted, setSubmitted] = useState(false);
  const [rolled, setRolled] = useState(false);
  const [diceValue, setDiceValue] = useState(null);
  const [userInput, setUserInput] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [rolling, setRolling] = useState(false);
  const audioRef = useRef(null);

  const isPlayer1 = playerNumber === game.player1_number;
  const myReadyField = isPlayer1 ? 'player1_ready' : 'player2_ready';
  const otherReadyField = isPlayer1 ? 'player2_ready' : 'player1_ready';
  const myPosField = isPlayer1 ? 'player1_position' : 'player2_position';
  const otherPosField = isPlayer1 ? 'player2_position' : 'player1_position';
  const otherPlayerNumber = isPlayer1 ? game.player2_number : game.player1_number;

  const myPosition = game[myPosField] || 0;
  const otherPosition = game[otherPosField] || 0;
  const myReady = game[myReadyField] || false;
  const otherReady = game[otherReadyField] || false;

  // Real-time sync
  useEffect(() => {
    const unsubscribe = base44.entities.LiteracyPeerGame.subscribe((event) => {
      if (event.id === game.id && event.type !== 'delete') {
        setGame(event.data);
        // Reset UI when game updates
        setSubmitted(false);
        setRolled(false);
        setUserInput('');
        setDiceValue(null);
        setFeedback(null);
      }
    });
    return unsubscribe;
  }, [game.id]);

  // Play audio when current_item changes
  useEffect(() => {
    if (game.current_item && game.status === 'active') {
      const folder = mode === 'sight_words_spelling' ? 'sight-words' : 'spelling-words';
      const src = `/audio/${folder}/${game.current_item.toLowerCase()}.mp3`;
      if (audioRef.current) {
        audioRef.current.src = src;
        audioRef.current.play().catch(() => {});
      }
    }
  }, [game.current_item, game.status]);

  // Initialize first round
  useEffect(() => {
    if (game.status === 'active' && !game.current_item) {
      const word = selectRandomWord(mode);
      base44.entities.LiteracyPeerGame.update(game.id, { current_item: word });
    }
  }, [game.status, game.current_item, mode, game.id]);

  const checkAnswer = async () => {
    const correct = userInput.toLowerCase().trim() === game.current_item.toLowerCase();
    setFeedback(correct ? 'correct' : 'incorrect');
    setSubmitted(true);
    if (correct) {
      // Mark as ready so can roll
      const updated = await base44.entities.LiteracyPeerGame.update(game.id, { [myReadyField]: true });
      if (updated[otherReadyField]) {
        // Both answered, reset ready states
        await base44.entities.LiteracyPeerGame.update(updated.id, { player1_ready: false, player2_ready: false });
      }
    }
  };

  const rollDice = async () => {
    setRolling(true);
    await new Promise(r => setTimeout(r, 600)); // Dice animation
    const roll = Math.floor(Math.random() * 6) + 1;
    setDiceValue(roll);
    setRolled(true);

    const newPos = Math.min(myPosition + roll, BOARD_LENGTH);
    const updated = await base44.entities.LiteracyPeerGame.update(game.id, { [myPosField]: newPos });

    // Check win
    if (newPos >= BOARD_LENGTH) {
      await base44.entities.LiteracyPeerGame.update(updated.id, {
        status: 'finished',
        winner: playerNumber,
      });
      return;
    }

    // If both have rolled, pick next word
    if (updated[otherReadyField] === false) {
      const word = selectRandomWord(mode);
      await base44.entities.LiteracyPeerGame.update(updated.id, { current_item: word });
    }
    setRolling(false);
  };

  // Waiting for player 2
  if (game.status === 'waiting') {
    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-sm mx-auto w-full">
        <h2 className="text-2xl font-bold text-white">⏳ Waiting...</h2>
        <div className="bg-white/20 rounded-2xl p-8 text-center w-full">
          <div className="text-5xl mb-4">👋</div>
          <p className="text-white text-lg font-bold">You are #{playerNumber}</p>
          <p className="text-white/70 mt-2">Tell a classmate to join!</p>
        </div>
        <button onClick={onBack} className="text-white/70 hover:text-white text-sm">← Cancel</button>
      </div>
    );
  }

  if (game.status === 'finished') {
    const iWon = game.winner === playerNumber;
    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-sm mx-auto">
        <div className={`text-6xl ${iWon ? 'animate-bounce' : ''}`}>{iWon ? '🏆' : '🎉'}</div>
        <h2 className="text-2xl font-bold text-white">{iWon ? 'You Won!' : `#${game.winner} Won!`}</h2>
        <p className="text-white/70">Great game!</p>
        <Button onClick={onBack} className="bg-white text-indigo-700 font-bold">Play Again</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-4 px-4 w-full max-w-sm mx-auto">

      {/* Player positions */}
      <div className="w-full bg-white/10 rounded-lg p-3">
        <div className="text-white/60 text-xs mb-2">Board Progress</div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className={`font-bold ${isPlayer1 ? 'text-white' : 'text-white/60'}`}>#{game.player1_number}</span>
            <div className="flex-1 mx-2 h-2 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-blue-400" style={{ width: `${(myPosition / BOARD_LENGTH) * 100}%` }} />
            </div>
            <span className="text-white/80 font-bold">{myPosition}/20</span>
          </div>
          {game.player2_number && (
            <div className="flex items-center justify-between text-sm">
              <span className={`font-bold ${!isPlayer1 ? 'text-white' : 'text-white/60'}`}>#{game.player2_number}</span>
              <div className="flex-1 mx-2 h-2 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-pink-400" style={{ width: `${(otherPosition / BOARD_LENGTH) * 100}%` }} />
              </div>
              <span className="text-white/80 font-bold">{otherPosition}/20</span>
            </div>
          )}
        </div>
      </div>

      {/* Audio playback */}
      <audio ref={audioRef} />
      <div className="bg-white rounded-2xl shadow-lg p-6 w-full text-center">
        <div className="text-white/60 text-sm mb-2">Listen and spell the word:</div>
        <button
          onClick={() => audioRef.current?.play()}
          className="text-5xl hover:scale-110 transition-transform"
        >🔊</button>
      </div>

      {/* Input + Submit */}
      {!myReady && (
        <div className="w-full flex flex-col gap-3">
          <input
            type="text"
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            placeholder="Type the word..."
            onKeyDown={e => e.key === 'Enter' && checkAnswer()}
            className="w-full px-4 py-3 rounded-lg text-center text-lg font-bold border-2 border-white/30 focus:outline-none focus:border-white"
          />
          <Button
            onClick={checkAnswer}
            disabled={submitted}
            className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-lg py-3 h-auto w-full"
          >
            {submitted ? (feedback === 'correct' ? '✅ Correct! Ready to roll?' : '❌ Try again') : 'Submit'}
          </Button>
        </div>
      )}

      {/* Dice roll */}
      {myReady && !rolled && (
        <div className="w-full text-center">
          <div className="text-white/70 mb-3">Both answered correctly! Now roll:</div>
          <Button
            onClick={rollDice}
            disabled={rolling}
            className="bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-black text-2xl py-6 h-auto w-full rounded-2xl"
          >
            {rolling ? '🎲 Rolling...' : '🎲 Roll Dice'}
          </Button>
        </div>
      )}

      {/* Dice result */}
      {rolled && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="text-center w-full"
        >
          <div className="text-6xl font-black text-yellow-300 mb-3">{diceValue}</div>
          <div className="text-white/70">You moved {diceValue} space{diceValue !== 1 ? 's' : ''}!</div>
          {!otherReady && (
            <div className="text-white/50 text-sm mt-3">Waiting for #{otherPlayerNumber} to roll...</div>
          )}
        </motion.div>
      )}

      {/* Status */}
      <div className="text-white/60 text-sm">
        {myReady && rolled && otherReady ? '✅ Both ready for next round' : myReady && !rolled ? '⏳ Waiting for other player...' : ''}
      </div>
    </div>
  );
}