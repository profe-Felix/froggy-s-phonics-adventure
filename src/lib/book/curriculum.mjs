import { resolveQuestionTarget, questionTargetFields } from "./comprehension.mjs";

export function entityItems(result) {
  const rows = Array.isArray(result) ? result : result?.items;
  if (!Array.isArray(rows)) throw new Error("The book records could not be read. Please retry.");
  return rows;
}

export function bookCurriculum(book) {
  return ["df", "lv"].includes(book?.subject) ? book.subject : null;
}

// Old associations/questions have no subject. Interpret their original book
// ordering before filtering, without migrating or rewriting saved records.
export function selectComprehension({ subject, associations = [], questions = [], catalog = [], module }) {
  const byId = new Map(catalog.map(b => [b.id, b]));
  const legacy = associations.find(a => !a.subject);
  const explicit = associations.find(a => a.subject === subject);
  const legacyBooks = (legacy?.book_ids || []).map(id => byId.get(id)).filter(Boolean);
  const books = explicit
    ? (explicit.book_ids || []).map(id => byId.get(id)).filter(b => b && bookCurriculum(b) === subject)
    : legacyBooks.filter(b => bookCurriculum(b) === subject);
  const primary = bookCurriculum(legacyBooks[0]) || "df";
  const selected = questions.flatMap(q => {
    if (q.subject) return q.subject === subject ? [q] : [];
    const target = resolveQuestionTarget(q, legacyBooks);
    const targetBook = byId.get(q.book_id || target.bookId);
    const owner = bookCurriculum(targetBook) || primary;
    if (owner !== subject) return [];
    if (q.book_id || q.question_scope || q.mark?.book_id) return [q];
    if (target.kind !== "book" && target.kind !== "extra") return [q];
    return [{
      ...q,
      ...questionTargetFields(target, legacyBooks),
      mark: target.kind === "book" && q.mark?.shape ? { ...q.mark, book_id: target.bookId } : q.mark,
    }];
  }).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.page_number || 0) - (b.page_number || 0));
  return {
    questions: selected, books, lessonBooks: explicit || null,
    catalog: catalog.filter(b => bookCurriculum(b) === subject && (!module || b.module === module)),
  };
}
