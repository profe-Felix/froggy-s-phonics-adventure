import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function useBookPagePairing(book) {
  const qc = useQueryClient();
  const bookKey = book.catalog_book_id ? `catalog:${book.catalog_book_id}` : `assignment:${book.id}`;
  const queryKey = ['book-page-pairing', bookKey];
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const page = await base44.entities.BookPagePairing.filter({ book_key: bookKey }, {
        sort: '-created_date', limit: 1, fields: ['book_key', 'first_pair_page'],
      });
      return page.items[0] || null;
    },
  });
  const mutation = useMutation({
    mutationFn: (firstPair) => {
      const data = { book_key: bookKey, first_pair_page: firstPair };
      return query.data
        ? base44.entities.BookPagePairing.update(query.data.id, data)
        : base44.entities.BookPagePairing.create(data);
    },
    onSuccess: (record) => qc.setQueryData(queryKey, record),
  });
  return {
    firstPair: query.data?.first_pair_page || 1,
    save: mutation.mutate,
    isLoading: query.isPending,
    isSaving: mutation.isPending,
    error: query.error || mutation.error,
  };
}