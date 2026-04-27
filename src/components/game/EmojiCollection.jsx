import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getEmojiForIndex } from './EmojiPrizeCelebration';

/**
 * Tappable emoji collection display — like the pet system.
 * Shows all earned emojis; tap one to set it as active (shown in the bar).
 */
export default function EmojiCollection({ totalEmojiCount, activeEmojiIdx, onSelectEmoji, onClose }) {
  const emojis = Array.from({ length: totalEmojiCount }, (_, i) => ({
    idx: i,
    emoji: getEmojiForIndex(i),
  }));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center pb-4 px-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl p-5 w-full max-w-sm"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black text-purple-700 text-lg">My Emoji Collection ✨</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-gray-500 font-bold mb-3 text-center">Tap an emoji to show it on your bar!</p>
        {emojis.length === 0 ? (
          <p className="text-center text-gray-400 font-bold py-4">No emojis yet — keep spelling! 🎯</p>
        ) : (
          <div className="grid grid-cols-5 gap-2">
            {emojis.map(({ idx, emoji }) => (
              <button
                key={idx}
                onClick={() => onSelectEmoji(idx)}
                className={`w-full aspect-square rounded-2xl flex items-center justify-center text-3xl transition-all active:scale-90
                  ${activeEmojiIdx === idx
                    ? 'bg-purple-100 border-2 border-purple-500 scale-110 shadow-lg'
                    : 'bg-gray-50 border-2 border-gray-200 hover:bg-purple-50 hover:border-purple-300'
                  }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}