import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import DisplayCubes from './DisplayCubesPanel';

const SPINNER_OPTIONS = ['more', 'less'];

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default function OneLessMoreTeacher({ className, onBack }) {
  const [game, setGame] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [minNum, setMinNum] = useState(2);
  const [maxNum, setMaxNum] = useState(18);

  const createGame = async () => {
    const g = await base44.entities.OneLessMoreGame.create({
      class_name: className,
      is_active: true,
      status: 'waiting',
      round_number: 0,
    });
    setGame(g);
  };

  const nextRound = async () => {
    setSpinning(true);
    const num = randomBetween(minNum, maxNum);
    const result = SPINNER_OPTIONS[Math.floor(Math.random() * 2)];
    const target = result === 'more' ? num + 1 : num - 1;

    // Animate briefly then update
    setTimeout(async () => {
      const updated = await base44.entities.OneLessMoreGame.update(game.id, {
        current_number: num,
        spinner_result: result,
        target_number: target,
        round_number: (game.round_number || 0) + 1,
        status: 'active',
      });
      setGame(updated);
      setSpinning(false);
    }, 600);
  };

  const endGame = async () => {
    const updated = await base44.entities.OneLessMoreGame.update(game.id, { status: 'done', is_active: false });
    setGame(updated);
  };

  if (!game) {
    return (
      <div className="flex flex-col items-center gap-6 max-w-sm mx-auto py-12">
        <h2 className="text-2xl font-bold text-white">🧊 1 More / 1 Less — Teacher</h2>
        <p className="text-white/70">{className}</p>
        <div className="bg-white/20 rounded-2xl p-4 w-full flex flex-col gap-3">
          <label className="text-white text-sm font-bold">Number range</label>
          <div className="flex gap-3 items-center">
            <input type="number" value={minNum} onChange={e => setMinNum(Number(e.target.value))}
              className="w-20 text-center rounded-xl border-2 border-indigo-300 p-2 text-lg font-bold" />
            <span className="text-white font-bold">to</span>
            <input type="number" value={maxNum} onChange={e => setMaxNum(Number(e.target.value))}
              className="w-20 text-center rounded-xl border-2 border-indigo-300 p-2 text-lg font-bold" />
          </div>
        </div>
        <button onClick={createGame}
          className="w-full py-5 bg-white text-indigo-700 font-bold text-xl rounded-2xl shadow-lg hover:bg-indigo-50">
          Start Lesson
        </button>
        <button onClick={onBack} className="text-white/60 hover:text-white text-sm">← Back</button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 flex flex-col items-center gap-6">
      <div className="flex items-center justify-between w-full">
        <button onClick={onBack} className="text-white/70 hover:text-white text-sm">← Back</button>
        <h2 className="text-xl font-bold text-white">🧊 1 More / 1 Less — {className}</h2>
        <span className="text-white/50 text-sm">Round {game.round_number || 0}</span>
      </div>

      {game.status === 'waiting' && (
        <div className="bg-white rounded-3xl p-8 shadow-xl text-center w-full">
          <p className="text-2xl font-bold text-gray-600 mb-2">Ready to begin!</p>
          <p className="text-gray-400 mb-6">Students are waiting. Press "Next Round" to start.</p>
          <button onClick={nextRound}
            className="px-10 py-4 bg-indigo-600 text-white font-bold text-xl rounded-2xl hover:bg-indigo-700 shadow-lg">
            Next Round →
          </button>
        </div>
      )}

      {game.status === 'active' && (
        <div className="bg-white rounded-3xl p-6 shadow-xl w-full flex flex-col items-center gap-5">
          <div className="flex gap-6 items-center flex-wrap justify-center">
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase">Starting Number</span>
              <span className="text-6xl font-bold text-indigo-700">{game.current_number}</span>
            </div>
            <div className={`text-2xl font-bold px-6 py-3 rounded-2xl ${game.spinner_result === 'more' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
              1 {game.spinner_result === 'more' ? 'More ➕' : 'Less ➖'}
            </div>
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase">Answer</span>
              <span className="text-6xl font-bold text-green-600">{game.target_number}</span>
            </div>
          </div>

          <div className="w-full bg-sky-50 rounded-2xl p-4 border border-sky-200">
            <p className="text-xs text-gray-400 font-bold mb-2">Ten-frame ({game.current_number} cubes):</p>
            <DisplayCubes count={game.current_number} />
          </div>

          <div className="flex gap-3 w-full">
            <button onClick={nextRound} disabled={spinning}
              className="flex-1 py-4 bg-indigo-600 text-white font-bold text-lg rounded-2xl hover:bg-indigo-700 disabled:opacity-50 shadow-lg">
              {spinning ? 'Spinning…' : 'Next Round →'}
            </button>
            <button onClick={endGame}
              className="px-6 py-4 bg-gray-100 text-gray-600 font-bold rounded-2xl hover:bg-gray-200">
              End
            </button>
          </div>
        </div>
      )}

      {game.status === 'done' && (
        <div className="bg-white rounded-3xl p-8 shadow-xl text-center w-full">
          <p className="text-3xl font-bold text-green-600 mb-2">Lesson Complete! 🎉</p>
          <p className="text-gray-400 mb-6">{game.round_number} rounds completed.</p>
          <button onClick={createGame}
            className="px-10 py-4 bg-indigo-600 text-white font-bold text-xl rounded-2xl hover:bg-indigo-700">
            New Lesson
          </button>
        </div>
      )}
    </div>
  );
}