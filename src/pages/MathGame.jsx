import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import BingoCard from '../components/math/BingoCard';
import BingoTeacher from '../components/math/BingoTeacher';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

const CLASSES = ['Felix', 'Valero', 'Campos'];
const STUDENT_NUMBERS = Array.from({ length: 30 }, (_, i) => i + 1);

export default function MathGame() {
  const urlParams = new URLSearchParams(window.location.search);
  const mode = urlParams.get('mode');

  const [selectedClass, setSelectedClass] = useState(null);
  const [studentNumber, setStudentNumber] = useState(null);

  const queryClient = useQueryClient();

  const { data: games } = useQuery({
    queryKey: ['math-bingo', selectedClass],
    queryFn: () => base44.entities.MathBingoGame.filter({ class_name: selectedClass }),
    enabled: !!selectedClass,
    refetchInterval: 3000,
  });

  const [gameData, setGameData] = useState(null);

  useEffect(() => {
    if (games) {
      setGameData(games.length > 0 ? games[0] : null);
    }
  }, [games]);

  const createGame = async (cls) => {
    const g = await base44.entities.MathBingoGame.create({
      game_name: 'Bingo',
      class_name: cls,
      is_active: false,
      called_numbers: [],
      current_number: null,
      min_number: 10,
      max_number: 20,
    });
    setGameData(g);
    queryClient.invalidateQueries({ queryKey: ['math-bingo', cls] });
    return g;
  };

  // ── TEACHER VIEW ──
  if (mode === 'teacher') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-600 to-purple-700 py-8 px-4">
        {!selectedClass ? (
          <div className="flex flex-col items-center gap-6 max-w-sm mx-auto">
            <h1 className="text-3xl font-bold text-white">🎱 Bingo — Teacher</h1>
            <p className="text-white/70">Select a class to manage:</p>
            <div className="flex flex-col gap-3 w-full">
              {CLASSES.map(cls => (
                <Button
                  key={cls}
                  onClick={() => setSelectedClass(cls)}
                  className="bg-white text-indigo-700 font-bold text-xl py-6 h-auto rounded-2xl hover:bg-indigo-50"
                >
                  {cls}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <button onClick={() => { setSelectedClass(null); setGameData(null); }}
              className="text-white/80 hover:text-white mb-4 flex items-center gap-1 ml-4">
              ← Back to classes
            </button>
            {!gameData ? (
              <div className="flex flex-col items-center gap-4">
                <div className="text-white text-xl">No game for {selectedClass} yet</div>
                <Button onClick={() => createGame(selectedClass)}
                  className="bg-white text-indigo-700 font-bold text-lg px-8 py-4 h-auto">
                  Create Bingo Game for {selectedClass}
                </Button>
              </div>
            ) : (
              <BingoTeacher
                game={gameData}
                className={selectedClass}
                onUpdate={g => { setGameData(g); queryClient.invalidateQueries({ queryKey: ['math-bingo', selectedClass] }); }}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  // ── STUDENT VIEW — Step 1: Pick class ──
  if (!selectedClass) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-400 to-indigo-500 flex flex-col items-center justify-center gap-6 p-6">
        <div className="text-5xl">🧮</div>
        <h1 className="text-3xl font-bold text-white">Math Games</h1>
        <p className="text-white/80 text-lg">Which class are you in?</p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {CLASSES.map(cls => (
            <motion.button
              key={cls}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedClass(cls)}
              className="bg-white text-indigo-700 font-bold text-2xl py-5 rounded-2xl shadow-lg"
            >
              {cls}
            </motion.button>
          ))}
        </div>
      </div>
    );
  }

  // ── STUDENT VIEW — Step 2: Pick number ──
  if (!studentNumber) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-400 to-indigo-500 flex flex-col items-center justify-center gap-4 p-6">
        <button onClick={() => setSelectedClass(null)} className="text-white/80 self-start hover:text-white">← Back</button>
        <h2 className="text-2xl font-bold text-white">{selectedClass} — What's your number?</h2>
        <div className="grid grid-cols-6 gap-2">
          {STUDENT_NUMBERS.map(num => (
            <motion.button
              key={num}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setStudentNumber(num)}
              className="w-14 h-14 bg-white text-indigo-700 font-bold text-xl rounded-xl shadow-md"
            >
              {num}
            </motion.button>
          ))}
        </div>
      </div>
    );
  }

  // ── STUDENT VIEW — Bingo card ──
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-400 to-indigo-500 flex flex-col items-center py-6 px-4 gap-4">
      <div className="flex items-center justify-between w-full max-w-md">
        <div className="text-white font-bold text-lg">🧮 {selectedClass} #{studentNumber}</div>
        <Button onClick={() => setStudentNumber(null)} variant="ghost" className="text-white hover:bg-white/20">
          ← Back
        </Button>
      </div>
      {gameData ? (
        <BingoCard
          studentNumber={studentNumber}
          className={selectedClass}
          minNumber={gameData.min_number ?? 10}
          maxNumber={gameData.max_number ?? 20}
          calledNumbers={gameData.called_numbers || []}
          currentNumber={gameData.current_number}
          freeSpace={gameData.free_space ?? true}
          gameId={gameData.id}
          tenFrameSeed={gameData.ten_frame_seed ?? 42}
        />
      ) : (
        <div className="text-white text-xl mt-10">Waiting for game to start...</div>
      )}
    </div>
  );
}