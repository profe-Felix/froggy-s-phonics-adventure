import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const FACE_EMOJIS = [
  '🥳','🤩','😎','🥰','😍','🤑','😜','🤪','😄','🎉',
  '🦸','🌟','✨','💫','🔥','🎊','🏆','👑','🦄','🎸',
  '🍕','🌈','⚡','🎯','💥','🎁','🎀','🥇','🎠','🎡'
];

export const POINTS_PER_EMOJI = 100;

/**
 * Given old and new lifetime spelling points, returns how many new emojis were earned.
 */
export function countNewEmojis(oldPts, newPts) {
  const oldCount = Math.floor(oldPts / POINTS_PER_EMOJI);
  const newCount = Math.floor(newPts / POINTS_PER_EMOJI);
  return Math.max(0, newCount - oldCount);
}

/** Pick a deterministic emoji from lifetime total */
export function getEmojiForIndex(idx) {
  return FACE_EMOJIS[idx % FACE_EMOJIS.length];
}

/**
 * Full-screen celebration overlay shown when student earns a new emoji prize.
 * onClose: called when student taps the emoji or "Yay!" button.
 */
export default function EmojiPrizeCelebration({ emoji, pointsTotal, onClose }) {
  return (
    <AnimatePresence>
      {emoji && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.3, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0.3, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            onClick={e => e.stopPropagation()}
            className="flex flex-col items-center gap-4 bg-white rounded-3xl shadow-2xl p-8 max-w-xs w-full mx-4"
          >
            <motion.div
              animate={{ scale: [1, 1.15, 1], rotate: [0, 8, -8, 0] }}
              transition={{ repeat: Infinity, duration: 1.4 }}
              className="text-8xl select-none"
            >
              {emoji}
            </motion.div>
            <h2 className="text-2xl font-black text-purple-700 text-center">You earned a prize! 🎉</h2>
            <p className="text-sm text-gray-500 font-bold text-center">
              {pointsTotal} spelling points total
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-black text-lg shadow-lg hover:opacity-90 active:scale-95 transition-all"
            >
              Yay! ✨
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}