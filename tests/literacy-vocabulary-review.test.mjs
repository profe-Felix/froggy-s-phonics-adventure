import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyVocabularyReviews, buildVocabularyReviewItems, reviewDecisions,
  vocabularyKey, vocabularyReviewPayload, loadVocabularyReviews } from '../src/lib/literacy/vocabularyReview.mjs';
import { decodableBookPool } from '../src/lib/literacy/pathwayCurriculum.mjs';
const indexes = [{ book_id: 'a', entries: [
  { word: 'silbato', syllables: ['sil', 'ba', 'to'] },
  { word: 'taco', syllables: ['ta', 'co'] }
] }];
const books = [{ id: 'a', title: 'Mi libro', subject: 'lv', language: 'es' }];
const rule = (kind, text, status, extra = {}) => ({ kind, text, status, ...extra });
const strict = rule('settings', 'bank', 'approved', { approved_only: true });
test('excluded words and their derived syllables do not enter automatic practice', () => {
  const result = applyVocabularyReviews(indexes, [rule('word', 'silbato', 'excluded')]);
  assert.deepEqual(result[0].entries.map(e => e.word), ['taco']);
  assert.deepEqual(indexes[0].entries[0].syllables, ['sil', 'ba', 'to']);
});
test('word corrections and syllable corrections replace only the shared practice view', () => {
  const result = applyVocabularyReviews(indexes, [
    rule('word', 'silbato', 'approved', { replacement: 'salto', syllables: ['sal', 'to'] }),
    rule('syllable', 'co', 'approved', { replacement: 'ca' })
  ]);
  assert.equal(result[0].entries[0].word, 'salto');
  assert.deepEqual(result[0].entries[0].syllables, ['sal', 'to']);
  assert.deepEqual(result[0].entries[1].syllables, ['ta', 'ca']);
  assert.equal(indexes[0].entries[0].word, 'silbato');
});
test('strict mode admits approved words and their syllables, with explicit exclusions winning', () => {
  const result = applyVocabularyReviews(indexes, [strict, rule('word', 'silbato', 'approved'),
    rule('syllable', 'ba', 'excluded'), rule('syllable', 'co', 'approved')])[0].entries;
  assert.equal(result[0].wordAllowed, true);
  assert.deepEqual(result[0].syllables, ['sil', 'to']);
  assert.equal(result[1].wordAllowed, false);
  assert.deepEqual(result[1].syllables, ['co']);
});
test('latest explicit decisions win, including reset and strict-mode changes', () => {
  const old = { ...rule('word', 'taco', 'excluded'), updated_date: '2026-01-01' };
  const current = { ...rule('word', 'taco', 'pending'), updated_date: '2026-01-02' };
  assert.equal(reviewDecisions([old, current]).get(vocabularyKey('word', 'TACO')).status, 'pending');
  assert.equal(applyVocabularyReviews(indexes, [old, current])[0].entries.length, 2);
  assert.notEqual(vocabularyKey('word', 'si'), vocabularyKey('word', 'sí'));
});
test('review list keeps provenance, excluded entries, corrections and inherited syllable approval', () => {
  const items = buildVocabularyReviewItems([...indexes, { ...indexes[0], book_id: 'b' }],
    [...books, { id: 'b', title: 'Otro libro', subject: 'df' }], [rule('word', 'silbato', 'approved')]);
  assert.equal(items.words.find(w => w.original === 'silbato').sourceBooks.length, 2);
  const syllable = items.syllables.find(s => s.original === 'sil');
  assert.equal(syllable.status, 'approved'); assert.equal(syllable.inherited, true);
  assert.equal(items.words.find(w => w.original === 'taco').status, 'pending');
});
test('save validation preserves accents, requires matching splits and allows excluding bad OCR', () => {
  const item = { kind: 'word', original: 'silbato', text: 'silbato', syllables: ['sil', 'ba', 'to'], status: 'pending' };
  assert.equal(vocabularyReviewPayload(item, { status: 'approved' }).status, 'approved');
  assert.throws(() => vocabularyReviewPayload(item, { status: 'approved', replacement: 'país', syllables: ['pa', 'is'] }), /join/);
  assert.deepEqual(vocabularyReviewPayload(item, { status: 'approved', replacement: 'país', syllables: ['pa', 'ís'] }).syllables, ['pa', 'ís']);
  assert.throws(() => vocabularyReviewPayload(item, { status: 'approved', replacement: 'dos palabras' }), /one Spanish/);
  assert.equal(vocabularyReviewPayload({ ...item, text: 'bad0cr' }, { status: 'excluded' }).status, 'excluded');
  assert.equal(vocabularyReviewPayload(item, { status: 'pending' }).replacement, '');
});
test('pagination reads all reviews and fails explicitly rather than silently ignoring later exclusions', async () => {
  const calls = [];
  const client = { entities: { BookVocabularyReview: { list: async (sort, limit, skip) => {
    calls.push(skip); return skip === 0 ? Array.from({ length: 500 }, (_, n) => ({ id: n })) : [{ id: 'last' }];
  } } } };
  assert.equal((await loadVocabularyReviews(client)).length, 501);
  assert.deepEqual(calls, [0, 500]);
});
test('decodable automatic pools apply global review policy without affecting phonics filtering', () => {
  const position = { moduleNumber: 9, lessonNumber: 20 };
  assert.deepEqual(decodableBookPool(indexes, position, { books, reviews: [strict] }), []);
  const reviews = [strict, rule('word', 'silbato', 'approved'), rule('syllable', 'ba', 'excluded')];
  assert.deepEqual(decodableBookPool(indexes, position, { books, reviews }), ['silbato']);
  assert.deepEqual(decodableBookPool(indexes, position, { books, kind: 'syllables', reviews }), ['sil', 'to']);
});
test('review loading is fail-closed, manual daily overrides are explicit, and source scans cannot overwrite decisions', async () => {
  const source = path => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const hook = await source('hooks/useBookVocabulary.js');
  assert.match(hook, /config.vocabularyOverride !== true/);
  assert.match(hook, /!reviews.data \|\| reviews.error/);
  assert.match(hook, /reviews: reviews.data/);
  const scanner = await source('hooks/useBookIndexScanner.js');
  assert.doesNotMatch(scanner, /BookVocabularyReview\.(?:create|update|delete)/);
});
test('kinder defaults and explicit learning text use Andika without changing waypoint font', async () => {
  const source = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const css = await source('src/index.css');
  assert.match(css, /--font-kinder: 'Andika'/);
  assert.match(css, /font-family: var\(--font-kinder\)/);
  assert.match(css, /font-family: 'ZBKidLettersArrowDot'/);
  assert.doesNotMatch(css, /font-family: 'Teachers'/);
  assert.match(await source('tailwind.config.js'), /sans: \['Andika'/);
});
