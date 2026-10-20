import assert from "node:assert/strict";
import test from "node:test";
import { bookSection, groupBooksBySection, resolveSection } from "../src/components/book/bookShelfSections.js";
import { inkPageKey, addStroke, undoStroke, clearPage, eraseAt, normalizePoint } from "../src/components/book/teacherInk.js";

test("books split by subject tag, never by title", () => {
  const books = [
    { id: 1, subject: "lv", title: "DF decodable" },
    { id: 2, subject: "df", title: "LV story" },
    { id: 3, title: "No tag" },
    { id: 4, subject: "DF" },
    { id: 5, subject: "library" },
  ];
  assert.equal(bookSection(books[0]), "lv");
  assert.equal(bookSection(books[2]), "unclassified");
  const sections = groupBooksBySection(books);
  assert.deepEqual(sections.map(s => s.id), ["df", "lv", "library", "unclassified"]);
  assert.deepEqual(sections[0].books.map(b => b.id), [2, 4]);
  assert.equal(resolveSection(sections, null), "df");
  assert.equal(resolveSection(sections, "lv"), "lv");
  assert.equal(resolveSection(groupBooksBySection([{ subject: "lv" }]), "df"), "lv");
  assert.equal(resolveSection([], "df"), null);
  assert.equal(books[2].subject, undefined, "records are not mutated");
});

test("annotation page identity is per book and page", () => {
  assert.equal(inkPageKey({ id: "a", catalog_book_id: "cat" }, 3), "cat::p3");
  assert.equal(inkPageKey({ id: "a" }, 3), "a::p3");
  assert.notEqual(inkPageKey({ id: "a" }, 3), inkPageKey({ id: "a" }, 4));
  assert.notEqual(inkPageKey({ id: "a" }, 3), inkPageKey({ id: "b" }, 3));
});

test("stroke reducers add, undo, erase and clear only the target page", () => {
  const k1 = "b::p1", k2 = "b::p2";
  let s = {};
  s = addStroke(s, k1, { tool: "pen", points: [[0.1, 0.1], [0.5, 0.1]] });
  s = addStroke(s, k1, { tool: "pen", points: [[0.1, 0.9], [0.5, 0.9]] });
  s = addStroke(s, k2, { tool: "highlight", points: [[0.2, 0.2]] });
  assert.equal(s[k1].length, 2);
  s = eraseAt(s, k1, [0.3, 0.11]);
  assert.equal(s[k1].length, 1);
  assert.equal(s[k1][0].points[0][1], 0.9);
  s = undoStroke(s, k1);
  assert.equal(s[k1].length, 0);
  assert.equal(s[k2].length, 1);
  s = clearPage(s, k2);
  assert.equal(s[k2], undefined);
  assert.deepEqual(normalizePoint(150, 50, { left: 100, top: 0, width: 100, height: 100 }), [0.5, 0.5]);
  assert.deepEqual(normalizePoint(500, -5, { left: 100, top: 0, width: 100, height: 100 }), [1, 0]);
});
