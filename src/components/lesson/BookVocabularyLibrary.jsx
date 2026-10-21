import useBookIndexScanner from '@/hooks/useBookIndexScanner';
import { useEffect, useRef } from 'react';
import VocabularyReviewPanel from './VocabularyReviewPanel';

export default function BookVocabularyLibrary() {
  const status = useBookIndexScanner();
  const panel = useRef(null);
  useEffect(() => {
    const reveal = () => {
      if (window.location.hash === '#book-vocabulary-bank' && panel.current) {
        panel.current.open = true;
        panel.current.scrollIntoView({ block: 'start' });
      }
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, []);
  return <details id="book-vocabulary-bank" ref={panel} className="mb-4 rounded-2xl border border-indigo-100 bg-white p-4" style={{ fontFamily: "var(--font-kinder, 'Andika'), 'Andika', sans-serif" }}>
    <summary className="cursor-pointer font-bold text-indigo-800">Book word and syllable bank <span className="ml-2 inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-xs">Edit lists</span></summary>
    <div className="mt-3 space-y-3 text-sm">
      <p>DF, LV and library books are indexed here. Daily activities filter words and individual syllables by the phonics introduced that day. Manual daily lists are never replaced.</p>
      <p className="rounded-lg bg-indigo-50 p-2 font-bold text-indigo-900">Choose Words or Syllables below, search for an item, then use Correct or Exclude. Saved corrections survive rescanning and apply when you open a fresh practice activity.</p>
      <button disabled={status.busy} onClick={() => status.scan(true)} className="rounded-lg bg-indigo-600 px-3 py-2 font-bold text-white disabled:opacity-50">{status.busy ? `Scanning ${status.title || 'library'}…` : 'Rescan books'}</button>
      {status.error && <p role="alert" className="text-red-700">{status.error}</p>}
      {!!status.warnings?.length && <details><summary className="text-amber-800">{status.warnings.length} books need text or review</summary><ul className="max-h-40 overflow-auto">{status.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
      <VocabularyReviewPanel />
    </div>
  </details>;
}
