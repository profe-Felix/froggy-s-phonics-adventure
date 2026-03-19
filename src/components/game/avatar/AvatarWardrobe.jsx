import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock } from 'lucide-react';
import { AVATAR_ITEMS, getUnlockedItems } from './AVATAR_ITEMS';
import AvatarDisplay from './AvatarDisplay';

const SLOTS = ['hat', 'outfit', 'accessory'];
const SLOT_LABELS = { hat: '🎩 Hats', outfit: '👕 Outfits', accessory: '✨ Accessories' };

export default function AvatarWardrobe({ studentData, cosmetics, onSave, onClose }) {
  const [current, setCurrent] = useState({ ...cosmetics });
  const [activeSlot, setActiveSlot] = useState('hat');

  const unlockedIds = new Set(getUnlockedItems(studentData).map(i => i.id));
  const slotItems = AVATAR_ITEMS.filter(i => i.slot === activeSlot);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.8, y: 40 }}
          animate={{ scale: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-400 to-pink-400 p-5 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">My Avatar</h2>
            <button onClick={onClose} className="text-white/80 hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Preview */}
          <div className="flex justify-center py-6 bg-gradient-to-b from-sky-100 to-green-100">
            <AvatarDisplay cosmetics={current} size="lg" />
          </div>

          {/* Slot tabs */}
          <div className="flex border-b">
            {SLOTS.map(slot => (
              <button
                key={slot}
                onClick={() => setActiveSlot(slot)}
                className={`flex-1 py-3 text-sm font-medium transition ${
                  activeSlot === slot
                    ? 'border-b-2 border-purple-500 text-purple-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {SLOT_LABELS[slot]}
              </button>
            ))}
          </div>

          {/* Items grid */}
          <div className="p-4 grid grid-cols-4 gap-3 max-h-48 overflow-y-auto">
            {slotItems.map(item => {
              const unlocked = unlockedIds.has(item.id);
              const selected = current[activeSlot] === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => unlocked && setCurrent(c => ({ ...c, [activeSlot]: item.id }))}
                  className={`relative flex flex-col items-center justify-center p-2 rounded-2xl border-2 transition aspect-square
                    ${selected ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-gray-50'}
                    ${!unlocked ? 'opacity-50 cursor-not-allowed' : 'hover:border-purple-300 cursor-pointer'}
                  `}
                  title={!unlocked ? item.hint : item.label}
                >
                  <span className="text-2xl">{item.emoji || '✖️'}</span>
                  <span className="text-xs text-gray-500 mt-0.5 truncate w-full text-center">{item.label}</span>
                  {!unlocked && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/40">
                      <Lock className="w-4 h-4 text-gray-400" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Locked hint */}
          <div className="px-4 pb-1 text-xs text-gray-400 text-center">
            🔒 Locked items show what you need to unlock them
          </div>

          {/* Save */}
          <div className="p-4">
            <button
              onClick={() => onSave(current)}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-3 rounded-2xl hover:opacity-90 transition text-lg"
            >
              Save Look ✨
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}