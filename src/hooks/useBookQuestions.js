import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Questions planned in Book Comprehension for any lesson that uses this catalog book.
export default function useBookQuestions(catalogBookId) {
  const { data = [] } = useQuery({
    queryKey: ['book-reader-questions', catalogBookId],
    enabled: !!catalogBookId,
    queryFn: async () => {
      const links = await base44.entities.LessonBooks.filter({ book_ids: catalogBookId }, { limit: 50 });
      const keys = links.items.map(l => l.lesson_key);
      if (keys.length === 0) return [];
      const res = await base44.entities.BookComprehensionQuestion.filter(
        { lesson_key: { $in: keys }, page_number: { $gt: 0 } },
        { sort: 'page_number', limit: 200 }
      );
      return res.items.sort(
        (a, b) => (a.page_number || 0) - (b.page_number || 0) || (a.order || 0) - (b.order || 0)
      );
    },
  });
  return data;
}