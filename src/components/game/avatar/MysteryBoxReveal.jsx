import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getRandomNewPets } from './PETS_DATA';
import confetti from 'canvas-confetti';

export default function MysteryBoxReveal({ studentData, onUnlock, onClose }) {
  const unlockedIds = studentData?.unlocked_pets || [];
  const [choices] = useState(() => getRandomNewPets(unlockedIds, 3));
  const [revealed, setRevealed] = useState(null);
  const [chosen, setChosen] = useState(null);

  function pickBox(index) {
    if (chosen !== null) return;
    const pet = choices[index];
    setChosen(index);
    setRevealed(pet);
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 } });
  }

  if (choices.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 text-center shadow-2xl max-w-sm w-full">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-700">All pets unlocked!</h2>
          <p className="text-gray-500 mt-2">You're a true pet master!</p>
          <button onClick={onClose} className="mt-6 bg-purple-500 text-white px-6 py-2 rounded-full font-bold hover:bg-purple-600 transition">
            Awesome!
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
      >
        <div className="bg-gradient-to-r from-yellow-400 to-orange-400 p-5 text-center">
          <h2 className="text-3xl font-bold text-white drop-shadow">🎉 New Pet Unlocked!</h2>
          <p className="text-white/90 mt-1">Pick a mystery box to reveal your pet!</p>
        </div>

        <div className="p-8 flex justify-center gap-6">
          {choices.map((pet, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <motion.button
                whileHover={chosen === null ? { scale: 1.1, y: -5 } : {}}
                whileTap={chosen === null ? { scale: 0.95 } : {}}
                onClick={() => pickBox(i)}
                className={`w-24 h-24 rounded-2xl flex items-center justify-center text-5xl shadow-lg border-4 transition
                  ${chosen === i ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200 bg-gray-50 cursor-pointer'}
                  ${chosen !== null && chosen !== i ? 'opacity-40' : ''}
                `}
              >
                <AnimatePresence mode="wait">
                  {chosen === i ? (
                    <motion.span
                      key="revealed"
                      initial={{ scale: 0, rotate: -20 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 300 }}
                      className="text-5xl"
                    >
                      {pet.emoji}
                    </motion.span>
                  ) : (
                    <motion.span key="box" className="text-4xl select-none">❓</motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
              {chosen === i && (
                <motion.span
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="font-bold text-gray-700"
                >
                  {pet.name}!
                </motion.span>
              )}
            </div>
          ))}
        </div>

        {revealed && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="pb-6 px-6 flex flex-col items-center gap-3"
          >
            <p className="text-gray-500 text-center">You got <strong>{revealed.name}</strong>! It's been added to your pet collection.</p>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => onUnlock(revealed.id, false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-2xl transition"
              >
                Keep current pet
              </button>
              <button
                onClick={() => onUnlock(revealed.id, true)}
                className="flex-1 bg-gradient-to-r from-yellow-400 to-orange-400 text-white font-bold py-3 rounded-2xl hover:opacity-90 transition"
              >
                Use {revealed.name}! 🐾
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}