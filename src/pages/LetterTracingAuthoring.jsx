import { useState, useMemo, useEffect, useCallback } from 'react';
import { Copy, Check, Play, RotateCcw, Save, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import StrokeAuthoringCanvas from '@/components/tracing/StrokeAuthoringCanvas';
import TraceThinCanvas from '@/components/tracing/TraceThinCanvas';
import { CANVAS_W, CANVAS_H, simplify } from '@/components/tracing/strokeMath';
import LetterTracingCanvas from '@/components/game/LetterTracingCanvas';
import { base44 } from '@/api/base44Client';
import TracingLetterToggle from '@/components/tracing/TracingLetterToggle';

const LOWER = 'abcdefghijklmnopqrstuvwxyz'.split('');
const UPPER = LOWER.map((c) => c.toUpperCase());

export default function LetterTracingAuthoring() {
  const [upper, setUpper] = useState(false);
  const [letter, setLetter] = useState('a');
  const [hint, setHint] = useState('');
  const [rawStrokes, setRawStrokes] = useState([]);
  const [copied, setCopied] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Authoring canvas: 'snap' = image-based center-on-ink (the original tool),
  // 'thin' = draw-then-trace-thin (draw a thick guide, shrink it to a thin
  // line, then trace over it with the pen held to that line).
  const [authorMode, setAuthorMode] = useState('snap');

  // Shared trace image + transform — lives here so it persists when toggling
  // between "Snap to ink" and "Trace thin" (no re-inserting the image).
  const DEFAULT_BG_SCALE = 16.3;
  const [sharedBg, setSharedBg] = useState(null);
  const [sharedBgScale, setSharedBgScale] = useState(DEFAULT_BG_SCALE);
  const [sharedBgX, setSharedBgX] = useState(0);
  const [sharedBgY, setSharedBgY] = useState(0);
  const loadImage = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const aspect = img.naturalWidth / img.naturalHeight || 1;
      setSharedBg({ url, aspect, img });
      const dh = CANVAS_H * DEFAULT_BG_SCALE;
      const dw = dh * aspect;
      setSharedBgScale(DEFAULT_BG_SCALE);
      setSharedBgX((CANVAS_W - dw) / 2);
      setSharedBgY((CANVAS_H - dh) / 2);
    };
    img.src = url;
  }, []);
  useEffect(() => {
    if (!sharedBg) return;
    return () => URL.revokeObjectURL(sharedBg.url);
  }, [sharedBg]);

  const chars = upper ? UPPER : LOWER;
  const target = upper ? letter.toUpperCase() : letter.toLowerCase();

  // rawStrokes IS the skeleton (the control points the user placed). Save it
  // directly — loading gives back the exact same points for editing. The
  // student tracing game smooths these sparse waypoints via Catmull-Rom at
  // runtime (buildDensePath in tracingCore), so no densification is needed here.
  const normalized = useMemo(
    () => rawStrokes.map((s) => s.map((p) => ({
      x: p.x / CANVAS_W,
      y: p.y / CANVAS_H,
      ...(p.corner ? { corner: true } : {}),
    }))),
    [rawStrokes]
  );

  // Load saved waypoints for the selected letter so the preview works without
  // redrawing. The student tracing game reads from the same LetterWaypoint
  // entity, so this keeps authoring and student play in sync.
  useEffect(() => {
    let cancelled = false;
    base44.entities.LetterWaypoint.filter({ letter: target })
      .then((records) => {
        if (cancelled || !records || !records.length) return;
        const rec = records[0];
        try {
          const strokes = JSON.parse(rec.strokes_data);
          if (Array.isArray(strokes) && strokes.length) {
            // Old saved data is dense (64+ catmullRom samples). Simplify back to
            // the skeleton control points so edit mode shows a manageable handle
            // set. New data is already sparse (the skeleton), so simplify is a no-op.
            const px = strokes.map((s) => {
              const raw = s.map((p) => ({
                x: p.x * CANVAS_W,
                y: p.y * CANVAS_H,
                ...(p.corner ? { corner: true } : {}),
              }));
              return raw.length > 16 ? simplify(raw, 3) : raw;
            });
            setRawStrokes(px);
            setHint(rec.hint || '');
          }
        } catch { /* ignore malformed */ }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [target]);

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

  const save = async () => {
    if (!normalized.length) return;
    setSaving(true);
    setSaveError('');
    try {
      const existing = await base44.entities.LetterWaypoint.filter({ letter: target });
      const payload = {
        letter: target,
        strokes_data: JSON.stringify(normalized),
        hint: hint || '',
      };
      if (existing.length) {
        await base44.entities.LetterWaypoint.update(existing[0].id, payload);
      } else {
        await base44.entities.LetterWaypoint.create(payload);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setSaveError('Could not save — try again.');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setRawStrokes([]);
    setHint('');
    setPreviewing(false);
    setSharedBg(null);
  };

  const pickLetter = (c) => {
    setLetter(c.toLowerCase());
    setRawStrokes([]);
    setPreviewing(false);
    setSharedBg(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">✏️ Letter Tracing Authoring</h1>
            <p className="text-sm text-slate-500">Draw each letter — strokes are smoothed and recorded with direction for the tracing game.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/LetterRecognition"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <Sparkles className="w-4 h-4" /> Guess a letter
            </Link>
            <button
              onClick={reset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
            >
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
          </div>
        </div>

        <TracingLetterToggle />

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
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                Draw · <span className="text-indigo-600 text-xl align-middle">{target}</span>
              </h2>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  onClick={() => setAuthorMode('snap')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition ${
                    authorMode === 'snap' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Snap to ink
                </button>
                <button
                  onClick={() => setAuthorMode('thin')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition ${
                    authorMode === 'thin' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Trace thin
                </button>
              </div>
            </div>
            {authorMode === 'snap' ? (
              <StrokeAuthoringCanvas rawStrokes={rawStrokes} setRawStrokes={setRawStrokes} bg={sharedBg} bgScale={sharedBgScale} bgX={sharedBgX} bgY={sharedBgY} setBgScale={setSharedBgScale} setBgX={setSharedBgX} setBgY={setSharedBgY} setBg={setSharedBg} loadImage={loadImage} />
            ) : (
              <TraceThinCanvas rawStrokes={rawStrokes} setRawStrokes={setRawStrokes} bg={sharedBg} bgScale={sharedBgScale} bgX={sharedBgX} bgY={sharedBgY} setBgScale={setSharedBgScale} setBgX={setSharedBgX} setBgY={setSharedBgY} setBg={setSharedBg} loadImage={loadImage} />
            )}
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
              <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
                <p className="text-xs text-slate-500">
                  Saving stores these strokes for the letter so the tracing game uses them — no copy-paste needed.
                </p>
                <button
                  onClick={save}
                  disabled={!normalized.length || saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
                </button>
              </div>
              {saveError && <p className="text-xs text-red-600 mt-1">{saveError}</p>}
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
                {previewing && (
                  <button
                    onClick={() => setShowCoverage((s) => !s)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border ${
                      showCoverage
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
                    }`}
                  >
                    🖊️ {showCoverage ? 'Hide thick-pen' : 'Show thick-pen'}
                  </button>
                )}
              </div>
              {previewing && normalized.length > 0 ? (
                <div className="flex justify-center bg-gradient-to-b from-purple-400 to-indigo-600 rounded-xl p-4">
                  <LetterTracingCanvas
                    key={target + JSON.stringify(normalized)}
                    letter={target}
                    strokes={normalized}
                    onComplete={() => {}}
                    onReset={() => {}}
                    debugCoverage={showCoverage}
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