import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  bookPageCount, resolveQuestionTarget, questionTargetFields, questionLabel, buildReadingPages,
} from '../src/lib/book/comprehension.mjs';

const books = [
  { id: 'a', title: 'First book', pdf_page_count: 3 },
  { id: 'b', title: 'Second book', pdf_page_count: 5 },
];
test('page counts support PDF and image-page books', () => {
  assert.equal(bookPageCount(books[1]), 5);
  assert.equal(bookPageCount({ pages: ['1', '2'] }), 2);
  assert.equal(bookPageCount(null), 1);
});
test('Book B page 2 is local, independent of Book A length', () => {
  const q = questionTargetFields({ kind: 'book', bookId: 'b', pageNumber: 2 }, books);
  assert.equal(q.page_number, 2);
  assert.deepEqual(resolveQuestionTarget(q, books), { kind: 'book', bookId: 'b', bookIndex: 1, pageNumber: 2 });
  assert.equal(resolveQuestionTarget(q, [{ ...books[0], pdf_page_count: 70 }, books[1]]).pageNumber, 2);
  assert.equal(questionLabel(q, books), 'Book B · p2');
});
test('legacy global slide numbers map across books without rewriting', () => {
  const q = { page_number: 5 };
  assert.equal(resolveQuestionTarget(q, books).bookId, 'b');
  assert.equal(resolveQuestionTarget(q, books).pageNumber, 2);
  assert.deepEqual(q, { page_number: 5 });
  assert.equal(resolveQuestionTarget({ page_number: 9 }, books).extraPage, 1);
  assert.equal(resolveQuestionTarget({ page_number: 0 }, books).kind, 'general');
});
test('legacy marks preserve their original book, explicit removed books are never reassigned', () => {
  assert.equal(resolveQuestionTarget({ page_number: 1, mark: { book_id: 'b' } }, books).bookId, 'b');
  const orphan = resolveQuestionTarget({ question_scope: 'book', book_id: 'removed', page_number: 1 }, books);
  assert.equal(orphan.bookIndex, -1);
  assert.equal(orphan.bookId, 'removed');
});
test('new extras and general have unambiguous scope and clear stale book links', () => {
  assert.deepEqual(questionTargetFields({ kind: 'extra', extraPage: 2 }, books),
    { question_scope: 'extra', book_id: '', page_number: 0, extra_page: 2 });
  assert.equal(resolveQuestionTarget({ question_scope: 'extra', page_number: 0, extra_page: 2 }, books).extraPage, 2);
  assert.deepEqual(questionTargetFields({ kind: 'general' }, books),
    { question_scope: 'general', book_id: '', page_number: 0, extra_page: 0 });
});
test('invalid pages and unknown books are rejected', () => {
  for (const pageNumber of [0, 6, NaN]) assert.throws(() =>
    questionTargetFields({ kind: 'book', bookId: 'b', pageNumber }, books));
  assert.throws(() => questionTargetFields({ kind: 'book', bookId: 'missing', pageNumber: 1 }, books));
  assert.throws(() => questionTargetFields({ kind: 'extra', extraPage: 0 }, books));
});
test('reading sequence includes all of A then all of B before comparisons', () => {
  const a = { id: 'qa', question_scope: 'book', book_id: 'a', page_number: 1 };
  const b = { id: 'qb', question_scope: 'book', book_id: 'b', page_number: 1 };
  const c = { id: 'qc', question_scope: 'extra', extra_page: 1 };
  const pages = buildReadingPages(books, [a, b, c]);
  assert.equal(pages.length, 9);
  assert.deepEqual(pages.slice(0, 8).map(p => p.book.id), ['a', 'a', 'a', 'b', 'b', 'b', 'b', 'b']);
  assert.deepEqual(pages[0].questions, [a]);
  assert.deepEqual(pages[3].questions, [b]);
  assert.equal(pages[3].pageNumber, 1);
  assert.equal(pages[8].question.id, 'qc');
  assert.equal(pages[8].type, 'question');
});
test('several questions on the same extra slide remain reachable and ordered', () => {
  const pages = buildReadingPages([], [
    { id: 'second', question_scope: 'extra', extra_page: 1, order: 2 },
    { id: 'first', question_scope: 'extra', extra_page: 1, order: 1 },
    { id: 'general', page_number: 0 },
  ]);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[1].questions.map(q => q.id), ['first', 'second']);
});
test('each reader receives only questions belonging to its catalog book', () => {
  const source = readFileSync(new URL('../src/hooks/useBookQuestions.js', import.meta.url), 'utf8');
  assert.match(source, /target\.bookId === catalogBookId/);
  assert.match(source, /page_number: target\.pageNumber/);
  assert.match(source, /booksByLesson/);
});
test('regular teacher reader offers recording-safe next-book continuation', () => {
  const source = readFileSync(new URL('../src/components/book/StudentBookReader.jsx', import.meta.url), 'utf8');
  assert.match(source, /hasNextPage \|\| \(teacherMode && !!nextLessonBook\)/);
  assert.match(source, /await navigateTo\(currentPage\)/);
  assert.match(source, /lessonContext=\{effectiveLessonKey\}/);
  assert.match(source, /initialPage=\{1\}/);
});
test('schema adds optional identity fields without changing existing authorization', () => {
  const schema = JSON.parse(readFileSync(new URL('../base44/entities/BookComprehensionQuestion.jsonc', import.meta.url), 'utf8'));
  assert.equal(schema.properties.book_id.type, 'string');
  assert.deepEqual(schema.properties.question_scope.enum, ['book', 'general', 'extra']);
  assert.deepEqual(schema.required, ['lesson_key', 'question_text']);
  assert.equal(schema.rls.read, null);
  assert.ok(schema.rls.update.$or);
});
