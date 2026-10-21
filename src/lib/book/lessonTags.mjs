// Missing catalog metadata can be recovered from a linked assignment, never
// guessed from a title, lesson number, or curriculum default.
import { bookLessonTags } from '../../../base44/shared/bookMetadata.mjs';
export { bookLessonTags, enrichBookCatalog } from '../../../base44/shared/bookMetadata.mjs';

export function bookLessonKeys(book) {
  return /^M[1-9]$/.test(book?.module || '')
    ? bookLessonTags(book).map(lesson => `${book.module}.${lesson}`) : [];
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
