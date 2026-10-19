import { knownSightWordsAt } from '../literacy/sightWordProgression.mjs';

const validPosition = (moduleNumber, lessonNumber) =>
  [moduleNumber, lessonNumber].every(n => Number.isSafeInteger(n) && n > 0);

export function readerSightWordPosition(lessonKey, classConfig) {
  const moduleNumber = Number(classConfig?.active_spanish_module);
  const lessonNumber = Number(classConfig?.active_spanish_lesson);
  if (validPosition(moduleNumber, lessonNumber)) return { moduleNumber, lessonNumber };
  // Authoring without a selected class still has a deterministic lesson preview.
  const match = /^M(\d+)\.L(\d+)$/i.exec(String(lessonKey || '').trim());
  if (!match || !validPosition(Number(match[1]), Number(match[2]))) return null;
  return { moduleNumber: Number(match[1]), lessonNumber: Number(match[2]) };
}

export function knownWordsForReader(lessonKey, classConfig) {
  const target = readerSightWordPosition(lessonKey, classConfig);
  if (!target) return new Set();
  // Exact HFW introductions, never dictation words or a proportional list.
  return new Set(knownSightWordsAt(target).map(word =>
    word.normalize('NFKC').trim().toLocaleLowerCase('es')
      .normalize('NFD').replace(/n\u0303/g, 'ñ').replace(/u\u0308/g, 'ü')
      .replace(/[\u0300-\u036f]/g, '')
  ));
}
