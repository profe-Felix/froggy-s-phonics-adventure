import { useEffect, useRef, useState } from 'react';
import { createVocabularyContextReader } from '@/lib/book/vocabularyContextReader';

const empty = { hits: [], index: 0, loading: false, error: '', progress: '', hasMore: true };

export default function useVocabularyContext(item, catalog) {
  const [state, setState] = useState(empty);
  const session = useRef(null);
  const loadNext = async current => {
    if (!current || current.busy || !current.alive) return;
    current.busy = true;
    setState(previous => ({ ...previous, loading: true, error: '' }));
    try {
      const result = await current.reader.next();
      if (!current.alive) return;
      setState(previous => result.done
        ? { ...previous, loading: false, hasMore: false, progress: '' }
        : { ...previous, hits: [...previous.hits, result.value], index: previous.hits.length, loading: false, progress: '' });
    } catch (error) {
      if (current.alive) setState(previous => ({ ...previous, loading: false,
        error: error.message || 'The book page could not open. Try again.' }));
    } finally { current.busy = false; }
  };
  useEffect(() => {
    setState(empty);
    if (!item) return;
    const current = { alive: true, busy: false };
    current.reader = createVocabularyContextReader(item, catalog, progress => {
      if (current.alive) setState(previous => ({ ...previous, progress }));
    });
    session.current = current;
    void loadNext(current);
    return () => {
      current.alive = false;
      current.reader.dispose();
      if (session.current === current) session.current = null;
    };
    // Keep the open preview's source snapshot and position when background
    // catalog/scanner queries refresh. Reopening takes a fresh snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);
  return {
    ...state, hit: state.hits[state.index] || null, totalLoaded: state.hits.length,
    onNext: () => {
      if (state.index < state.hits.length - 1) setState(previous => ({ ...previous, index: previous.index + 1, error: '' }));
      else if (state.hasMore) void loadNext(session.current);
    },
    onPrevious: () => setState(previous => ({ ...previous, index: Math.max(0, previous.index - 1), error: '' })),
    onRetry: () => loadNext(session.current),
  };
}
