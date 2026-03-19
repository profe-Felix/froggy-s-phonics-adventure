import React from 'react';
import { X } from 'lucide-react';
import { ALL_PETS, getPetImageUrl } from './PETS_DATA';
import { motion } from 'framer-motion';

export default function PetCollection({ unlockedIds = [], activePetId, onSelectPet, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
      >
        <div className="bg-gradient-to-r from-green-400 to-teal-400 p-5 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">🐾 My Pets</h2>
          <button onClick={onClose}><X className="w-6 h-6 text-white" /></button>
        </div>

        <div className="p-4 grid grid-cols-4 gap-3 max-h-96 overflow-y-auto">
          {ALL_PETS.map(pet => {
            const owned = unlockedIds.includes(pet.id);
            const active = pet.id === activePetId;
            return (
              <button
                key={pet.id}
                onClick={() => owned && onSelectPet(pet.id)}
                className={`relative flex flex-col items-center gap-1 p-2 rounded-2xl border-2 transition
                  ${active ? 'border-green-500 bg-green-50 shadow' : 'border-gray-200'}
                  ${!owned ? 'opacity-40 cursor-not-allowed grayscale' : 'hover:border-green-300 cursor-pointer hover:scale-105'}
                `}
              >
                <img
                  src={getPetImageUrl(pet)}
                  alt={owned ? pet.name : '???'}
                  className="w-14 h-14 rounded-full"
                  style={{ backgroundColor: pet.bg }}
                />
                <span className="text-xs font-medium text-gray-600 truncate w-full text-center">
                  {owned ? pet.name : '???'}
                </span>
                {active && (
                  <span className="absolute -top-1 -right-1 text-base">✅</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-4 text-center text-sm text-gray-400">
          {unlockedIds.length}/{ALL_PETS.length} pets collected 🎉
        </div>
      </motion.div>
    </div>
  );
}