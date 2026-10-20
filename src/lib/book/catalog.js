import { base44 } from '@/api/base44Client';
import { entityItems } from './curriculum.mjs';
import { enrichBookCatalog } from './lessonTags.mjs';

export async function loadBookCatalog() {
  const [catalog, assignments] = await Promise.all([
    base44.entities.BookCatalog.list({ sort: 'title', limit: 1000 }),
    base44.entities.BookAssignment.list(undefined, 1000, undefined,
      ['id', 'catalog_book_id', 'subject', 'module', 'lesson', 'lessons']),
  ]);
  return enrichBookCatalog(entityItems(catalog), entityItems(assignments));
}
