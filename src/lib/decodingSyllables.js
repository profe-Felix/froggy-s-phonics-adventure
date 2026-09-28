// Decoding assessment syllable/word generation.
//
// Uses the graphemes taught through the class's current M#.L# position
// (from ClassConfig.active_spanish_module / active_spanish_lesson) to
// generate developmentally appropriate decoding items in four levels:
//
//   1. CV  — consonant + vowel (mo, pa, si)
//   2. CVC — consonant + vowel + consonant (mes, mas, pal)
//   3. CVCV — two CV syllables (mala, piso)
//   4. Inverse — vowel-first patterns (isla, alma)
//
// The teacher marks items correct/incorrect. The student always advances to
// the next level (first round) so the teacher can see their approach on all
// patterns. Lists are deterministic — same items every round for the same
// curriculum position (M#.L#).

import { getIntroducedGraphemesThrough } from './literacy/curriculumGraphemes';

// Map each grapheme to the CV syllables it can form, restricted to the
// vowels that have actually been taught.
const GRAPHEME_CV_MAP = {
  m: ['ma','me','mi','mo','mu'],
  p: ['pa','pe','pi','po','pu'],
  s: ['sa','se','si','so','su'],
  l: ['la','le','li','lo','lu'],
  n: ['na','ne','ni','no','nu'],
  d: ['da','de','di','do','du'],
  t: ['ta','te','ti','to','tu'],
  f: ['fa','fe','fi','fo','fu'],
  b: ['ba','be','bi','bo','bu'],
  v: ['va','ve','vi','vo','vu'],
  z: ['za','ze','zi','zo','zu'],
  j: ['ja','je','ji','jo','ju'],
  k: ['ka','ke','ki','ko','ku'],
  x: ['xa','xe','xi','xo','xu'],
  w: ['wa','we','wi','wo','wu'],
  ñ: ['ña','ñe','ñi','ño','ñu'],
  y: ['ya','ye','yi','yo','yu'],
  'y-inicial': ['ya','ye','yi','yo','yu'],
  r: ['ra','re','ri','ro','ru'],
  'r-inicial': ['ra','re','ri','ro','ru'],
  'r-medial': ['ra','re','ri','ro','ru'],
  'r-final': ['ra','re','ri','ro','ru'],
  'rr-medial': ['ra','re','ri','ro','ru'],
  'c-fuerte': ['ca','co','cu'],
  'c-suave': ['ce','ci'],
  qu: ['que','qui'],
  'g-fuerte': ['ga','go','gu','gue','gui'],
  'g-suave': ['ge','gi'],
  'g-diéresis': ['güe','güi'],
  h: ['ha','he','hi','ho','hu'],
  ll: ['lla','lle','lli','llo','llu'],
  ch: ['cha','che','chi','cho','chu'],
  tr: ['tra','tre','tri','tro','tru'],
  br: ['bra','bre','bri','bro','bru'],
  gr: ['gra','gre','gri','gro','gru'],
  pr: ['pra','pre','pri','pro','pru'],
  fr: ['fra','fre','fri','fro','fru'],
  cr: ['cra','cre','cri','cro','cru'],
  dr: ['dra','dre','dri','dro','dru'],
  cl: ['cla','cle','cli','clo','clu'],
  bl: ['bla','ble','bli','blo','blu'],
  pl: ['pla','ple','pli','plo','plu'],
  fl: ['fla','fle','fli','flo','flu'],
  gl: ['gla','gle','gli','glo','glu'],
};

const VOWELS = ['a','e','i','o','u'];

// Consonants that can appear at the end of a CVC word in Spanish.
const VALID_FINAL_CONSONANTS = ['s','n','l','r','d','t','z','x'];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Get the taught vowels and consonant graphemes through the current lesson.
export function getTaughtGraphemes(moduleNumber, lessonNumber) {
  return getIntroducedGraphemesThrough({ moduleNumber, lessonNumber });
}

// Generate CV syllables from taught graphemes, restricted to taught vowels.
function generateCVSyllables(graphemes) {
  // Identify taught vowels
  const taughtVowels = new Set(
    graphemes.filter((g) => VOWELS.includes(g))
  );

  // If no vowels taught yet, fall back to all vowels
  if (taughtVowels.size === 0) {
    VOWELS.forEach((v) => taughtVowels.add(v));
  }

  const syllables = new Set();
  for (const g of graphemes) {
    if (VOWELS.includes(g)) continue; // skip vowels
    const map = GRAPHEME_CV_MAP[g];
    if (!map) continue;
    // Filter to only syllables using taught vowels
    for (const syl of map) {
      const vowel = syl.slice(-1);
      if (taughtVowels.has(vowel)) {
        syllables.add(syl);
      }
    }
  }
  return [...syllables];
}

// Generate CVC words: ~12 words, cycling through taught initial consonants
// so each one gets equal representation (e.g. m/p/s/l each appear 3×).
// Final consonants rotate through valid Spanish finals that have been taught.
// Deterministic — same list every round for the same curriculum position.
function generateCVCWords(graphemes) {
  const cvSyllables = generateCVSyllables(graphemes);
  if (cvSyllables.length === 0) return [];

  // Valid final consonants from taught graphemes
  const taughtFinals = graphemes
    .filter((g) => VALID_FINAL_CONSONANTS.includes(g) || g === 'r-final' || g === 'r-medial')
    .map((g) => (g === 'r-final' || g === 'r-medial' ? 'r' : g));
  const uniqueFinals = [...new Set(taughtFinals)].sort();
  if (uniqueFinals.length === 0) return [];

  // Group CV syllables by initial consonant, sorted for determinism
  const byInitial = {};
  for (const syl of [...cvSyllables].sort()) {
    const ic = syl.slice(0, -1);
    if (!byInitial[ic]) byInitial[ic] = [];
    byInitial[ic].push(syl);
  }
  const initials = Object.keys(byInitial).sort();

  // Build 12 words, cycling through initials so each gets equal representation.
  // For each initial, use the next available vowel and a rotating final consonant.
  const wordList = [];
  const words = new Set();
  const usedSyllables = new Set();
  let finalIdx = 0;

  for (let round = 0; round < 12; round++) {
    const ic = initials[round % initials.length];
    const syl = byInitial[ic].find((s) => !usedSyllables.has(s));
    if (!syl) continue;
    const fc = uniqueFinals[finalIdx % uniqueFinals.length];
    const word = syl + fc;
    if (!words.has(word)) {
      words.add(word);
      wordList.push(word);
      usedSyllables.add(syl);
    }
    finalIdx++;
  }

  return wordList.sort();
}

// Real Spanish CVCV words (two CV syllables), tagged with required graphemes.
// g = all graphemes (consonants + vowels) the word uses.
const REAL_CVCV_WORDS = [
  // ── m, p, s, l + vowels (M2.L11+) ──
  { word: 'mapa', g: ['m','p','a'] },
  { word: 'masa', g: ['m','s','a'] },
  { word: 'mesa', g: ['m','s','e','a'] },
  { word: 'misa', g: ['m','s','i','a'] },
  { word: 'musa', g: ['m','s','u','a'] },
  { word: 'mula', g: ['m','l','u','a'] },
  { word: 'mala', g: ['m','l','a'] },
  { word: 'molo', g: ['m','l','o'] },
  { word: 'puma', g: ['p','m','u','a'] },
  { word: 'pipa', g: ['p','a'] },
  { word: 'pasa', g: ['p','s','a'] },
  { word: 'pisa', g: ['p','s','i','a'] },
  { word: 'pesa', g: ['p','s','e','a'] },
  { word: 'pala', g: ['p','l','a'] },
  { word: 'palo', g: ['p','l','a','o'] },
  { word: 'pelo', g: ['p','l','e','o'] },
  { word: 'pila', g: ['p','l','i','a'] },
  { word: 'sopa', g: ['s','p','o','a'] },
  { word: 'sapo', g: ['s','p','a','o'] },
  { word: 'sala', g: ['s','l','a'] },
  { word: 'sola', g: ['s','l','o','a'] },
  { word: 'silo', g: ['s','l','i','o'] },
  { word: 'loma', g: ['l','m','o','a'] },
  { word: 'lima', g: ['l','m','i','a'] },
  { word: 'lapa', g: ['l','p','a'] },
  { word: 'lupa', g: ['l','p','u','a'] },
  { word: 'lila', g: ['l','i','a'] },
  { word: 'lelo', g: ['l','e','o'] },
  { word: 'papa', g: ['p','a'] },
  { word: 'mama', g: ['m','a'] },
  { word: 'mimo', g: ['m','i','o'] },
  // ── + n (M2.L16+) ──
  { word: 'lana', g: ['l','n','a'] },
  { word: 'luna', g: ['l','n','u','a'] },
  { word: 'sana', g: ['s','n','a'] },
  { word: 'sano', g: ['s','n','a','o'] },
  { word: 'nene', g: ['n','e'] },
  { word: 'nena', g: ['n','a'] },
  // ── + d (M3.L1+) ──
  { word: 'doma', g: ['d','m','o','a'] },
  { word: 'dama', g: ['d','m','a'] },
  { word: 'seda', g: ['s','d','e','a'] },
  { word: 'soda', g: ['s','d','o','a'] },
  { word: 'moda', g: ['m','d','o','a'] },
  { word: 'muda', g: ['m','d','u','a'] },
  { word: 'dedo', g: ['d','e','o'] },
  { word: 'dado', g: ['d','a','o'] },
  { word: 'lado', g: ['l','d','a','o'] },
  { word: 'lodo', g: ['l','d','o'] },
  { word: 'nudo', g: ['n','d','u','o'] },
  // ── + t (M3.L6+) ──
  { word: 'tela', g: ['t','l','e','a'] },
  { word: 'toma', g: ['t','m','o','a'] },
  { word: 'pato', g: ['p','t','a','o'] },
  { word: 'pito', g: ['p','t','i','o'] },
  { word: 'moto', g: ['m','t','o'] },
  { word: 'mate', g: ['m','t','a','e'] },
  { word: 'nota', g: ['n','t','o','a'] },
  { word: 'nata', g: ['n','t','a'] },
  { word: 'soto', g: ['s','t','o'] },
  { word: 'dato', g: ['d','t','a','o'] },
  { word: 'lote', g: ['l','t','o','e'] },
  // ── + f (M3.L11+) ──
  { word: 'fama', g: ['f','m','a'] },
  { word: 'fuma', g: ['f','m','u','a'] },
  // ── + b (M4.L1+) ──
  { word: 'bota', g: ['b','t','o','a'] },
  { word: 'lobo', g: ['l','b','o'] },
  // ── + r-inicial (M4.L6+) ──
  { word: 'ropa', g: ['r-inicial','p','o','a'] },
  { word: 'rama', g: ['r-inicial','m','a'] },
  { word: 'rima', g: ['r-inicial','m','i','a'] },
  // ── + c-fuerte (M4.L11+) ──
  { word: 'cama', g: ['c-fuerte','m','a'] },
  { word: 'coco', g: ['c-fuerte','o'] },
  { word: 'cuna', g: ['c-fuerte','n','u','a'] },
  // ── + v (M5.L1+) ──
  { word: 'vaso', g: ['v','s','o','a'] },
  { word: 'vela', g: ['v','l','e','a'] },
];

// Real Spanish inverse-pattern words (vowel-first: V-CV, V-CCV).
const REAL_INVERSE_WORDS = [
  // ── m, p, s, l + vowels ──
  { word: 'oso', g: ['s','o'] },
  { word: 'ala', g: ['l','a'] },
  { word: 'amo', g: ['m','a','o'] },
  { word: 'ola', g: ['l','o','a'] },
  { word: 'asa', g: ['s','a'] },
  { word: 'eme', g: ['m','e'] },
  { word: 'ele', g: ['l','e'] },
  { word: 'ese', g: ['s','e'] },
  { word: 'uso', g: ['s','u','o'] },
  { word: 'osa', g: ['s','o','a'] },
  { word: 'isla', g: ['s','l','i','a'] },
  { word: 'alma', g: ['l','m','a'] },
  // ── + n ──
  { word: 'uno', g: ['n','u','o'] },
  { word: 'asno', g: ['s','n','a','o'] },
  // ── + d ──
  { word: 'oda', g: ['d','o','a'] },
  // ── + t ──
  { word: 'alto', g: ['l','t','a','o'] },
  { word: 'alta', g: ['l','t','a'] },
  { word: 'ata', g: ['t','a'] },
  { word: 'asta', g: ['s','t','a'] },
  { word: 'este', g: ['s','t','e'] },
  { word: 'esto', g: ['s','t','o'] },
  // ── + f ──
  { word: 'efe', g: ['f','e'] },
  // ── + r-inicial ──
  { word: 'ora', g: ['r-inicial','o','a'] },
  { word: 'ara', g: ['r-inicial','a'] },
  { word: 'ere', g: ['r-inicial','e'] },
  { word: 'ira', g: ['r-inicial','i','a'] },
  { word: 'arma', g: ['r-inicial','m','a'] },
  { word: 'orla', g: ['r-inicial','l','o','a'] },
];

// Check if all required graphemes for a word are in the taught set.
function wordIsAvailable(entry, taughtSet) {
  return entry.g.every((grapheme) => taughtSet.has(grapheme));
}

// Generate CVCV words from a curated list of real Spanish words, filtered
// by the graphemes taught through the current curriculum position.
// Returns up to 12 words, sorted alphabetically — deterministic.
function generateCVCVWords(graphemes) {
  const taughtSet = new Set(graphemes);
  return REAL_CVCV_WORDS
    .filter((entry) => wordIsAvailable(entry, taughtSet))
    .map((entry) => entry.word)
    .sort()
    .slice(0, 12);
}

// Generate inverse-pattern words from a curated list of real Spanish words,
// filtered by the graphemes taught through the current curriculum position.
// Returns up to 12 words, sorted alphabetically — deterministic.
function generateInverseWords(graphemes) {
  const taughtSet = new Set(graphemes);
  return REAL_INVERSE_WORDS
    .filter((entry) => wordIsAvailable(entry, taughtSet))
    .map((entry) => entry.word)
    .sort()
    .slice(0, 12);
}

export const DECODING_LEVELS = [
  { id: 'CV', label: 'CV Syllables', generate: generateCVSyllables, sample: 'mo, pa, si' },
  { id: 'CVC', label: 'CVC Words', generate: generateCVCWords, sample: 'mes, mas, pal' },
  { id: 'CVCV', label: 'CVCV Words', generate: generateCVCVWords, sample: 'mapa, sopa, pala' },
  { id: 'inverse', label: 'Inverse', generate: generateInverseWords, sample: 'oso, isla, alma' },
];

// Generate a shuffled set of items for a given level.
export function generateDecodingItems(levelId, moduleNumber, lessonNumber, count = 0) {
  const graphemes = getTaughtGraphemes(moduleNumber, lessonNumber);
  const level = DECODING_LEVELS.find((l) => l.id === levelId);
  if (!level) return [];
  const pool = level.generate(graphemes);
  if (pool.length === 0) return [];
  // Deterministic sort — no shuffle — so every student at the same
  // curriculum position gets the same list every round.
  const sorted = [...pool].sort();
  if (count <= 0) return sorted;
  return sorted.slice(0, Math.min(count, pool.length));
}

// Check if a level has enough items to be assessable.
export function canAssessLevel(levelId, moduleNumber, lessonNumber) {
  const graphemes = getTaughtGraphemes(moduleNumber, lessonNumber);
  const level = DECODING_LEVELS.find((l) => l.id === levelId);
  if (!level) return false;
  return level.generate(graphemes).length > 0;
}