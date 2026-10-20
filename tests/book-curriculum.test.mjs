import test from "node:test";
import assert from "node:assert/strict";
import { selectComprehension, entityItems } from "../src/lib/book/curriculum.mjs";

const catalog = [
  { id: "a", subject: "df", module: "M3", pdf_page_count: 10 },
  { id: "b", subject: "lv", module: "M3", pdf_page_count: 20 },
  { id: "c", subject: "lv", module: "M4", pdf_page_count: 5 },
];
const associations = [{ id: "old", lesson_key: "M3.L18", book_ids: ["a", "b"] }];
test("DF/LV use different books and questions at the same module and lesson", () => {
  const questions = [
    { id: "df", subject: "df", question_text: "DF" },
    { id: "lv", subject: "lv", question_text: "LV" },
  ];
  for (const subject of ["df", "lv"]) {
    const data = selectComprehension({ subject, associations, questions, catalog, module: "M3" });
    assert.deepEqual(data.questions.map(q => q.id), [subject]);
    assert.deepEqual(data.catalog.map(b => b.id), [subject === "df" ? "a" : "b"]);
  }
});
test("legacy flat page references retain their original book-local page after curriculum filtering", () => {
  const questions = [{ id: "oldq", page_number: 12, question_text: "Book B page 2" }];
  const before = structuredClone({ questions, associations });
  const lv = selectComprehension({ subject: "lv", associations, questions, catalog });
  assert.equal(lv.questions[0].book_id, "b");
  assert.equal(lv.questions[0].page_number, 2);
  assert.deepEqual(lv.books.map(b => b.id), ["b"]);
  assert.equal(selectComprehension({ subject: "df", associations, questions, catalog }).questions.length, 0);
  assert.deepEqual({ questions, associations }, before);
});
test("explicit curriculum associations override legacy without updating or deleting the old association", () => {
  const links = [...associations, { id: "lv-link", subject: "lv", book_ids: ["c"] }];
  const data = selectComprehension({ subject: "lv", associations: links, catalog });
  assert.equal(data.lessonBooks.id, "lv-link");
  assert.deepEqual(data.books.map(b => b.id), ["c"]);
  assert.equal(selectComprehension({ subject: "df", associations: links, catalog }).lessonBooks, null);
  assert.deepEqual(associations[0].book_ids, ["a", "b"]);
});
test("removed legacy book references are not silently reassigned to the new book", () => {
  const data = selectComprehension({
    subject: "lv", catalog,
    associations: [...associations, { subject: "lv", book_ids: ["c"] }],
    questions: [{ id: "oldq", page_number: 12, question_text: "Old book" }],
  });
  assert.equal(data.questions[0].book_id, "b");
  assert.equal(data.questions[0].page_number, 2);
});
test("API envelopes and arrays are accepted, but malformed data fails explicitly", () => {
  assert.deepEqual(entityItems({ items: [] }), []);
  assert.deepEqual(entityItems([]), []);
  assert.throws(() => entityItems({}), /could not be read/);
});

test("library readers keep their historical questions without being forced into DF or LV", () => {
  const library = [{ id: "library", subject: "library", pdf_page_count: 5 }];
  const questions = [{ id: "q", page_number: 1, question_text: "Library question" }];
  const data = selectComprehension({
    subject: null, catalog: library, questions,
    associations: [{ book_ids: ["library"] }],
  });
  assert.deepEqual(data.questions, questions);
  assert.deepEqual(data.books, library);
});
