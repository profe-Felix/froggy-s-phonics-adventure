import test from 'node:test';
import assert from 'node:assert/strict';
import { bookLessonTags, bookLessonKeys, enrichBookCatalog, lessonTagUpdate, updateBookMetadata } from '../src/lib/book/lessonTags.mjs';
import { selectComprehension } from '../src/lib/book/curriculum.mjs';

test('missing catalog curriculum comes from linked assignment, restoring the saved M3 book and questions', () => {
  const raw = [{ id: 'book', title: 'Existing book', module: 'M3', pdf_page_count: 8 }];
  const assignments = [{ id: 'assignment', catalog_book_id: 'book', subject: 'df', module: 'M3' }];
  const catalog = enrichBookCatalog(raw, assignments);
  const questions = [{ id: 'q', book_id: 'book', question_scope: 'book', page_number: 2 }];
  const result = selectComprehension({
    subject: 'df', module: 'M3', catalog, questions,
    associations: [{ book_ids: ['book'], lesson_key: 'M3.L7' }],
  });
  assert.equal(result.books[0].id, 'book');
  assert.equal(result.questions[0].page_number, 2);
  assert.equal(result.questions[0].book_id, 'book');
  assert.equal(result.catalog[0].id, 'book');
  assert.equal(raw[0].subject, undefined);
  assert.deepEqual(selectComprehension({ subject: 'lv', module: 'M3', catalog }).catalog, []);
});

test('all books in the selected curriculum/module remain selectable, including module-only and other lesson tags', () => {
  const catalog = [
    { id: 'moduleOnly', module: 'M3', subject: 'df' },
    { id: 'multi', module: 'M3', subject: 'df', lessons: ['L2', 'L5'] },
    { id: 'single', module: 'M3', subject: 'df', lesson: 'L4' },
    { id: 'otherModule', module: 'M4', subject: 'df' },
    { id: 'otherCurriculum', module: 'M3', subject: 'lv' },
  ];
  assert.deepEqual(selectComprehension({ subject: 'df', module: 'M3', catalog }).catalog.map(b => b.id), ['moduleOnly', 'multi', 'single']);
});

test('lesson tags preserve legacy single lessons and normalize multiple selections without duplicates', () => {
  assert.deepEqual(bookLessonTags({ lesson: 'L4' }), ['L4']);
  assert.deepEqual(lessonTagUpdate(['L5', 'L2', 'L5', 'oops', 'L21']), { lessons: ['L2', 'L5'], lesson: 'L2' });
  assert.deepEqual(bookLessonKeys({ module: 'M3', lessons: ['L4', 'L5'] }), ['M3.L4', 'M3.L5']);
  assert.deepEqual(lessonTagUpdate([]), { lessons: [], lesson: '' });
  assert.deepEqual(bookLessonKeys({ lessons: ['L4'] }), []);
});

test('catalog metadata is not guessed from titles or conflicting assignments; explicit metadata wins', () => {
  const raw = [{ id: 'book', title: 'DF M3 L7', subject: 'lv', lessons: [] }];
  const assignments = [
    { id: 'a', catalog_book_id: 'book', subject: 'df', module: 'M3', lesson: 'L2' },
    { id: 'b', catalog_book_id: 'book', subject: 'lv', module: 'M4', lesson: 'L5' },
  ];
  const [book] = enrichBookCatalog(raw, assignments);
  assert.equal(book.subject, 'lv');
  assert.equal(book.module, undefined);
  assert.deepEqual(bookLessonTags(book), []);
  const [missing] = enrichBookCatalog([{ id: 'book' }], assignments);
  assert.equal(missing.subject, undefined);
});

test('source assignment can recover metadata without conflating unrelated copies', () => {
  const [book] = enrichBookCatalog([{ id: 'book', source_assignment_id: 'a' }], [
    { id: 'a', catalog_book_id: 'book', subject: 'df', lesson: 'L5' },
    { id: 'b', catalog_book_id: 'book', subject: 'lv', lesson: 'L6' },
  ]);
  assert.equal(book.subject, 'df');
  assert.deepEqual(bookLessonTags(book), ['L5']);
});

test('saving multiple lessons updates catalog and assignment without touching questions or access', async () => {
  const calls = [];
  const api = Object.fromEntries(['BookCatalog', 'BookAssignment'].map(entity => [
    entity, { update: async (id, data) => { calls.push({ entity, id, data }); return data; } },
  ]));
  const data = lessonTagUpdate(['L4', 'L5']);
  await updateBookMetadata(api, { id: 'assignment', catalog_book_id: 'book' }, data);
  assert.deepEqual(calls, [
    { entity: 'BookCatalog', id: 'book', data },
    { entity: 'BookAssignment', id: 'assignment', data },
  ]);
  calls.length = 0;
  await updateBookMetadata(api, { id: 'assignment', catalog_book_id: 'book' }, { status: 'closed' });
  assert.deepEqual(calls, [{ entity: 'BookAssignment', id: 'assignment', data: { status: 'closed' } }]);
});

test('failed catalog synchronization fails visibly before changing the bookshelf assignment', async () => {
  let assignmentUpdated = false;
  await assert.rejects(updateBookMetadata({
    BookCatalog: { update: async () => { throw new Error('offline'); } },
    BookAssignment: { update: async () => { assignmentUpdated = true; } },
  }, { id: 'assignment', catalog_book_id: 'book' }, lessonTagUpdate(['L2', 'L5'])), /offline/);
  assert.equal(assignmentUpdated, false);
});
