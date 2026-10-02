// Letter-formation groups for the Letter Tracing GAME MODE (free play).
//
// Instead of practicing letters in isolation, students trace groups of letters
// that share a starting stroke — the same way most handwriting curricula
// sequence letters. Lesson steps still pass their own single-letter targets
// and bypass this grouping entirely.
//
// Each group's `letters` are ordered pedagogically: the "seed" letter first,
// then each subsequent letter extends the same stroke (r → n → ñ → m → h →
// b → p, where r is the base dive and each next letter adds another hump /
// extension). The group practice flow traces them in this order.

export const LETTER_FORMATION_GROUPS = [
  { key: 'magic_c', label: 'Magic c', letters: ['c', 'o', 'a', 'd', 'g', 'q'] },
  { key: 'diving', label: 'Diving', letters: ['r', 'n', 'ñ', 'm', 'h', 'b', 'p'] },
  { key: 'straight_down', label: 'Straight down', letters: ['i', 'l', 't', 'j', 'k'] },
  { key: 'diagonal', label: 'Diagonal', letters: ['v', 'w', 'x', 'y', 'z'] },
  { key: 'curves_loops', label: 'Curves & loops', letters: ['e', 's', 'f', 'u'] },
];

import { getIntroducedGraphemesThrough } from './curriculumGraphemes';

// Map a lowercase letter to the curriculum grapheme IDs that introduce its
// sound. Contextual letters (c, g, r, y) map to several IDs — the sound is
// "on" once ANY of them has been introduced. IDs match ES_GRAPHEME_CHART.
const LETTER_TO_GRAPHEME = {
  o: ['o'], i: ['i'], a: ['a'], u: ['u'], e: ['e'],
  m: ['m'], p: ['p'], s: ['s'], l: ['l'], n: ['n'],
  d: ['d'], t: ['t'], f: ['f'], b: ['b'], v: ['v'],
  ñ: ['ñ'], h: ['h'], j: ['j'], k: ['k'], x: ['x'], w: ['w'],
  ll: ['ll'], ch: ['ch'], qu: ['qu'],
  c: ['c-fuerte', 'c-suave'],
  g: ['g-fuerte', 'g-suave', 'g-dieresis'],
  r: ['r-inicial', 'r-medial', 'r-final'],
  y: ['y-inicial'],
};

function normId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Is the sound for this letter introduced given the student's class config?
// classConfig = the ClassConfig record (active_spanish_module / _lesson).
// Fails OPEN (returns true) when the progression can't be determined, so
// tracing still works for classes without a configured curriculum position.
export function isLetterSoundIntroduced(letter, classConfig) {
  if (!classConfig) return true;
  const ids = LETTER_TO_GRAPHEMES[normId(letter)];
  if (!ids || !ids.length) return true;
  const mod = Number(classConfig.active_spanish_module);
  const les = Number(classConfig.active_spanish_lesson);
  if (!mod || !les) return true;
  const introduced = new Set(
    getIntroducedGraphemesThrough({ moduleNumber: mod, lessonNumber: les })
      .map(normId)
  );
  return ids.some((id) => introduced.has(normId(id)));
}