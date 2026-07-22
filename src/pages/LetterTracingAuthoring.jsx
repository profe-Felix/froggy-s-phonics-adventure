import { useState, useMemo } from 'react';
import { Copy, Check, Play, RotateCcw } from 'lucide-react';
import StrokeAuthoringCanvas from '@/components/tracing/StrokeAuthoringCanvas';
import { smoothAndNormalize } from '@/components/tracing/strokeMath';
import LetterTracingCanvas from '@/components/game/LetterTracingCanvas';

const LOWER = 'abcdefghijklmnopqrstuvwxyz'.split('');
const UPPER = LOWER.map((c) => c.toUpperCase());

export default function LetterTracingAuthoring() {
  const [upper, setUpper] = useState(false);
  const [letter, setLetter] = useState('a');
  const [hint, setHint] = useState('');
  const [rawStrokes, setRawStrokes] = useState([]);
  const [copied, setCopied] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const chars = upper ? UPPER : LOWER;
  const target = upper ? letter.toUpperCase() : letter.toLowerCase();

  const normalized = useMemo(() => rawStrokes.map((s) => smoothAndNormalize(s)), [rawStrokes]);

  const snippet = useMemo(() => {
    if (!normalized.length) return '// Draw strokes to generate waypoints';
    const strokesStr = normalized
      .map((stroke) => `      [${stroke.map((p) => `{ x: ${p.x}, y: ${p.y} }`).join(', ')}]`)
      .join(',\n');
    return `  ${target}: {\n    strokes: [\n${strokesStr}\n    ],\n    hint: ${JSON.stringify(hint || '')}\n  },`;
  }, [normalized, target, hint]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const reset = () => {
    setRawStrokes([]);
    setHint('');
    setPreviewing(false);
  };

  const pickLetter = (c) => {
    setLetter(c.toLowerCase());
    setRawStrokes([]);
    setPreviewing(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">✏️ Letter Tracing Authoring</h1>
            <p className="text-sm text-slate-500">Draw each letter — strokes are smoothed and recorded with direction for the tracing game.</p>
          </div>
          <button
            onClick={reset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
          >
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
        </div>

        {/* Letter picker + case toggle + hint */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Letter</h2>
            <button
              onClick={() => setUpper((u) => !u)}
              className={`px-3 py-1 rounded-full text-sm font-bold border transition ${
                upper
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {upper ? 'UPPERCASE' : 'lowercase'}
            </button>
          </div>
          <div className="grid grid-cols-9 sm:grid-cols-13 gap-1.5 mb-4">
            {chars.map((c) => (
              <button
                key={c}
                onClick={() => pickLetter(c)}
                className={`h-10 rounded-lg font-bold text-lg transition active:scale-95 ${
                  target === c
                    ? 'bg-indigo-600 text-white shadow'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-slate-500 uppercase">Hint (spoken to the student)</span>
            <input
              type="text"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="e.g. Pull down, push up, circle forward"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </label>
        </div>

        <div className="grid md:grid-cols-2 gap-5 items-start">
          {/* Drawing canvas */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">
              Draw · <span className="text-indigo-600 text-xl align-middle">{target}</span>
            </h2>
            <StrokeAuthoringCanvas rawStrokes={rawStrokes} setRawStrokes={setRawStrokes} />
          </div>

          {/* Output + preview */}
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Waypoints output</h2>
                <button
                  onClick={copy}
                  disabled={!normalized.length}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="text-xs font-mono bg-slate-900 text-slate-100 rounded-lg p-3 overflow-auto max-h-72 whitespace-pre">
                {snippet}
              </pre>
              <p className="text-xs text-slate-500 mt-2">
                Paste this into <code className="bg-slate-100 px-1 rounded">letterWaypoints.jsx</code> under{' '}
                <code className="bg-slate-100 px-1 rounded">LETTER_WAYPOINTS</code> to use it in the tracing game.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Student preview</h2>
                <button
                  onClick={() => setPreviewing((p) => !p)}
                  disabled={!normalized.length}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Play className="w-4 h-4" /> {previewing ? 'Hide' : 'Preview'}
                </button>
              </div>
              {previewing && normalized.length > 0 ? (
                <div className="flex justify-center bg-gradient-to-b from-purple-400 to-indigo-600 rounded-xl p-4">
                  <LetterTracingCanvas
                    key={target + JSON.stringify(normalized)}
                    letter={target}
                    strokes={normalized}
                    onComplete={() => {}}
                    onReset={() => {}}
                  />
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-6">
                  {normalized.length ? 'Press Preview to trace your letter like a student would.' : 'Draw strokes first, then preview.'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}