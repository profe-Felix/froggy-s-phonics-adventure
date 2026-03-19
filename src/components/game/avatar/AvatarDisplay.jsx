import React from 'react';
import { buildAvatarUrl, getDefaultCosmetics } from './AVATAR_ITEMS';

export default function AvatarDisplay({ cosmetics, seed = 'froggy', size = 'md' }) {
  const sizeMap = { sm: 'w-12 h-12', md: 'w-20 h-20', lg: 'w-32 h-32' };
  const merged = { ...getDefaultCosmetics(), ...cosmetics };
  const url = buildAvatarUrl(merged, seed);

  return (
    <img
      src={url}
      alt="My Avatar"
      className={`${sizeMap[size]} rounded-full bg-sky-100 border-4 border-white shadow-lg`}
    />
  );
}