import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Ordered list of fruits students can collect
export const FRUIT_LIST = [
  '🍎', '🍊', '🍋', '🍇', '🍓', '🍒', '🍑', '🥭', '🍍', '🍌',
  '🍈', '🫐', '🍉', '🥝', '🍐', '🫒', '🍅', '🥥', '🌽', '🍆'
];

export const POINTS_PER_FRUIT = 75;

/**
 * Compute how many fruits should be unlocked based on lifetime spelling points.
 * Also returns the next milestone.
 */
export function computeFruitProgress(spellingTotalPoints = 0) {
  const earned = Math.floor(spellingTotalPoints / POINTS_PER_FRUIT);
  const nextMilestone = (earned + 1) * POINTS_PER_FRUIT;
  const progressToNext = spellingTotalPoints % POINTS_PER_FRUIT;
  return { earned, nextMilestone, progressToNext };
}

/**
 * Given old and new lifetime points, returns an array of newly-earned fruit emojis.
 */
export function getNewFruits(oldPoints = 0, newPoints = 0, alreadyUnlocked = []) {
  const { earned: newEarned } = computeFruitProgress(newPoints);
  const newFruits = [];
  for (let i = alreadyUnlocked.length; i < newEarned && i < FRUIT_LIST.length; i++) {
    newFruits.push(FRUIT_LIST[i]);
  }
  return newFruits;
}

/** Compact badge shown beside the pet on ModeSelection */
export function FruitBadge({ unlockedFruits = [], spellingTotalPoints = 0, onClick }) {
  const { progressToNext } = computeFruitProgress(spellingTotalPoints);
  const count = unlockedFruits.length;
  const latest = count > 0 ? unlockedFruits[count - 1] : '🍎';
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 group"
    >
      <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-yellow-300 to-orange-400 flex items-center justify-center text-3xl shadow-lg group-hover:scale-105 transition-all">
        {count > 0 ? latest : '🫙'}
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-black rounded-full w-5 h-5 flex items-center justify-center">
            {count}
          </span>
        )}
      </div>
      {/* Progress bar to next fruit */}
      <div className="w-14 h-1.5 bg-white/60 rounded-full overflow-hidden">
        <div
          className="h-full bg-orange-500 rounded-full transition-all"
          style={{ width: `${(progressToNext / POINTS_PER_FRUIT) * 100}%` }}
        />
      </div>
      <span className="text-xs font-bold text-orange-800">🍎 Fruits</span>
    </button>
  );
}

/** Full fruit collection modal */
export default function FruitCollection({ unlockedFruits = [], spellingTotalPoints = 0, onClose }) {
  const { earned, nextMilestone, progressToNext } = computeFruitProgress(spellingTotalPoints);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.8, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-black text-orange-700">🍎 My Fruit Collection</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">✕</button>
        </div>

        <p className="text-sm text-gray-500 mb-1 font-bold">
          {spellingTotalPoints} spelling points · {unlockedFruits.length} fruits collected
        </p>

        {/* Progress to next fruit */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-400 font-bold mb-1">
            <span>{progressToNext} pts</span>
            <span>{nextMilestone} pts → next fruit!</span>
          </div>
          <div className="h-3 bg-orange-100 rounded-full overflow-hidden border border-orange-200">
            <motion.div
              className="h-full bg-gradient-to-r from-orange-400 to-yellow-400 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(progressToNext / POINTS_PER_FRUIT) * 100}%` }}
              transition={{ duration: 0.6 }}
            />
          </div>
        </div>

        {/* Fruit grid */}
        <div className="grid grid-cols-5 gap-2">
          {FRUIT_LIST.map((fruit, i) => {
            const unlocked = i < unlockedFruits.length;
            return (
              <motion.div
                key={i}
                initial={unlocked ? { scale: 0.5 } : {}}
                animate={{ scale: 1 }}
                className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl
                  ${unlocked ? 'bg-orange-50 border-2 border-orange-300 shadow' : 'bg-gray-100 border-2 border-gray-200 opacity-30 grayscale'}`}
              >
                {fruit}
              </motion.div>
            );
          })}
        </div>

        <p className="text-center text-xs text-gray-400 mt-4 font-bold">
          Earn {POINTS_PER_FRUIT} spelling points for each new fruit!
        </p>
      </motion.div>
    </motion.div>
  );
}