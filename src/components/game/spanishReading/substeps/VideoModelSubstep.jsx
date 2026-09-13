import React, { useState, useEffect } from 'react';
import { SUBSTEP_COLORS as C } from './substepTheme';
import SlideToReadCanvas from '../SlideToReadCanvas';

// Video Model substep: replays the teacher's recorded demo (audio + slider
// animation) using the playback system — no video file needed.
//
// The demo data lives in step.config.demos[word] as { audio_url, slider_data }.
// When no demo is configured, shows an "unconfigured" message instead of a
// recorder (teachers record demos from the Practice step or the recorder view).
export default function VideoModelSubstep({ substep }) {
  const { word, demo } = substep;
  // demo can be { audio_url, slider_data } (new playback system) or a string
  // URL (legacy video). Support both.
  const audioUrl = demo?.audio_url || (typeof demo === 'string' ? demo : '');
  const sliderData = demo?.slider_data || [];

  if (!audioUrl) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 w-full max-w-md mx-auto text-center">
        <div
          className="text-5xl sm:text-7xl font-black leading-none tracking-tight"
          style={{ color: C.text }}
        >
          {word}
        </div>
        <p className="text-sm font-bold" style={{ color: C.muted }}>
          No hay modelo grabado para esta palabra.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex-1 overflow-hidden">
        <SlideToReadCanvas
          text={word}
          theme="mint"
          replayData={{ audioUrl, sliderData }}
        />
      </div>
    </div>
  );
}