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

// QWERTY keyboard layout — builds real keyboarding muscle memory. Vowels
// get a distinct color in the keyboard component so students can ensure
// they include a vowel when spelling.
const KEYBOARD_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ñ'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

export function getKeyboardRows() {
  return KEYBOARD_ROWS;
}

export const KEYBOARD_VOWELS = VOWELS;

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

// Progression thresholds (consonant count, assuming all 5 vowels known):
//   letter   — 0-2 consonants (identify missing letter, then trace it)
//   syllable — 3-4 consonants (type a missing syllable)
//   word     — 5-6 consonants (type a complete word)
//   phrase   — 7+ consonants  (type a short phrase with sight words + spaces)
export function determineMode(classConfig) {
  const introduced = getIntroducedLetters(classConfig);
  const vowels = getIntroducedVowels(introduced);
  const consonants = getIntroducedConsonants(introduced);
  if (vowels.length >= 5 && consonants.length >= 7) return 'phrase';
  if (vowels.length >= 5 && consonants.length >= 5) return 'word';
  if (vowels.length >= 5 && consonants.length >= 3) return 'syllable';
  return 'letter';
}

// Tiered coin rewards: letter=1, CV syllable=2, complex syllable=3, word=4, phrase=5.
export function classifySyllable(syllable) {
  if (!syllable) return 'complex';
  if (syllable.length === 1 && VOWELS.includes(syllable)) return 'simple'; // V
  if (syllable.length === 2) {
    const [c, v] = syllable;
    if (!VOWELS.includes(c) && VOWELS.includes(v)) return 'simple'; // CV
  }
  return 'complex'; // CVC, VC, CCV, etc.
}

export function getCoinReward(mode, syllableType) {
  switch (mode) {
    case 'letter': return 1;
    case 'syllable': return syllableType === 'simple' ? 2 : 3;
    case 'word': return 4;
    case 'phrase': return 5;
    default: return 1;
  }
}

// Spanish sight words that appear in phrases. Students memorize these as
// whole words, so they don't need to be decodable.
export const SIGHT_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'y', 'mi', 'su', 'o',
]);

// Short phrases for phrase mode. Each has a sight word + a decodable content
// word. The student types the entire phrase including the space.
const PHRASES = [
  { phrase: 'el oso', words: ['el', 'oso'] },
  { phrase: 'la masa', words: ['la', 'masa'] },
  { phrase: 'mi mama', words: ['mi', 'mama'] },
  { phrase: 'su papa', words: ['su', 'papa'] },
  { phrase: 'mi mapa', words: ['mi', 'mapa'] },
  { phrase: 'la sopa', words: ['la', 'sopa'] },
  { phrase: 'el mono', words: ['el', 'mono'] },
  { phrase: 'la luna', words: ['la', 'luna'] },
  { phrase: 'un oso', words: ['un', 'oso'] },
  { phrase: 'mi moto', words: ['mi', 'moto'] },
  { phrase: 'la papa', words: ['la', 'papa'] },
  { phrase: 'el polo', words: ['el', 'polo'] },
  { phrase: 'la sala', words: ['la', 'sala'] },
  { phrase: 'mi sala', words: ['mi', 'sala'] },
  { phrase: 'la loma', words: ['la', 'loma'] },
  { phrase: 'mi nota', words: ['mi', 'nota'] },
  { phrase: 'la nota', words: ['la', 'nota'] },
  { phrase: 'el nene', words: ['el', 'nene'] },
  { phrase: 'la nena', words: ['la', 'nena'] },
  { phrase: 'mi pera', words: ['mi', 'pera'] },
  { phrase: 'la pera', words: ['la', 'pera'] },
  { phrase: 'el pato', words: ['el', 'pato'] },
  { phrase: 'mi pato', words: ['mi', 'pato'] },
  { phrase: 'la taza', words: ['la', 'taza'] },
  { phrase: 'mi taza', words: ['mi', 'taza'] },
];

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

// Generate word-mode items: decodable words from the Letter Sort image
// bucket that the student types in full (not just a missing syllable).
export async function generateWordItems(classConfig, { bucket = 'lettersort-images', maxItems = 20 } = {}) {
  const graphemes = getIntroducedGraphemes(classConfig);
  const introduced = getIntroducedLetters(classConfig);
  const introducedNorm = new Set([...introduced].map(l => stripVowelAccents(l)));

  if (!introducedNorm.size) return [];

  const images = await listAllImagesJpg({ bucket });
  const seen = new Set();
  const items = [];

  for (const img of images.sort(() => Math.random() - 0.5)) {
    if (!img.core) continue;
    const word = stripVowelAccents(img.core);
    if (seen.has(word) || word.length < 2 || word.length > 5) continue;
    if (!canDecodeWord(word, graphemes)) continue;
    seen.add(word);
    items.push({
      word,
      image_source: 'upload',
      image_url: img.url,
    });
    if (items.length >= maxItems) break;
  }

  return items;
}

// Generate phrase-mode items: short sight-word + decodable-word phrases.
// The student types the entire phrase including the space between words.
export function generatePhraseItems(classConfig, { maxItems = 15 } = {}) {
  const graphemes = getIntroducedGraphemes(classConfig);
  const items = [];

  for (const p of shuffle(PHRASES)) {
    // Check that all content words (non-sight-words) are decodable.
    const contentWords = p.words.filter(w => !SIGHT_WORDS.has(w));
    const allDecodable = contentWords.every(w => canDecodeWord(w, graphemes));
    if (!allDecodable) continue;

    items.push({
      phrase: p.phrase,
      words: p.words,
      contentWord: contentWords[0] || p.words[0],
    });
    if (items.length >= maxItems) break;
  }

  return items;
}