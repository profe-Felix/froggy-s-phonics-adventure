// Missing catalog metadata can be recovered from a linked assignment, never
// guessed from a title, lesson number, or curriculum default.
export function bookLessonTags(book) {
  const values = Array.isArray(book?.lessons) && book.lessons.length
    ? book.lessons : book?.lesson ? [book.lesson] : [];
  return [...new Set(values.filter(v => /^L(?:[1-9]|1\d|20)$/.test(v)))]
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

export function bookLessonKeys(book) {
  return /^M[1-9]$/.test(book?.module || '')
    ? bookLessonTags(book).map(lesson => `${book.module}.${lesson}`) : [];
}

export function enrichBookCatalog(catalog, assignments) {
  return catalog.map(book => {
    const matches = assignments.filter(a => a.catalog_book_id === book.id);
    const source = matches.find(a => a.id === book.source_assignment_id);
    const candidates = source ? [source] : matches;
    const result = { ...book };
    for (const field of ['subject', 'module']) {
      const values = [...new Set(candidates.map(a => a[field]).filter(Boolean))];
      if (result[field] == null && values.length === 1) result[field] = values[0];
    }
    if (!Array.isArray(book.lessons) && !book.lesson) {
      const tagSets = [...new Set(candidates.map(a => JSON.stringify(bookLessonTags(a))).filter(v => v !== '[]'))];
      if (tagSets.length === 1) result.lessons = JSON.parse(tagSets[0]);
    }
    return result;
  });
}

export function lessonTagUpdate(lessons) {
  const normalized = bookLessonTags({ lessons });
  return { lessons: normalized, lesson: normalized[0] || '' };
}

export async function updateBookMetadata(api, book, data) {
  // The bookshelf edits assignments; comprehension reads permanent catalog
  // records. Keep shared metadata in sync instead of letting the two diverge.
  const metadata = Object.fromEntries(
    Object.entries(data).filter(([key]) => ['subject', 'module', 'lesson', 'lessons'].includes(key))
  );
  if (book.catalog_book_id && Object.keys(metadata).length) {
    await api.BookCatalog.update(book.catalog_book_id, metadata);
  }
  return api.BookAssignment.update(book.id, data);
}
