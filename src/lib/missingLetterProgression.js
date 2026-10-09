// Missing Letter progression — uses the class's active curriculum position
// (ClassConfig.active_spanish_module / active_spanish_lesson) to determine
// which letters have been introduced, and generates developmentally
// appropriate items for both letter mode (early) and syllable mode (later).
//
// Letter mode: words with a missing initial or final letter. The student
// picks the letter from a keyboard where introduced letters are green.
//
// Syllable mode: 2-3 syllable words with one missing syllable. The student
// types the syllable letter-by-letter using the same keyboard. Activates
// once the student knows all 5 vowels + at least 3 consonants.

import { getIntroducedGraphemesThrough } from './literacy/curriculumGraphemes';
import { canDecodeWord } from './literacy/lessonProgression';
import { syllabifyEs } from './spanishSyllables';
import { listAllImagesJpg } from '@/lib/lettersort/storage';

// Map curriculum graphemes to the single keyboard letters they unlock.
const GRAPHEME_TO_LETTERS = {
  'a': ['a'], 'e': ['e'], 'i': ['i'], 'o': ['o'], 'u': ['u'],
  'm': ['m'], 'p': ['p'], 's': ['s'], 'l': ['l'], 'n': ['n'],
  'd': ['d'], 't': ['t'], 'f': ['f'], 'b': ['b'], 'v': ['v'],
  'z': ['z'], 'j': ['j'], 'k': ['k'], 'x': ['x'], 'w': ['w'],
  'ñ': ['ñ'], 'y': ['y'], 'h': ['h'],
  'c-fuerte': ['c'], 'c-suave': ['c'],
  'g-fuerte': ['g'], 'g-suave': ['g'], 'g-diéresis': ['g'],
  'r-inicial': ['r'], 'r-medial': ['r'], 'r-final': ['r'], 'rr-medial': ['r'],
  'y-inicial': ['y'],
  'ch': ['c', 'h'], 'll': ['l'], 'qu': ['q', 'u'],
  'tr': ['t', 'r'], 'br': ['b', 'r'], 'gr': ['g', 'r'],
  'pr': ['p', 'r'], 'fr': ['f', 'r'], 'cr': ['c', 'r'],
  'dr': ['d', 'r'], 'cl': ['c', 'l'], 'bl': ['b', 'l'],
  'pl': ['p', 'l'], 'fl': ['f', 'l'], 'gl': ['g', 'l'],
};

const VOWELS = ['a', 'e', 'i', 'o', 'u'];

// Alphabetical keyboard layout — 4 rows. Easier for non-readers to find
// letters than QWERTY, still builds keyboarding skills (pressing keys to spell).
const KEYBOARD_ROWS = [
  ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  ['h', 'i', 'j', 'k', 'l', 'm', 'n'],
  ['ñ', 'o', 'p', 'q', 'r', 's', 't'],
  ['u', 'v', 'w', 'x', 'y', 'z'],
];

export function getKeyboardRows() {
  return KEYBOARD_ROWS;
}

export function getIntroducedGraphemes(classConfig) {
  const mod = classConfig?.active_spanish_module || 1;
  const les = classConfig?.active_spanish_lesson || 1;
  return getIntroducedGraphemesThrough({ moduleNumber: mod, lessonNumber: les });
}

// Returns a Set of single lowercase letters that have been introduced
// through the class's current curriculum position.
export function getIntroducedLetters(classConfig) {
  const graphemes = getIntroducedGraphemes(classConfig);
  const set = new Set();
  for (const g of graphemes) {
    for (const l of (GRAPHEME_TO_LETTERS[g] || [])) set.add(l);
  }
  return set;
}

export function getIntroducedVowels(introducedSet) {
  return VOWELS.filter(v => introducedSet.has(v));
}

export function getIntroducedConsonants(introducedSet) {
  return [...introducedSet].filter(l => !VOWELS.includes(l)).sort();
}

// Syllable mode activates when the student knows all 5 vowels + at least
// 3 consonants — enough to build meaningful CV syllables.
export function determineMode(classConfig) {
  const introduced = getIntroducedLetters(classConfig);
  const vowels = getIntroducedVowels(introduced);
  const consonants = getIntroducedConsonants(introduced);
  if (vowels.length >= 5 && consonants.length >= 3) return 'syllable';
  return 'letter';
}

// Strip vowel accents for matching (á→a). ñ is preserved.
function stripVowelAccents(s) {
  return (s || '')
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
    .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ü/g, 'u');
}

// Generate letter-mode items from the Letter Sort image bucket, filtered
// to words whose initial or final letter is in the introduced set.
export async function generateLetterItems(classConfig, { bucket = 'lettersort-images', maxItems = 30 } = {}) {
  const introduced = getIntroducedLetters(classConfig);
  const introducedNorm = new Set([...introduced].map(l => stripVowelAccents(l)));

  if (!introducedNorm.size) return [];

  const images = await listAllImagesJpg({ bucket });
  const seen = new Set();
  const items = [];

  for (const img of images.sort(() => Math.random() - 0.5)) {
    if (!img.core) continue;
    const word = stripVowelAccents(img.core);
    if (seen.has(word) || word.length < 2) continue;

    const init = stripVowelAccents(img.initial?.toLowerCase() || word[0]);
    const final = stripVowelAccents(word[word.length - 1]);

    // Initial position
    if (introducedNorm.has(init)) {
      seen.add(word);
      items.push({
        word,
        position: 'initial',
        image_source: 'upload',
        image_url: img.url,
      });
    }
    // Final position (different letter so it's not a duplicate)
    if (items.length < maxItems && introducedNorm.has(final) && final !== init && !seen.has(word)) {
      seen.add(word);
      items.push({
        word,
        position: 'final',
        image_source: 'upload',
        image_url: img.url,
      });
    }

    if (items.length >= maxItems) break;
  }

  return items;
}

// 3-syllable Spanish words for syllable mode, tagged with required graphemes.
// Filtered by canDecodeWord against the introduced graphemes.
const REAL_3SYL_WORDS = [
  // m, p, s, l, n, d + vowels (M3.L1+)
  { word: 'modelo', g: ['m', 'd', 'l', 'o', 'e'] },
  { word: 'domino', g: ['d', 'm', 'n', 'i', 'o'] },
  { word: 'manada', g: ['m', 'n', 'd', 'a'] },
  { word: 'salida', g: ['s', 'l', 'd', 'a', 'i'] },
  { word: 'mamada', g: ['m', 'd', 'a'] },
  { word: 'domado', g: ['d', 'm', 'a', 'o'] },
  { word: 'manado', g: ['m', 'n', 'd', 'a', 'o'] },
  { word: 'paloma', g: ['p', 'l', 'm', 'a', 'o'] },
  // + t (M3.L6+)
  { word: 'tomate', g: ['t', 'm', 'a', 'e', 'o'] },
  { word: 'patata', g: ['p', 't', 'a'] },
  { word: 'pelota', g: ['p', 'l', 't', 'a', 'e', 'o'] },
  // + b (M4.L1+)
  { word: 'sabana', g: ['s', 'b', 'n', 'a'] },
  { word: 'tomaba', g: ['t', 'm', 'b', 'a'] },
  { word: 'pelaba', g: ['p', 'l', 'b', 'a'] },
  { word: 'donaba', g: ['d', 'n', 'b', 'a'] },
  { word: 'manaba', g: ['m', 'n', 'b', 'a'] },
  { word: 'nadaba', g: ['n', 'd', 'b', 'a'] },
  { word: 'batata', g: ['b', 't', 'a'] },
  // + c-fuerte (M4.L11+)
  { word: 'camino', g: ['c-fuerte', 'm', 'n', 'i', 'o'] },
  { word: 'campana', g: ['c-fuerte', 'm', 'p', 'n', 'a'] },
  { word: 'copita', g: ['c-fuerte', 'p', 't', 'i', 'a'] },
  { word: 'tocaba', g: ['t', 'c-fuerte', 'b', 'a'] },
  // + v (M5.L1+)
  { word: 'novato', g: ['n', 'v', 't', 'a', 'o'] },
  { word: 'lavaba', g: ['l', 'v', 'b', 'a'] },
  { word: 'nevaba', g: ['n', 'v', 'b', 'a'] },
  { word: 'veleta', g: ['v', 'l', 't', 'a', 'e'] },
];

// 2-syllable CV-CV words for early syllable practice (initial/final only).
const REAL_2SYL_WORDS = [
  { word: 'mapa', g: ['m', 'p', 'a'] },
  { word: 'masa', g: ['m', 's', 'a'] },
  { word: 'mesa', g: ['m', 's', 'e', 'a'] },
  { word: 'misa', g: ['m', 's', 'i', 'a'] },
  { word: 'mula', g: ['m', 'l', 'u', 'a'] },
  { word: 'mala', g: ['m', 'l', 'a'] },
  { word: 'puma', g: ['p', 'm', 'u', 'a'] },
  { word: 'pipa', g: ['p', 'a'] },
  { word: 'pasa', g: ['p', 's', 'a'] },
  { word: 'pala', g: ['p', 'l', 'a'] },
  { word: 'palo', g: ['p', 'l', 'a', 'o'] },
  { word: 'sopa', g: ['s', 'p', 'o', 'a'] },
  { word: 'sala', g: ['s', 'l', 'a'] },
  { word: 'sola', g: ['s', 'l', 'o', 'a'] },
  { word: 'loma', g: ['l', 'm', 'o', 'a'] },
  { word: 'lima', g: ['l', 'm', 'i', 'a'] },
  { word: 'lupa', g: ['l', 'p', 'u', 'a'] },
  { word: 'papa', g: ['p', 'a'] },
  { word: 'mama', g: ['m', 'a'] },
  { word: 'mimo', g: ['m', 'i', 'o'] },
  { word: 'lana', g: ['l', 'n', 'a'] },
  { word: 'luna', g: ['l', 'n', 'u', 'a'] },
  { word: 'nene', g: ['n', 'e'] },
  { word: 'nena', g: ['n', 'a'] },
  { word: 'dama', g: ['d', 'm', 'a'] },
  { word: 'dedo', g: ['d', 'e', 'o'] },
  { word: 'dado', g: ['d', 'a', 'o'] },
  { word: 'lado', g: ['l', 'd', 'a', 'o'] },
  { word: 'seda', g: ['s', 'd', 'e', 'a'] },
  { word: 'tela', g: ['t', 'l', 'e', 'a'] },
  { word: 'pato', g: ['p', 't', 'a', 'o'] },
  { word: 'moto', g: ['m', 't', 'o'] },
  { word: 'nota', g: ['n', 't', 'o', 'a'] },
  { word: 'bota', g: ['b', 't', 'o', 'a'] },
  { word: 'lobo', g: ['l', 'b', 'o'] },
  { word: 'cama', g: ['c-fuerte', 'm', 'a'] },
  { word: 'coco', g: ['c-fuerte', 'o'] },
  { word: 'cuna', g: ['c-fuerte', 'n', 'u', 'a'] },
  { word: 'vaso', g: ['v', 's', 'o', 'a'] },
  { word: 'vela', g: ['v', 'l', 'e', 'a'] },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Generate syllable-mode items: words split into syllables with one missing.
// Prefers 3-syllable words (initial/middle/final positions); falls back to
// 2-syllable words (initial/final) when 3-syllable words aren't decodable yet.
export function generateSyllableItems(classConfig, { maxItems = 20 } = {}) {
  const graphemes = getIntroducedGraphemes(classConfig);

  const avail3 = REAL_3SYL_WORDS.filter(e => canDecodeWord(e.word, graphemes));
  const avail2 = REAL_2SYL_WORDS.filter(e => canDecodeWord(e.word, graphemes));

  const pool = [...shuffle(avail3), ...shuffle(avail2)];
  const seen = new Set();
  const items = [];

  for (const entry of pool) {
    if (seen.has(entry.word)) continue;
    seen.add(entry.word);

    const syllables = syllabifyEs(entry.word);
    if (syllables.length < 2) continue;

    // Pick a random syllable position to be missing
    const missingIdx = Math.floor(Math.random() * syllables.length);
    const missingSyllable = syllables[missingIdx];

    items.push({
      word: entry.word,
      syllables,
      missingIdx,
      missingSyllable,
      position: missingIdx === 0 ? 'initial'
        : missingIdx === syllables.length - 1 ? 'final'
          : 'middle',
    });

    if (items.length >= maxItems) break;
  }

  return items;
}