import React from 'react';
import { AVATAR_ITEMS } from './AVATAR_ITEMS';

// A simple layered emoji avatar — base character + cosmetic overlays
export default function AvatarDisplay({ cosmetics = {}, size = 'md' }) {
  const sizeMap = { sm: 'text-4xl w-16 h-16', md: 'text-6xl w-24 h-24', lg: 'text-8xl w-32 h-32' };
  const overlayMap = { sm: 'text-xl', md: 'text-2xl', lg: 'text-3xl' };

  const hat = AVATAR_ITEMS.find(i => i.id === (cosmetics.hat || 'hat_none'));
  const outfit = AVATAR_ITEMS.find(i => i.id === (cosmetics.outfit || 'outfit_none'));
  const acc = AVATAR_ITEMS.find(i => i.id === (cosmetics.accessory || 'acc_none'));

  return (
    <div className="relative inline-flex flex-col items-center">
      {/* Hat above */}
      <div className={`${overlayMap[size]} h-6 flex items-center justify-center`}>
        {hat?.emoji || ''}
      </div>
      {/* Body */}
      <div className={`relative ${sizeMap[size]} flex items-center justify-center bg-yellow-100 rounded-full border-4 border-yellow-300 shadow-lg`}>
        <span className={sizeMap[size].split(' ')[0]}>🧒</span>
        {/* Accessory overlay */}
        {acc?.emoji && (
          <span className={`absolute -top-1 -right-1 ${overlayMap[size]}`}>{acc.emoji}</span>
        )}
      </div>
      {/* Outfit below */}
      {outfit?.emoji && outfit.id !== 'outfit_none' && (
        <div className={`${overlayMap[size]} mt-1`}>{outfit.emoji}</div>
      )}
    </div>
  );
}