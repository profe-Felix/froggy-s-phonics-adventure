import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Questions planned in Book Comprehension for any lesson that uses this catalog book.
// Returns { items, lessonKey } where lessonKey is the first lesson key found
// (used for sight-word highlighting via useKnownSightWords).
export default function useBookQuestions(catalogBookId) {
  const { data = { items: [], lessonKey: null } } = useQuery({
    queryKey: ['book-reader-questions', catalogBookId],
    enabled: !!catalogBookId,
    queryFn: async () => {
      const links = await base44.entities.LessonBooks.filter({ book_ids: catalogBookId }, { limit: 50 });
      const keys = links.items.map(l => l.lesson_key);
      if (keys.length === 0) return { items: [], lessonKey: null };
      const res = await base44.entities.BookComprehensionQuestion.filter(
        { lesson_key: { $in: keys }, page_number: { $gt: 0 } },
        { sort: 'page_number', limit: 200 }
      );
      const items = res.items.sort(
        (a, b) => (a.page_number || 0) - (b.page_number || 0) || (a.order || 0) - (b.order || 0)
      );
      return { items, lessonKey: keys[0] };
    },
  });
  return data;
}