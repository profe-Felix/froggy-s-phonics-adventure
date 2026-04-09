import { useState, useRef } from 'react';
import CollectionCanvas from './CollectionCanvas';
import CountingVerify from './CountingVerify';
import { motion } from 'framer-motion';

function randomSeed() { return Math.floor(Math.random() * 1000000); }
function randomCount() { return Math.floor(Math.random() * 10) + 11; } // 11-20

export default function CountingCollectionSolo({ onBack }) {
  const [seed, setSeed] = useState(randomSeed);
  const [count, setCount] = useState(randomCount);
  const [showVerify, setShowVerify] = useState(false);
  const [done, setDone] = useState(false);
  const [points, setPoints] = useState(0);
  const [streak, setStreak] = useState(0);
  const [firstTry, setFirstTry] = useState(true);
  const topRef = useRef(null);

  const handleCorrect = (wasFirstTry) => {
    if (wasFirstTry) {
      setPoints(p => p + 10);
      setStreak(s => s + 1);
    } else {
      setStreak(0);
    }
    setDone(true);
  };

  const handleNewRound = () => {
    setSeed(randomSeed());
    setCount(randomCount());
    setShowVerify(false);
    setDone(false);
    setFirstTry(true);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-300 to-teal-400 flex flex-col items-center justify-center gap-6 p-6">
        <div className="text-6xl">{streak >= 3 ? '🔥' : '⭐'}</div>
        <p className="text-3xl font-black text-white">Amazing counting!</p>
        {streak >= 2 && <p className="text-xl font-bold text-yellow-200">{streak} in a row! 🔥</p>}
        <div className="bg-white/30 rounded-2xl px-6 py-3 text-white text-center">
          <p className="text-sm font-bold opacity-80">Total Points</p>
          <p className="text-4xl font-black">{points} ⭐</p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <motion.button whileTap={{ scale: 0.95 }} onClick={handleNewRound}
            className="bg-white text-teal-700 font-bold text-xl py-5 rounded-2xl shadow-lg">
            🔄 New Collection
          </motion.button>
          <button onClick={onBack} className="text-white/70 hover:text-white text-center text-sm mt-2">← Back to Menu</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-b from-green-200 to-teal-300 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0">
        <button onClick={onBack} className="text-teal-900/70 hover:text-teal-900 font-medium">← Back</button>
        <h1 className="text-lg font-black text-teal-900">🔢 Count the Collection</h1>
        <div className="flex items-center gap-2">
          {streak >= 2 && <span className="text-orange-500 font-bold text-sm">{streak}🔥</span>}
          <span className="bg-white/60 rounded-xl px-3 py-1 text-sm font-black text-teal-800">{points} ⭐</span>
        </div>
      </div>
      <div className="flex-1 flex gap-3 px-3 pb-3 min-h-0">
        {/* LEFT: collection canvas */}
        <div className="flex-1 bg-white rounded-2xl shadow-xl overflow-hidden min-w-0">
          <CollectionCanvas seed={seed} count={count} hideButton />
        </div>
        {/* RIGHT: write + enter number */}
        <div className="w-64 flex-shrink-0 bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col">
          <CountingVerify
            targetCount={count}
            onVerified={(wasFirstTry) => handleCorrect(wasFirstTry)}
            onGoBack={() => setFirstTry(false)}
          />
        </div>
      </div>
    </div>
  );
}