export const KINDS = ['sight_words', 'syllables', 'words', 'phrases'];
export const LABELS = { sight_words: 'Construye: palabras frecuentes', syllables: 'Construye: sílabas',
  words: 'Construye: palabras', phrases: 'Construye: frases' };
export const TOTAL = 20, REQUIRED = 18;
// Earned levels are never revoked when the new practice requirement arrives.
export const ROLLOUT = '2026-10-22T13:00:00.000Z';
export class PracticeError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const normalize = text => String(text || '').normalize('NFKC').toLocaleLowerCase('es').trim().replace(/\s+/g, ' ');
export function safeImage(value) {
  if (!value) return '';
  try { const url = new URL(value); if (url.protocol === 'https:' && !url.username && !url.password) return url.href; } catch {}
  throw new PracticeError('Use an HTTPS image URL from the image library.');
}
export function validateConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PracticeError('Invalid practice targets.');
  const result = {};
  for (const kind of KINDS) {
    const rows = input[kind] || [];
    if (!Array.isArray(rows) || rows.length > 100) throw new PracticeError('Use no more than 100 targets per activity.');
    const seen = new Set();
    result[kind] = rows.map(row => {
      const text = normalize(typeof row === 'string' ? row : row?.text);
      if (!text || text.length > 120 || !/^[a-záéíóúüñ¿?¡!.,\s]+$/i.test(text))
        throw new PracticeError('Targets must contain Spanish letters and ordinary phrase punctuation.');
      if (kind !== 'phrases' && /\s/.test(text)) throw new PracticeError('Put multiword targets in phrases.');
      const imageUrl = typeof row === 'object' ? safeImage(row.imageUrl) : '';
      if (kind === 'phrases' && (!imageUrl || text.split(' ').length < 2 || text.split(' ').length > 12))
        throw new PracticeError('Each phrase needs 2–12 words and a noun image.');
      if (seen.has(text)) return null;
      seen.add(text); return { text, imageUrl };
    }).filter(Boolean);
  }
  return result;
}
export function grandfathered(rows, lessonId) {
  return rows.some(row => row.lesson_id === lessonId && row.completed === true &&
    Number.isFinite(Date.parse(row.updated_date || row.created_date)) &&
    Date.parse(row.updated_date || row.created_date) < Date.parse(ROLLOUT));
}
export function shuffled(values, random = Math.random) {
  const items = [...values];
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
export function makeQuestions(pool, kind, splitSyllables, random = Math.random) {
  if (!KINDS.includes(kind) || !pool?.length) throw new PracticeError('No reviewed targets are available for this activity yet.', 409);
  const split = text => kind === 'phrases' ? text.split(' ') : kind === 'words'
    ? splitSyllables(text) : Array.from(text);
  const candidates = pool.map(row => ({ ...row, pieces: split(row.text) })).filter(row =>
    row.pieces.length && row.pieces.join(kind === 'phrases' ? ' ' : '') === row.text);
  if (!candidates.length) throw new PracticeError('The selected targets could not be split into building tiles.', 409);
  const allPieces = [...new Set(candidates.flatMap(row => row.pieces))];
  let bag = [];
  return Array.from({ length: TOTAL }, (_, index) => {
    if (!bag.length) bag = shuffled(candidates, random);
    const target = bag.pop(), extras = shuffled(allPieces.filter(p => !target.pieces.includes(p)), random).slice(0, 2);
    const pieces = target.pieces.map((value, i) => ({ id: `p${i}`, value }));
    return { index, text: target.text, imageUrl: target.imageUrl || '', kind,
      unit: kind === 'phrases' ? 'word' : kind === 'words' ? 'syllable' : 'letter',
      tiles: shuffled([...pieces, ...extras.map((value, i) => ({ id: `d${i}`, value }))], random) };
  });
}
export function answerCorrect(question, tileIds) {
  if (!Array.isArray(tileIds) || tileIds.length > 120 || new Set(tileIds).size !== tileIds.length ||
      tileIds.some(id => !question.tiles.some(tile => tile.id === id)))
    throw new PracticeError('Choose tiles from this item without using the same tile twice.');
  const text = tileIds.map(id => question.tiles.find(tile => tile.id === id).value)
    .join(question.kind === 'phrases' ? ' ' : '');
  return normalize(text) === question.text;
}
// Events are append-only. A correct retry cannot overwrite a wrong first
// answer, even across concurrent browser tabs. Network retries share request_id.
export function summarize(questions, input) {
  if (questions.length !== TOTAL) throw new PracticeError('This practice round is incomplete. Start a new round.', 409);
  const events = [...input].sort((a, b) => String(a.created_date).localeCompare(String(b.created_date)) ||
    String(a.id).localeCompare(String(b.id)));
  const requests = new Set();
  const states = questions.map(() => ({ solved: false, hinted: false, firstCorrect: false, tries: 0 }));
  for (const event of events) {
    if (requests.has(event.request_id)) continue;
    requests.add(event.request_id);
    const state = states[event.item_index], question = questions[event.item_index];
    if (!state || state.solved) continue;
    if (event.event_type === 'hint') { state.hinted = true; continue; }
    if (event.event_type !== 'answer') continue;
    let ids; try { ids = JSON.parse(event.answer_data); } catch { continue; }
    let correct; try { correct = answerCorrect(question, ids); } catch { continue; }
    state.tries++;
    if (state.tries === 1) state.firstCorrect = correct && !state.hinted;
    if (correct) state.solved = true;
  }
  const answered = states.filter(s => s.solved).length;
  const correctFirst = states.filter(s => s.firstCorrect).length;
  return { states, answered, correctFirst, cursor: states.findIndex(s => !s.solved),
    passed: answered === TOTAL && correctFirst >= REQUIRED,
    needsPractice: answered === TOTAL && correctFirst < REQUIRED };
}
export function validateScope(student, lesson) {
  if (!student?.id || !Number.isInteger(student.student_number) || student.student_number < 1 ||
      student.student_number > 30 || !student.class_name || !student.school_year)
    throw new PracticeError('Choose an existing student in this class.', 403);
  if (!lesson?.id || lesson.language !== 'es' || (lesson.class_name && lesson.class_name !== student.class_name))
    throw new PracticeError('This level is not assigned to this student.', 403);
  return { student_id: student.id, class_name: student.class_name, school_year: student.school_year, lesson_id: lesson.id };
}
