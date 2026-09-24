// Word-bank difficulty scoring + grapheme-progression filtering.
//
// Words are syllabified (syllabifyEs) and each syllable is assigned a tier:
//   1 = simple       — CV or V (no coda, no diphthong, no cluster onset)
//   2 = intermediate — has a coda or diphthong, but no consonant cluster onset
//   3 = complex      — has a consonant cluster onset (pl, br, tr, ch, ll, ...)
//
// A word's difficulty is the max tier across its syllables, so "samba"
// (sam·ba → tier 2 + tier 1) is intermediate and "plato" (pla·to →
// tier 3 + tier 1) is complex. This lets practice start simple and climb.

import { syllabifyEs } from '@/lib/spanishSyllables';
import { canDecodeWord } from '@/lib/literacy/lessonProgression';

const ONSET_CLUSTERS = [
  'pl', 'pr', 'bl', 'br', 'tr', 'dr', 'cl', 'cr',
  'gl', 'gr', 'fl', 'fr', 'ch', 'll', 'rr',
];

export const TIER_LABELS = {
  1: 'Simple (CV)',
  2: 'Intermediate (CVC)',
  3: 'Complex (clusters)',
};

// Tier for a single syllable string, e.g. "sam" -> 2, "pla" -> 3, "ma" -> 1.
export function syllableTier(syl) {
  const letters = String(syl || '').toLowerCase().replace(/[^a-zñüáéíóú]/g, '');
  const m = letters.match(/^([^aeiouáéíóú]*)([aeiouáéíóúü]+)([^aeiouáéíóú]*)$/);
  if (!m) return 1;
  const onset = m[1];
  const nucleus = m[2];
  const coda = m[3];
  const hasCluster = onset.length >= 2 || ONSET_CLUSTERS.some((p) => onset === p);
  if (hasCluster) return 3;
  if (coda.length > 0 || nucleus.length >= 2) return 2;
  return 1;
}

export function computeDifficulty(word) {
  const syllables = syllabifyEs(word);
  if (!syllables.length) return 1;
  return Math.max(...syllables.map(syllableTier));
}

export function syllabify(word) {
  return syllabifyEs(word);
}

// Build a record ready for the WordBank entity from a raw word string.
export function buildWordRecord(word) {
  const clean = String(word || '').trim().toLowerCase();
  return {
    word: clean,
    syllables: syllabifyEs(clean),
    difficulty: computeDifficulty(clean),
    active: true,
  };
}

// Filter a word-bank list to words decodable with the given graphemes,
// sorted by difficulty (simple first) then alphabetically.
export function getDecodableWords(words, graphemes) {
  return (words || [])
    .filter((w) => w.active !== false && canDecodeWord(w.word, graphemes))
    .sort((a, b) => {
      const da = a.difficulty || computeDifficulty(a.word);
      const db = b.difficulty || computeDifficulty(b.word);
      if (da !== db) return da - db;
      return (a.word || '').localeCompare(b.word || '', 'es');
    });
}

// Unique decodable syllables across a set of decodable words, sorted.
export function getDecodableSyllables(words, graphemes) {
  const set = new Set();
  getDecodableWords(words, graphemes).forEach((w) => {
    (w.syllables || syllabifyEs(w.word)).forEach((s) => set.add(s));
  });
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}