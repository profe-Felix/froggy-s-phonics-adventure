import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { loadBookCatalog } from '@/lib/book/catalog';
import { decodableBookPool } from '@/lib/literacy/pathwayCurriculum.mjs';

export default function useBookVocabulary(config = {}) {
  const enabled = !!config.bookVocabulary;
  const books = useQuery({ queryKey: ['curriculum-book-catalog'], queryFn: loadBookCatalog,
    enabled, staleTime: 30000, refetchInterval: enabled ? 60000 : false });
  const index = useQuery({ queryKey: ['curriculum-book-index'],
    queryFn: () => base44.entities.BookPracticeIndex.list('-scanned_at', 1000),
    enabled, staleTime: 30000, refetchInterval: enabled ? 60000 : false });
  const p = config.curriculumPosition;
  const preset = useMemo(() => {
    if (!enabled || !p) return null;
    const position = { moduleNumber: Number(p.module_number), lessonNumber: Number(p.curriculum_lesson_end || p.curriculum_lesson_number) };
    const content = config.vocabularyOverride === true ? (config.vocabularyItems || []) :
      decodableBookPool(index.data || [], position, { books: books.data || [], kind: config.bookVocabulary });
    return { id: `books_${position.moduleNumber}_${position.lessonNumber}_${config.bookVocabulary}`,
      title: `M${position.moduleNumber}.L${position.lessonNumber} · ${config.bookVocabulary === 'words' ? 'Palabras' : 'Sílabas'}`,
      rows: 5, cols: 6, sweep_ms: 800, content };
  }, [config, books.data, index.data]);
  return { preset, loading: enabled && (books.isLoading || index.isLoading),
    error: enabled && (books.error || index.error),
    retry: () => { books.refetch(); index.refetch(); } };
}
