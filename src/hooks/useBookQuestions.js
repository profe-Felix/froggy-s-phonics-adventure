import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { resolveQuestionTarget } from '@/lib/book/comprehension.mjs';

// Questions planned in Book Comprehension for any lesson that uses this catalog book.
// Returns { items, lessonKeys, lessonKey } where:
//   items      = all questions across every lesson that uses this book (page_number > 0)
//   lessonKeys = every lesson key found (e.g. ['M2.L16', 'M2.L17']) so callers can
//                build a lesson selector dropdown
//   lessonKey  = first lesson key found (backward compat)
export default function useBookQuestions(catalogBookId) {
  const { data = { items: [], lessonKeys: [], lessonKey: null, booksByLesson: {} } } = useQuery({
    queryKey: ['book-reader-questions-v2', catalogBookId],
    enabled: !!catalogBookId,
    queryFn: async () => {
      const links = await base44.entities.LessonBooks.filter({ book_ids: catalogBookId }, { limit: 50 });
      const keys = [...new Set(links.items.map(l => l.lesson_key))];
      if (keys.length === 0) return { items: [], lessonKeys: [], lessonKey: null, booksByLesson: {} };
      const ids = [...new Set(links.items.flatMap(link => link.book_ids || []))];
      const catalog = await Promise.all(ids.map(id => base44.entities.BookCatalog.get(id)));
      const booksByLesson = Object.fromEntries(links.items.map(link => [
        link.lesson_key, (link.book_ids || []).map(id => catalog.find(book => book.id === id)).filter(Boolean),
      ]));
      const res = await base44.entities.BookComprehensionQuestion.filter(
        { lesson_key: { $in: keys } },
        { sort: 'page_number', limit: 200 }
      );
      const items = res.items.flatMap(q => {
        const target = resolveQuestionTarget(q, booksByLesson[q.lesson_key] || []);
        return target.kind === 'book' && target.bookId === catalogBookId
          ? [{ ...q, page_number: target.pageNumber }]
          : [];
      }).sort(
        (a, b) => (a.page_number || 0) - (b.page_number || 0) || (a.order || 0) - (b.order || 0)
      );
      return { items, lessonKeys: keys, lessonKey: keys[0], booksByLesson };
    },
  });
  return data;
}