import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import BingoPeerCard from './BingoPeerCard';

export default function BingoPeerLobby({ className, studentNumber, onBack }) {
  const [activeGame, setActiveGame] = useState(null);

  const { data: allGames } = useQuery({
    queryKey: ['peer-games', className],
    queryFn: () => base44.entities.MathBingoPeerGame.filter({ class_name: className }),
    refetchInterval: 3000,
  });

  const myGame = (allGames || []).find(g =>
    (g.player1_number === studentNumber || g.player2_number === studentNumber) &&
    (g.status === 'waiting' || g.status === 'active')
  );
  const joinableGames = (allGames || []).filter(g =>
    g.status === 'waiting' && g.player1_number !== studentNumber
  );

  const gameToShow = activeGame || myGame;
  if (gameToShow) {
    const handleBack = async () => {
      // If we created a waiting game, delete it so we can join another
      if (gameToShow.status === 'waiting' && gameToShow.player1_number === studentNumber) {
        await base44.entities.MathBingoPeerGame.delete(gameToShow.id);
      }
      setActiveGame(null);
    };
    return (
      <BingoPeerCard
        initialGame={gameToShow}
        playerNumber={studentNumber}
        className={className}
        onBack={handleBack}
      />
    );
  }

  const createGame = async () => {
    const g = await base44.entities.MathBingoPeerGame.create({
      class_name: className,
      player1_number: studentNumber,
      called_numbers: [],
      min_number: 10,
      max_number: 20,
      free_space: true,
      status: 'waiting',
      player1_ready: false,
      player2_ready: false,
    });
    setActiveGame(g);
  };

  const joinGame = async (openGame) => {
    const allNums = [];
    for (let n = (openGame.min_number ?? 10); n <= (openGame.max_number ?? 20); n++) allNums.push(n);
    const pick = allNums[Math.floor(Math.random() * allNums.length)];
    const updated = await base44.entities.MathBingoPeerGame.update(openGame.id, {
      player2_number: studentNumber,
      status: 'active',
      current_number: pick,
      called_numbers: [pick],
      ten_frame_seed: Math.floor(Math.random() * 999999),
    });
    setActiveGame(updated);
  };

  return (
    <div className="flex flex-col items-center gap-6 p-6 max-w-sm mx-auto w-full">
      <h2 className="text-2xl font-bold text-white">👫 Play with a Friend</h2>
      <p className="text-white/70">Class: {className} · You are #{studentNumber}</p>

      {joinableGames.length > 0 ? (
        <div className="w-full flex flex-col gap-3">
          <p className="text-white font-semibold">Open games to join:</p>
          {joinableGames.map(g => (
            <motion.button
              key={g.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => joinGame(g)}
              className="bg-white text-indigo-700 font-bold text-xl py-4 rounded-2xl shadow-lg w-full"
            >
              Join #{g.player1_number}'s game 🎱
            </motion.button>
          ))}
          <div className="text-white/40 text-center text-sm">— or —</div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={createGame}
            className="bg-white/20 hover:bg-white/30 text-white font-bold text-lg py-3 rounded-2xl w-full border border-white/30"
          >
            + Create My Own Game
          </motion.button>
        </div>
      ) : (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={createGame}
          className="bg-white text-indigo-700 font-bold text-2xl py-6 rounded-2xl shadow-lg w-full"
        >
          + Create a Game
        </motion.button>
      )}

      <p className="text-white/40 text-xs text-center">Both players must be in class {className}</p>
      <button onClick={onBack} className="text-white/70 hover:text-white text-sm">← Back</button>
    </div>
  );
}