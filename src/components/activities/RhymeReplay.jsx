import { useMemo } from 'react';
import { syllabifyEs } from '@/lib/lettersort/phonics';
import { Check, X, Volume2 } from 'lucide-react';

// Teacher replay for "Identificar rimas". Shows the pair with each word's
// syllables (ending highlighted), the student's ✓/✗ choice colored by whether
// it was correct, and the voice recording.
function speak(text) {
  try {
    window.speechSynthesis?.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES'; u.rate = 0.8;
    window.speechSynthesis?.speak(u);
  } catch { /* best-effort */ }
}

function WordView({ word }) {
  const syls = useMemo(() => syllabifyEs(word), [word]);
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => speak(word)} className="shrink-0 p-2 rounded-lg bg-indigo-100 text-indigo-700" aria-label={`Escuchar ${word}`}>
        <Volume2 className="w-4 h-4" />
      </button>
      <span className="text-xl font-bold text-slate-800 flex flex-wrap">
        {syls.map((s, i) => (
          <span key={i} className={`px-1 rounded ${i === syls.length - 1 ? 'bg-indigo-200 text-indigo-800' : ''}`}>{s}</span>
        ))}
      </span>
    </div>
  );
}

export default function RhymeReplay({ rec }) {
  const data = useMemo(() => {
    try { return JSON.parse(rec.placements_data || '{}'); } catch { return {}; }
  }, [rec.placements_data]);
  const choice = data.choice;
  const correct = data.correct;
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-4">
        {data.word1 && <WordView word={data.word1} />}
        {data.word2 && <WordView word={data.word2} />}
      </div>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 ${choice === true ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {choice === true ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {choice === true ? 'Sí' : 'No'}
        </span>
        <span className={`text-sm font-bold ${correct ? 'text-green-600' : 'text-red-600'}`}>
          {correct ? 'Correcto' : `Incorrecto — ${data.answer ? 'sí riman' : 'no riman'}`}
        </span>
        {rec.audio_url && <audio controls src={rec.audio_url} className="ml-auto h-8" />}
      </div>
    </div>
  );
}