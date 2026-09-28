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

// Real Spanish CVC words, tagged with required graphemes (initial + vowel + final).
// Filtered by the graphemes taught through the current curriculum position.
const REAL_CVC_WORDS = [
  // ── m, p, s, l + vowels (M2.L11+) — finals: s, l ──
  { word: 'mas', g: ['m','s','a'] },
  { word: 'mes', g: ['m','s','e'] },
  { word: 'mis', g: ['m','s','i'] },
  { word: 'las', g: ['l','s','a'] },
  { word: 'les', g: ['l','s','e'] },
  { word: 'los', g: ['l','s','o'] },
  { word: 'mal', g: ['m','l','a'] },
  { word: 'mil', g: ['m','l','i'] },
  { word: 'sal', g: ['s','l','a'] },
  { word: 'sol', g: ['s','l','o'] },
  // ── + n (M2.L16+) — finals: s, l, n ──
  { word: 'pan', g: ['p','n','a'] },
  { word: 'sin', g: ['s','n','i'] },
  { word: 'son', g: ['s','n','o'] },
  { word: 'san', g: ['s','n','a'] },
  // ── + d (M3.L1+) — finals: s, l, n, d ──
  { word: 'dan', g: ['d','n','a'] },
  { word: 'don', g: ['d','n','o'] },
  { word: 'dos', g: ['d','s','o'] },
  { word: 'del', g: ['d','l','e'] },
  { word: 'sed', g: ['s','d','e'] },
  // ── + t (M3.L6+) — finals: s, l, n, d, t ──
  { word: 'tan', g: ['t','n','a'] },
  { word: 'tos', g: ['t','s','o'] },
  // ── + f (M3.L11+) ──
  { word: 'fin', g: ['f','n','i'] },
  // ── + b (M4.L1+) ──
  { word: 'bus', g: ['b','s','u'] },
  // ── + c-fuerte (M4.L11+) ──
  { word: 'cal', g: ['c-fuerte','l','a'] },
  { word: 'col', g: ['c-fuerte','l','o'] },
  { word: 'can', g: ['c-fuerte','n','a'] },
  { word: 'con', g: ['c-fuerte','n','o'] },
  // ── + v (M5.L1+) ──
  { word: 'vas', g: ['v','s','a'] },
  { word: 'ves', g: ['v','s','e'] },
  { word: 'vos', g: ['v','s','o'] },
  { word: 'val', g: ['v','l','a'] },
  { word: 'vil', g: ['v','l','i'] },
  { word: 'van', g: ['v','n','a'] },
  { word: 'ven', g: ['v','n','e'] },
  { word: 'vid', g: ['v','d','i'] },
  // ── + r-final (M5.L6+) ──
  { word: 'mar', g: ['m','a','r-final'] },
  { word: 'par', g: ['p','a','r-final'] },
  { word: 'por', g: ['p','o','r-final'] },
  { word: 'ser', g: ['s','e','r-final'] },
  { word: 'dar', g: ['d','a','r-final'] },
  { word: 'tor', g: ['t','o','r-final'] },
  { word: 'bar', g: ['b','a','r-final'] },
  { word: 'ver', g: ['v','e','r-final'] },
  // ── + g-fuerte (M6.L1+) ──
  { word: 'gas', g: ['g-fuerte','s','a'] },
  { word: 'gol', g: ['g-fuerte','l','o'] },
  // ── + tr (M8.L11+) ──
  { word: 'tras', g: ['tr','s','a'] },
  { word: 'tres', g: ['tr','s','e'] },
  { word: 'tren', g: ['tr','n','e'] },
  // ── + gr (M8.L16+) ──
  { word: 'gris', g: ['gr','s','i'] },
  { word: 'gran', g: ['gr','n','a'] },
  // ── + pl, fl (M9.L11+) ──
  { word: 'plan', g: ['pl','n','a'] },
  { word: 'flan', g: ['fl','n','a'] },
];

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
  return [...syllables].sort();
}

// Single consonants that can start a CVC word (no digraphs/clusters).
const CVC_INITIALS = ['m','p','s','l','n','d','t','f','b','v','z','j','k','x','w','ñ','y','r'];
// Consonants that commonly end CVC words in Spanish.
const CVC_FINALS = ['s','l','n','d','t','r-final'];

// Generate CVC words balanced across taught initial consonants.
// Uses real words first, padding with syllable fillers so each initial
// consonant has equal representation (3 per initial). Interleaved
// round-robin so the student sees variety, not grouped by initial.
function generateCVCWords(graphemes) {
  const taughtSet = new Set(graphemes);
  const available = REAL_CVC_WORDS.filter((entry) => wordIsAvailable(entry, taughtSet));

  // Group real words by initial consonant
  const byInitial = {};
  for (const entry of available) {
    const initial = entry.g[0];
    if (!byInitial[initial]) byInitial[initial] = [];
    byInitial[initial].push(entry.word);
  }

  const initials = CVC_INITIALS.filter((i) => taughtSet.has(i));
  if (initials.length === 0) return [];

  const finals = CVC_FINALS.filter((f) => taughtSet.has(f));
  const vowels = VOWELS.filter((v) => taughtSet.has(v));
  if (finals.length === 0 || vowels.length === 0) return [];

  // Pad each initial group with syllable fillers up to 3
  for (const initial of initials) {
    if (!byInitial[initial]) byInitial[initial] = [];
    byInitial[initial].sort();
    if (byInitial[initial].length >= 3) continue;
    const fillers = [];
    for (const v of vowels) {
      for (const f of finals) {
        if (initial === f) continue;
        const syl = initial + v + f;
        if (!byInitial[initial].includes(syl)) fillers.push(syl);
      }
    }
    fillers.sort();
    for (const f of fillers) {
      if (byInitial[initial].length >= 3) break;
      byInitial[initial].push(f);
      byInitial[initial].sort();
    }
  }

  // Interleave round-robin: 3 per initial
  const result = [];
  for (let i = 0; i < 3; i++) {
    for (const init of initials) {
      if (byInitial[init] && byInitial[init][i]) result.push(byInitial[init][i]);
    }
  }
  return result;
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
  { word: 'lupa', g: ['l','p','u','a'] },
  { word: 'lila', g: ['l','i','a'] },

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

// Real Spanish inverse-pattern words.
// true = V-CCV with a closed V-C syllable (alma, isla) — the target pattern.
// simple = V-CV with no closed syllable (oso, ala) — filler when true inverse
// words are scarce at early curriculum positions.
const REAL_INVERSE_WORDS = [
  // ── True inverse (V-CCV) ──
  // m, p, s, l + vowels
  { word: 'alma', g: ['l','m','a'], true: true },
  { word: 'asma', g: ['s','m','a'], true: true },
  { word: 'isla', g: ['s','l','i','a'], true: true },
  { word: 'olmo', g: ['l','m','o'], true: true },
  // + n, d
  { word: 'asno', g: ['s','n','a','o'], true: true },
  { word: 'onda', g: ['n','d','o','a'], true: true },
  { word: 'anda', g: ['n','d','a'], true: true },
  // + t
  { word: 'alto', g: ['l','t','a','o'], true: true },
  { word: 'alta', g: ['l','t','a'], true: true },
  { word: 'asta', g: ['s','t','a'], true: true },
  { word: 'este', g: ['s','t','e'], true: true },
  { word: 'esto', g: ['s','t','o'], true: true },
  // + f
  { word: 'alfa', g: ['l','f','a'], true: true },
  // + b
  { word: 'alba', g: ['l','b','a'], true: true },
  // + r-inicial
  { word: 'arma', g: ['r-inicial','m','a'], true: true },
  { word: 'orla', g: ['r-inicial','l','o','a'], true: true },
  { word: 'arpa', g: ['r-inicial','p','a'], true: true },
  // + c-fuerte
  { word: 'orca', g: ['r-inicial','c-fuerte','o','a'], true: true },
  { word: 'orco', g: ['r-inicial','c-fuerte','o'], true: true },
  // ── Simple V-CV (filler) ──
  { word: 'oso', g: ['s','o'], true: false },
  { word: 'ala', g: ['l','a'], true: false },
  { word: 'amo', g: ['m','a','o'], true: false },
  { word: 'ola', g: ['l','o','a'], true: false },
  { word: 'asa', g: ['s','a'], true: false },
  { word: 'ese', g: ['s','e'], true: false },
  { word: 'uso', g: ['s','u','o'], true: false },
  { word: 'osa', g: ['s','o','a'], true: false },
  { word: 'uno', g: ['n','u','o'], true: false },
  { word: 'oda', g: ['d','o','a'], true: false },
  { word: 'ata', g: ['t','a'], true: false },
  { word: 'efe', g: ['f','e'], true: false },
  { word: 'ora', g: ['r-inicial','o','a'], true: false },
  { word: 'ara', g: ['r-inicial','a'], true: false },
  { word: 'ere', g: ['r-inicial','e'], true: false },
  { word: 'ira', g: ['r-inicial','i','a'], true: false },
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
  const available = REAL_INVERSE_WORDS.filter((entry) => wordIsAvailable(entry, taughtSet));
  // True inverse (V-CCV) first, then simple V-CV as filler.
  const trueInv = available.filter((e) => e.true).map((e) => e.word).sort();
  const simple = available.filter((e) => !e.true).map((e) => e.word).sort();
  return [...trueInv, ...simple].slice(0, 12);
}

export const DECODING_LEVELS = [
  { id: 'CV', label: 'CV Syllables', generate: generateCVSyllables, sample: 'mo, pa, si' },
  { id: 'CVC', label: 'CVC Words', generate: generateCVCWords, sample: 'sal, mes, mas' },
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
  // Generators already return a deterministic order (alphabetical, or
  // true-inverse-first for the inverse level) — do NOT re-sort here.
  if (count <= 0) return pool;
  return pool.slice(0, Math.min(count, pool.length));
}

// Check if a level has enough items to be assessable.
export function canAssessLevel(levelId, moduleNumber, lessonNumber) {
  const graphemes = getTaughtGraphemes(moduleNumber, lessonNumber);
  const level = DECODING_LEVELS.find((l) => l.id === levelId);
  if (!level) return false;
  return level.generate(graphemes).length > 0;
}