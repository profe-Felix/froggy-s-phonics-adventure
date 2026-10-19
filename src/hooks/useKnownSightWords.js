import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { knownWordsForReader } from '@/lib/book/knownSightWords.mjs';

// A book's comprehension lesson is not the class's current DF position.
// Refresh the small class-position record, not all lessons or book pages.
export function useKnownSightWords(lessonKey, className) {
  const configQuery = useQuery({
    queryKey: ['book-highlight-class-position', className || null],
    enabled: !!className,
    queryFn: async () => {
      const response = await base44.entities.ClassConfig.filter({ class_name: className }, { limit: 1 });
      const rows = Array.isArray(response) ? response : response?.items;
      if (!Array.isArray(rows)) throw new Error('The class sight-word position could not be read.');
      return rows[0] || null;
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const data = useMemo(() => {
    // Do not flash an older book-based word list while class settings load.
    // During a failed refresh React Query retains the last successful setting.
    if (className && configQuery.data === undefined) return undefined;
    return knownWordsForReader(lessonKey, configQuery.data);
  }, [lessonKey, className, configQuery.data]);
  return { ...configQuery, data };
}
