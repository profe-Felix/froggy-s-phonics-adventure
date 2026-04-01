import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import BingoPeerCard from './BingoPeerCard';

export default function BingoPeerLobby({ className, studentNumber, onBack }) {
  const [activeGameId, setActiveGameId] = useState(null);

  const { data: allGames = [], refetch } = useQuery({
    queryKey: ['peer-games', className],
    queryFn: () => base44.entities.MathBingoPeerGame.filter({ class_name: className }),
    refetchInterval: 3000,
  });

  const myGame = allGames.find(g =>
    (g.players || []).includes(studentNumber) &&
    (g.status === 'waiting' || g.status === 'active')
  ) || (activeGameId && allGames.find(g => g.id === activeGameId));

  const joinableGames = allGames.filter(g =>
    g.status === 'waiting' && !(g.players || []).includes(studentNumber)
  );

  const gameToShow = myGame;
  if (gameToShow && gameToShow.status === 'active') {
    return (
      <BingoPeerCard
        initialGame={gameToShow}
        playerNumber={studentNumber}
        className={className}
        onBack={() => setActiveGameId(null)}
      />
    );
  }

  const createGame = async () => {
    if (myGame) return;
    const g = await base44.entities.MathBingoPeerGame.create({
      class_name: className,
      host_number: studentNumber,
      players: [studentNumber],
      ready_players: [],
      player_points: {},
      called_numbers: [],
      min_number: 10,
      max_number: 20,
      free_space: true,
      status: 'waiting',
    });
    setActiveGameId(g.id);
  };

  const joinGame = async (openGame) => {
    const updatedPlayers = [...(openGame.players || []), studentNumber];
    await base44.entities.MathBingoPeerGame.update(openGame.id, {
      players: updatedPlayers,
    });
    setActiveGameId(openGame.id);
    refetch();
  };

  const startGame = async (game) => {
    const allNums = [];
    for (let n = (game.min_number ?? 10); n <= (game.max_number ?? 20); n++) allNums.push(n);
    const pick = allNums[Math.floor(Math.random() * allNums.length)];
    await base44.entities.MathBingoPeerGame.update(game.id, {
      status: 'active',
      current_number: pick,
      called_numbers: [pick],
      ten_frame_seed: Math.floor(Math.random() * 999999),
      ready_players: [],
    });
    refetch();
  };

  const leaveGame = async (game) => {
    const remaining = (game.players || []).filter(p => p !== studentNumber);
    if (remaining.length === 0) {
      await base44.entities.MathBingoPeerGame.delete(game.id);
    } else {
      await base44.entities.MathBingoPeerGame.update(game.id, {
        players: remaining,
        host_number: game.host_number === studentNumber ? remaining[0] : game.host_number,
      });
    }
    setActiveGameId(null);
    refetch();
  };

  // Waiting room view
  if (myGame && myGame.status === 'waiting') {
    const isHost = myGame.host_number === studentNumber;
    const players = myGame.players || [];
    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-sm mx-auto w-full">
        <h2 className="text-2xl font-bold text-white">🎱 Waiting Room</h2>
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

  // Lobby view
  return (
    <div className="flex flex-col items-center gap-6 p-6 max-w-sm mx-auto w-full">
      <h2 className="text-2xl font-bold text-white">🎱 Bingo Lobby</h2>
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

      <p className="text-white/40 text-xs text-center">Players must be in class {className}</p>
      <button onClick={onBack} className="text-white/70 hover:text-white text-sm">← Back</button>
    </div>
  );
}