import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { loadBookCatalog } from '@/lib/book/catalog';
import { readFluencyBook } from '@/lib/book/fluencyText';
import { indexVocabulary, sourceSignature } from '@/lib/literacy/pathwayCurriculum.mjs';

// Only mounted on teacher surfaces. Students read the shared prepared index.
let running = null;
async function scanLibrary(cache, report, force) {
  const books = await loadBookCatalog();
  const rows = await base44.entities.BookPracticeIndex.list('-scanned_at', 1000);
  if (rows.length >= 1000) throw Error('The index is too large for a complete scan.');
  const indexed = new Map();
  for (const row of rows) if (!indexed.has(row.book_id)) indexed.set(row.book_id, row);
  const warnings = [];
  let scanned = 0;
  for (const book of books.filter(b => !b.language || ['es', 'bilingual'].includes(b.language))) {
    const prior = indexed.get(book.id);
    if (!force && prior?.source_signature === sourceSignature(book)) {
      if (prior.warning) warnings.push(`${book.title}: ${prior.warning}`);
      continue;
    }
    report({ busy: true, scanned, title: book.title, warnings });
    const result = await readFluencyBook(book);
    const saved = await base44.functions.invoke('scanBookVocabulary', {
      action: 'save_index', book_id: book.id, source_signature: sourceSignature(book),
      entries: indexVocabulary(result.words), warning: result.warning || '',
      expected_index_id: prior?.id || '', expected_index_updated_at: prior?.updated_date || '' });
    if (saved.data?.ok !== true) throw Error('The vocabulary save was not confirmed.');
    if (result.warning) warnings.push(result.warning);
    scanned++;
  }
  // Add newly introduced DF readers without regenerating any teacher-edited steps.
  const linked = await base44.functions.invoke('scanBookVocabulary', { action: 'sync_readers' });
  if (linked.data?.ok !== true) throw Error('Reader links were not confirmed.');
  if (linked.data.deferred) warnings.push('Recently edited reader links were left unchanged; the next scan will retry them.');
  await Promise.all(['curriculum-book-index', 'curriculum-book-catalog', 'all-lessons', 'lessons']
    .map(key => cache.invalidateQueries({ queryKey: [key] })));
  return { busy: false, scanned, title: '', warnings, error: '' };
}
export default function useBookIndexScanner() {
  const cache = useQueryClient(), alive = useRef(true);
  const [state, setState] = useState({ busy: false, scanned: 0, warnings: [], error: '', title: '' });
  const scan = async (force = false) => {
    setState(s => ({ ...s, busy: true, error: '' }));
    try {
      if (!running) running = scanLibrary(cache, s => { if (alive.current) setState(s); }, force).finally(() => { running = null; });
      const result = await running;
      if (alive.current) setState(result);
    } catch { if (alive.current) setState(s => ({ ...s, busy: false, error: 'Some books could not be indexed. Saved vocabulary and your lesson edits are unchanged. Retry the scan.' })); }
  };
  useEffect(() => {
    alive.current = true;
    void scan();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void scan(); }, 300000);
    return () => { alive.current = false; clearInterval(timer); };
  }, []);
  return { ...state, scan };
}
