export function bookLessonTags(book) {
  const values = Array.isArray(book?.lessons) && book.lessons.length
    ? book.lessons : book?.lesson ? [book.lesson] : [];
  return [...new Set(values.filter(v => /^L(?:[1-9]|1\d|20)$/.test(v)))]
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
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
export function sourceSignature(book) {
  return JSON.stringify([book.id, book.updated_date, book.pdf_url, book.subject, book.module, book.lessons, book.lesson,
    (book.pages || []).map(p => [p.page_number, p.html_url, p.text, p.page_text, p.words])]);
}
