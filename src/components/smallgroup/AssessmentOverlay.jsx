import React from 'react';
import { assessmentItemStyle } from '@/lib/classroomSync';

// Presentational overlay — receives the assessment broadcast from the parent
// (useStudentLockdown hook) and renders it full-screen. No polling of its own;
// the parent's consolidated hook handles all data fetching and subscriptions.
//
// Mounted inside LetterGame so it overlays whatever the student was doing
// (Level Path, games, lessons, rotation-locked activities) the moment the
// teacher broadcasts to them. When the broadcast clears or the session ends,
// the overlay disappears and the student returns to where they were.
export default function AssessmentOverlay({ assessmentBroadcast }) {
  if (!assessmentBroadcast) return null;

  const { broadcast } = assessmentBroadcast;
  const type = broadcast.assessment_type || '';
  const isLetterType = type === 'upper_names' || type === 'lower_names';
  const isSoundType = type === 'upper_sounds' || type === 'lower_sounds';
  const isDecoding = type === 'decoding';

  const prompt = isSoundType
    ? '¿Qué sonido hace?'
    : isLetterType
      ? '¿Cómo se llama esta letra?'
      : isDecoding
        ? 'Lee esto:'
        : 'Lee la palabra:';

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col items-center justify-center">
      <p className="text-white/60 text-xl mb-6">
        {prompt}
      </p>
      {isDecoding && broadcast.decoding_level && (
        <p className="text-indigo-400/60 text-sm font-medium mb-2 uppercase tracking-wider">
          {broadcast.decoding_level}
        </p>
      )}
      <div
        key={broadcast.item_index}
        className="text-[200px] font-bold text-white leading-none assessment-fade-in"
        style={{
          fontFamily: isLetterType ? "'Teachers', sans-serif" : "'Andika', sans-serif",
        }}
      >
        {broadcast.current_item}
      </div>
      <p className="text-white/30 mt-8 text-sm">
        {broadcast.item_index + 1} of {broadcast.total_items}
      </p>
    </div>
  );
}