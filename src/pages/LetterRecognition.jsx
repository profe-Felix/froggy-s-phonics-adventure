import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import LetterRecognitionCanvas from '@/components/tracing/LetterRecognitionCanvas';

export default function LetterRecognition() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    base44.entities.LetterWaypoint.list()
      .then((records) => {
        if (cancelled) return;
        const t = [];
        for (const rec of records || []) {
          try {
            const strokes = JSON.parse(rec.strokes_data);
            if (Array.isArray(strokes) && strokes.length && rec.letter && rec.letter.length === 1) {
              t.push({ letter: rec.letter, strokes });
            }
          } catch { /* ignore malformed */ }
        }
        t.sort((a, b) => a.letter.localeCompare(b.letter, undefined, { sensitivity: 'base' }));
        setTemplates(t);
        if (!t.length) setError('No saved letters yet. Author some letters first (a–e to test).');
      })
      .catch(() => { if (!cancelled) setError('Could not load saved letters.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const available = templates.map((t) => t.letter).join(' ');

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">🎯 Guess My Letter</h1>
            <p className="text-sm text-slate-500">Draw a letter on the lines and I'll guess which one it is — using your saved templates.</p>
          </div>
          <Link
            to="/LetterTracingAuthoring"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
          >
            <ArrowLeft className="w-4 h-4" /> Authoring
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-10 text-slate-400">Loading saved letters…</div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center text-slate-500">{error}</div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="mb-3 text-sm text-slate-500">
              Known letters: <span className="font-bold text-slate-700 tracking-wider">{available}</span>
            </div>
            <LetterRecognitionCanvas templates={templates} />
            <p className="text-xs text-slate-400 text-center mt-3">
              Stroke order within a letter doesn't matter — circle-then-line still matches line-then-circle.
              Use "Group by spacing" to split letters by horizontal gap (works even without pausing), or "Group by pause" to split by timing.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}