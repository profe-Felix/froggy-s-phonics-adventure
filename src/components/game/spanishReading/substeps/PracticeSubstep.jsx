import React from 'react';
import SlideToReadCanvas from '../SlideToReadCanvas';
import { SUBSTEP_COLORS as C } from './substepTheme';

export default function PracticeSubstep({ substep, onRecordingComplete }) {
  const { word, itemId, hint, itemType = 'word' } = substep;

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex-1 overflow-hidden">
        <SlideToReadCanvas
          text={word}
          itemId={itemId}
          itemType={itemType}
          theme="mint"
          onRecordingComplete={onRecordingComplete}
          onBack={() => {}}
        />
      </div>
      {hint && (
        <p
          className="text-sm text-center py-2 px-4 shrink-0"
          style={{ color: C.muted, background: C.bg }}
        >
          <span className="font-bold">Hint:</span> {hint}
        </p>
      )}
    </div>
  );
}