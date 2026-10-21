import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sourceSignature } from '../base44/shared/bookMetadata.mjs';
import { ScanError, validateScanEntries, saveBookIndex, appendIntroducedReaders,
  syncIntroducedReaders, ocrBook } from '../base44/shared/bookVocabularyScan.mjs';

function fixture() {
  const book = { id: 'book1', title: 'Lectura', language: 'es', subject: 'df', module: 'M3', lessons: ['L7'],
    pdf_url: 'https://example.com/book.pdf', updated_date: '2026-01-01', pages: [] };
  let index = null;
  const writes = [];
  const api = {
    BookCatalog: { get: async id => id === book.id ? book : null, list: async () => [book] },
    BookAssignment: { filter: async () => [], list: async () => [] },
    BookVocabularyOcrCache: { filter: async () => [], create: async data => ({ id: 'ocr1', ...data }) },
    BookPracticeIndex: {
      filter: async () => index ? [index] : [],
      get: async () => index,
      create: async payload => { index = { ...payload, id: 'index1', updated_date: 't1' }; writes.push(payload); return index; },
      update: async (id, payload) => { index = { ...payload, id, updated_date: 't2' }; writes.push(payload); return index; }
    }
  };
  const body = { action: 'save_index', book_id: book.id, source_signature: sourceSignature(book),
    expected_index_id: '', expected_index_updated_at: '', warning: '',
    entries: [{ word: 'taco', syllables: ['ta', 'co'] }] };
  return { api, book, body, writes, setIndex: value => { index = value; } };
}
test('a public scan contract saves only a verified current catalog book, with confirmed readback', async () => {
  const f = fixture();
  assert.equal((await saveBookIndex(f.api, f.body)).ok, true);
  assert.deepEqual(Object.keys(f.writes[0]).sort(), ['book_id', 'entries', 'scanned_at', 'source_signature', 'warning']);
  assert.equal(f.writes[0].book_id, f.book.id);
  assert.equal((await saveBookIndex(f.api, f.body)).already_current, true);
  assert.equal(f.writes.length, 1);
});
test('unknown books, changed sources and arbitrary entity payloads fail before any write', async () => {
  const f = fixture();
  for (const [body, code] of [
    [{ ...f.body, book_id: 'missing' }, 'book_not_found'],
    [{ ...f.body, source_signature: 'stale' }, 'book_changed'],
    [{ ...f.body, entity: 'Student' }, 'invalid_request'],
    [{ ...f.body, book_id: '../Student/123' }, 'invalid_book'],
  ]) await assert.rejects(saveBookIndex(f.api, body), error => error instanceof ScanError && error.code === code);
  assert.equal(f.writes.length, 0);
});
test('a stale destination cannot replace a newer scan with different words', async () => {
  const f = fixture();
  f.setIndex({ id: 'index1', updated_date: 'newer', source_signature: f.body.source_signature,
    entries: [{ word: 'pato', syllables: ['pa', 'to'] }] });
  await assert.rejects(saveBookIndex(f.api, f.body), error => error.code === 'index_changed');
  assert.equal(f.writes.length, 0);
});
test('index validation requires literal Spanish words and reconstructable syllables', () => {
  assert.deepEqual(validateScanEntries([{ word: 'PAÍS', syllables: ['PA', 'ÍS'] }]), [{ word: 'país', syllables: ['pa', 'ís'] }]);
  assert.throws(() => validateScanEntries([{ word: 'país', syllables: ['pa', 'is'] }]), /invalid_syllables/);
  assert.throws(() => validateScanEntries([{ word: '<script>', syllables: ['x'] }]), /invalid_entries/);
});
const day = { id: 'day1', module_number: 3, curriculum_lesson_number: 7, custom: 'teacher',
  steps: [{ mode: 'letter_formation', title: 'Keep me', config: { letters: ['t'] } }] };
const lesson = { id: 'lesson1', language: 'es', lesson_number: 10, daily_lessons: [day],
  updated_date: '2026-01-01T00:00:00.000Z' };
test('reader linking is append-only, idempotent and restricted to regular global Spanish curriculum', () => {
  const f = fixture(), days = appendIntroducedReaders(lesson, [f.book]);
  assert.equal(days[0].custom, 'teacher');
  assert.deepEqual(days[0].steps[0], day.steps[0]);
  assert.equal(days[0].steps[1].config.autoDfBooks, true);
  assert.equal(lesson.daily_lessons[0].steps.length, 1);
  assert.equal(appendIntroducedReaders({ ...lesson, daily_lessons: days }, [f.book]), null);
  for (const change of [{ language: 'en' }, { class_name: 'Felix' }, { lesson_number: 37 },
    { assignment_type: 'guided' }, { active: false }])
    assert.equal(appendIntroducedReaders({ ...lesson, ...change }, [f.book]), null);
});
test('reader synchronization re-reads current lessons and defers recent or concurrent teacher edits', async () => {
  const f = fixture(), writes = [];
  const current = { ...lesson, daily_lessons: [{ ...day, custom: 'new edit' }] };
  f.api.Lesson = { list: async () => [lesson], get: async () => current,
    update: async (id, payload) => writes.push([id, payload]) };
  assert.equal((await syncIntroducedReaders(f.api, Date.parse('2026-01-02'))).updated, 1);
  assert.equal(writes[0][1].daily_lessons[0].custom, 'new edit');
  assert.deepEqual(Object.keys(writes[0][1]), ['daily_lessons']);
  writes.length = 0;
  current.updated_date = '2026-01-02T00:00:00.000Z';
  assert.equal((await syncIntroducedReaders(f.api, Date.parse(current.updated_date) + 1000)).deferred, 1);
  assert.equal(writes.length, 0);
});
test('OCR service receives only a trusted catalog PDF; a caller cannot supply a different URL', async () => {
  const f = fixture(); let calls = 0;
  const core = { ExtractDataFromUploadedFile: async input => {
    calls++; assert.equal(input.file_url, f.book.pdf_url);
    return { status: 'success', output: { words: ['Taco', 'pato', 'taco'] } };
  } };
  const body = { action: 'ocr_book', book_id: f.book.id, source_signature: sourceSignature(f.book) };
  assert.deepEqual((await ocrBook(f.api, core, body)).words, ['taco', 'pato']);
  await assert.rejects(ocrBook(f.api, core, { ...body, file_url: 'https://wrong.example/' }), /invalid_request/);
  assert.equal(calls, 1);
});
test('unchanged scanned vocabulary is reused before invoking paid OCR again', async () => {
  const f = fixture();
  f.setIndex({ source_signature: f.body.source_signature, entries: f.body.entries });
  const result = await ocrBook(f.api, { ExtractDataFromUploadedFile: () => { throw Error('Must not call'); } },
    { action: 'ocr_book', book_id: f.book.id, source_signature: f.body.source_signature });
  assert.equal(result.cached, true);
});
test('persistent OCR caching survives requests and does not depend on assignment lesson tags', async () => {
  const f = fixture();
  f.api.BookVocabularyOcrCache.filter = async () => [{ words: ['taco'] }];
  const result = await ocrBook(f.api, { ExtractDataFromUploadedFile: () => { throw Error('Must not call'); } },
    { action: 'ocr_book', book_id: f.book.id, source_signature: f.body.source_signature });
  assert.deepEqual(result.words, ['taco']);
  assert.equal(result.cached, true);
});
test('no browser login, privileged client writes, review writes or student permission changes are introduced', async () => {
  const source = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const hook = await source('src/hooks/useBookIndexScanner.js');
  assert.doesNotMatch(hook, /entities\.(?:BookPracticeIndex|Lesson)\.(?:create|update)/);
  assert.match(hook, /functions.invoke\('scanBookVocabulary'/);
  assert.doesNotMatch(await source('src/lib/book/fluencyText.js'), /base44.integrations.Core/);
  const entry = await source('base44/functions/scanBookVocabulary/entry.ts');
  assert.doesNotMatch(entry, /auth\.me|requireUser|login|redirect/);
  const contract = await source('base44/shared/bookVocabularyScan.mjs');
  assert.doesNotMatch(contract, /BookVocabularyReview|Student|FluencyPracticeSession/);
  assert.match(await source('base44/entities/BookPracticeIndex.jsonc'), /"role": "admin"/);
});
