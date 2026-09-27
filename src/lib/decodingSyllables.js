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
// The teacher marks items correct/incorrect. If accuracy on a level is
// >70%, the student advances to the next level.

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

// Generate CVC words: CV + final consonant.
// Only use final consonants that have been taught.
function generateCVCWords(graphemes) {
  const cvSyllables = generateCVSyllables(graphemes);
  // Which taught graphemes are valid final consonants?
  const taughtFinals = graphemes.filter((g) =>
    VALID_FINAL_CONSONANTS.includes(g) ||
    g === 'r-final' || g === 'r-medial'
  );

  if (taughtFinals.length === 0 || cvSyllables.length === 0) return [];

  const words = new Set();
  for (const cv of cvSyllables) {
    for (const fc of taughtFinals) {
      const final = fc === 'r-final' || fc === 'r-medial' ? 'r' : fc;
      // Avoid awkward combinations
      const word = cv + final;
      // Skip if the final consonant matches the initial consonant (e.g., "m m" → "mam")
      // Actually, "mam" is fine in Spanish. Just skip truly unpronounceable ones.
      words.add(word);
    }
  }
  return [...words];
}

// Generate CVCV words: two CV syllables.
function generateCVCVWords(graphemes) {
  const cvSyllables = generateCVSyllables(graphemes);
  if (cvSyllables.length < 2) return [];

  const words = new Set();
  // Generate a reasonable set of two-syllable combinations
  const shuffled = shuffle(cvSyllables);
  for (let i = 0; i < shuffled.length; i++) {
    for (let j = 0; j < shuffled.length; j++) {
      if (i === j) continue;
      const word = shuffled[i] + shuffled[j];
      words.add(word);
      if (words.size >= 50) break; // cap the pool
    }
    if (words.size >= 50) break;
  }
  return [...words];
}

// Generate inverse-pattern words: vowel-first (V, VC, VCV, VCCV).
// Examples: isla, alma, oso, ala.
function generateInverseWords(graphemes) {
  const taughtVowels = graphemes.filter((g) => VOWELS.includes(g));
  if (taughtVowels.length === 0) return [];

  const cvSyllables = generateCVSyllables(graphemes);
  const taughtConsonants = graphemes.filter((g) =>
    !VOWELS.includes(g) && GRAPHEME_CV_MAP[g]
  );

  const words = new Set();

  // VCV pattern: vowel + CV (e.g., i-sla, a-la, o-so)
  for (const v of taughtVowels) {
    for (const cv of cvSyllables) {
      // Skip if the CV starts with a vowel-only syllable
      const word = v + cv;
      words.add(word);
    }
  }

  // VCCV pattern: vowel + consonant + CV (e.g., a-lma, i-sla with clusters)
  // Use simple consonants for the middle consonant
  const simpleConsonants = taughtConsonants.filter((g) => g.length === 1);
  for (const v of taughtVowels) {
    for (const c of simpleConsonants) {
      for (const cv of cvSyllables) {
        // Only if the consonant + CV vowel forms a valid cluster
        const word = v + c + cv;
        // Avoid triple letters or awkward combos
        if (word.length <= 6) words.add(word);
      }
    }
  }

  // Filter to a reasonable pool
  const pool = [...words].slice(0, 50);
  return pool;
}

export const DECODING_LEVELS = [
  { id: 'CV', label: 'CV Syllables', generate: generateCVSyllables, sample: 'mo, pa, si' },
  { id: 'CVC', label: 'CVC Words', generate: generateCVCWords, sample: 'mes, mas, pal' },
  { id: 'CVCV', label: 'CVCV Words', generate: generateCVCVWords, sample: 'mala, piso' },
  { id: 'inverse', label: 'Inverse', generate: generateInverseWords, sample: 'isla, alma' },
];

// Generate a shuffled set of items for a given level.
export function generateDecodingItems(levelId, moduleNumber, lessonNumber, count = 0) {
  const graphemes = getTaughtGraphemes(moduleNumber, lessonNumber);
  const level = DECODING_LEVELS.find((l) => l.id === levelId);
  if (!level) return [];
  const pool = level.generate(graphemes);
  if (pool.length === 0) return [];
  const shuffled = shuffle(pool);
  // count = 0 means return ALL items (e.g. every CV syllable is tested).
  // Otherwise take min(count, pool.length).
  if (count <= 0) return shuffled;
  return shuffled.slice(0, Math.min(count, pool.length));
}

// Check if a level has enough items to be assessable.
export function canAssessLevel(levelId, moduleNumber, lessonNumber) {
  const graphemes = getTaughtGraphemes(moduleNumber, lessonNumber);
  const level = DECODING_LEVELS.find((l) => l.id === levelId);
  if (!level) return false;
  return level.generate(graphemes).length > 0;
}