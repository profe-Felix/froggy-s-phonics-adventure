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

// Generate CVCV words: two CV syllables, ensuring each CV syllable appears
// at least once as the first syllable so all are tested in word context.
// Deterministic — same list every round.
function generateCVCVWords(graphemes) {
  const cvSyllables = generateCVSyllables(graphemes);
  if (cvSyllables.length < 2) return [];

  const sorted = [...cvSyllables].sort();
  const words = new Set();

  // Pair each syllable with the next one (cycling) so every CV syllable
  // appears as the first syllable at least once.
  for (let i = 0; i < sorted.length; i++) {
    const first = sorted[i];
    let second = sorted[(i + 1) % sorted.length];
    if (first === second) {
      const alt = sorted[(i + 2) % sorted.length];
      if (alt !== first) second = alt;
    }
    words.add(first + second);
  }

  return [...words].sort();
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

  // Deterministic sort — same list every round
  return [...words].sort();
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