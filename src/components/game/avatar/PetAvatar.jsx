import React from 'react';
import { ALL_PETS } from './PETS_DATA';

const sizeMap = {
  sm: { box: 'w-10 h-10', emoji: 'text-3xl' },
  md: { box: 'w-16 h-16', emoji: 'text-4xl' },
  lg: { box: 'w-24 h-24', emoji: 'text-6xl' },
  xl: { box: 'w-36 h-36', emoji: 'text-8xl' },
};

export default function PetAvatar({ petId, size = 'md', showName = false }) {
  const pet = ALL_PETS.find(p => p.id === petId) || ALL_PETS[0];
  const s = sizeMap[size] || sizeMap.md;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`${s.box} rounded-full border-4 border-white shadow-lg flex items-center justify-center`}
        style={{ backgroundColor: pet.bg }}
      >
        <span className={s.emoji}>{pet.emoji}</span>
      </div>
      {showName && (
        <span className="text-xs font-bold text-gray-600">{pet.name}</span>
      )}
    </div>
  );
}