import { ES_SIGHT_WORD_SEQUENCE } from '../dashboardData.js';

const position = row => [Number(row.module_number), Number(row.curriculum_lesson_number)];
const compare = (a, b) => position(a)[0] - position(b)[0] || position(a)[1] - position(b)[1];

// The dashboard's introduction chart is the authority. Dictation, spelling,
// week-level vocabulary and proportional slices are never HFW introductions.
export function sightWordIntroductions({ moduleNumber, lessonNumber }) {
  const target = { module_number: Number(moduleNumber), curriculum_lesson_number: Number(lessonNumber) };
  if (!position(target).every(n => Number.isSafeInteger(n) && n > 0)) return [];
  const seen = new Set();
  return ES_SIGHT_WORD_SEQUENCE.filter(row => compare(row, target) <= 0)
    .slice().sort(compare).map(row => ({
      ...row,
      words: row.words.filter(word => {
        const key = word.normalize('NFKC').toLocaleLowerCase('es');
        if (seen.has(key)) return false;
        seen.add(key); return true;
      }),
    })).filter(row => row.words.length);
}

export function newSightWordsAt(position) {
  return sightWordIntroductions(position).find(row =>
    row.module_number === Number(position.moduleNumber) &&
    row.curriculum_lesson_number === Number(position.lessonNumber))?.words.slice() || [];
}

export function knownSightWordsAt(position) {
  return sightWordIntroductions(position).flatMap(row => row.words);
}

export function latestSightWordIntroduction(position) {
  return sightWordIntroductions(position).at(-1) || null;
}
