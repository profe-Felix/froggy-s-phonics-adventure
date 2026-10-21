import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { findVocabularyOccurrences as find, vocabularyContextParts, contextRectangles, createContextCursor } from '../src/lib/book/vocabularyContext.mjs';
import { buildVocabularyReviewItems } from '../src/lib/literacy/vocabularyReview.mjs';
import { htmlContextImageSurfaces, htmlContextImagePlacement } from '../src/lib/book/htmlContextImages.mjs';

test('word context matches entire words, case insensitively, and keeps repeated occurrences', () => {
  const text = 'El silbato, los silbatos y otro SILBATO.';
  const hits = find(text, { kind: 'word', original: 'silbato', text: 'silbato' });
  assert.equal(hits.length, 2);
  assert.deepEqual(hits.map(hit => text.slice(hit.start, hit.end)), ['silbato', 'SILBATO']);
});

test('syllable context highlights actual syllables inside words, not arbitrary substrings', () => {
  const text = 'silbato, silbar y asilado';
  const hits = find(text, { kind: 'syllable', original: 'sil', text: 'sil' });
  assert.deepEqual(hits.map(hit => hit.matchedWord), ['silbato', 'silbar']);
  assert.deepEqual(hits.map(hit => text.slice(hit.start, hit.end)), ['sil', 'sil']);
  assert.equal(find('papa', { kind: 'syllable', original: 'pa', text: 'pa' }).length, 2);
});

test('accents and decomposed accents retain original source offsets', () => {
  const text = 'Papa, papá y pa\u0301jaro.';
  const hits = find(text, { kind: 'syllable', original: 'pá', text: 'pá' });
  assert.deepEqual(hits.map(hit => text.slice(hit.start, hit.end)), ['pá', 'pa\u0301']);
  const parts = vocabularyContextParts(text, hits[1]);
  assert.equal(parts.find(part => part.match).text, 'pa\u0301');
});

test('corrections can locate the scanned or corrected form without rewriting print', () => {
  const text = 'El coneto y el conejo.';
  assert.deepEqual(find(text, { kind: 'word', original: 'coneto', text: 'conejo' })
    .map(hit => hit.matchedWord), ['coneto', 'conejo']);
});

test('highlight boxes merge by line, normalize to page size, and exclude invisible text', () => {
  const chars = [{ x: 10, y: 20, w: 5, h: 10 }, { x: 15, y: 20, w: 6, h: 10 },
    { x: 1, y: 40, w: 5, h: 10 }];
  assert.deepEqual(contextRectangles(chars, { start: 0, end: 3 }, 100, 100),
    [{ x: .1, y: .2, w: .11, h: .1 }, { x: .01, y: .4, w: .05, h: .1 }]);
  assert.deepEqual(contextRectangles([{ x: 120, y: 10, w: 5, h: 10 }], { start: 0, end: 1 }, 100, 100), []);
});

test('books with identical titles retain separate source identities', () => {
  const result = buildVocabularyReviewItems(
    ['one', 'two'].map(book_id => ({ book_id, entries: [{ word: 'silbato', syllables: ['sil', 'ba', 'to'] }] })),
    ['one', 'two'].map(id => ({ id, title: 'Same title', subject: 'df' })));
  assert.deepEqual(result.words[0].sourceBooks.map(book => book.id), ['one', 'two']);
  assert.equal(result.syllables.find(item => item.text === 'sil').sourceBooks.length, 2);
});

test('Next is lazy and visits repeated hits, subsequent pages, and other books in order', async () => {
  const calls = [], completed = [];
  const cursor = createContextCursor({ sources: ['A', 'B'], getPageCount: () => 2,
    readMatches: async (book, page) => {
      calls.push(`${book}:${page}`);
      return book === 'A' && page === 1 ? ['first', 'second'] : page === 2 ? [`${book}-last`] : [];
    }, onBookComplete: book => completed.push(book) });
  assert.deepEqual(calls, []);
  assert.equal((await cursor.next()).value, 'first');
  assert.equal((await cursor.next()).value, 'second');
  assert.deepEqual(calls, ['A:1']);
  assert.equal((await cursor.next()).value, 'A-last');
  assert.equal((await cursor.next()).value, 'B-last');
  assert.equal((await cursor.next()).done, true);
  assert.deepEqual(completed, ['A', 'B']);
});

test('failed pages retry without skipping or repeating delivered hits; closing cancels search', async () => {
  let fail = true;
  const calls = [];
  const cursor = createContextCursor({ sources: ['A'], getPageCount: () => 2,
    readMatches: async (_, page) => {
      calls.push(page);
      if (page === 2 && fail) { fail = false; throw Error('Connection interrupted'); }
      return [`hit-${page}`];
    } });
  assert.equal((await cursor.next()).value, 'hit-1');
  await assert.rejects(cursor.next(), /Connection interrupted/);
  assert.equal((await cursor.next()).value, 'hit-2');
  assert.deepEqual(calls, [1, 2, 2]);
  cursor.dispose();
  await assert.rejects(cursor.next(), { name: 'AbortError' });
});

test('context UI is wired to click, navigation, original-page rendering and read-only OCR', async () => {
  const source = file => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
  const panel = await source('components/lesson/VocabularyReviewPanel.jsx');
  assert.match(panel, /onClick=\{\(\) => preview\(item\)\}/);
  assert.match(panel, /<VocabularyContextDialog item=\{previewItem\}/);
  assert.match(panel, /<VocabularyContextPage hit=\{context.hit\}/);
  const hook = await source('hooks/useVocabularyContext.js');
  assert.match(hook, /index: Math.max\(0, previous.index - 1\)/);
  assert.match(hook, /current.reader.dispose\(\)/);
  const reader = await source('lib/book/vocabularyContextReader.js');
  assert.match(reader, /prepareHtmlBookDocument/);
  assert.match(reader, /module.default.createWorker\('spa'/);
  assert.match(reader, /blocks: true/);
  assert.match(reader, /page.getTextContent\(\)/);
  assert.doesNotMatch(reader, /entities\.|functions.invoke|UploadFile|asServiceRole/);
  assert.match(reader, /revokeObjectURL/);
  const dialog = await source('components/lesson/VocabularyContextDialog.jsx');
  assert.match(dialog, /h-full min-h-0 p-2 transition-opacity/);
});

test('SingleFile artwork in CSS background figures is available without an image tag', () => {
  const embedded = 'data:image/jpeg;base64,c2F2ZWQtcGFnZQ==';
  const node = (tagName, style, hidden = false) => ({
    tagName, style, closest: () => hidden ? {} : null,
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 768, height: 768 }),
  });
  const figure = node('FIGURE', { backgroundImage: `url("${embedded}")`, backgroundSize: '100%', backgroundPosition: '0% 0%' });
  const hidden = node('H1', { backgroundImage: `url("${embedded}")` }, true);
  const external = node('DIV', { backgroundImage: 'url("https://untrusted.example/page.jpg")' });
  const body = node('BODY', { backgroundImage: 'none' });
  body.querySelectorAll = () => [figure, hidden, external];
  const surfaces = htmlContextImageSurfaces({ body, defaultView: { getComputedStyle: el => el.style } });
  assert.equal(surfaces.length, 1);
  assert.equal(surfaces[0].url, embedded);
  assert.deepEqual(htmlContextImagePlacement(surfaces[0], 1536, 1536),
    { x: 0, y: 0, width: 768, height: 768 });
});

test('background image geometry respects offsets, cropping, and contain sizing', () => {
  const rect = { x: 10, y: 20, width: 200, height: 100 };
  assert.deepEqual(htmlContextImagePlacement({ rect, size: 'cover', position: '50% 50%' }, 100, 100),
    { x: 10, y: -30, width: 200, height: 200 });
  assert.deepEqual(htmlContextImagePlacement({ rect, fit: 'contain', position: '50% 50%' }, 100, 100),
    { x: 60, y: 20, width: 100, height: 100 });
  assert.deepEqual(htmlContextImagePlacement({ rect, size: '50% auto', position: '0% 0%' }, 100, 200),
    { x: 10, y: 20, width: 100, height: 200 });
});

test('blank and nonmatching cover pages do not block later HTML occurrences', async () => {
  const visited = [];
  const cursor = createContextCursor({ sources: ['html-book'], getPageCount: () => 4,
    readMatches: async (_, page) => { visited.push(page); return page === 4 ? ['construcciones'] : []; } });
  assert.equal((await cursor.next()).value, 'construcciones');
  assert.deepEqual(visited, [1, 2, 3, 4]);
  assert.equal((await cursor.next()).done, true);
  const reader = await readFile(new URL('../src/lib/book/vocabularyContextReader.js', import.meta.url), 'utf8');
  assert.doesNotMatch(reader, /throw Error\('This image-only HTML page has no page image/);
  assert.match(reader, /htmlContextImageSurfaces\(doc\)/);
  assert.match(reader, /html: source.html/);
  assert.match(reader, /x: char.x \/ scale, y: char.y \/ scale/);
});
