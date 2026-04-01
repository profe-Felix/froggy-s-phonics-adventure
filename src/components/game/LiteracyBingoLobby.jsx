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
  const [activeGameId, setActiveGameId] = useState(null);

  const { data: allGames = [], refetch } = useQuery({
    queryKey: ['literacy-bingo', className, modeSelected],
    queryFn: () => base44.entities.LiteracyBingoGame.filter({ class_name: className, mode: modeSelected }),
    enabled: !!modeSelected,
    refetchInterval: 3000,
  });

  if (!modeSelected) {
    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-sm mx-auto w-full">
        <h2 className="text-2xl font-bold text-white">🎱 Bingo with Friends</h2>
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

  const myGame = allGames.find(g =>
    (g.players || []).includes(studentNumber) &&
    (g.status === 'waiting' || g.status === 'active')
  ) || (activeGameId && allGames.find(g => g.id === activeGameId));

  const joinableGames = allGames.filter(g =>
    g.status === 'waiting' && !(g.players || []).includes(studentNumber)
  );

  const createGame = async () => {
    if (myGame) return;
    const g = await base44.entities.LiteracyBingoGame.create({
      mode: modeSelected,
      class_name: className,
      host_number: studentNumber,
      players: [studentNumber],
      ready_players: [],
      player_points: {},
      called_items: [],
      status: 'waiting',
    });
    setActiveGameId(g.id);
  };

  const joinGame = async (openGame) => {
    const updatedPlayers = [...(openGame.players || []), studentNumber];
    await base44.entities.LiteracyBingoGame.update(openGame.id, { players: updatedPlayers });
    setActiveGameId(openGame.id);
    refetch();
  };

  const startGame = async (game) => {
    const cardUnion = getCardUnion(game.players, game.class_name, game.mode);
    const pick = cardUnion[Math.floor(Math.random() * cardUnion.length)];
    await base44.entities.LiteracyBingoGame.update(game.id, {
      status: 'active',
      current_item: pick,
      called_items: [pick],
      ready_players: [],
    });
    refetch();
  };

  const leaveGame = async (game) => {
    const remaining = (game.players || []).filter(p => p !== studentNumber);
    if (remaining.length === 0) {
      await base44.entities.LiteracyBingoGame.delete(game.id);
    } else {
      await base44.entities.LiteracyBingoGame.update(game.id, {
        players: remaining,
        host_number: game.host_number === studentNumber ? remaining[0] : game.host_number,
      });
    }
    setActiveGameId(null);
    refetch();
  };

  // Active or finished game — show card (stays until student clicks back)
  if (myGame && (myGame.status === 'active' || myGame.status === 'finished')) {
    return (
      <LiteracyBingoPeerCard
        initialGame={myGame}
        playerNumber={studentNumber}
        className={className}
        onBack={() => setActiveGameId(null)}
      />
    );
  }

  // Waiting room
  if (myGame && myGame.status === 'waiting') {
    const isHost = myGame.host_number === studentNumber;
    const players = myGame.players || [];
    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-sm mx-auto w-full">
        <h2 className="text-2xl font-bold text-white">⏳ Waiting Room</h2>
        <div className="bg-white/20 rounded-2xl p-5 w-full flex flex-col gap-3">
          <p className="text-white font-semibold text-center">{players.length} player{players.length !== 1 ? 's' : ''} joined:</p>
          {players.map(p => (
            <div key={p} className="flex items-center justify-between bg-white/20 rounded-xl px-4 py-2">
              <span className="text-white font-bold text-lg">#{p}</span>
              {p === myGame.host_number && <span className="text-yellow-300 text-xs font-bold">HOST</span>}
              {p === studentNumber && <span className="text-white/60 text-xs">(you)</span>}
            </div>
          ))}
        </div>
        {isHost ? (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => startGame(myGame)}
            disabled={players.length < 2}
            className="bg-green-500 hover:bg-green-400 disabled:opacity-40 text-white font-bold text-xl py-4 rounded-2xl shadow-lg w-full"
          >
            {players.length < 2 ? 'Waiting for players…' : '▶ Start Game!'}
          </motion.button>
        ) : (
          <div className="text-white/70 text-center">Waiting for the host to start…</div>
        )}
        <p className="text-white/50 text-sm text-center">Share your class & room with classmates so they can join!</p>
        <button onClick={() => leaveGame(myGame)} className="text-white/50 hover:text-white text-sm">← Leave Room</button>
      </div>
    );
  }

  // Lobby
  return (
    <div className="flex flex-col items-center gap-6 p-6 max-w-sm mx-auto w-full">
      <h2 className="text-2xl font-bold text-white">
        {BINGO_MODES.find(m => m.id === modeSelected)?.label}
      </h2>
      <p className="text-white/70">Class: {className} · You are #{studentNumber}</p>

      {joinableGames.length > 0 ? (
        <div className="w-full flex flex-col gap-3">
          <p className="text-white font-semibold">Open rooms:</p>
          {joinableGames.map(g => (
            <motion.button
              key={g.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => joinGame(g)}
              className="bg-white text-indigo-700 font-bold text-lg py-4 rounded-2xl shadow-lg w-full flex flex-col items-center gap-1"
            >
              <span>#{g.host_number}'s room</span>
              <span className="text-sm font-normal text-indigo-400">{(g.players || []).length} player{(g.players || []).length !== 1 ? 's' : ''} waiting</span>
            </motion.button>
          ))}
          <div className="text-white/40 text-center text-sm">— or —</div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={createGame}
            className="bg-white/20 hover:bg-white/30 text-white font-bold text-lg py-3 rounded-2xl w-full border border-white/30"
          >
            + Create My Own Room
          </motion.button>
        </div>
      ) : (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={createGame}
          className="bg-white text-indigo-700 font-bold text-2xl py-6 rounded-2xl shadow-lg w-full"
        >
          + Create a Room
        </motion.button>
      )}

      <button onClick={() => setModeSelected(null)} className="text-white/70 hover:text-white text-sm">← Back to modes</button>
    </div>
  );
}