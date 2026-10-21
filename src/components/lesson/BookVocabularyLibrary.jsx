import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import useBookIndexScanner from '@/hooks/useBookIndexScanner';

export default function BookVocabularyLibrary() {
  const status = useBookIndexScanner();
  const [search, setSearch] = useState('');
  const index = useQuery({ queryKey: ['curriculum-book-index'],
    queryFn: () => base44.entities.BookPracticeIndex.list('-scanned_at', 1000), staleTime: 30000 });
  const entries = [...new Map((index.data || []).flatMap(r => r.entries || []).map(e => [e.word, e])).values()];
  const syllables = new Set(entries.flatMap(e => e.syllables || []));
  return <details className="mb-4 rounded-2xl border border-indigo-100 bg-white p-4">
    <summary className="cursor-pointer font-bold text-indigo-800">Book word and syllable bank · {entries.length} words · {syllables.size} syllables</summary>
    <div className="mt-3 space-y-3 text-sm">
      <p>DF, LV and library books are indexed here. Daily activities filter words and individual syllables by the phonics introduced that day. Manual daily lists are never replaced.</p>
      <button disabled={status.busy} onClick={() => status.scan(true)} className="rounded-lg bg-indigo-600 px-3 py-2 font-bold text-white disabled:opacity-50">{status.busy ? `Scanning ${status.title || 'library'}…` : 'Rescan books'}</button>
      {status.error && <p role="alert" className="text-red-700">{status.error}</p>}
      {!!status.warnings?.length && <details><summary className="text-amber-800">{status.warnings.length} books need text or review</summary><ul className="max-h-40 overflow-auto">{status.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a word or syllable, e.g. sil" className="w-full rounded-lg border p-2" />
      <div className="flex max-h-48 flex-wrap gap-2 overflow-auto">{entries.filter(e => !search || e.word.includes(search)).slice(0, 120).map(e =>
        <span key={e.word} className="rounded-lg bg-indigo-50 px-2 py-1" title={e.word}>{(e.syllables || []).join(' · ')}</span>)}</div>
    </div>
  </details>;
}
