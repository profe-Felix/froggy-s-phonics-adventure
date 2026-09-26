// Shared curriculum-driven content builder for workstation activities.
//
// Given an M#.L# curriculum position and a content type (letters, syllables,
// sight_words), this module builds a weighted spiral-review pool where recent
// lessons appear more frequently than older ones (exponential decay).
//
// Graphemes come from the static ES_GRAPHEME_CHART (no data loading needed).
// Sight words come from lesson literacy_progression records (lessons array
// must be passed in).

import {
  ES_GRAPHEME_SEQUENCE,
  compareCurriculumPositions,
} from './curriculumGraphemes';
import {
  splitLiteracyList,
  normalizeSpanish,
} from './lessonProgression';

// decay=0.6 → each lesson back gets 60% of the weight of the one after it.
const DEFAULT_DECAY = 0.6;
const VOWELS = ['a', 'e', 'i', 'o', 'u'];

// Parse "M2.L6" → { module_number: 2, curriculum_lesson_number: 6 }
export function parseCurriculumKey(key) {
  const match = /^M(\d+)\.L(\d+)$/i.exec(String(key || '').trim());
  if (!match) return null;
  return {
    module_number: Number(match[1]),
    curriculum_lesson_number: Number(match[2]),
  };
}

// Convert a grapheme ID to the consonant + allowed vowels for syllable generation.
function graphemeToSyllableBase(grapheme) {
  const g = normalizeSpanish(grapheme);
  if (VOWELS.includes(g)) return null;
  if (g === 'c-fuerte') return { consonant: 'c', vowels: ['a', 'o', 'u'] };
  if (g === 'c-suave') return { consonant: 'c', vowels: ['e', 'i'] };
  if (g === 'g-fuerte') return { consonant: 'g', vowels: ['a', 'o', 'u'] };
  if (g === 'g-suave') return { consonant: 'g', vowels: ['e', 'i'] };
  if (g === 'g-dieresis') return { consonant: 'gü', vowels: ['e', 'i'] };
  if (g === 'r-inicial' || g === 'r-medial' || g === 'r-final') return { consonant: 'r', vowels: VOWELS };
  if (g === 'rr-medial') return { consonant: 'rr', vowels: VOWELS };
  if (g === 'y-inicial') return { consonant: 'y', vowels: VOWELS };
  return { consonant: g, vowels: VOWELS };
}

// Lessons that introduced new graphemes, ordered oldest → newest.
function getGraphemeLessons(moduleNumber, lessonNumber) {
  const target = { module_number: moduleNumber, curriculum_lesson_number: lessonNumber };
  return ES_GRAPHEME_SEQUENCE
    .filter(l => compareCurriculumPositions(l, target) <= 0)
    .filter(l => (l.graphemes || []).length > 0);
}

// Apply weighted decay to a list of item-groups (one per lesson that introduced
// new content). Returns a flat pool where recent groups appear more.
function applyWeightedDecay(groups, multiplier, decay) {
  const pool = [];
  groups.forEach((items, index) => {
    const recencyRank = groups.length - 1 - index; // 0 = most recent
    const weight = Math.pow(decay, recencyRank);
    const repetitions = Math.max(1, Math.round(weight * multiplier));
    for (let i = 0; i < repetitions; i++) {
      items.forEach(item => pool.push(item));
    }
  });
  return pool;
}

// ── Letters / phonemes ──────────────────────────────────────────────────────
export function buildLetterPool({ moduleNumber, lessonNumber, decay = DEFAULT_DECAY }) {
  const lessons = getGraphemeLessons(moduleNumber, lessonNumber);
  if (!lessons.length) return [];
  const groups = lessons.map(l => l.graphemes || []);
  return applyWeightedDecay(groups, 10, decay);
}

// ── Syllables ──────────────────────────────────────────────────────────────
export function buildSyllablePool({ moduleNumber, lessonNumber, decay = DEFAULT_DECAY }) {
  const lessons = getGraphemeLessons(moduleNumber, lessonNumber);
  if (!lessons.length) return [];

  const cumulativeVowels = new Set();
  const groups = [];

  lessons.forEach((lesson) => {
    const newGraphemes = lesson.graphemes || [];
    const newBases = [];

    newGraphemes.forEach(g => {
      const normalized = normalizeSpanish(g);
      if (VOWELS.includes(normalized)) {
        cumulativeVowels.add(normalized);
      } else {
        const base = graphemeToSyllableBase(g);
        if (base) newBases.push(base);
      }
    });

    const newSyllables = [];
    newBases.forEach(({ consonant, vowels }) => {
      vowels.forEach(v => {
        if (cumulativeVowels.has(v)) newSyllables.push(consonant + v);
      });
    });

    if (newSyllables.length > 0) groups.push(newSyllables);
  });

  return applyWeightedDecay(groups, 5, decay);
}

// ── Sight words (from lesson literacy_progression) ─────────────────────────
export function buildSightWordPool({ moduleNumber, lessonNumber, lessons, decay = DEFAULT_DECAY }) {
  const target = { module_number: moduleNumber, curriculum_lesson_number: lessonNumber };

  const weekWords = [];
  (lessons || []).forEach((lesson) => {
    const dailyLessons = lesson.daily_lessons || [];
    const positions = dailyLessons
      .filter(d => d.active !== false)
      .map(d => ({
        module_number: Number(d.module_number) || 0,
        curriculum_lesson_number: Number(d.curriculum_lesson_number) || 0,
      }))
      .filter(p => p.module_number > 0 && p.curriculum_lesson_number > 0)
      .filter(p => compareCurriculumPositions(p, target) <= 0);

    if (positions.length === 0) return;

    const sightWords = splitLiteracyList(lesson.literacy_progression?.sightWords);
    if (sightWords.length > 0) {
      const maxPos = positions.reduce((max, p) =>
        compareCurriculumPositions(p, max) > 0 ? p : max
      );
      weekWords.push({ words: sightWords, position: maxPos });
    }
  });

  weekWords.sort((a, b) => compareCurriculumPositions(a.position, b.position));
  return applyWeightedDecay(weekWords.map(w => w.words), 10, decay);
}

// ── Fluency preset builder ─────────────────────────────────────────────────
function ensurePoolSize(pool, targetSize) {
  if (pool.length === 0 || pool.length >= targetSize) return pool;
  const result = [...pool];
  while (result.length < targetSize) result.push(...pool);
  return result;
}

export function buildFluencyPreset({ moduleNumber, lessonNumber, contentType, lessons, decay = DEFAULT_DECAY }) {
  let content = [];
  let cols = 8;
  let sweep_ms = 600;

  if (contentType === 'letters') {
    content = buildLetterPool({ moduleNumber, lessonNumber, decay });
  } else if (contentType === 'syllables') {
    content = buildSyllablePool({ moduleNumber, lessonNumber, decay });
    cols = 6;
    sweep_ms = 800;
  } else if (contentType === 'sight_words') {
    content = buildSightWordPool({ moduleNumber, lessonNumber, lessons, decay });
    cols = 6;
    sweep_ms = 800;
  }

  const rows = 5;
  content = ensurePoolSize(content, rows * cols);

  return {
    id: `curriculum_M${moduleNumber}.L${lessonNumber}_${contentType}`,
    title: `M${moduleNumber}.L${lessonNumber} · ${contentType}`,
    rows,
    cols,
    sweep_ms,
    content,
  };
}

// ── Letter Sort letters ────────────────────────────────────────────────────
export function buildLetterSortLetters({ moduleNumber, lessonNumber, decay = DEFAULT_DECAY }) {
  const lessons = getGraphemeLessons(moduleNumber, lessonNumber);
  if (!lessons.length) return [];
  const groups = lessons.map(l => l.graphemes || []);
  return applyWeightedDecay(groups, 10, decay);
}

// ── Syllable Train content ─────────────────────────────────────────────────
export function buildSyllableTrainContent({ moduleNumber, lessonNumber, decay = DEFAULT_DECAY }) {
  return buildSyllablePool({ moduleNumber, lessonNumber, decay });
}

// ── Syllable Blender words (decodable words from graphemes) ────────────────
// Returns CV and CVC pseudo-words that are decodable with the introduced
// graphemes. For real word practice, the WordBank should be used.
export function buildSyllableBlenderWords({ moduleNumber, lessonNumber, decay = DEFAULT_DECAY }) {
  const syllables = buildSyllablePool({ moduleNumber, lessonNumber, decay });
  if (syllables.length < 2) return [];

  // Build simple 2-syllable words by pairing syllables
  const words = [];
  const consonantSyllables = syllables.filter(s => {
    const c = s.replace(/[aeiouü]/g, '');
    return c && !['ch', 'll', 'qu', 'tr', 'br', 'gr', 'pr', 'fr', 'cr', 'dr', 'cl', 'bl', 'pl', 'fl', 'gl'].includes(c);
  });

  // Pair different consonant syllables to make pseudo-words
  for (let i = 0; i < consonantSyllables.length && words.length < 20; i++) {
    for (let j = 0; j < consonantSyllables.length && words.length < 20; j++) {
      if (i === j) continue;
      const word = consonantSyllables[i] + consonantSyllables[j];
      if (!words.includes(word)) words.push(word);
    }
  }

  return words;
}