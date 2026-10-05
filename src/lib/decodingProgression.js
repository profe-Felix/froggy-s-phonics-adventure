// Adaptive decoding progression for Spanish Reading free play.
//
// Students start at the easiest level (CV syllables). As their self-check
// accuracy on a level reaches 80% (with a minimum number of attempts), the
// next level unlocks and becomes the focus. Mastered levels contribute a
// small amount of spiral review so earlier patterns aren't forgotten, but
// the bulk of the round is always the student's current level — capable
// students don't keep drilling the easiest syllables.
//
// Levels follow decodingSyllables.js: CV → CVC → CVCV → inverse.
// Mastery is computed from SpanishReadingSession records tagged with
// list_name = `Decoding ${levelId}` and the student's self-check grade.

import { DECODING_LEVELS, generateDecodingItems } from './decodingSyllables';

export const MASTERY_THRESHOLD = 0.8;
export const MIN_ATTEMPTS = 5;
export const ROUND_SIZE = 10;
export const REVIEW_PER_MASTERED = 2;

// Tag stored as list_name on SpanishReadingSession records for decoding practice.
export const decodingListName = (levelId) => `Decoding ${levelId}`;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Self-check mastery for a single decoding level.
// `sessions` are SpanishReadingSession records (any list_name).
export function getLevelMastery(sessions, levelId) {
  const tag = decodingListName(levelId);
  const graded = (sessions || [])
    .filter(s => s.list_name === tag)
    .filter(s => s.student_self_grade && s.student_self_grade !== 'pending');
  if (graded.length < MIN_ATTEMPTS) {
    return { accuracy: 0, attempts: graded.length, mastered: false };
  }
  const correct = graded.filter(s => s.student_self_grade === 'correct').length;
  const accuracy = correct / graded.length;
  return { accuracy, attempts: graded.length, mastered: accuracy >= MASTERY_THRESHOLD };
}

// The student's current decoding level + a mastery map for every level.
// The current level is the first level that is unlocked but not yet mastered.
export function getStudentDecodingTier(sessions) {
  const mastery = {};
  for (const level of DECODING_LEVELS) {
    mastery[level.id] = getLevelMastery(sessions, level.id);
  }
  let currentLevel = DECODING_LEVELS[0].id;
  for (let i = 0; i < DECODING_LEVELS.length; i++) {
    if (mastery[DECODING_LEVELS[i].id].mastered) {
      if (i < DECODING_LEVELS.length - 1) {
        currentLevel = DECODING_LEVELS[i + 1].id;
      } else {
        currentLevel = DECODING_LEVELS[i].id; // all mastered
      }
    } else {
      currentLevel = DECODING_LEVELS[i].id;
      break;
    }
  }
  return { currentLevel, mastery };
}

// Build an adaptive practice round for Sílabas free play.
// Returns { levelId, items } where items is an array of strings.
// The round focuses on the current level, with a couple of review items
// from already-mastered lower levels so earlier patterns spiral back in.
export function buildAdaptiveDecodingRound(sessions, moduleNumber, lessonNumber) {
  const { currentLevel, mastery } = getStudentDecodingTier(sessions);

  let currentItems = generateDecodingItems(currentLevel, moduleNumber, lessonNumber);

  // If the current level has no items at this curriculum position (e.g. the
  // class is early and CVC words aren't teachable yet), fall back to the
  // first level that does have items so the student always has something.
  if (currentItems.length === 0) {
    for (const level of DECODING_LEVELS) {
      const items = generateDecodingItems(level.id, moduleNumber, lessonNumber);
      if (items.length > 0) {
        return { levelId: level.id, items: shuffle(items).slice(0, ROUND_SIZE) };
      }
    }
    return { levelId: currentLevel, items: [] };
  }

  // Spiral review: a couple of items from each already-mastered lower level.
  const reviewItems = [];
  for (let i = 0; i < DECODING_LEVELS.length; i++) {
    const level = DECODING_LEVELS[i];
    if (level.id === currentLevel) break;
    if (mastery[level.id].mastered) {
      const items = generateDecodingItems(level.id, moduleNumber, lessonNumber);
      if (items.length > 0) {
        reviewItems.push(...shuffle(items).slice(0, REVIEW_PER_MASTERED));
      }
    }
  }

  const reviewCount = Math.min(reviewItems.length, REVIEW_PER_MASTERED);
  const focusCount = Math.max(1, ROUND_SIZE - reviewCount);

  const pool = [
    ...shuffle(currentItems).slice(0, Math.min(focusCount, currentItems.length)),
    ...reviewItems.slice(0, reviewCount),
  ];

  return { levelId: currentLevel, items: shuffle(pool) };
}