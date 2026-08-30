import { useState } from 'react';
import { listAllImagesJpg } from '@/lib/lettersort/storage';
import { normalizeMarkers } from '@/lib/lettersort/phonics';
import { Sparkles, Loader2, Plus, X } from 'lucide-react';

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'á', 'é', 'í', 'ó', 'ú', 'ü']);

// Scans the Letter Sort image bucket and lists words whose initial OR final
// letter is a vowel (a, e, i, o, u) — the targets for a Missing Letter preset.
// The teacher clicks a word to add it as an item (image auto-resolves from the
// bucket, no upload needed). Words already in the preset are hidden.
export default function BucketWordSuggestions({ bucket, existingWords, onAdd }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');

  const load = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    setLoading(true);
    setErr('');
    try {
      const all = await listAllImagesJpg({ bucket });
      const seen = new Set();
      const out = [];
      for (const f of all) {
        const word = normalizeMarkers(f.core || f.rawCore || '');
        if (!word || word.length < 2) continue;
        if (seen.has(word)) continue;
        seen.add(word);
        const first = word[0];
        const last = word[word.length - 1];
        const iniV = VOWELS.has(first);
        const finV = VOWELS.has(last);
        if (!iniV && !finV) continue;
        out.push({ word, url: f.url, iniV, finV });
      }
      out.sort((a, b) => a.word.localeCompare(b.word, 'es'));
      setRows(out);
    } catch (e) {
      setErr(e?.message || 'Could not read the image bucket.');
    } finally {
      setLoading(false);
    }
  };

  const add = (word, position) => {
    onAdd(word, position);
  };

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-2 flex flex-col gap-2">
      <button
        onClick={load}
        className="text-xs font-bold text-indigo-600 hover:underline inline-flex items-center gap-1 self-start"
      >
        {open ? <X className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
        {open ? 'Hide suggestions' : 'Suggest words from image bucket'}
      </button>

      {open && (
        <div className="flex flex-col gap-1.5">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Scanning the Letter Sort image bucket…
            </div>
          )}
          {err && <p className="text-xs text-red-500">{err}</p>}
          {!loading && !err && rows.length === 0 && (
            <p className="text-xs text-gray-400 py-1">No words with a vowel initial or final letter found in the bucket.</p>
          )}
          {!loading && rows.length > 0 && (
            <>
              <p className="text-[10px] text-gray-500">
                {rows.length} word{rows.length !== 1 ? 's' : ''} with an initial or final vowel. Click <b>+ I</b> (initial) or <b>+ F</b> (final) to add.
              </p>
              <div className="flex flex-col gap-1 max-h-56 overflow-y-auto pr-1">
                {rows.map((r) => {
                  const taken = existingWords.has(r.word);
                  return (
                    <div key={r.word} className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${taken ? 'border-gray-200 bg-gray-50 opacity-50' : 'border-gray-200 bg-white'}`}>
                      <img src={r.url} alt={r.word} className="w-9 h-9 object-cover rounded-md flex-shrink-0" />
                      <span className="flex-1 text-sm font-semibold text-gray-700 lowercase">{r.word}</span>
                      {taken ? (
                        <span className="text-[10px] text-gray-400 font-bold">added</span>
                      ) : (
                        <div className="flex gap-1">
                          {r.iniV && (
                            <button onClick={() => add(r.word, 'initial')} title="Add as initial (first letter missing)"
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-500 text-white hover:bg-indigo-600">+ I</button>
                          )}
                          {r.finV && (
                            <button onClick={() => add(r.word, 'final')} title="Add as final (last letter missing)"
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 text-white hover:bg-emerald-600">+ F</button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}