import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { resolveQuestionTarget } from '@/lib/book/comprehension.mjs';
import { entityItems, selectComprehension, bookCurriculum } from '@/lib/book/curriculum.mjs';
import { enrichBookCatalog, bookLessonKeys } from '@/lib/book/lessonTags.mjs';

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
      const links = entityItems(await base44.entities.LessonBooks.filter({ book_ids: catalogBookId }, { limit: 100 }));
      const ids = [...new Set([catalogBookId, ...links.flatMap(link => link.book_ids || [])])];
      const [rawCatalog, assignments] = await Promise.all([
        Promise.all(ids.map(id => base44.entities.BookCatalog.get(id))),
        base44.entities.BookAssignment.filter({ catalog_book_id: { $in: ids } }, undefined, 1000, undefined,
          ['id', 'catalog_book_id', 'subject', 'module', 'lesson', 'lessons']),
      ]);
      const catalog = enrichBookCatalog(rawCatalog, entityItems(assignments));
      const currentBook = catalog.find(b => b.id === catalogBookId);
      const keys = [...new Set([...links.map(l => l.lesson_key), ...bookLessonKeys(currentBook)])];
      if (keys.length === 0) return { items: [], lessonKeys: [], lessonKey: null, booksByLesson: {} };
      const res = await base44.entities.BookComprehensionQuestion.filter(
        { lesson_key: { $in: keys } },
        { sort: 'page_number', limit: 200 }
      );
      const subject = bookCurriculum(currentBook);
      const booksByLesson = {};
      const items = keys.flatMap(key => {
        const selection = selectComprehension({
          subject, associations: links.filter(l => l.lesson_key === key),
          questions: entityItems(res).filter(q => q.lesson_key === key), catalog,
        });
        booksByLesson[key] = links.some(l => l.lesson_key === key) ? selection.books : [currentBook];
        return selection.questions.flatMap(q => {
          const target = resolveQuestionTarget(q, selection.books);
          return target.kind === 'book' && target.bookId === catalogBookId
            ? [{ ...q, page_number: target.pageNumber }] : [];
        });
      }).sort(
        (a, b) => (a.page_number || 0) - (b.page_number || 0) || (a.order || 0) - (b.order || 0)
      );
      return { items, lessonKeys: keys, lessonKey: keys[0], booksByLesson };
    },
  });
  return data;
}