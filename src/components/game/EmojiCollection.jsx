import React from 'react';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';
import { getEmojiForIndex, POINTS_PER_EMOJI } from './EmojiPrizeCelebration';

// Total number of emoji faces in the collection (matches FACE_EMOJIS array length)
const TOTAL_EMOJI_SLOTS = 30;

/**
 * Emoji collection modal — like the pet system.
 * Shows all 30 slots; earned ones are revealed, unearned show ?.
 * Tap an earned emoji to set it as the active one shown on the bar.
 */
export default function EmojiCollection({ totalEmojiCount, activeEmojiIdx, onSelectEmoji, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
      >
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-5 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">✨ My Emoji Faces</h2>
          <button onClick={onClose}><X className="w-6 h-6 text-white" /></button>
        </div>

        <div className="p-4 grid grid-cols-5 gap-3 max-h-96 overflow-y-auto">
          {Array.from({ length: TOTAL_EMOJI_SLOTS }, (_, i) => {
            const earned = i < totalEmojiCount;
            const active = earned && i === activeEmojiIdx;
            return (
              <button
                key={i}
                onClick={() => earned && onSelectEmoji(i)}
                className={`relative flex flex-col items-center gap-1 p-2 rounded-2xl border-2 transition
                  ${active ? 'border-purple-500 bg-purple-50 shadow' : 'border-gray-200'}
                  ${!earned ? 'opacity-40 cursor-not-allowed' : 'hover:border-purple-300 cursor-pointer hover:scale-105'}
                `}
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-3xl bg-gray-50">
                  {earned ? getEmojiForIndex(i) : '❓'}
                </div>
                <span className="text-xs font-medium text-gray-500">
                  {earned ? `#${i + 1}` : '???'}
                </span>
                {active && (
                  <span className="absolute -top-1 -right-1 text-base">✅</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-4 text-center text-sm text-gray-400">
          {totalEmojiCount}/{TOTAL_EMOJI_SLOTS} faces collected 🎉
          {totalEmojiCount < TOTAL_EMOJI_SLOTS && (
            <p className="text-xs mt-1 text-purple-400">
              Next face in {POINTS_PER_EMOJI - (totalEmojiCount * POINTS_PER_EMOJI % POINTS_PER_EMOJI || POINTS_PER_EMOJI)} pts
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}