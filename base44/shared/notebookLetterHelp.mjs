const lettersPattern = /^(?:[a-zñáéíóúü]|ch|ll|rr)$/u;
export function parseHelpLetters(value) {
  const parts = (Array.isArray(value) ? value : String(value || '').split(/[,;\s]+/u))
    .map(letter => String(letter).trim().normalize('NFC').toLocaleLowerCase('es')).filter(Boolean);
  if (parts.some(letter => !lettersPattern.test(letter))) throw new Error('Use letters separated by commas, for example: d, t, p.');
  const letters = [...new Set(parts)];
  if (!letters.length || letters.length > 40) throw new Error('Choose between 1 and 40 target letters.');
  return letters;
}
export function normalizeLetterHelp(value, pageCount = 2000) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 100) throw new Error('Letter Help must contain at most 100 page rules.');
  const ids = new Set();
  return value.map(rule => {
    if (!rule || typeof rule.id !== 'string' || !/^[\w-]{1,80}$/.test(rule.id) || ids.has(rule.id)) throw new Error('Each Letter Help rule needs a unique ID.');
    ids.add(rule.id);
    const pageStart = Number(rule.pageStart), pageEnd = Number(rule.pageEnd ?? rule.pageStart);
    if (![pageStart, pageEnd].every(n => Number.isSafeInteger(n) && n >= 1 && n <= pageCount) || pageEnd < pageStart) throw new Error('Choose a valid page or page range.');
    const x = rule.x ?? .9, y = rule.y ?? .08, speed = rule.speed ?? .5;
    if (![x, y].every(n => typeof n === 'number' && Number.isFinite(n) && n >= .02 && n <= .98)) throw new Error('Place the help icon inside the worksheet.');
    if (![.25, .5, 1].includes(speed)) throw new Error('Choose a supported replay speed.');
    return { id: rule.id, pageStart, pageEnd, letters: parseHelpLetters(rule.letters), x, y, speed, enabled: rule.enabled !== false };
  });
}
export function letterHelpForPage(value, page, pageCount = 2000) {
  return normalizeLetterHelp(value, pageCount).filter(rule => rule.enabled && page >= rule.pageStart && page <= rule.pageEnd);
}

let waypointCache = null;
let waypointPending = null;
const MAX_AGE = 120000;

// Small, shared per-instance snapshot. Never query Base44 from animation frames
// or each student dialog. Default books without help do not load this at all.
async function teacherWaypoints(svc) {
  if (waypointCache && Date.now() - waypointCache.at < MAX_AGE) return waypointCache.rows;
  if (waypointPending) return waypointPending;
  waypointPending = Promise.resolve().then(() => svc.entities.LetterWaypoint.list('-updated_date', 500))
    .then(value => {
      const rows = Array.isArray(value) ? value : value?.items;
      if (!Array.isArray(rows) || rows.length >= 500) throw new Error('Incomplete letter models');
      waypointCache = { at: Date.now(), rows };
      return rows;
    }).finally(() => { waypointPending = null; });
  return waypointPending;
}

export async function withNotebookLetterHelp(workbook, assignment, svc) {
  try {
    const rules = normalizeLetterHelp(assignment?.letter_help, workbook.pageCount);
    if (!rules.length) return workbook;
    if (!rules.some(rule => rule.enabled)) return { ...workbook, letterHelp: rules, letterHelpWaypoints: {} };
    const needed = new Set(rules.filter(rule => rule.enabled).flatMap(rule => rule.letters)
      .flatMap(letter => [letter, letter.toLocaleUpperCase('es'),
        ...Array.from(letter), ...Array.from(letter.toLocaleUpperCase('es')),
        ...Array.from(letter.normalize('NFD').replace(/[\u0300-\u036f]/g, '')),
        ...Array.from(letter.toLocaleUpperCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, ''))]));
    const snapshot = {};
    for (const row of await teacherWaypoints(svc)) {
      if (!needed.has(row.letter) || snapshot[row.letter]) continue;
      const strokes = typeof row.strokes_data === 'string' ? JSON.parse(row.strokes_data) : row.strokes_data;
      if (!Array.isArray(strokes) || !strokes.length || strokes.length > 30 ||
          strokes.reduce((n, stroke) => n + (Array.isArray(stroke) ? stroke.length : 10000), 0) > 6000 ||
          strokes.some(stroke => !Array.isArray(stroke) || !stroke.length || stroke.some(point =>
            !point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > 4 || Math.abs(point.y) > 4))) {
        throw new Error('Invalid teacher letter model');
      }
      snapshot[row.letter] = { strokes, hint: typeof row.hint === 'string' ? row.hint.slice(0, 500) : '' };
    }
    return { ...workbook, letterHelp: rules, letterHelpWaypoints: snapshot };
  } catch {
    // Optional help must never block a child's notebook or pending ink.
    return { ...workbook, letterHelp: [], letterHelpWaypoints: {}, letterHelpError: 'Letter Help is temporarily unavailable. Your notebook still works.' };
  }
}
