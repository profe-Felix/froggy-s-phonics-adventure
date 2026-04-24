import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import BingoCard from '../components/math/BingoCard';
import BingoTeacher from '../components/math/BingoTeacher';
import BingoPeerLobby from '../components/math/BingoPeerLobby';
import NumberBuildingMode from '../components/game/modes/NumberBuildingMode';
import OneLessMoreMode from '../components/math/OneLessMoreMode';
import OneLessMoreTeacher from '../components/math/OneLessMoreTeacher';
import OneLessMoreLessonStudent from '../components/math/OneLessMoreLessonStudent';
import RollCompareGame from '../components/math/RollCompareGame';
import RollCompareTeacherLesson from '../components/math/RollCompareTeacherLesson';
import RollCompareStudentLesson from '../components/math/RollCompareStudentLesson';
import TenFrameCompareTeacherLesson from '../components/math/TenFrameCompareTeacherLesson';
import TenFrameCompareStudentLesson from '../components/math/TenFrameCompareStudentLesson';
import TenFrameComparePair from '../components/math/TenFrameComparePair';
import RollCompareSolo from '../components/math/RollCompareSolo';
import CountingCollectionSolo from '../components/math/counting/CountingCollectionSolo';
import CountingCollectionStudentLesson from '../components/math/counting/CountingCollectionStudentLesson';
import CountingCollectionPartner from '../components/math/counting/CountingCollectionPartner';
import CountingCollectionTeacherDash from '../components/math/counting/CountingCollectionTeacherDash';
import DoubleSidedCounters from '../components/math/DoubleSidedCounters';
import GraphingGame from '../components/math/GraphingGame';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

const CLASSES = ['Felix', 'Valero', 'Campos'];
const STUDENT_NUMBERS = Array.from({ length: 30 }, (_, i) => i + 1);

export default function MathGames() {
  const urlParams = new URLSearchParams(window.location.search);
  const mode = urlParams.get('mode');

  const [selectedClass, setSelectedClass] = useState(null);
  const [studentNumber, setStudentNumber] = useState(null);
  const [gameMode, setGameMode] = useState(null); // null=tiles, 'bingo', 'numbers'
  const [selfPlay, setSelfPlay] = useState(null); // null=not chosen, true=peer, false=teacher

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

  const createGame = async (cls, settings = {}) => {
    const g = await base44.entities.MathBingoGame.create({
      game_name: 'Bingo',
      class_name: cls,
      is_active: false,
      called_numbers: [],
      current_number: null,
      min_number: settings.min_number ?? 10,
      max_number: settings.max_number ?? 20,
      free_space: settings.free_space ?? true,
    });
    setGameData(g);
    queryClient.invalidateQueries({ queryKey: ['math-bingo', cls] });
    return g;
  };

  // Reset creates a NEW game record for clean per-session data
  const handleReset = async (settings) => {
    await createGame(selectedClass, settings);
  };

  // ── TEACHER VIEW ──
  if (mode === 'teacher') {
    if (gameMode === 'onelessmore' && selectedClass) {
      return (
        <div className="min-h-screen bg-gradient-to-b from-indigo-600 to-purple-700 py-8 px-4">
          <OneLessMoreTeacher className={selectedClass} onBack={() => setGameMode(null)} />
        </div>
      );
    }
    if (gameMode === 'rollcompare' && selectedClass) {
      return <RollCompareTeacherLesson className={selectedClass} onBack={() => setGameMode(null)} />;
    }
    if (gameMode === 'tenframecompare' && selectedClass) {
      return <TenFrameCompareTeacherLesson className={selectedClass} onBack={() => setGameMode(null)} />;
    }
    if (gameMode === 'countcollection' && selectedClass) {
      return (
        <div className="min-h-screen bg-gradient-to-b from-indigo-600 to-purple-700 py-8 px-4">
          <CountingCollectionTeacherDash className={selectedClass} onBack={() => setGameMode(null)} />
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-600 to-purple-700 py-8 px-4">
        {!selectedClass ? (
          <div className="flex flex-col items-center gap-6 max-w-sm mx-auto">
            <h1 className="text-3xl font-bold text-white">🏫 Teacher Dashboard</h1>
            <p className="text-white/70">Select a class:</p>
            <div className="flex flex-col gap-3 w-full">
              {CLASSES.map(cls => (
                <button key={cls} onClick={() => { setSelectedClass(cls); setGameData(null); }}
                  className="bg-white text-indigo-700 font-bold text-xl py-5 rounded-2xl hover:bg-indigo-50">
                  {cls}
                </button>
              ))}
            </div>
          </div>
        ) : gameMode === null ? (
          <div className="flex flex-col items-center gap-4 max-w-sm mx-auto">
            <button onClick={() => setSelectedClass(null)} className="text-white/70 hover:text-white self-start text-sm">← Classes</button>
            <h2 className="text-2xl font-bold text-white">{selectedClass}</h2>
            <div className="flex flex-col gap-3 w-full">
              <button onClick={() => setGameMode('bingo')} className="bg-white text-indigo-700 font-bold text-xl py-5 rounded-2xl hover:bg-indigo-50">🎱 Bingo</button>
              <button onClick={() => setGameMode('onelessmore')} className="bg-white text-indigo-700 font-bold text-xl py-5 rounded-2xl hover:bg-indigo-50">🧊 1 More / 1 Less</button>
              <button onClick={() => setGameMode('rollcompare')} className="bg-white text-indigo-700 font-bold text-xl py-5 rounded-2xl hover:bg-indigo-50">🍪 Roll & Compare</button>
              <button onClick={() => setGameMode('tenframecompare')} className="bg-white text-indigo-700 font-bold text-xl py-5 rounded-2xl hover:bg-indigo-50">🟦 Ten Frame Compare</button>
              <button onClick={() => setGameMode('countcollection')} className="bg-white text-indigo-700 font-bold text-xl py-5 rounded-2xl hover:bg-indigo-50">🔢 Count Collections</button>
              <button onClick={() => setGameMode('doublesided')} className="bg-white text-indigo-700 font-bold text-xl py-5 rounded-2xl hover:bg-indigo-50">🟡🔴 Double-Sided Counters</button>
            </div>
          </div>
        ) : (
          <div>
            <button onClick={() => setGameMode(null)} className="text-white/80 hover:text-white mb-4 flex items-center gap-1 ml-4">← Back</button>
            {!gameData ? (
              <div className="flex flex-col items-center gap-4">
                <div className="text-white text-xl">No game for {selectedClass} yet</div>
                <Button onClick={() => createGame(selectedClass)} className="bg-white text-indigo-700 font-bold text-lg px-8 py-4 h-auto">Create Bingo Game for {selectedClass}</Button>
              </div>
            ) : (
              <BingoTeacher game={gameData} className={selectedClass}
                onUpdate={g => { setGameData(g); queryClient.invalidateQueries({ queryKey: ['math-bingo', selectedClass] }); }}
                onReset={handleReset} />
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

  // ── STUDENT VIEW — Step 3: Pick game type (tile cards) ──
  if (gameMode === null) {
    const MATH_MODES = [
      {
        id: 'bingo',
        title: 'Bingo',
        description: 'Teacher or friend calls numbers',
        icon: '🎱',
        color: 'from-indigo-400 to-indigo-600',
      },
      {
        id: 'numbers',
        title: 'Number Recognition',
        description: 'Hear a number and catch it',
        icon: '🔢',
        color: 'from-teal-400 to-teal-600',
      },
      {
        id: 'onelessmore',
        title: '1 More / 1 Less',
        description: 'Build with linking cubes',
        icon: '🧊',
        color: 'from-sky-400 to-blue-600',
      },
      {
        id: 'rollcompare',
        title: 'Roll & Compare',
        description: 'Roll, build cookies, compare with a partner',
        icon: '🍪',
        color: 'from-amber-400 to-orange-500',
      },
      {
        id: 'tenframecompare',
        title: 'Ten Frame Compare',
        description: 'Compare your number to the teacher’s number',
        icon: '🟦',
        color: 'from-emerald-400 to-teal-600',
      },
      {
        id: 'countcollection',
        title: 'Count Collections',
        description: 'Count and organize objects, compare with a partner',
        icon: '🔢',
        color: 'from-teal-400 to-green-500',
      },
      {
        id: 'doublesided',
        title: 'Double-Sided Counters',
        description: 'Shake & spill — count red & yellow, then compare!',
        icon: '🟡',
        color: 'from-red-400 to-amber-500',
      },
      {
        id: 'graphing',
        title: 'Graphing',
        description: 'Count objects, sort them, and make a bar graph!',
        icon: '📊',
        color: 'from-green-400 to-emerald-600',
      },
    ];
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-300 via-sky-200 to-green-200 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-green-700 mb-2">Math Games 🧮</h1>
            <p className="text-xl text-gray-600">{selectedClass} — Student #{studentNumber}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {MATH_MODES.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.05 }}
                className="relative"
              >
                <div className="bg-white rounded-3xl shadow-xl p-6">
                  <div className={`w-full h-32 bg-gradient-to-br ${m.color} rounded-2xl flex items-center justify-center text-6xl mb-4 shadow-lg`}>
                    {m.icon}
                  </div>
                  <h3 className="text-2xl font-bold text-gray-800 mb-2">{m.title}</h3>
                  <p className="text-gray-600 mb-4">{m.description}</p>
                  <Button
                    onClick={() => setGameMode(m.id)}
                    className="w-full bg-green-500 hover:bg-green-600 text-white py-6 text-lg"
                  >
                    Play
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
          <div className="text-center">
            <Button onClick={() => setStudentNumber(null)} variant="outline" className="px-8 py-4 text-lg">
              ← Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── STUDENT VIEW — Double-Sided Counters ──
  if (gameMode === 'doublesided') {
    return <DoubleSidedCounters onBack={() => setGameMode(null)} />;
  }

  // ── STUDENT VIEW — Graphing ──
  if (gameMode === 'graphing') {
    return <GraphingGame onBack={() => setGameMode(null)} />;
  }

  // ── STUDENT VIEW — Count Collections ──
  if (gameMode === 'countcollection') {
    if (selfPlay === null) {
      return (
        <div className="min-h-screen bg-gradient-to-b from-teal-400 to-green-500 flex flex-col items-center justify-center gap-6 p-6">
          <button onClick={() => setGameMode(null)} className="text-white/80 self-start hover:text-white">← Back</button>
          <div className="text-5xl">🔢</div>
          <h2 className="text-2xl font-bold text-white">Count Collections</h2>
          <div className="flex flex-col gap-4 w-full max-w-xs">
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }}
              onClick={() => setSelfPlay(false)}
              className="bg-white text-teal-700 font-bold text-xl py-6 rounded-2xl shadow-lg flex flex-col items-center gap-1">
              🏫 Teacher Lesson
              <span className="text-sm font-normal text-teal-400">Teacher controls the collection</span>
            </motion.button>
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }}
              onClick={() => setSelfPlay(true)}
              className="bg-white text-teal-700 font-bold text-xl py-6 rounded-2xl shadow-lg flex flex-col items-center gap-1">
              👫 Partner Mode
              <span className="text-sm font-normal text-teal-400">Count your own, then compare</span>
            </motion.button>
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }}
              onClick={() => setSelfPlay('solo')}
              className="bg-white text-teal-700 font-bold text-xl py-6 rounded-2xl shadow-lg flex flex-col items-center gap-1">
              🎮 Solo Practice
              <span className="text-sm font-normal text-teal-400">Practice counting on your own</span>
            </motion.button>
          </div>
        </div>
      );
    }
    if (selfPlay === 'solo') return <CountingCollectionSolo onBack={() => setSelfPlay(null)} />;
    if (selfPlay === true) return <CountingCollectionPartner onBack={() => setSelfPlay(null)} studentNumber={studentNumber} className={selectedClass} />;
    return <CountingCollectionStudentLesson onBack={() => setSelfPlay(null)} studentNumber={studentNumber} className={selectedClass} />;
  }

  // ── STUDENT VIEW — Roll & Compare ──
  if (gameMode === 'rollcompare') {
    if (selfPlay === null) {
      return (
        <div className="min-h-screen bg-gradient-to-b from-amber-200 to-orange-300 flex flex-col items-center justify-center gap-6 p-6">
          <button onClick={() => setGameMode(null)} className="text-amber-900/80 self-start hover:text-amber-900">← Back</button>
          <div className="text-5xl">🍪</div>
          <h2 className="text-2xl font-bold text-amber-900">Roll & Compare</h2>
          <div className="flex flex-col gap-4 w-full max-w-xs">
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }} onClick={() => setSelfPlay(false)}
              className="bg-white text-amber-700 font-bold text-xl py-6 rounded-2xl shadow-lg flex flex-col items-center gap-1">
              🏫 Teacher Lesson
              <span className="text-sm font-normal text-amber-400">Teacher controls the spinner</span>
            </motion.button>
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }} onClick={() => setSelfPlay(true)}
              className="bg-white text-amber-700 font-bold text-xl py-6 rounded-2xl shadow-lg flex flex-col items-center gap-1">
              👫 Play with a Partner
              <span className="text-sm font-normal text-amber-400">Roll & compare with a classmate</span>
            </motion.button>
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }} onClick={() => setSelfPlay('solo')}
              className="bg-white text-amber-700 font-bold text-xl py-6 rounded-2xl shadow-lg flex flex-col items-center gap-1">
              🎮 Solo Practice
              <span className="text-sm font-normal text-amber-400">Practice against the computer</span>
            </motion.button>
          </div>
        </div>
      );
    }
    if (selfPlay === 'solo') return <RollCompareSolo onBack={() => setSelfPlay(null)} studentNumber={studentNumber} />;
    if (selfPlay === true) return <RollCompareGame onBack={() => setSelfPlay(null)} studentNumber={studentNumber} className={selectedClass} />;
    return <RollCompareStudentLesson onBack={() => setSelfPlay(null)} studentNumber={studentNumber} className={selectedClass} />;
  }

  // ── STUDENT VIEW — Ten Frame Compare ──
  if (gameMode === 'tenframecompare') {
    if (selfPlay === null) {
      return (
        <div className="min-h-screen bg-gradient-to-b from-emerald-400 to-teal-600 flex flex-col items-center justify-center gap-6 p-6">
          <button onClick={() => setGameMode(null)} className="text-white/80 self-start hover:text-white">← Back</button>
          <div className="text-5xl">🟦</div>
          <h2 className="text-2xl font-bold text-white">Ten Frame Compare</h2>
          <div className="flex flex-col gap-4 w-full max-w-xs">
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }} onClick={() => setSelfPlay(false)}
              className="bg-white text-teal-700 font-bold text-xl py-6 rounded-2xl shadow-lg flex flex-col items-center gap-1">
              🏫 Teacher Lesson
              <span className="text-sm font-normal text-teal-400">Teacher controls the number</span>
            </motion.button>
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }} onClick={() => setSelfPlay(true)}
              className="bg-white text-teal-700 font-bold text-xl py-6 rounded-2xl shadow-lg flex flex-col items-center gap-1">
              👫 Play with a Partner
              <span className="text-sm font-normal text-teal-400">Compare your numbers with a classmate</span>
            </motion.button>
          </div>
        </div>
      );
    }
    if (selfPlay === true) {
      return <TenFrameComparePair onBack={() => setSelfPlay(null)} studentNumber={studentNumber} className={selectedClass} />;
    }
    return (
      <TenFrameCompareStudentLesson
        onBack={() => setSelfPlay(null)}
        studentNumber={studentNumber}
        className={selectedClass}
      />
    );
  }

  // ── STUDENT VIEW — Number Recognition ──
  if (gameMode === 'numbers') {
    return <NumberBuildingMode onBack={() => setGameMode(null)} studentNumber={studentNumber} className={selectedClass} />;
  }

  // ── STUDENT VIEW — 1 More / 1 Less ──
  if (gameMode === 'onelessmore') {
    if (selfPlay === null) {
      return (
        <div className="min-h-screen bg-gradient-to-b from-sky-400 to-indigo-500 flex flex-col items-center justify-center gap-6 p-6">
          <button onClick={() => setGameMode(null)} className="text-white/80 self-start hover:text-white">← Back</button>
          <div className="text-5xl">🧊</div>
          <h2 className="text-2xl font-bold text-white">1 More / 1 Less</h2>
          <p className="text-white/80">How do you want to play?</p>
          <div className="flex flex-col gap-4 w-full max-w-xs">
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }}
              onClick={() => setSelfPlay(false)}
              className="bg-white text-indigo-700 font-bold text-xl py-6 rounded-2xl shadow-lg flex flex-col items-center gap-1">
              🏫 Teacher Lesson
              <span className="text-sm font-normal text-indigo-400">Teacher controls the pace</span>
            </motion.button>
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }}
              onClick={() => setSelfPlay(true)}
              className="bg-white text-indigo-700 font-bold text-xl py-6 rounded-2xl shadow-lg flex flex-col items-center gap-1">
              🎮 Solo Practice
              <span className="text-sm font-normal text-indigo-400">Spin and build on your own</span>
            </motion.button>
          </div>
        </div>
      );
    }
    if (selfPlay === true) {
      return <OneLessMoreMode onBack={() => setSelfPlay(null)} studentNumber={studentNumber} className={selectedClass} />;
    }
    return <OneLessMoreLessonStudent onBack={() => setSelfPlay(null)} studentNumber={studentNumber} className={selectedClass} />;
  }

  // ── STUDENT VIEW — Bingo sub-mode ──
  if (selfPlay === null) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-400 to-indigo-500 flex flex-col items-center justify-center gap-6 p-6">
        <button onClick={() => { setSelfPlay(null); setGameMode(null); }} className="text-white/80 self-start hover:text-white">← Back</button>
        <div className="text-5xl">🎱</div>
        <h2 className="text-2xl font-bold text-white">{selectedClass} — #{studentNumber}</h2>
        <p className="text-white/80">How do you want to play Bingo?</p>
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelfPlay(false)}
            className="bg-white text-indigo-700 font-bold text-xl py-6 rounded-2xl shadow-lg flex flex-col items-center gap-1"
          >
            🏫 Teacher Game
            <span className="text-sm font-normal text-indigo-400">Teacher calls the numbers</span>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelfPlay(true)}
            className="bg-white text-indigo-700 font-bold text-xl py-6 rounded-2xl shadow-lg flex flex-col items-center gap-1"
          >
            👫 Play with a Friend
            <span className="text-sm font-normal text-indigo-400">Challenge a classmate</span>
          </motion.button>
        </div>
      </div>
    );
  }

  // ── STUDENT VIEW — Peer / Self play ──
  if (selfPlay === true) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-400 to-indigo-500 flex flex-col items-center py-6 px-4">
        <BingoPeerLobby
          className={selectedClass}
          studentNumber={studentNumber}
          onBack={() => setSelfPlay(null)}
        />
      </div>
    );
  }

  // ── STUDENT VIEW — Teacher game ──
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-400 to-indigo-500 flex flex-col items-center py-6 px-4 gap-4">
      <div className="flex items-center justify-between w-full max-w-md">
        <div className="text-white font-bold text-lg">🧮 {selectedClass} #{studentNumber}</div>
        <Button onClick={() => { setSelfPlay(null); }} variant="ghost" className="text-white hover:bg-white/20">
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