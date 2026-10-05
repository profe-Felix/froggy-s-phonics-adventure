// Item generation for the live small-group Spanish Reading session.
//
// Two modes:
//   blending    — teacher picks syllable types (CV/CVC/CVCV/inverse) + a
//                 subset of consonants (e.g. just m, s, l). Items are generated
//                 from those consonants only, so the group can focus on
//                 specific letters.
//   letter_hunt — teacher picks a target letter; items are random words
//                 (and optionally sentences) from the WordBank / reading lists
//                 that contain that letter, so students can hunt it.

import { generateDecodingItemsForConsonants } from './decodingSyllables';

export const SYLLABLE_TYPES = [
  { id: 'CV', label: 'CV — sílabas', sample: 'ma, si, lo' },
  { id: 'CVC', label: 'CVC', sample: 'mes, sal, sol' },
  { id: 'CVCV', label: 'CVCV', sample: 'mapa, sopa' },
  { id: 'inverse', label: 'Inversa', sample: 'oso, isla' },
];

export const CONSONANT_OPTIONS = [
  'm', 'p', 's', 'l', 'n', 'd', 't', 'f',
  'b', 'v', 'r', 'c', 'g', 'ch', 'll', 'ñ',
  'y', 'k', 'j', 'z',
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// blending: returns [{ text, level }, ...] shuffled across all selected levels.
export function generateBlendingItems({ syllableTypes, consonants }) {
  const out = [];
  for (const level of syllableTypes) {
    const items = generateDecodingItemsForConsonants(level, consonants);
    for (const it of items) out.push({ text: it, level });
  }
  return shuffle(out);
}

// letter_hunt: returns [{ text }, ...] drawn from words (and optionally
// sentences) that contain the target letter.
export function generateLetterHuntItems({ targetLetter, words = [], sentences = [], count = 12 }) {
  const letter = (targetLetter || '').toLowerCase();
  if (!letter) return [];
  const wordPool = words
    .map((w) => (typeof w === 'string' ? w : w.word))
    .filter(Boolean)
    .filter((w) => w.toLowerCase().includes(letter));
  const sentPool = sentences
    .map((s) => (typeof s === 'string' ? s : s.text))
    .filter(Boolean)
    .filter((s) => s.toLowerCase().includes(letter));
  const pool = shuffle([...wordPool, ...sentPool]);
  return pool.slice(0, count).map((text) => ({ text }));
}