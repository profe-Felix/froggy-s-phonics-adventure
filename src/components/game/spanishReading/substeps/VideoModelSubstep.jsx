import React from 'react';
import { SUBSTEP_COLORS as C } from './substepTheme';

export default function VideoModelSubstep({ substep }) {
  const { videoUrl, word } = substep;

  return (
    <div className="flex flex-col items-center gap-4 px-4 py-2 w-full max-w-lg mx-auto">
      {word && (
        <div
          className="text-5xl sm:text-7xl font-black leading-none"
          style={{ color: C.text }}
        >
          {word}
        </div>
      )}
      {videoUrl ? (
        <video
          src={videoUrl}
          controls
          className="w-full rounded-2xl shadow-lg"
          style={{ maxHeight: '60vh' }}
        />
      ) : (
        <div
          className="w-full rounded-2xl shadow-lg p-8 text-center"
          style={{ background: '#ffffff', color: C.muted }}
        >
          No hay video configurado para este paso.
        </div>
      )}
    </div>
  );
}