import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import * as pdfjsLib from 'pdfjs-dist';
import { buildWordRecord, TIER_LABELS } from '@/lib/wordBankDifficulty';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

const TIER_COLORS = {
  1: 'bg-green-100 text-green-700',
  2: 'bg-amber-100 text-amber-700',
  3: 'bg-rose-100 text-rose-700',
};

// Common Spanish function/structure words to exclude from a phonics word bank.
const STOP_WORDS = new Set([
  'de','que','con','un','una','unos','unas','en','el','la','los','las','lo','le','les',
  'y','o','u','a','e','i','al','del','se','su','sus','por','para','es','son','va','fue',
  'mi','tu','te','me','ya','no','si','sí','más','pero','como','cuando','donde','qué',
  'quien','cual','esto','eso','aquí','allí','hay','ser','ver','dar','ir','muy','tan',
  'todo','otro','vez','hola','entonces','también','porque','sobre','tras','desde','hasta',
  'sin','sino','ni','poco','mucho','ese','esa','eso','esta','este','estos','estas',
  'sus','nuestra','nuestro','vuestra','vuestro','mía','mío','tuya','tuyo','suya','suyo',
]);

function isCandidate(w) {
  if (w.length < 2) return false;
  if (STOP_WORDS.has(w)) return false;
  if (!/[aeiouáéíóúü]/.test(w)) return false;
  if (!/^[a-zñüáéíóú]+$/.test(w)) return false;
  return true;
}

// Modal that scans selected BookCatalog PDFs (via pdfjs-dist getTextContent),
// extracts candidate words, and lets the teacher pick which to add to the
// WordBank. Image-only / scanned PDFs yield no text and are skipped silently.
export default function ImportFromBooks({ onClose }) {
  const qc = useQueryClient();
  const { data: books = [], isLoading } = useQuery({
    queryKey: ['book-catalog-for-import'],
    queryFn: () => base44.entities.BookCatalog.list('-updated_date', 300),
  });
  const { data: existing = [] } = useQuery({
    queryKey: ['word-bank'],
    queryFn: () => base44.entities.WordBank.list('-updated_date', 2000),
  });
  const existingSet = new Set(existing.map((w) => (w.word || '').toLowerCase()));
  const pdfBooks = books.filter((b) => b.book_type !== 'images' && b.pdf_url);

  const [selected, setSelected] = useState(new Set());
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [checked, setChecked] = useState(new Set());
  const [adding, setAdding] = useState(false);
  const [scanSummary, setScanSummary] = useState(null);

  const toggleBook = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllBooks = () => {
    setSelected(new Set(pdfBooks.filter((b) => !b.word_bank_imported).map((b) => b.id)));
  };

  const scan = async () => {
    setScanning(true);
    setProgress('Starting…');
    const toScan = pdfBooks.filter((b) => selected.has(b.id));
    const wordMap = new Map();
    let booksWithText = 0;
    let booksNoText = 0;
    for (let i = 0; i < toScan.length; i++) {
      const book = toScan[i];
      setProgress(`Scanning "${book.title}" (${i + 1}/${toScan.length})…`);
      try {
        const doc = await pdfjsLib.getDocument({ url: book.pdf_url, withCredentials: false }).promise;
        let bookWordCount = 0;
        for (let p = 1; p <= doc.numPages; p++) {
          const page = await doc.getPage(p);
          const content = await page.getTextContent();
          const text = content.items.map((it) => it.str).join(' ');
          const words = text.toLowerCase().match(/[a-zñüáéíóú]+/g) || [];
          for (const w of words) {
            if (!isCandidate(w)) continue;
            if (!wordMap.has(w)) wordMap.set(w, new Set());
            wordMap.get(w).add(book.title);
            bookWordCount++;
          }
        }
        if (bookWordCount > 0) booksWithText++;
        else booksNoText++;
      } catch {
        booksNoText++;
      }
    }
    const sorted = [...wordMap.keys()].sort((a, b) => a.localeCompare(b, 'es'));
    const built = sorted.map((w) => {
      const rec = buildWordRecord(w);
      return { ...rec, fromBooks: [...wordMap.get(w)] };
    });
    setCandidates(built);
    setChecked(new Set(built.filter((c) => !existingSet.has(c.word)).map((c) => c.word)));
    setScanSummary({ total: built.length, withText: booksWithText, noText: booksNoText });
    setScanning(false);
    setProgress('');
  };

  const toggleWord = (word) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(word)) next.delete(word);
      else next.add(word);
      return next;
    });
  };

  const addSelected = async () => {
    setAdding(true);
    try {
      const toCreate = candidates
        .filter((c) => checked.has(c.word) && !existingSet.has(c.word))
        .map((c) => ({
          word: c.word,
          syllables: c.syllables,
          difficulty: c.difficulty,
          active: true,
        }));
      if (toCreate.length) await base44.entities.WordBank.bulkCreate(toCreate);
      // Mark the scanned books as imported so they show a badge next time.
      const scannedIds = pdfBooks.filter((b) => selected.has(b.id)).map((b) => b.id);
      if (scannedIds.length) {
        await base44.entities.BookCatalog.bulkUpdate(
          scannedIds.map((id) => ({ id, word_bank_imported: true }))
        );
        qc.invalidateQueries({ queryKey: ['book-catalog-for-import'] });
      }
      qc.invalidateQueries({ queryKey: ['word-bank'] });
      onClose?.();
    } finally {
      setAdding(false);
    }
  };

  const newCount = [...checked].filter((w) => !existingSet.has(w)).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <h2 className="text-lg font-bold text-slate-800">📥 Import words from books</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {candidates.length === 0 ? (
            <>
              <p className="text-sm text-slate-500 mb-3">
                Select books to scan. Text is extracted from each PDF page and filtered to candidate words.
                <span className="text-amber-600"> Image-only (scanned) PDFs have no extractable text and are skipped.</span>
              </p>
              {isLoading ? (
                <p className="text-slate-400">Loading books…</p>
              ) : pdfBooks.length === 0 ? (
                <p className="text-slate-400">No PDF books found in the catalog.</p>
              ) : (
                <>
                  <button onClick={selectAllBooks} className="text-xs font-bold text-indigo-600 hover:underline mb-2">
                    Select all {pdfBooks.filter((b) => !b.word_bank_imported).length} not-yet-imported books
                  </button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {pdfBooks.map((b) => {
                      const imported = b.word_bank_imported;
                      return (
                        <label key={b.id} className={`flex items-center gap-2 p-2 rounded-lg border hover:bg-slate-50 cursor-pointer ${imported ? 'bg-green-50/60' : ''}`}>
                          <input
                            type="checkbox"
                            checked={selected.has(b.id)}
                            onChange={() => toggleBook(b.id)}
                            className="shrink-0"
                          />
                          <span className="text-sm font-medium text-slate-700 truncate flex-1">{b.title}</span>
                          {imported && <span className="text-[10px] font-bold text-green-600 shrink-0">✓ imported</span>}
                          <span className="text-xs text-slate-400 shrink-0">{b.pdf_page_count || '?'}p</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
              {scanning && <p className="text-sm text-indigo-600 animate-pulse mt-3">{progress}</p>}
            </>
          ) : (
            <>
              {scanSummary && (
                <p className="text-xs text-slate-500 mb-2">
                  Scanned {scanSummary.withText + scanSummary.noText} books · {scanSummary.withText} had text · {scanSummary.noText} image-only · {candidates.length} unique candidate words
                </p>
              )}
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-slate-700">{candidates.length} candidate words</p>
                <div className="flex gap-3">
                  <button onClick={() => setChecked(new Set(candidates.filter((c) => !existingSet.has(c.word)).map((c) => c.word)))} className="text-xs text-indigo-600 font-bold hover:underline">Select all new</button>
                  <button onClick={() => setChecked(new Set())} className="text-xs text-slate-500 font-bold hover:underline">Clear</button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {candidates.map((c) => {
                  const inBank = existingSet.has(c.word);
                  return (
                    <label
                      key={c.word}
                      className={`flex items-center gap-2 p-1.5 rounded-lg border text-sm ${inBank ? 'opacity-50 bg-slate-50' : 'hover:bg-slate-50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked.has(c.word)}
                        onChange={() => toggleWord(c.word)}
                        disabled={inBank}
                        className="shrink-0"
                      />
                      <span className="font-bold text-slate-700">{c.word}</span>
                      <span className="text-xs text-slate-400 font-mono">{c.syllables.join('·')}</span>
                      <span className={`text-[10px] font-bold px-1 rounded ${TIER_COLORS[c.difficulty]}`}>T{c.difficulty}</span>
                      {inBank && <span className="text-[10px] text-green-600 font-bold ml-auto">✓ in bank</span>}
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t shrink-0">
          <p className="text-xs text-slate-400">
            {candidates.length > 0 ? `${newCount} new words selected` : `${selected.size} books selected`}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            {candidates.length === 0 ? (
              <button
                onClick={scan}
                disabled={scanning || selected.size === 0}
                className="px-4 py-2 text-sm font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40"
              >
                {scanning ? 'Scanning…' : `Scan ${selected.size} ${selected.size === 1 ? 'book' : 'books'}`}
              </button>
            ) : (
              <button
                onClick={addSelected}
                disabled={adding || newCount === 0}
                className="px-4 py-2 text-sm font-bold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40"
              >
                {adding ? 'Adding…' : `Add ${newCount} words`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}