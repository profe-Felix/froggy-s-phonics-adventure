import { bookLessonTags, enrichBookCatalog, sourceSignature } from './bookMetadata.mjs';

export class ScanError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
const fail = (code, status) => { throw new ScanError(code, status); };
const normalize = value => String(value || '').normalize('NFC').trim().toLocaleLowerCase('es');
const validWord = word => typeof word === 'string' && /^[a-záéíóúüñ]{1,80}$/iu.test(word);
const pendingOcr = new Map();
const bounded = rows => {
  if (!Array.isArray(rows) || rows.length >= 1000) fail('catalog_too_large', 409);
  return rows;
};
function onlyKeys(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !keys.includes(key))) fail('invalid_request');
}
export function validateScanEntries(entries) {
  if (!Array.isArray(entries) || entries.length > 10000) fail('invalid_entries');
  const seen = new Set();
  return entries.flatMap(entry => {
    if (!entry || !validWord(entry.word) || !Array.isArray(entry.syllables) ||
        !entry.syllables.length || entry.syllables.length > 40 ||
        entry.syllables.some(s => !validWord(s))) fail('invalid_entries');
    const word = normalize(entry.word), syllables = entry.syllables.map(normalize);
    if (syllables.join('') !== word) fail('invalid_syllables');
    if (seen.has(word)) return [];
    seen.add(word);
    return [{ word, syllables }];
  });
}
async function currentBook(api, body) {
  if (typeof body.book_id !== 'string' || !/^[\w-]{1,100}$/.test(body.book_id) ||
      typeof body.source_signature !== 'string' || body.source_signature.length > 400000) fail('invalid_book');
  let raw;
  try { raw = await api.BookCatalog.get(body.book_id); } catch { fail('book_not_found', 404); }
  if (!raw?.id) fail('book_not_found', 404);
  if (raw.language && !['es', 'bilingual'].includes(raw.language)) fail('unsupported_book');
  const assignments = bounded(await api.BookAssignment.filter({ catalog_book_id: raw.id }, undefined, 1000));
  const book = enrichBookCatalog([raw], assignments)[0];
  if (sourceSignature(book) !== body.source_signature) fail('book_changed', 409);
  return book;
}
export async function saveBookIndex(api, body) {
  onlyKeys(body, ['action', 'book_id', 'source_signature', 'entries', 'warning',
    'expected_index_id', 'expected_index_updated_at']);
  const entries = validateScanEntries(body.entries);
  if (typeof body.warning !== 'string' || body.warning.length > 2000) fail('invalid_warning');
  await currentBook(api, body);
  const matches = bounded(await api.BookPracticeIndex.filter({ book_id: body.book_id }, '-scanned_at', 1000));
  const prior = matches[0];
  if (prior?.source_signature === body.source_signature &&
      JSON.stringify(validateScanEntries(prior.entries)) === JSON.stringify(entries) &&
      String(prior.warning || '') === body.warning)
    return { ok: true, index_id: prior.id, already_current: true };
  if (String(prior?.id || '') !== String(body.expected_index_id || '') ||
      String(prior?.updated_date || '') !== String(body.expected_index_updated_at || '')) fail('index_changed', 409);
  // Recheck the trusted source after reading the destination. Never accept a caller URL or arbitrary entity ID.
  await currentBook(api, body);
  const payload = { book_id: body.book_id, source_signature: body.source_signature, entries,
    warning: body.warning, scanned_at: new Date().toISOString() };
  const saved = prior ? await api.BookPracticeIndex.update(prior.id, payload) : await api.BookPracticeIndex.create(payload);
  const readback = await api.BookPracticeIndex.get(saved.id);
  if (readback.source_signature !== body.source_signature ||
      JSON.stringify(validateScanEntries(readback.entries)) !== JSON.stringify(entries)) fail('save_unconfirmed', 503);
  return { ok: true, index_id: saved.id };
}
export function appendIntroducedReaders(lesson, books) {
  if (lesson.language !== 'es' || lesson.class_name || ['guided', 'side_quest'].includes(lesson.assignment_type) ||
      lesson.active === false || !Number.isInteger(Number(lesson.lesson_number)) ||
      Number(lesson.lesson_number) < 1 || Number(lesson.lesson_number) > 36) return null;
  let changed = false;
  const days = (lesson.daily_lessons || []).map(day => {
    const module = Number(day.module_number), number = Number(day.curriculum_lesson_number);
    if (day.active === false || !Number.isInteger(module) || module < 1 || module > 9 ||
        !Number.isInteger(number) || number < 1 || number > 20 || !day.steps?.length ||
        day.steps.some(step => step.mode === 'book_reading') ||
        !books.some(book => book.subject === 'df' && book.module === `M${module}` &&
          Number(bookLessonTags(book)[0]?.slice(1)) === number)) return day;
    changed = true;
    return { ...day, steps: [...day.steps, { mode: 'book_reading', title: 'Lectura DF', emoji: '', color: 'orange',
      live_scope: 'both', access_scope: 'both', completion: { type: 'view', target: 1 },
      config: { autoDfBooks: true, generatedCurriculum: true,
        curriculumPosition: { module_number: module, curriculum_lesson_number: number } } }] };
  });
  return changed ? days : null;
}
export async function syncIntroducedReaders(api, now = Date.now()) {
  const catalog = bounded(await api.BookCatalog.list('title', 1000));
  const assignments = bounded(await api.BookAssignment.list(undefined, 1000, undefined,
    ['id', 'catalog_book_id', 'subject', 'module', 'lesson', 'lessons']));
  const books = enrichBookCatalog(catalog, assignments)
    .filter(book => !book.language || ['es', 'bilingual'].includes(book.language));
  const lessons = bounded(await api.Lesson.list('-created_date', 1000));
  let updated = 0, deferred = 0;
  for (const original of lessons) {
    if (!appendIntroducedReaders(original, books)) continue;
    const current = await api.Lesson.get(original.id);
    const days = appendIntroducedReaders(current, books);
    if (!days) continue;
    const changedAt = Date.parse(current.updated_date);
    // Do not race a teacher's recently saved edits. The next teacher scan retries this safely.
    if (!Number.isFinite(changedAt) || now - changedAt < 60000) { deferred++; continue; }
    const latest = await api.Lesson.get(current.id);
    if (latest.updated_date !== current.updated_date) { deferred++; continue; }
    await api.Lesson.update(current.id, { daily_lessons: days });
    updated++;
  }
  return { ok: true, updated, deferred };
}
export async function ocrBook(api, core, body) {
  onlyKeys(body, ['action', 'book_id', 'source_signature']);
  const book = await currentBook(api, body);
  if (!book.pdf_url || !/^https:\/\//i.test(book.pdf_url)) fail('no_readable_pdf');
  const matches = bounded(await api.BookPracticeIndex.filter({ book_id: book.id }, '-scanned_at', 1000));
  const cached = matches.find(row => row.source_signature === body.source_signature && row.entries?.length);
  if (cached) return { ok: true, words: cached.entries.map(entry => entry.word), cached: true };
  // Catalog uploads use immutable file URLs. Retagging a book or refreshing the
  // teacher page must not repeatedly invoke paid OCR for that same PDF.
  const prepared = await api.BookVocabularyOcrCache.filter({ book_id: book.id, pdf_url: book.pdf_url }, '-created_date', 1);
  if (prepared[0] && Array.isArray(prepared[0].words))
    return { ok: true, words: prepared[0].words, cached: true };
  const key = JSON.stringify([book.id, book.pdf_url]);
  if (pendingOcr.has(key)) return pendingOcr.get(key);
  const task = (async () => {
    const result = await core.ExtractDataFromUploadedFile({
    file_url: book.pdf_url,
    json_schema: { type: 'object', properties: { words: { type: 'array', items: { type: 'string' },
      description: 'Transcribe only Spanish words printed in the story pages. Exclude cover, author names, publisher, copyright and credits. Do not invent, translate or add words.' } }, required: ['words'] }
    });
    if (result.status && result.status !== 'success') fail('ocr_unavailable', 503);
    const raw = result.output?.words || result.words;
    if (!Array.isArray(raw)) fail('ocr_unavailable', 503);
    const words = [...new Set(raw.map(normalize).filter(validWord))];
    await api.BookVocabularyOcrCache.create({ book_id: book.id, pdf_url: book.pdf_url,
      words, prepared_at: new Date().toISOString() });
    return { ok: true, words, cached: false };
  })().finally(() => pendingOcr.delete(key));
  pendingOcr.set(key, task);
  return task;
}
