import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { loadBookCatalog } from '@/lib/book/catalog';
import { buildVocabularyReviewItems, loadVocabularyReviews, reviewDecisions,
  vocabularyKey, vocabularyReviewPayload } from '@/lib/literacy/vocabularyReview.mjs';

export const VOCABULARY_REVIEW_QUERY = ['curriculum-vocabulary-reviews'];
export function useVocabularyReviewData(enabled = true) {
  return useQuery({ queryKey: VOCABULARY_REVIEW_QUERY, queryFn: () => loadVocabularyReviews(base44),
    enabled, staleTime: 10000, refetchInterval: enabled ? 60000 : false });
}
export default function useVocabularyReview() {
  const cache = useQueryClient(), locked = useRef(false);
  const [saving, setSaving] = useState(false), [progress, setProgress] = useState(null);
  const reviews = useVocabularyReviewData();
  const books = useQuery({ queryKey: ['curriculum-book-catalog'], queryFn: loadBookCatalog, staleTime: 30000 });
  const index = useQuery({ queryKey: ['curriculum-book-index'],
    queryFn: () => base44.entities.BookPracticeIndex.list('-scanned_at', 1000), staleTime: 30000 });
  const lists = useMemo(() => buildVocabularyReviewItems(index.data || [], books.data || [], reviews.data || []),
    [index.data, books.data, reviews.data]);
  const summary = useMemo(() => Object.fromEntries(['words', 'syllables'].map(kind => [kind, {
    total: lists[kind].length, ...Object.fromEntries(['pending', 'approved', 'excluded']
      .map(status => [status, lists[kind].filter(item => item.status === status).length]))
  }])), [lists]);
  const approvedOnly = reviewDecisions(reviews.data || []).get(vocabularyKey('settings', 'bank'))?.approved_only === true;
  const refresh = () => Promise.all([reviews.refetch(), books.refetch(), index.refetch()]);
  const write = async payload => {
    const prior = reviewDecisions(cache.getQueryData(VOCABULARY_REVIEW_QUERY) || reviews.data || [])
      .get(vocabularyKey(payload.kind, payload.text));
    const result = prior?.id ? await base44.entities.BookVocabularyReview.update(prior.id, payload)
      : await base44.entities.BookVocabularyReview.create(payload);
    if (!result?.id) throw Error('The review was not confirmed. Refresh the bank before retrying.');
    const record = { ...payload, ...result };
    cache.setQueryData(VOCABULARY_REVIEW_QUERY, old => [record, ...(old || []).filter(row => row.id !== record.id)]);
  };
  const run = async action => {
    if (locked.current) throw Error('Wait for the current review save to finish.');
    if (reviews.isLoading || reviews.error) throw Error('Reload the vocabulary reviews before saving.');
    locked.current = true; setSaving(true);
    try { return await action(); }
    finally {
      locked.current = false; setSaving(false); setProgress(null);
      void cache.invalidateQueries({ queryKey: VOCABULARY_REVIEW_QUERY });
    }
  };
  const save = (item, changes) => run(() => write(vocabularyReviewPayload(item, changes)));
  const saveMany = (items, status) => run(async () => {
    if (!Array.isArray(items) || items.length > 100) throw Error('Review up to 100 items at a time.');
    // Validate the entire batch before writing any of it.
    const payloads = items.map(item => vocabularyReviewPayload(item, { status }));
    let completed = 0; setProgress({ completed, total: items.length });
    try {
      for (const payload of payloads) { await write(payload); completed++;
        setProgress({ completed, total: items.length }); }
    } catch (error) { throw Error(`Saved ${completed} of ${items.length} reviews. The rest were not saved. ${error.message}`); }
    return completed;
  });
  const setApprovedOnly = value => run(() => write({ kind: 'settings', text: 'bank',
    status: 'approved', approved_only: value === true }));
  return { ...lists, summary, approvedOnly, saving, progress, save, saveMany, setApprovedOnly, refresh,
    loading: reviews.isLoading || books.isLoading || index.isLoading,
    error: (!reviews.data && reviews.error) || (!books.data && books.error) || (!index.data && index.error),
    refreshError: reviews.error || books.error || index.error };
}
