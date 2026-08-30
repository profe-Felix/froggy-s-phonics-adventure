import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Volume2, Loader2, Check, Wand2, X } from 'lucide-react';

// Generates TTS audio for a list of words and stores it permanently in the
// Supabase audio bucket via the generateTts backend function. The backend
// checks the bucket first — words that already have audio are skipped
// instantly, and new words are generated once and reused forever.
export default function TtsWordGenerator({ words, lang = 'es' }) {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState({});
  const [done, setDone] = useState(false);

  const wordList = (words || '')
    .split(/[,\n]/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);

  const generate = async () => {
    if (!wordList.length) return;
    setGenerating(true);
    setDone(false);
    setResults({});
    for (let i = 0; i < wordList.length; i++) {
      const word = wordList[i];
      setProgress({ current: i + 1, total: wordList.length, word });
      try {
        const res = await base44.functions.invoke('generateTts', { text: word, lang });
        const url = res.data?.url;
        setResults((prev) => ({ ...prev, [word]: { url, ok: !!url } }));
      } catch (e) {
        setResults((prev) => ({ ...prev, [word]: { ok: false, error: e?.message } }));
      }
    }
    setProgress(null);
    setGenerating(false);
    setDone(true);
  };

  const preview = (word) => {
    const r = results[word];
    if (r?.url) { try { new Audio(r.url).play().catch(() => {}); } catch {} }
  };

  const okCount = Object.values(results).filter((r) => r.ok).length;
  const failCount = Object.values(results).filter((r) => !r.ok).length;

  if (!wordList.length) return null;

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-2.5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Wand2 className="w-4 h-4 text-indigo-500" />
        <span className="text-xs font-bold text-gray-700">Generate audio (text-to-speech)</span>
        {done && (
          <span className={`text-xs font-bold ml-auto ${failCount ? 'text-amber-600' : 'text-green-600'}`}>
            {failCount ? `⚠ ${okCount}/${wordList.length} ok` : `✓ ${okCount} ready`}
          </span>
        )}
      </div>
      <p className="text-[11px] text-gray-500 leading-tight">
        Generates spoken audio for {wordList.length} word{wordList.length !== 1 ? 's' : ''} using Google Cloud TTS ({lang === 'en' ? 'English' : 'Spanish'}).
        Stored permanently — reused on every future play without regenerating.
      </p>
      {progress && (
        <div className="text-xs text-gray-600 flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          {progress.current}/{progress.total}: "{progress.word}"
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={generate}
          disabled={generating}
          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1"
        >
          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
          {generating ? 'Generating…' : 'Generate audio'}
        </button>
        {done && okCount > 0 && (
          <button
            onClick={() => wordList.forEach((w) => results[w]?.ok && preview(w))}
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 inline-flex items-center gap-1"
          >
            <Volume2 className="w-3 h-3" /> Preview all
          </button>
        )}
      </div>
      {done && (
        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
          {wordList.map((w) => {
            const r = results[w];
            return (
              <button
                key={w}
                onClick={() => r?.ok && preview(w)}
                className={`text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                  r?.ok
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {r?.ok ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />} {w}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}