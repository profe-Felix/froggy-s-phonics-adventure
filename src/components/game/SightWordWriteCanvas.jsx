import { useRef, useState, useEffect, useMemo } from 'react';
import { Trash2, Check, Volume2, RefreshCw, ArrowRight } from 'lucide-react';
import { CANVAS_W, CANVAS_H } from '@/components/tracing/strokeMath';
import { recognize, pathwayMatch } from '@/lib/letterRecognize';
import { segmentByRecognition } from '@/components/tracing/LetterRecognitionCanvas';
import { LETTER_WAYPOINTS } from '../data/letterWaypoints';
import { base44 } from '@/api/base44Client';

// A wide handwriting canvas for sight-word writing. The student writes the
// word freely on the guide lines; "Check" segments the ink into letters,
// recognizes each one, and compares the result to the target word — giving
// per-letter green/red feedback the old freehand canvas never had.
const VIEWBOX_W = 900;
const SPACE_GAP = 14;

const pathD = (pts) =>
  pts.length < 2 ? '' : pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

export default function SightWordWriteCanvas({ word, onDone, onPlaySound }) {
  const [strokes, setStrokes] = useState([]);
  const [current, setCurrent] = useState([]);
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [waypoints, setWaypoints] = useState(LETTER_WAYPOINTS);
  const svgRef = useRef(null);
  const currentRef = useRef([]);
  const drawingRef = useRef(false);

  // Load teacher-authored waypoints from the DB (same merge as
  // SightWordTraceFeedback) so recognition uses the same templates the
  // tracing canvas teaches.
  useEffect(() => {
    let cancelled = false;
    base44.entities.LetterWaypoint.list()
      .then((records) => {
        if (cancelled || !Array.isArray(records) || !records.length) return;
        setWaypoints((prev) => {
          const merged = { ...prev };
          for (const r of records) {
            if (!r.letter || !r.strokes_data) continue;
            try {
              const s = JSON.parse(r.strokes_data);
              if (Array.isArray(s) && s.length) merged[r.letter] = { strokes: s, hint: r.hint || '' };
            } catch { /* ignore */ }
          }
          return merged;
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Build recognition templates from the loaded waypoints.
  const templates = useMemo(
    () =>
      Object.entries(waypoints)
        .filter(([, d]) => d && Array.isArray(d.strokes) && d.strokes.length)
        .map(([letter, d]) => ({ letter, strokes: d.strokes })),
    [waypoints]
  );

  const getPos = (e) => {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * VIEWBOX_W) / rect.width,
      y: ((e.clientY - rect.top) * CANVAS_H) / rect.height,
    };
  };

  // Commit the current stroke to the strokes array. Called from both the
  // SVG's onPointerUp and a global window pointerup listener — the fallback
  // ensures strokes are never lost when pointerup fires outside the SVG
  // (common on mobile where setPointerCapture can silently fail).
  // Only uses refs + stable setters, so a plain function is safe.
  const commitStroke = () => {
    if (!drawingRef.current) return;
    if (currentRef.current.length >= 1) {
      setStrokes((prev) => [...prev, currentRef.current.slice()]);
    }
    currentRef.current = [];
    setCurrent([]);
    drawingRef.current = false;
  };

  // Global pointerup fallback — catches the stroke even when the pointerup
  // event fires on a different element than the SVG.
  useEffect(() => {
    const handler = () => commitStroke();
    window.addEventListener('pointerup', handler, { capture: true });
    window.addEventListener('pointercancel', handler, { capture: true });
    return () => {
      window.removeEventListener('pointerup', handler, { capture: true });
      window.removeEventListener('pointercancel', handler, { capture: true });
    };
  }, []);

  const down = (e) => {
    e.preventDefault();
    if (e.button != null && e.button !== 0) return;
    try { svgRef.current.setPointerCapture(e.pointerId); } catch {}
    const pos = getPos(e);
    currentRef.current = [pos];
    setCurrent([pos]);
    drawingRef.current = true;
    if (result) setResult(null);
  };

  const move = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const pos = getPos(e);
    const last = currentRef.current[currentRef.current.length - 1];
    if (last && Math.hypot(pos.x - last.x, pos.y - last.y) < 2) return;
    currentRef.current = [...currentRef.current, pos];
    setCurrent(currentRef.current);
  };

  const up = (e) => {
    e.preventDefault();
    try { svgRef.current.releasePointerCapture(e.pointerId); } catch {}
    commitStroke();
  };

  const clear = () => {
    setStrokes([]);
    setCurrent([]);
    setResult(null);
  };

  // Scale stroke x-coordinates from the wide viewBox (0..VIEWBOX_W) into the
  // recognition canvas space (0..CANVAS_W) so the recognizer's normalize()
  // (which divides by CANVAS_W) produces correct 0-1 coordinates.
  const scaleForRecognition = (rawStrokes) =>
    rawStrokes.map((s) => s.map((p) => ({ x: (p.x * CANVAS_W) / VIEWBOX_W, y: p.y })));

  const check = () => {
    if (!strokes.length) return;
    setChecking(true);
    setTimeout(() => {
      const scaled = scaleForRecognition(strokes);
      const groups = segmentByRecognition(scaled, SPACE_GAP, templates);
      const segments = groups.map((g) => {
        const ranked = recognize(g, templates);
        const top = ranked[0] || null;
        const letter = top ? top.letter : '?';
        const conf = top ? top.confidence : 0;
        const pathway = top && top.letter !== '?' ? templates.filter((t) => t.letter === top.letter).some((t) => pathwayMatch(g, t)) : false;
        return { letter, confidence: conf, pathway, ranked };
      });
      const recognized = segments.map((s) => s.letter).join('');
      const isCorrect = recognized === word;
      setResult({ segments, recognized, isCorrect });
      setChecking(false);
    }, 80);
  };

  const targetLetters = (word || '').split('');

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="flex items-center gap-3 w-full justify-between">
        <div className="flex items-center gap-2">
          <p className="text-lg font-black text-indigo-700">✏️ Write the word:</p>
          <button onClick={onPlaySound}
            className="w-10 h-10 rounded-full bg-indigo-100 hover:bg-indigo-200 flex items-center justify-center text-lg">
            🔊
          </button>
        </div>
        <div className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
          {word}
        </div>
      </div>

      {/* Canvas */}
      <div className="relative rounded-2xl border-4 border-indigo-300 overflow-hidden w-full bg-white" style={{ aspectRatio: `${VIEWBOX_W}/${CANVAS_H}` }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEWBOX_W} ${CANVAS_H}`}
          className="absolute inset-0 w-full h-full touch-none"
          style={{ touchAction: 'none', cursor: 'crosshair' }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          {/* Guide lines — same vertical positions as the tracing canvas */}
          <line x1="0" y1={0.10 * CANVAS_H} x2={VIEWBOX_W} y2={0.10 * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
          <line x1="0" y1={0.367 * CANVAS_H} x2={VIEWBOX_W} y2={0.367 * CANVAS_H} stroke="#93c5fd" strokeWidth="1" strokeDasharray="8 6" opacity="0.7" />
          <line x1="0" y1={0.633 * CANVAS_H} x2={VIEWBOX_W} y2={0.633 * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
          <line x1="0" y1={0.90 * CANVAS_H} x2={VIEWBOX_W} y2={0.90 * CANVAS_H} stroke="#fca5a5" strokeWidth="1.5" strokeDasharray="6 6" opacity="0.85" />

          {/* Committed strokes */}
          {strokes.map((s, i) =>
            s.length === 1 ? (
              <circle key={i} cx={s[0].x} cy={s[0].y} r="4" fill="#4f46e5" />
            ) : (
              <path key={i} d={pathD(s)} fill="none" stroke="#4f46e5" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
            )
          )}
          {/* Active stroke */}
          {current.length > 1 && (
            <path d={pathD(current)} fill="none" stroke="#6366f1" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {current.length === 1 && (
            <circle cx={current[0].x} cy={current[0].y} r="4" fill="#6366f1" />
          )}
        </svg>
      </div>

      {/* Result feedback */}
      {result && (
        <div className={`w-full rounded-2xl p-4 border-2 ${result.isCorrect ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'}`}>
          <div className="flex items-center justify-center gap-2 mb-2">
            {result.isCorrect ? (
              <span className="text-2xl font-black text-green-600">✓ Correct!</span>
            ) : (
              <span className="text-lg font-bold text-amber-600">Almost! Let's look at each letter:</span>
            )}
          </div>
          {/* Per-letter comparison */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {targetLetters.map((tl, i) => {
              const seg = result.segments[i];
              const got = seg ? seg.letter : '—';
              const match = seg && seg.letter === tl;
              return (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <div className={`w-12 h-14 rounded-xl border-2 flex items-center justify-center text-3xl font-black lowercase ${
                    match ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-600'
                  }`}>
                    {got}
                  </div>
                  <div className="text-xs font-bold text-slate-400">{tl}</div>
                </div>
              );
            })}
          </div>
          {!result.isCorrect && result.segments.length > targetLetters.length && (
            <p className="text-center text-xs text-amber-600 mt-2">
              You wrote {result.segments.length} letters — the word has {targetLetters.length}.
            </p>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex gap-2 w-full flex-wrap">
        <button
          onClick={check}
          disabled={!strokes.length || checking}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold shadow-lg disabled:opacity-40 hover:bg-indigo-700 text-sm"
        >
          <Check className="w-4 h-4" /> {checking ? 'Checking…' : 'Check'}
        </button>
        <button
          onClick={clear}
          disabled={!strokes.length && !current.length}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 text-sm disabled:opacity-40"
        >
          <Trash2 className="w-4 h-4" /> Clear
        </button>
        {result && !result.isCorrect && (
          <button
            onClick={() => { clear(); }}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-100 text-amber-700 font-bold hover:bg-amber-200 text-sm"
          >
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
        )}
        <button
          onClick={onDone}
          disabled={!result?.isCorrect}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-500 text-white font-bold shadow-lg disabled:opacity-40 hover:bg-green-600 text-sm min-w-[120px]"
        >
          Done → <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {!result && (
        <p className="text-xs text-slate-400 text-center">
          Write the word on the lines, then tap Check to see if you got it right!
        </p>
      )}
    </div>
  );
}