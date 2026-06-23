import React from 'react';
import { motion } from 'framer-motion';
import { ALL_PETS } from './avatar/PETS_DATA';
import { POINTS_PER_FRUIT, computeFruitProgress } from './FruitCollection';
import { POINTS_PER_EMOJI, getEmojiForIndex } from './EmojiPrizeCelebration';

const PTS_PER_STICKER = 100;

/**
 * Condensed reward bar — replaces 4 separate badge components with a single
 * horizontal row of compact chips. Each chip opens its respective modal/handler.
 */
export default function RewardBar({
  activePetId,
  unlockedPets,
  pendingUnlocks,
  unlockedFruits,
  spellingTotalPoints,
  sentencesTotalPoints,
  onOpenPets,
  onOpenFruits,
  onOpenSentences,
  onOpenEmojis,
  activeEmojiIdx,
}) {
  const pet = ALL_PETS.find(p => p.id === activePetId) || ALL_PETS[0];
  const petCount = unlockedPets.length;

  const { progressToNext: fruitProgress } = computeFruitProgress(spellingTotalPoints);
  const fruitCount = unlockedFruits.length;

  const sentenceProgress = (sentencesTotalPoints || 0) % PTS_PER_STICKER;

  const totalEmojiCount = Math.floor((spellingTotalPoints || 0) / POINTS_PER_EMOJI);
  const emojiProgress = (spellingTotalPoints || 0) % POINTS_PER_EMOJI;
  const activeEmoji = totalEmojiCount > 0 ? getEmojiForIndex(activeEmojiIdx ?? totalEmojiCount - 1) : '🎯';

  const Chip = ({ onClick, bg, children, label }) => (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 bg-white/90 rounded-xl px-2 sm:px-3 py-1.5 shadow-sm hover:shadow-md transition-all min-w-[52px] sm:min-w-[64px] relative"
    >
      <div className="flex items-center gap-1">
        <span className="text-lg sm:text-xl leading-none">{children}</span>
      </div>
      <span className="text-[9px] sm:text-[10px] font-black text-gray-600 leading-none">{label}</span>
    </motion.button>
  );

  return (
    <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap">
      {/* Pet chip */}
      <Chip
        onClick={onOpenPets}
        bg={pet.bg}
        label={`${petCount}/${ALL_PETS.length}`}
      >
        <span
          className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-sm sm:text-base"
          style={{ backgroundColor: pet.bg }}
        >
          {pet.emoji}
        </span>
        {pendingUnlocks > 0 && (
          <span className="absolute -top-1 -right-1 bg-amber-400 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center animate-pulse">
            {pendingUnlocks}
          </span>
        )}
      </Chip>

      {/* Fruit chip */}
      <Chip
        onClick={onOpenFruits}
        bg="#fed7aa"
        label={`${fruitProgress}/${POINTS_PER_FRUIT}`}
      >
        🍎
        {fruitCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">
            {fruitCount}
          </span>
        )}
      </Chip>

      {/* Sentence prize chip */}
      <Chip
        onClick={onOpenSentences}
        bg="#fce7f3"
        label={`${sentenceProgress}/${PTS_PER_STICKER}`}
      >
        🎡
      </Chip>

      {/* Emoji face chip */}
      <Chip
        onClick={onOpenEmojis}
        bg="#f3e8ff"
        label={`${emojiProgress}/${POINTS_PER_EMOJI}`}
      >
        {activeEmoji}
        {totalEmojiCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">
            {totalEmojiCount}
          </span>
        )}
      </Chip>
    </div>
  );
}