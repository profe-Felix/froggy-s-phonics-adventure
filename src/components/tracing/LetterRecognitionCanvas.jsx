import { useRef, useState } from 'react';
import { Trash2, Sparkles } from 'lucide-react';
import { CANVAS_W, CANVAS_H } from '@/components/tracing/strokeMath';
import { recognize, pathwayMatch, groupFormsLetter } from '@/lib/letterRecognize';

// Contact grouping is only a HINT. After clustering touching strokes, re-examine
// every multi-stroke group against recognition: if EACH stroke already reads as
// a confident standalone letter AND merging them is NOT clearly better than the
// best standalone read, split them back apart. This is the "examine the strokes
// first, not as a whole" rule — a "c" and an "l" that happen to touch stay two
// letters (each is a confident c / l on its own), instead of collapsing into an
// "a". A genuine multi-stroke letter still merges: its parts alone are NOT
// confident letters (a "t" crossbar, an "i" dot, an "a" bowl), or the merged
// letter reads clearly better than any fragment.
const STANDALONE_DIST = 0.22; // a stroke reading this close (DTW avg per-stroke cost) is a confident standalone letter — DTW scale, not the old Chamfer+feature scale
function segmentByRecognition(strokes, touchPx, templates) {
  const groups = clusterByTouch(strokes, touchPx);
  const out = [];
  const arcLenPx = (s) => { let L = 0; for (let i = 1; i < s.length; i++) L += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y); return L; };
  // A dot (the i/j dot, a tap) is a MARK — never a standalone letter. If a group
  // contains one, keep it merged with its stem: don't let the split rule tear the
  // dot off just because both the dot and the stem happen to read as confident
  // 'i's on their own (the ill→iill bug — dot became its own 'i', stem another).
  const hasDot = (g) => g.some((s) => s.length <= 2 || arcLenPx(s) < 6);
  for (const g of groups) {
    if (g.length < 2 || !templates.length) { out.push(g); continue; }
    if (hasDot(g)) { out.push(g); continue; }
    let bestIndiv = Infinity, allConfident = true;
    for (const s of g) {
      const r = recognize([s], templates);
      const d = r[0] ? r[0].dist : Infinity;
      if (d < bestIndiv) bestIndiv = d;
      if (d >= STANDALONE_DIST) allConfident = false;
    }
    // Split only when every stroke is a confident standalone letter on its own
    // AND the group does NOT clearly form one known multi-stroke letter. The
    // shape guard (groupFormsLetter) is what keeps a 2-stroke 't'/'f'/'k'
    // together even when a fragment (crossbar, arm) happens to read as a
    // confident short letter on its own — the group's overall shape still
    // matches the 2-stroke template, so it is one letter, not two.
    if (allConfident && isFinite(bestIndiv) && !groupFormsLetter(g, templates)) {
      for (const s of g) out.push([s]);
    } else {
      out.push(g);
    }
  }
  const cxOf = (g) => { const f = g.flat(); return f.reduce((s, p) => s + p.x, 0) / f.length; };
  return out.sort((a, b) => cxOf(a) - cxOf(b));
}

const pathD = (pts) =>
  pts.length < 2 ? '' : pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

// Ink is drawn 8px wide, so two strokes whose INK visually touches/overlaps still
// have centerlines up to 8px apart. "Touching" must mean ink-touching, not
// centerline-touching — otherwise an 'e' crossbar sitting on its loop, or an 'a'
// stem beside its bowl, never merges at a low slider value. The slider adds
// tolerance ON TOP of the ink width.
const INK_W = 8;

// Group strokes into letters by ACTUAL CONTACT. Two strokes join one letter
// only when some point of one is within `touchPx` of some point of the other —
// they touch or nearly touch. A single continuous stroke (an 'a' drawn as a
// bowl that flows into a tail) is always one letter: the tail is part of that
// stroke, so it won't pull in a nearby-but-separate 'b' unless the tail
// genuinely touches the 'b'. This is the "connected to the a, less so to the b"
// rule — stroke continuity is respected, mere closeness is not. A floating dot
// above a stem (i / j) still merges when it sits directly over the stem.
function clusterByTouch(strokes, touchPx) {
  const n = strokes.length;
  if (!n) return [];
  const bb = strokes.map((s) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of s) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
    return { minX, maxX, minY, maxY };
  });
  // x-range of a stroke's UPPER portion only (top 35%). A 'j' stem's full bbox
  // reaches left across its bottom hook, pulling the bbox center away from the
  // shaft the dot sits over; aligning to the shaft (the top of the stroke) keeps
  // the dot with its stem even when the hook is wide, and keeps a neighbor's dot
  // from joining (a side-by-side dot is never above the shaft's column).
  const topX = strokes.map((s, i) => {
    const minY = bb[i].minY, h = (bb[i].maxY - bb[i].minY) || 1;
    const cutoff = minY + 0.35 * h;
    let xmin = Infinity, xmax = -Infinity, any = false;
    for (const p of s) { if (p.y <= cutoff) { any = true; if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x; } }
    return any ? { xmin, xmax, cx: (xmin + xmax) / 2 } : { xmin: bb[i].minX, xmax: bb[i].maxX, cx: (bb[i].minX + bb[i].maxX) / 2 };
  });
  // nearest point-to-point distance — check EVERY point so a genuine touch
  // is never missed between samples (strokes are filtered to ≥2px spacing,
  // so sampling every 3rd can skip the exact contact point at low thresholds)
  const ptDist = (i, j) => {
    const a = strokes[i], b = strokes[j];
    let mn = Infinity;
    for (let pi = 0; pi < a.length; pi++) {
      const p = a[pi];
      for (let qi = 0; qi < b.length; qi++) {
        const q = b[qi];
        const d = (p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y);
        if (d < mn) mn = d;
      }
    }
    return Math.sqrt(mn);
  };
  const cxOf = (i) => (bb[i].minX + bb[i].maxX) / 2;
  const cyOf = (i) => (bb[i].minY + bb[i].maxY) / 2;
  const wOf = (i) => bb[i].maxX - bb[i].minX;
  const hOf = (i) => bb[i].maxY - bb[i].minY;
  const isMark = (i) => wOf(i) <= 60 && hOf(i) <= 34; // a dot (i/j) or a tilde (ñ)
  // A detached mark belongs to the stem in whose column it sits, even when the
  // stem reaches UP to the mark (a tall 'j' whose top meets its dot) — so the
  // rule is "mark above the stem's MIDDLE", not "mark above the stem's TOP".
  // The stem must be clearly taller than the mark (it's a stem, not another
  // small letter). The mark's center must sit over the stem's SHAFT (the top
  // portion's x-range, so a wide bottom hook doesn't drag the match away) or
  // within ~half a letter width of it. Side-by-side letters share a baseline,
  // so neither sits above the other's middle.
  const markOver = (m, o) => {
    if (!isMark(m) || hOf(o) <= hOf(m) * 1.5 || cyOf(m) >= cyOf(o)) return false;
    const t = topX[o];
    const mcx = (bb[m].minX + bb[m].maxX) / 2;
    return (mcx >= t.xmin - 10 && mcx <= t.xmax + 10) || Math.abs(mcx - t.cx) < 16;
  };
  const parent = strokes.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { parent[find(a)] = find(b); };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dotAbove = markOver(i, j) || markOver(j, i);
      if (ptDist(i, j) <= touchPx + INK_W || dotAbove) union(i, j);
    }
  }
  const groups = {};
  for (let i = 0; i < n; i++) { const r = find(i); (groups[r] = groups[r] || []).push(i); }
  return Object.values(groups)
    .map((idx) => ({ idx, cx: idx.reduce((s, i) => s + (bb[i].minX + bb[i].maxX) / 2, 0) / idx.length }))
    .sort((a, b) => a.cx - b.cx)
    .map((g) => g.idx.map((i) => strokes[i]));
}

export default function LetterRecognitionCanvas({ templates }) {
  const [strokes, setStrokes] = useState([]);
  const [pauses, setPauses] = useState([]);
  const [current, setCurrent] = useState([]);
  const [result, setResult] = useState(null);
  const [guessing, setGuessing] = useState(false);
  const [segMode, setSegMode] = useState('space'); // 'space' | 'pause'
  const [spaceGap, setSpaceGap] = useState(14); // canvas px — strokes join when ink is within this far (ink width already included); tuned for kids' multi-stroke letters whose parts don't quite touch
  const [pauseMs, setPauseMs] = useState(500);
  const svgRef = useRef(null);
  const currentRef = useRef([]);
  const drawingRef = useRef(false);
  const pendingPauseRef = useRef(0);
  const lastUpTimeRef = useRef(0);
  const committedCountRef = useRef(0);

  const getPos = (e) => {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * CANVAS_W) / rect.width,
      y: ((e.clientY - rect.top) * CANVAS_H) / rect.height,
    };
  };

  const down = (e) => {
    e.preventDefault();
    if (e.button != null && e.button !== 0) return;
    try { svgRef.current.setPointerCapture(e.pointerId); } catch {}
    const now = performance.now();
    pendingPauseRef.current = committedCountRef.current === 0 ? 0 : now - lastUpTimeRef.current;
    const pos = getPos(e);
    currentRef.current = [pos];
    setCurrent([pos]);
    drawingRef.current = true;
    setResult(null);
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
    if (drawingRef.current && currentRef.current.length >= 1) {
      // A tap (no movement) is a dot — the dot of i/j. Commit it as a single-
      // point stroke so the dot-above merge can attach it to the stem below.
      const finished = currentRef.current.slice();
      setStrokes((prev) => [...prev, finished]);
      setPauses((prev) => [...prev, pendingPauseRef.current]);
      committedCountRef.current += 1;
    }
    currentRef.current = [];
    setCurrent([]);
    drawingRef.current = false;
    lastUpTimeRef.current = performance.now();
  };

  const clear = () => {
    setStrokes([]); setPauses([]); setCurrent([]); setResult(null);
    committedCountRef.current = 0;
    lastUpTimeRef.current = 0;
  };

  const guess = () => {
    if (!strokes.length) return;
    setGuessing(true);
    setTimeout(() => {
      let groups;
      if (segMode === 'space') {
        groups = segmentByRecognition(strokes, spaceGap, templates);
      } else {
        groups = [];
        strokes.forEach((s, i) => {
          if (i === 0 || pauses[i] > pauseMs) groups.push([s]);
          else groups[groups.length - 1].push(s);
        });
      }
      const segments = groups.map((g) => {
        const ranked = recognize(g, templates);
        const letter = ranked[0] ? ranked[0].letter : '?';
        // A letter may have several saved templates (different writing styles).
        // The pathway is correct if the drawn strokes match ANY of them.
        const sameLetter = letter !== '?' ? templates.filter((t) => t.letter === letter) : [];
        const pathway = sameLetter.some((t) => pathwayMatch(g, t));
        return {
          letter,
          confidence: ranked[0] ? ranked[0].confidence : 0,
          ranked,
          pathway,
        };
      });
      setResult({ segments, word: segments.map((s) => s.letter).join('') });
      setGuessing(false);
    }, 60);
  };

  const single = result && result.segments.length === 1;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        className="w-72 max-w-full rounded-2xl border-4 border-indigo-300 bg-white touch-none aspect-[4/5] shadow-sm"
        style={{ touchAction: 'none', cursor: 'crosshair' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <line x1="0" y1={0.10 * CANVAS_H} x2={CANVAS_W} y2={0.10 * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={0.367 * CANVAS_H} x2={CANVAS_W} y2={0.367 * CANVAS_H} stroke="#93c5fd" strokeWidth="1" strokeDasharray="8 6" opacity="0.7" />
        <line x1="0" y1={0.633 * CANVAS_H} x2={CANVAS_W} y2={0.633 * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={0.90 * CANVAS_H} x2={CANVAS_W} y2={0.90 * CANVAS_H} stroke="#fca5a5" strokeWidth="1.5" strokeDasharray="6 6" opacity="0.85" />

        {strokes.map((s, i) => (
          s.length === 1 ? (
            <circle key={i} cx={s[0].x} cy={s[0].y} r="4" fill="#4f46e5" />
          ) : (
            <path key={i} d={pathD(s)} fill="none" stroke="#4f46e5" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          )
        ))}
        {current.length > 1 && (
          <path d={pathD(current)} fill="none" stroke="#6366f1" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {current.length === 1 && (
          <circle cx={current[0].x} cy={current[0].y} r="4" fill="#6366f1" />
        )}
      </svg>

      {/* Segmentation mode toggle */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg text-xs font-semibold">
        <button
          onClick={() => setSegMode('space')}
          className={`px-3 py-1 rounded-md transition ${segMode === 'space' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
        >
          Group by touching
        </button>
        <button
          onClick={() => setSegMode('pause')}
          className={`px-3 py-1 rounded-md transition ${segMode === 'pause' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
        >
          Group by pause
        </button>
      </div>

      {/* Mode-specific threshold */}
      <label className="flex items-center gap-2 text-xs text-slate-600 w-full max-w-xs px-2">
        <span className="w-28 shrink-0">{segMode === 'space' ? 'Stroke join distance' : 'Pause between letters'}</span>
        <input
          type="range"
          min={segMode === 'space' ? 2 : 200}
          max={segMode === 'space' ? 40 : 1500}
          step={segMode === 'space' ? 1 : 50}
          value={segMode === 'space' ? spaceGap : pauseMs}
          onChange={(e) => (segMode === 'space' ? setSpaceGap(parseInt(e.target.value, 10)) : setPauseMs(parseInt(e.target.value, 10)))}
          className="flex-1"
        />
        <span className="w-14 text-right tabular-nums">{segMode === 'space' ? `${spaceGap}px` : `${pauseMs}ms`}</span>
      </label>

      <div className="flex gap-2">
        <button
          onClick={guess}
          disabled={!strokes.length || guessing}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Sparkles className="w-4 h-4" /> {guessing ? 'Thinking…' : 'Guess my letters'}
        </button>
        <button
          onClick={clear}
          disabled={!strokes.length && !current.length}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" /> Clear
        </button>
      </div>

      {result && (
        <div className="w-full max-w-xs text-center">
          {single ? (
            <>
              <div className="text-lg font-bold text-slate-700">
                I think you wrote:{' '}
                <span className={`text-2xl ${result.segments[0].pathway ? 'text-green-600' : 'text-amber-500'}`}>
                  {result.segments[0].letter}
                </span>{' '}
                <span className="text-sm font-normal text-slate-500">({result.segments[0].confidence}% sure)</span>{' '}
                <span className={`text-xs font-bold ${result.segments[0].pathway ? 'text-green-600' : 'text-amber-500'}`}>
                  {result.segments[0].pathway ? '✓ correct pathway' : '↻ shape only — no full credit'}
                </span>
              </div>
              <div className="mt-3 space-y-1.5">
                {result.segments[0].ranked.map((r) => (
                  <div key={r.letter} className="flex items-center gap-2">
                    <span className="w-5 text-sm font-bold text-slate-600">{r.letter}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${r === result.segments[0].ranked[0] ? 'bg-indigo-500' : 'bg-slate-300'}`}
                        style={{ width: `${r.confidence}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs text-slate-400 tabular-nums">{r.confidence}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="text-lg font-bold text-slate-700">
                I think you wrote: <span className="text-2xl tracking-wider text-indigo-600">{result.word}</span>
              </div>
              <div className="mt-3 space-y-2 text-left">
                {result.segments.map((seg, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-14 text-xs text-slate-500">Letter {i + 1}</span>
                    <span className={`w-5 text-lg font-bold ${seg.pathway ? 'text-green-600' : 'text-amber-500'}`}>{seg.letter}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${seg.confidence}%` }} />
                    </div>
                    <span className="w-8 text-right text-xs text-slate-400 tabular-nums">{seg.confidence}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}