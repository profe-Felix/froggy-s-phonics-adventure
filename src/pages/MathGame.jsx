import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import BingoCard from '../components/math/BingoCard';
import BingoTeacher from '../components/math/BingoTeacher';
import { Button } from '@/components/ui/button';

export default function MathGame() {
  const urlParams = new URLSearchParams(window.location.search);
  const mode = urlParams.get('mode'); // 'teacher' for teacher view
  const rawClass = urlParams.get('class') || null;
  const urlClass = rawClass ? rawClass.charAt(0).toUpperCase() + rawClass.slice(1).toLowerCase() : null;
  const urlNumber = parseInt(urlParams.get('number')) || null;

  const [studentClass, setStudentClass] = useState(urlClass || '');
  const [studentNumber, setStudentNumber] = useState(urlNumber || '');
  const [loggedIn, setLoggedIn] = useState(!!(urlClass && urlNumber));

  const queryClient = useQueryClient();

  // Poll game state every 3 seconds
  const { data: games } = useQuery({
    queryKey: ['math-bingo'],
    queryFn: () => base44.entities.MathBingoGame.list(),
    refetchInterval: 3000,
  });

  const [gameData, setGameData] = useState(null);

  useEffect(() => {
    if (games) {
      if (games.length > 0) {
        setGameData(games[0]);
      }
    }
  }, [games]);

  const createGame = async () => {
    const g = await base44.entities.MathBingoGame.create({
      game_name: 'Bingo',
      is_active: false,
      called_numbers: [],
      current_number: null,
      min_number: 10,
      max_number: 20,
    });
    setGameData(g);
    queryClient.invalidateQueries({ queryKey: ['math-bingo'] });
  };

  // Teacher view
  if (mode === 'teacher') {
    if (!gameData) {
      return (
        <div className="min-h-screen bg-gradient-to-b from-indigo-600 to-purple-700 flex items-center justify-center">
          <div className="text-center">
            <div className="text-white text-2xl mb-6">No game session found</div>
            <Button onClick={createGame} className="bg-white text-indigo-700 font-bold text-lg px-8 py-4 h-auto">
              Create New Bingo Game
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-600 to-purple-700 py-8">
        <BingoTeacher game={gameData} onUpdate={g => { setGameData(g); queryClient.invalidateQueries({ queryKey: ['math-bingo'] }); }} />
      </div>
    );
  }

  // Student login
  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-400 to-indigo-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm flex flex-col gap-5">
          <div className="text-center">
            <div className="text-5xl mb-2">🧮</div>
            <h1 className="text-2xl font-bold text-gray-800">Math Games</h1>
            <p className="text-gray-500 text-sm">Enter your info to join</p>
          </div>
          <div className="flex flex-col gap-3">
            <input
              type="text"
              placeholder="Class name"
              value={studentClass}
              onChange={e => setStudentClass(e.target.value)}
              className="border-2 rounded-xl px-4 py-3 text-lg text-center focus:outline-none focus:border-indigo-400"
            />
            <input
              type="number"
              placeholder="Student number"
              value={studentNumber}
              onChange={e => setStudentNumber(e.target.value)}
              className="border-2 rounded-xl px-4 py-3 text-lg text-center focus:outline-none focus:border-indigo-400"
            />
            <Button
              onClick={() => setLoggedIn(true)}
              disabled={!studentClass || !studentNumber}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-lg py-3 h-auto rounded-xl"
            >
              Join Game 🎉
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Student bingo view
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-400 to-indigo-500 flex flex-col items-center py-6 px-4 gap-4">
      <div className="flex items-center justify-between w-full max-w-md">
        <div className="text-white font-bold text-lg">🧮 Bingo — {studentClass} #{studentNumber}</div>
        <Button onClick={() => setLoggedIn(false)} variant="ghost" className="text-white text-sm hover:bg-white/20">
          ← Back
        </Button>
      </div>
      {gameData ? (
        <BingoCard
          studentNumber={parseInt(studentNumber)}
          className={studentClass}
          minNumber={gameData.min_number ?? 10}
          maxNumber={gameData.max_number ?? 20}
          calledNumbers={gameData.called_numbers || []}
          currentNumber={gameData.current_number}
        />
      ) : (
        <div className="text-white text-xl">Waiting for game to start...</div>
      )}
    </div>
  );
}