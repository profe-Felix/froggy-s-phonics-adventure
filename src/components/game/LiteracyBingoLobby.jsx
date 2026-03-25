import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import LiteracyBingoPeerCard from './LiteracyBingoPeerCard';
import { getCardUnion } from './literacyBingoUtils';

const BINGO_MODES = [
  { id: 'letter_sounds', label: '🔤 Letter Sounds Bingo', description: 'Find the letter you hear' },
  { id: 'sight_words_easy', label: '👀 Sight Words Bingo', description: 'Find the word on your card' },
];

export default function LiteracyBingoLobby({ className, studentNumber, initialMode, onBack }) {
  const [modeSelected, setModeSelected] = useState(initialMode || null);
  const [activeGame, setActiveGame] = useState(null);

  const { data: allGames } = useQuery({
    queryKey: ['literacy-bingo', className, modeSelected],
    queryFn: () => base44.entities.LiteracyBingoGame.filter({
      class_name: className,
      mode: modeSelected,
    }),
    enabled: !!modeSelected,
    refetchInterval: 3000,
  });

  if (activeGame) {
    return (
      <LiteracyBingoPeerCard
        initialGame={activeGame}
        playerNumber={studentNumber}
        className={className}
        onBack={() => setActiveGame(null)}
      />
    );
  }

  if (!modeSelected) {
    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-sm mx-auto w-full">
        <h2 className="text-2xl font-bold text-white">🎱 Bingo with a Friend</h2>
        <p className="text-white/70">Pick a game:</p>
        <div className="flex flex-col gap-3 w-full">
          {BINGO_MODES.map(m => (
            <motion.button
              key={m.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => setModeSelected(m.id)}
              className="bg-white text-indigo-700 font-bold rounded-2xl shadow-lg p-4 flex flex-col items-start gap-1"
            >
              <div className="text-xl">{m.label}</div>
              <div className="text-xs font-normal text-indigo-500">{m.description}</div>
            </motion.button>
          ))}
        </div>
        <button onClick={onBack} className="text-white/70 hover:text-white text-sm">← Back</button>
      </div>
    );
  }

  const myGame = (allGames || []).find(g =>
    (g.player1_number === studentNumber || g.player2_number === studentNumber) &&
    (g.status === 'waiting' || g.status === 'active')
  );
  const joinableGames = (allGames || []).filter(g =>
    g.status === 'waiting' && g.player1_number !== studentNumber
  );

  const createGame = async () => {
    const g = await base44.entities.LiteracyBingoGame.create({
      mode: modeSelected,
      class_name: className,
      player1_number: studentNumber,
      status: 'waiting',
      player1_ready: false,
      player2_ready: false,
      called_items: [],
    });
    setActiveGame(g);
  };

  const joinGame = async (openGame) => {
    const updated = await base44.entities.LiteracyBingoGame.update(openGame.id, {
      player2_number: studentNumber,
      status: 'active',
    });
    // Pick first item only from the union of both players' cards
    const cardUnion = getCardUnion(openGame.player1_number, studentNumber, openGame.class_name, openGame.mode);
    const pick = cardUnion[Math.floor(Math.random() * cardUnion.length)];
    const started = await base44.entities.LiteracyBingoGame.update(updated.id, {
      current_item: pick,
      called_items: [pick],
    });
    setActiveGame(started);
  };

  return (
    <div className="flex flex-col items-center gap-6 p-6 max-w-sm mx-auto w-full">
      <h2 className="text-2xl font-bold text-white">
        {BINGO_MODES.find(m => m.id === modeSelected)?.label}
      </h2>
      <p className="text-white/70">Class: {className} · You are #{studentNumber}</p>

      {joinableGames.length > 0 ? (
        <div className="w-full flex flex-col gap-3">
          <p className="text-white font-semibold">Open games to join:</p>
          {joinableGames.map(g => (
            <motion.button
              key={g.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => joinGame(g)}
              className="bg-white text-indigo-700 font-bold text-lg py-4 rounded-2xl shadow-lg w-full"
            >
              Join #{g.player1_number}'s game 🎮
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

      <button onClick={() => setModeSelected(null)} className="text-white/70 hover:text-white text-sm">← Back to modes</button>
    </div>
  );
}