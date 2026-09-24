import { useState } from 'react';
import { base44 } from '@/api/base44Client';

// Batch-generates TTS audio for every unique syllable and word in the WordBank.
// The generateTts backend function checks the Supabase audio bucket first, so
// already-generated audio returns instantly — only missing audio is generated.
// Run this once after adding new words so students never wait for audio to load.
export default function GenerateAudioButton({ words }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [finished, setFinished] = useState(false);

  const generate = async () => {
    // Collect all unique syllables + words
    const sylSet = new Set();
    const wordSet = new Set();
    (words || []).forEach((w) => {
      if (w.word) wordSet.add(w.word.toLowerCase());
      (w.syllables || []).forEach((s) => sylSet.add(s));
    });
    const items = [...sylSet, ...wordSet];
    if (!items.length) return;

    setRunning(true);
    setFinished(false);
    setProgress({ done: 0, total: items.length });

    let done = 0;
    const CONCURRENCY = 4;

    for (let i = 0; i < items.length; i += CONCURRENCY) {
      const batch = items.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        batch.map((text) =>
          base44.functions.invoke('generateTts', { text, lang: 'es' })
        )
      );
      done += batch.length;
      setProgress({ done, total: items.length });
    }

    setRunning(false);
    setFinished(true);
    setTimeout(() => setFinished(false), 4000);
  };

  const pct = progress.total
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  if (running) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-28 h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-violet-600 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-slate-500 font-mono whitespace-nowrap">
          🔊 {progress.done}/{progress.total}
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={generate}
      disabled={!words.length}
      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40"
      title="Generate TTS audio for all syllables and words"
    >
      {finished ? '✅ Audio ready' : '🔊 Generate audio'}
    </button>
  );
}