import React, { useMemo } from 'react';
import ElkoninActivity from '@/components/workstations/ElkoninActivity';
import StepDoneBar from './StepDoneBar';
import { buildSyllableBlenderWords, parseCurriculumKey } from '@/lib/literacy/curriculumContentBuilder';

// Embedded student step for Elkonin boxes (Syllable Blender) with default
// words and media buckets — same fallback the standalone page uses.
// When curriculumPosition is provided, decodable words are auto-built from the
// grapheme progression with weighted spiral review.
const DEFAULT_WORDS = ['manzana', 'guitarra', 'camión', 'helado', 'caracol'];
const DEFAULT_MEDIA = {
  images: { bucket: 'lettersort-images', prefix: '' },
  syllableAudio: { bucket: 'syllable-audio', prefix: '' },
  wordAudio: { bucket: 'audio', prefix: 'es/words' },
};

export default function SyllableBlenderStep({ onComplete, curriculumPosition, curriculumPositionOverride }) {
  const words = useMemo(() => {
    if (!curriculumPosition) return DEFAULT_WORDS;
    const pos = curriculumPositionOverride
      ? parseCurriculumKey(curriculumPositionOverride)
      : curriculumPosition;
    const moduleNumber = Number(pos?.module_number);
    const lessonNumber = Number(pos?.curriculum_lesson_number);
    if (moduleNumber > 0 && lessonNumber > 0) {
      const built = buildSyllableBlenderWords({ moduleNumber, lessonNumber });
      if (built.length > 0) return built;
    }
    return DEFAULT_WORDS;
  }, [curriculumPosition, curriculumPositionOverride]);

  return (
    <div className="relative h-full flex flex-col bg-[#f7f8fc]">
      <div className="flex-1 min-h-0 overflow-auto">
        <ElkoninActivity words={words} behavior={{}} media={DEFAULT_MEDIA} />
      </div>
      <StepDoneBar onDone={onComplete} />
    </div>
  );
}