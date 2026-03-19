import React from 'react';
import { ALL_PETS, getPetImageUrl } from './PETS_DATA';

export default function PetAvatar({ petId, size = 'md', showName = false }) {
  const pet = ALL_PETS.find(p => p.id === petId) || ALL_PETS[0];
  const sizeMap = { sm: 'w-10 h-10', md: 'w-16 h-16', lg: 'w-28 h-28', xl: 'w-40 h-40' };

  return (
    <div className="flex flex-col items-center gap-1">
      <img
        src={getPetImageUrl(pet)}
        alt={pet.name}
        className={`${sizeMap[size]} rounded-full border-4 border-white shadow-lg`}
        style={{ backgroundColor: pet.bg }}
      />
      {showName && (
        <span className="text-xs font-bold text-gray-600">{pet.name}</span>
      )}
    </div>
  );
}