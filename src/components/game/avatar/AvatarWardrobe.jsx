import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock } from 'lucide-react';
import { AVATAR_ITEMS, getUnlockedItems, getDefaultCosmetics, buildAvatarUrl } from './AVATAR_ITEMS';
import AvatarDisplay from './AvatarDisplay';

const SLOTS = ['hat', 'outfit', 'accessory'];
const SLOT_LABELS = { hat: '💇 Hair', outfit: '👕 Outfit', accessory: '✨ Extras' };

export default function AvatarWardrobe({ studentData, cosmetics, onSave, onClose }) {
  const [current, setCurrent] = useState({ ...getDefaultCosmetics(), ...cosmetics });
  const [activeSlot, setActiveSlot] = useState('hat');

  const unlockedIds = new Set(getUnlockedItems(studentData).map(i => i.id));
  const slotItems = AVATAR_ITEMS.filter(i => i.slot === activeSlot);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.85, y: 30 }}
          animate={{ scale: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-500 to-pink-400 p-5 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">✨ Dress Up</h2>
            <button onClick={onClose} className="text-white/80 hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Big preview */}
          <div className="flex justify-center items-center py-6 bg-gradient-to-b from-sky-100 to-green-100">
            <AvatarDisplay cosmetics={current} seed={String(studentData?.student_number || 'froggy')} size="lg" />
          </div>

          {/* Slot tabs */}
          <div className="flex border-b">
            {SLOTS.map(slot => (
              <button
                key={slot}
                onClick={() => setActiveSlot(slot)}
                className={`flex-1 py-3 text-sm font-semibold transition ${
                  activeSlot === slot
                    ? 'border-b-2 border-purple-500 text-purple-600'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {SLOT_LABELS[slot]}
              </button>
            ))}
          </div>

          {/* Items grid */}
          <div className="p-4 grid grid-cols-3 gap-3 max-h-52 overflow-y-auto">
            {slotItems.map(item => {
              const unlocked = unlockedIds.has(item.id);
              const selected = current[activeSlot] === item.id;

              // Build a tiny preview URL for this single item
              const previewCosmetics = { ...getDefaultCosmetics(), [activeSlot]: item.id };
              const previewUrl = buildAvatarUrl(previewCosmetics, String(studentData?.student_number || 'froggy'));

              return (
                <button
                  key={item.id}
                  onClick={() => unlocked && setCurrent(c => ({ ...c, [activeSlot]: item.id }))}
                  title={!unlocked ? `🔒 ${item.hint}` : item.label}
                  className={`relative flex flex-col items-center gap-1 p-2 rounded-2xl border-2 transition
                    ${selected ? 'border-purple-500 bg-purple-50 shadow-md' : 'border-gray-200 bg-gray-50'}
                    ${!unlocked ? 'opacity-50 cursor-not-allowed' : 'hover:border-purple-300 cursor-pointer hover:scale-105'}
                  `}
                >
                  <img src={previewUrl} alt={item.label} className="w-14 h-14 rounded-full bg-sky-50" />
                  <span className="text-xs font-medium text-gray-600 truncate w-full text-center">{item.label}</span>
                  {!unlocked && (
                    <div className="absolute inset-0 rounded-2xl bg-white/40 flex items-end justify-center pb-1">
                      <span className="text-xs text-gray-500 bg-white/80 px-1 rounded">{item.hint}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Save */}
          <div className="p-4 pt-2">
            <button
              onClick={() => onSave(current)}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-3 rounded-2xl hover:opacity-90 transition text-lg shadow-lg"
            >
              Save My Look ✨
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}