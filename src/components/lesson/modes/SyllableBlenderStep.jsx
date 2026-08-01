import React from 'react';
import ElkoninActivity from '@/components/workstations/ElkoninActivity';
import StepDoneBar from './StepDoneBar';

// Embedded student step for Elkonin boxes (Syllable Blender) with default
// words and media buckets — same fallback the standalone page uses.
const DEFAULT_WORDS = ['manzana', 'guitarra', 'camión', 'helado', 'caracol'];
const DEFAULT_MEDIA = {
  images: { bucket: 'lettersort-images', prefix: '' },
  syllableAudio: { bucket: 'syllable-audio', prefix: '' },
  wordAudio: { bucket: 'audio', prefix: 'es/words' },
};

export default function SyllableBlenderStep({ onComplete }) {
  return (
    <div className="relative h-full flex flex-col bg-[#f7f8fc]">
      <div className="flex-1 min-h-0 overflow-auto">
        <ElkoninActivity words={DEFAULT_WORDS} behavior={{}} media={DEFAULT_MEDIA} />
      </div>
      <StepDoneBar onDone={onComplete} />
    </div>
  );
}