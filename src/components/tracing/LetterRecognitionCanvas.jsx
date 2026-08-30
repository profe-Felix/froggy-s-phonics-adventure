import { useRef, useState } from 'react';
import { Trash2, Sparkles } from 'lucide-react';
import { CANVAS_W, CANVAS_H } from '@/components/tracing/strokeMath';
import { recognize, shapeGuess, pathwayMatch, groupFormsLetter, traceMatch } from '@/lib/letterRecognize';
import MatchOverlap from '@/components/tracing/MatchOverlap';
import { classifyStroke, describeStroke } from '@/lib/strokeClassify';
import { analyzeStrokesInteraction } from '@/lib/strokeInteract';
import { inferLetter } from '@/lib/strokeInfer';

// Contact grouping is only a HINT. After clustering touching strokes, re-examine
// every multi-stroke group against recognition: if EACH stroke already reads as
// a confident standalone letter AND merging them is NOT clearly better than the
// best standalone read, split them back apart. This is the "examine the strokes
// first, not as a whole" rule — a "c" and an "l" that happen to touch stay two
// letters (each is a confident c / l on its own), instead of collapsing into an
// "a". A genuine multi-stroke letter still merges: its parts alone are NOT
// confident letters (a "t" crossbar, an "i" dot, an "a" bowl), or the merged
// letter reads clearly better than any fragment.
const STANDALONE_DIST = 0.22; // a stroke reading this close is a confident standalone letter
// Decide how to break a clustered stroke group into letters. A group that forms
// one known multi-stroke letter (groupFormsLetter) stays whole. Otherwise we try
// to PEEL one confident stroke off whose REMAINDER still forms a letter — this is
// what saves a 't'+'e' that touched: peel the 'e' off, the remaining stem+crossbar
// is still 't' (not the 'l'+'z' you get by shattering every stroke apart). Only if
// no peel works AND every stroke is a confident letter on its own (and none is a
// dot) do we split into singletons — the original "c + l that touch → c, l" rule.
function splitGroup(g, templates) {
  if (g.length < 2) return [g];
  if (groupFormsLetter(g, templates)) return [g];
  const arcLenPx = (s) => { let L = 0; for (let i = 1; i < s.length; i++) L += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y); return L; };
  const isDotPx = (s) => { if (s.length <= 2) return true; const L = arcLenPx(s); if (L < 6) return true; let mnx=Infinity,mxx=-Infinity,mny=Infinity,mxy=-Infinity; for (const p of s) { if (p.x<mnx) mnx=p.x; if (p.x>mxx) mxx=p.x; if (p.y<mny) mny=p.y; if (p.y>mxy) mxy=p.y; } return Math.max(mxx-mnx, mxy-mny) < 30; };
  // Peel: a confident standalone stroke whose remainder still forms a letter.
  for (let i = 0; i < g.length; i++) {
    const rest = g.filter((_, k) => k !== i);
    if (!rest.length) continue;
    const indiv = recognize([g[i]], templates);
    const indivD = indiv[0] ? indiv[0].dist : Infinity;
    if (indivD < STANDALONE_DIST && groupFormsLetter(rest, templates)) {
      return [g[i], ...splitGroup(rest, templates)];
    }
  }
  // No clean peel: split into singletons only if every stroke is a confident
  // standalone letter AND none is a dot (a dot is a mark — never its own letter;
  // tearing it off is the ill→iill bug). Otherwise keep the group together.
  let allConfident = true, hasDot = false;
  for (const s of g) {
    if (isDotPx(s)) hasDot = true;
    const r = recognize([s], templates);
    if ((r[0] ? r[0].dist : Infinity) >= STANDALONE_DIST) allConfident = false;
  }
  if (allConfident && !hasDot) return g.map((s) => [s]);
  return [g];
}
export function segmentByRecognition(strokes, touchPx, templates) {
  const groups = clusterByTouch(strokes, touchPx);
  const out = [];
  const arcLenPx = (s) => { let L = 0; for (let i = 1; i < s.length; i++) L += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y); return L; };
  const isDotPx = (s) => { if (s.length <= 2) return true; const L = arcLenPx(s); if (L < 6) return true; let mnx=Infinity,mxx=-Infinity,mny=Infinity,mxy=-Infinity; for (const p of s) { if (p.x<mnx) mnx=p.x; if (p.x>mxx) mxx=p.x; if (p.y<mny) mny=p.y; if (p.y>mxy) mxy=p.y; } return Math.max(mxx-mnx, mxy-mny) < 30; };
  for (const g of groups) {
    if (g.length < 2 || !templates.length) { out.push(g); continue; }
    // A simple dot+stem (i/j) stays together — never tear the dot off, even if
    // both dot and stem happen to read as confident letters on their own.
    if (g.length === 2 && g.some(isDotPx)) { out.push(g); continue; }
    for (const s of splitGroup(g, templates)) out.push(s);
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
  // A detached mark belongs to the stem whose SHAFT it sits over — and when two
  // letters are written close together, that means the CLOSEST shaft, not any
  // shaft within a loose window. Otherwise an 'i' dot just to the right of a tall
  // 'l' grabs the 'l' (forming an 'l'+dot group that reads as the wrong letter)
  // instead of its own 'i' stem. So for each mark we precompute the single nearest
  // stem (by horizontal distance from the mark's center to the stem's shaft), and
  // the mark joins only that one. The mark must still sit above that stem's middle
  // and the stem must be clearly taller (it's a stem, not another small letter).
  const markStem = (m, o) => {
    if (!isMark(m) || hOf(o) <= hOf(m) * 1.5 || cyOf(m) >= cyOf(o)) return Infinity;
    const t = topX[o];
    const mcx = (bb[m].minX + bb[m].maxX) / 2;
    if (mcx < t.xmin - 10 || mcx > t.xmax + 10) return Infinity; // not over this shaft
    return Math.abs(mcx - t.cx);
  };
  const closestStemFor = new Array(n).fill(-1);
  for (let m = 0; m < n; m++) {
    if (!isMark(m)) continue;
    let best = -1, bestDx = Infinity;
    for (let o = 0; o < n; o++) {
      if (o === m || isMark(o)) continue;
      const dx = markStem(m, o);
      if (dx < bestDx) { bestDx = dx; best = o; }
    }
    closestStemFor[m] = best;
  }
  const parent = strokes.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { parent[find(a)] = find(b); };
  // Two non-mark strokes whose ENDPOINT lies near the other stroke form a
  // JUNCTION — the V of a 'y'/'v' or the cross of an 'x'. Converging strokes
  // drawn with a small gap at the join are still ONE letter, so they merge on a
  // modest fixed tolerance beyond the ink-touch rule. Marks (dots/tildes) are
  // excluded — they only join via dotAbove — and side-by-side letters don't aim
  // endpoints at each other, so this doesn't over-merge neighbors.
  const JUNCTION = 24;
  const endpointNear = (i, j) => {
    const a = strokes[i], b = strokes[j];
    const ae = [a[0], a[a.length - 1]];
    for (const e of ae) {
      for (let k = 0; k < b.length; k++) { if (Math.hypot(e.x - b[k].x, e.y - b[k].y) <= JUNCTION) return true; }
    }
    return false;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // a mark joins ONLY its closest stem (not any stem it happens to sit over)
      const dotAbove = (isMark(i) && closestStemFor[i] === j) || (isMark(j) && closestStemFor[j] === i);
      const junction = !isMark(i) && !isMark(j) && (endpointNear(i, j) || endpointNear(j, i));
      if (ptDist(i, j) <= touchPx + INK_W || dotAbove || junction) union(i, j);
    }
  }
  const groups = {};
  for (let i = 0; i < n; i++) { const r = find(i); (groups[r] = groups[r] || []).push(i); }
  return Object.values(groups)
    .map((idx) => ({ idx, cx: idx.reduce((s, i) => s + (bb[i].minX + bb[i].maxX) / 2, 0) / idx.length }))
    .sort((a, b) => a.cx - b.cx)
    .map((g) => g.idx.map((i) => strokes[i]));
}

// Confidence tiers for a recognised segment.
//   green  — the taught pathway was followed (correct stroke order/direction/count)
//   yellow — the SHAPE is a confident letter, but the taught pathway wasn't followed
//            (e.g. a 'b' drawn in 2 strokes, stem-first). The letter identity is
//            credited; the pathway is flagged. This is the "I'm 80% sure you wrote
//            a b, but you did it in 2 strokes" tier — certainty of the LETTER is
//            decoupled from compliance with the PATH.
//   red    — nothing matches well = "doesn't match anything"
// The letter GUESS comes from the DTW pathway match (recognize) — the accurate
// signal for a well-drawn letter. The order-tolerant shape match (shapeGuess) only
// takes over in fusion territory (wrong stroke count) or when DTW is uncertain,
// so a letter drawn the wrong way still reads by its shape. The pathway check
// (pathwayMatch) is a SEPARATE signal that only sets green vs yellow — it never
// changes WHICH letter is guessed for a normally-drawn letter.
const YELLOW_CONF = 40;
const tierOf = (seg) => {
  if (seg.pathway) return 'green';
  if (seg.confidence >= YELLOW_CONF) return 'yellow';
  return 'red';
};
const TIER_TEXT = { green: 'text-green-600', yellow: 'text-amber-500', red: 'text-red-600' };
const TIER_BAR = { green: 'bg-green-500', yellow: 'bg-amber-500', red: 'bg-red-500' };
const TIER_BADGE = { green: '✓ correct pathway', yellow: '⚠ right letter, wrong pathway', red: '✗ no match' };

export default function LetterRecognitionCanvas({ templates }) {
  const [strokes, setStrokes] = useState([]);
  const [pauses, setPauses] = useState([]);
  const [current, setCurrent] = useState([]);
  const [result, setResult] = useState(null);
  const [guessing, setGuessing] = useState(false);
  const [mode, setMode] = useState('letter'); // 'letter' | 'stroke' | 'trace'
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
      if (mode === 'stroke') {
        const strokeResults = strokes.map((s, i) => ({
          idx: i,
          raw: s,
          ...classifyStroke(s),
          desc: describeStroke(s),
        }));
        const interaction = analyzeStrokesInteraction(strokes, strokeResults);
        const inferred = inferLetter(strokes, strokeResults);
        // Fused ideal-pathway match: join the strokes (any order, any count) onto
        // each taught pathway and take the closest. A 'k' drawn as 3 strokes or a
        // 'p' as bowl+stem matches its taught pathway once the strokes are joined,
        // instead of being misread stroke-by-stroke. This is the primary letter
        // authority; the per-stroke structural inference below is the fallback.
        const ranked = recognize(strokes, templates);
        const dtwLetter = ranked[0] ? ranked[0].letter : '?';
        const dtwConf = ranked[0] ? ranked[0].confidence : 0;
        const dtwDist = ranked[0] ? ranked[0].dist : Infinity;
        const sameLetter = dtwLetter !== '?' ? templates.filter((t) => t.letter === dtwLetter) : [];
        const pathway = sameLetter.some((t) => pathwayMatch(strokes, t));
        let guessLetter = null, guessKind = null;
        // Structural inference (bowl+stem → a/d/g/p/q/b, crossing diagonals →
        // x/y) is the reliable identity for MULTI-stroke drawings; the DTW
        // fusion misreads a 2-stroke 'a' as 'x'. Prefer the structural read when
        // it fires on 2+ strokes. (1-stroke keeps the DTW/pathway authority.)
        const multi = strokes.length >= 2;
        if (multi && inferred) { guessLetter = inferred.letter; guessKind = 'inferred'; }
        else if (pathway) { guessLetter = dtwLetter; guessKind = 'pathway'; }
        else if (isFinite(dtwDist) && dtwDist < 0.25) { guessLetter = dtwLetter; guessKind = 'dtw'; }
        else if (inferred) { guessLetter = inferred.letter; guessKind = 'inferred'; }
        setResult({ mode: 'stroke', strokeResults, interaction, inferred, ranked, pathway, guessLetter, guessKind, dtwConf, dtwDist });
        setGuessing(false);
        return;
      }
      if (mode === 'trace') {
        // Segment the ink into letter groups first (segmentByRecognition
        // already keeps i/j dots with their stems via the dot-above-shaft rule),
        // then trace-match each group separately. This lets the trace mode
        // recognize multi-letter words — each letter's taught pathway is traced
        // through its own ink cloud, not the whole word's.
        const groups = segmentByRecognition(strokes, spaceGap, templates);
        const segments = groups.map((g) => {
          const ranked = traceMatch(g, templates);
          const top = ranked[0] || null;
          return {
            letter: top ? top.letter : '?',
            confidence: top ? top.confidence : 0,
            coverage: top ? top.coverage : 0,
            extra: top ? top.extra : 0,
            ranked,
            strokesPx: g,
          };
        });
        setResult({ mode: 'trace', segments, word: segments.map((s) => s.letter).join(''), strokesPx: strokes });
        setGuessing(false);
        return;
      }
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
        // The letter IDENTITY comes from the DTW pathway match (recognize): it
        // compares the ink to each taught stroke pathway and is the ACCURATE
        // signal for a well-drawn letter — it tells a from o (the stem+hook the
        // bowl lacks), k from t (a diagonal is not a crossbar), w/z from s. It
        // already fuses multi-stroke drawings onto a fewer-stroke template, so a
        // normally-drawn letter reads correctly regardless of small start/speed
        // variance. The order-tolerant SHAPE match (shapeGuess) is a WEAKER
        // discriminator — it can't tell those apart by area alone — so it is only
        // consulted when DTW is in FUSION territory (the drawing's stroke count
        // differs from every same-count template, e.g. a 2-stroke 'b' against the
        // 1-stroke b template) or when DTW is genuinely uncertain. That is the
        // one case shape is the right identity signal: a letter drawn with the
        // wrong stroke count whose SHAPE is still clearly the letter. The
        // pathway check sets green (taught path followed) vs yellow (right letter,
        // wrong path) — never changing which letter wins for a normal drawing.
        const dtwRanked = recognize(g, templates);
        const dtwTop = dtwRanked[0] || null;
        const dtwLetter = dtwTop ? dtwTop.letter : '?';
        const dtwConf = dtwTop ? dtwTop.confidence : 0;
        const dtwPathwayOk = dtwLetter !== '?' && templates.filter((t) => t.letter === dtwLetter).some((t) => pathwayMatch(g, t));
        const dtwWinner = dtwLetter !== '?' ? templates.find((t) => t.letter === dtwLetter) : null;
        const sameCount = dtwWinner && dtwWinner.strokes.length === g.length;
        // Structural inference for MULTI-stroke segments: a bowl + stem
        // (a/d/g/p/q/b) or two crossing diagonals (x/y) read by GEOMETRY, not by
        // taught-pathway fusion. The DTW fusion misreads these — a 2-stroke 'a'
        // (a c-bowl + a stem) fuses onto the 2-stroke 'x' pathway and reads 'x'
        // with a green "correct pathway" badge — because the parts don't follow
        // any single-stroke template's taught path. The structural rules ("a bowl
        // with a short stem at the midline on the right of the bowl") are the
        // reliable identity signal here, so when they fire they override DTW.
        // Single-stroke segments skip this (DTW already reads them well), so a
        // clean 1-stroke 'a' or 'b' is still read by its taught pathway.
        let inferred = null;
        if (g.length >= 2) {
          const cls = g.map((s) => classifyStroke(s));
          inferred = inferLetter(g, cls);
        }
        let letter, confidence, ranked, pathway;
        if (inferred) {
          letter = inferred.letter;
          const infPathway = templates.filter((t) => t.letter === inferred.letter).some((t) => pathwayMatch(g, t));
          pathway = infPathway;
          confidence = infPathway ? 90 : (inferred.formation === 'correct' ? 82 : 64);
          const rest = dtwRanked.filter((r) => r.letter !== inferred.letter);
          ranked = [{ letter: inferred.letter, confidence, dist: 0 }, ...rest];
        } else if (dtwPathwayOk) {
          letter = dtwLetter; confidence = dtwConf; ranked = dtwRanked; pathway = true;
        } else if (sameCount && dtwConf >= YELLOW_CONF) {
          // Same stroke count, DTW confident, but the taught pathway wasn't
          // followed (e.g. slightly wrong direction/start). DTW is reliable here —
          // credit its letter, flag the pathway yellow.
          letter = dtwLetter; confidence = dtwConf; ranked = dtwRanked; pathway = false;
        } else {
          // Fusion territory (drawn stroke count ≠ any matching template) or DTW
          // uncertain: shape is the order-tolerant identity. A 2-stroke 'b' reads
          // as 'b' here even though the 1-stroke b pathway wasn't followed.
          const shapeRanked = shapeGuess(g, templates);
          const shapeTop = shapeRanked[0] || null;
          letter = shapeTop ? shapeTop.letter : dtwLetter;
          confidence = shapeTop ? shapeTop.confidence : dtwConf;
          ranked = shapeRanked; pathway = false;
        }
        return { letter, confidence, ranked, pathway, inferred, strokesPx: g };
      });
      setResult({ mode: 'letter', segments, word: segments.map((s) => s.letter).join('') });
      setGuessing(false);
    }, 60);
  };

  const single = result && result.mode === 'letter' && result.segments.length === 1;

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

      {/* Recognize letter / Recognize stroke toggle */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg text-xs font-semibold">
        <button
          onClick={() => { setMode('letter'); setResult(null); }}
          className={`px-3 py-1 rounded-md transition ${mode === 'letter' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500'}`}
        >
          Recognize letter
        </button>
        <button
          onClick={() => { setMode('stroke'); setResult(null); }}
          className={`px-3 py-1 rounded-md transition ${mode === 'stroke' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500'}`}
        >
          Recognize stroke
        </button>
        <button
          onClick={() => { setMode('trace'); setResult(null); }}
          className={`px-3 py-1 rounded-md transition ${mode === 'trace' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500'}`}
        >
          Recognize by trace
        </button>
      </div>

      {(mode === 'letter' || mode === 'trace') && (
        <>
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
        </>
      )}

      <div className="flex gap-2">
        <button
          onClick={guess}
          disabled={!strokes.length || guessing}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Sparkles className="w-4 h-4" /> {guessing ? 'Thinking…' : mode === 'stroke' ? 'Recognize strokes' : mode === 'trace' ? 'Trace match' : 'Guess my letters'}
        </button>
        <button
          onClick={clear}
          disabled={!strokes.length && !current.length}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" /> Clear
        </button>
      </div>

      {result && result.mode === 'stroke' && (
        <div className="w-full max-w-sm text-left space-y-2">
          {result.guessLetter ? (
            <div className="p-3 rounded-xl bg-indigo-50 border-2 border-indigo-300 text-center">
              <div className="text-sm font-semibold text-slate-600">I think this is</div>
              <div className="text-4xl font-bold text-indigo-600 leading-tight my-0.5">{result.guessLetter}</div>
              <div className="text-xs text-slate-500 leading-snug">
                {result.guessKind === 'pathway'
                  ? `Matched the taught pathway by joining your ${result.strokeResults.length} stroke${result.strokeResults.length === 1 ? '' : 's'}.`
                  : result.guessKind === 'dtw'
                    ? `Closest taught letter — ${result.dtwConf}% sure.`
                    : result.inferred
                      ? result.inferred.summary.replace(/^Looks like an? '.*?' — /, '')
                      : ''}
              </div>
              {result.guessKind === 'inferred' && result.inferred && result.inferred.note && (
                <div className="text-[10px] text-slate-400 mt-1">{result.inferred.note}</div>
              )}
            </div>
          ) : null}
          {result.ranked && result.guessKind !== 'inferred' && result.ranked.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold px-1">
                <span className="w-5">L</span>
                <span className="flex-1">match</span>
                <span className="w-10 text-right">%</span>
                <span className="w-24 text-right">dist / why excluded</span>
              </div>
              <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                {result.ranked.map((r) => (
                  <div key={r.letter} className="flex items-center gap-2">
                    <span className={`w-5 text-sm font-bold ${r === result.ranked[0] ? 'text-indigo-600' : 'text-slate-600'}`}>{r.letter}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${r === result.ranked[0] ? 'bg-indigo-500' : 'bg-slate-300'}`} style={{ width: `${r.confidence}%` }} />
                    </div>
                    <span className="w-10 text-right text-[10px] text-slate-400 tabular-nums">{r.confidence}%</span>
                    <span className="w-24 text-right text-[10px] text-slate-400 tabular-nums truncate" title={r.excludedBy || ''}>{isFinite(r.dist) ? r.dist.toFixed(2) : (r.excludedBy || '∞')}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 px-1">All saved letters, best first. Excluded letters show the gate that rejected them.</p>
            </div>
          )}
          <MatchOverlap segment={{ strokesPx: strokes, ranked: result.ranked.slice(0, 4) }} templates={templates} />
          <div className="text-sm font-bold text-slate-700 text-center">I see {result.strokeResults.length} stroke{result.strokeResults.length === 1 ? '' : 's'}:</div>
          {result.strokeResults.map((s) => (
            <div key={s.idx} className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
              <span className="shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-full bg-indigo-100 text-indigo-700">{s.idx + 1}</span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800">{s.desc}</div>
                <div className="text-[11px] text-slate-400">
                  {s.kind !== 'dot' && s.kind !== 'curve' && s.kind !== 'shoulder' && s.kind !== 'bowl' && s.kind !== 'hooked' && <>straightness {Math.round(s.straightness * 100)}%</>}
                  {s.kind === 'diagonal' && <> · {Math.round(s.angleDeg)}°</>}
                  {s.kind === 'curve' && <>straightness {Math.round(s.straightness * 100)}%</>}
                  {s.kind === 'shoulder' && <>{s.shoulder.humps ? `${s.shoulder.humps} hump${s.shoulder.humps === 1 ? '' : 's'}` : 'retrace'} · turn ≈{Math.round(s.shoulder.turnDeg)}°</>}
                  {s.kind === 'bowl' && <>{s.bowl.tailFrac > 0.12 ? `tail ${s.bowl.tailDir}` : 'closed loop'}{s.bowl.leadFrac > 0.12 ? ` · stem ${s.bowl.leadDir}` : ''}</>}
                  {s.kind === 'hooked' && <>{s.hook.stemKind} stem · hook {s.hook.hookDir}</>}
                </div>
              </div>
            </div>
          ))}
          {result.interaction && result.interaction.inferred && (
            <div className="mt-1 p-2.5 rounded-lg bg-indigo-50 border border-indigo-200">
              <div className="text-sm font-semibold text-indigo-700">{result.interaction.inferred.summary}</div>
              {result.interaction.inferred.note && (
                <div className="text-[11px] text-indigo-500 mt-0.5">{result.interaction.inferred.note}</div>
              )}
              <div className="text-[10px] text-slate-400 mt-1">
                {result.interaction.crossings.length} crossing{result.interaction.crossings.length === 1 ? '' : 's'} detected
              </div>
            </div>
          )}
        </div>
      )}

      {result && result.mode === 'trace' && (
        <div className="w-full max-w-sm text-left space-y-2">
          {result.segments.length === 1 && result.segments[0].letter !== '?' ? (
            <>
              <div className="p-3 rounded-xl bg-indigo-50 border-2 border-indigo-300 text-center">
                <div className="text-sm font-semibold text-slate-600">Best trace match</div>
                <div className="text-4xl font-bold text-indigo-600 leading-tight my-0.5">{result.segments[0].letter}</div>
                <div className="text-xs text-slate-500 leading-snug">
                  {Math.round(result.segments[0].coverage * 100)}% of the letter's path was traced · {Math.round(result.segments[0].extra * 100)}% waste ink
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  All your ink was treated as one shape; each letter's taught pathway was traced through it.
                </div>
              </div>
              <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                {result.segments[0].ranked.map((r, i) => (
                  <div key={r.letter} className="flex items-center gap-2">
                    <span className={`w-5 text-sm font-bold ${i === 0 ? 'text-indigo-600' : 'text-slate-600'}`}>{r.letter}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${i === 0 ? 'bg-indigo-500' : 'bg-slate-300'}`} style={{ width: `${r.confidence}%` }} />
                    </div>
                    <span className="w-28 text-right text-[10px] text-slate-400 tabular-nums truncate" title={r.excludedBy || ''}>
                      {isFinite(r.dist) ? `${Math.round(r.coverage * 100)}% cov · ${Math.round(r.extra * 100)}% waste` : (r.excludedBy || 'excluded')}
                    </span>
                  </div>
                ))}
              </div>
              <MatchOverlap segment={{ strokesPx: result.segments[0].strokesPx, ranked: result.segments[0].ranked.slice(0, 4) }} templates={templates} />
            </>
          ) : result.segments.length > 1 ? (
            <>
              <div className="text-lg font-bold text-slate-700 text-center">
                I think you wrote: <span className="text-2xl tracking-wider text-indigo-600">{result.word}</span>
              </div>
              <div className="space-y-2 text-left">
                {result.segments.map((seg, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-2">
                      <span className="w-14 text-xs text-slate-500">Letter {i + 1}</span>
                      <span className="w-5 text-lg font-bold text-indigo-600">{seg.letter}</span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${seg.confidence}%` }} />
                      </div>
                      <span className="w-20 text-right text-[10px] text-slate-400 tabular-nums">
                        {Math.round(seg.coverage * 100)}% cov · {Math.round(seg.extra * 100)}% waste
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center text-slate-500 p-3">No match — draw a letter first.</div>
          )}
        </div>
      )}

      {result && result.mode === 'letter' && (
        <div className="w-full max-w-xs text-center">
          {single ? (
            <>
              <div className="text-lg font-bold text-slate-700">
                I think you wrote:{' '}
                <span className={`text-2xl ${TIER_TEXT[tierOf(result.segments[0])]}`}>
                  {result.segments[0].letter}
                </span>{' '}
                <span className="text-sm font-normal text-slate-500">({result.segments[0].confidence}% sure)</span>{' '}
                <span className={`text-xs font-bold ${TIER_TEXT[tierOf(result.segments[0])]}`}>
                  {TIER_BADGE[tierOf(result.segments[0])]}
                </span>
              </div>
              {result.segments[0].inferred && (
                <div className="mt-1 text-xs text-amber-600 leading-snug">
                  {result.segments[0].inferred.summary}
                  {result.segments[0].inferred.note ? ` ${result.segments[0].inferred.note}` : ''}
                  {' '}— correct letter, but the taught stroke path wasn't followed.
                </div>
              )}
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold px-1">
                  <span className="w-5">L</span>
                  <span className="flex-1">match</span>
                  <span className="w-10 text-right">%</span>
                  <span className="w-24 text-right">dist / why excluded</span>
                </div>
                <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                  {result.segments[0].ranked.map((r) => (
                    <div key={r.letter} className="flex items-center gap-2">
                      <span className={`w-5 text-sm font-bold ${r === result.segments[0].ranked[0] ? TIER_TEXT[tierOf(result.segments[0])] : 'text-slate-600'}`}>{r.letter}</span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${r === result.segments[0].ranked[0] ? TIER_BAR[tierOf(result.segments[0])] : 'bg-slate-300'}`}
                          style={{ width: `${r.confidence}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-[10px] text-slate-400 tabular-nums">{r.confidence}%</span>
                      <span className="w-24 text-right text-[10px] text-slate-400 tabular-nums truncate" title={r.excludedBy || ''}>{isFinite(r.dist) ? r.dist.toFixed(2) : (r.excludedBy || '∞')}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 px-1">All saved letters, best first. Excluded letters show the gate that rejected them.</p>
              </div>
              <MatchOverlap segment={result.segments[0]} templates={templates} />
            </>
          ) : (
            <>
              <div className="text-lg font-bold text-slate-700">
                I think you wrote: <span className="text-2xl tracking-wider text-indigo-600">{result.word}</span>
              </div>
              <div className="mt-3 space-y-2 text-left">
                {result.segments.map((seg, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-2">
                      <span className="w-14 text-xs text-slate-500">Letter {i + 1}</span>
                      <span className={`w-5 text-lg font-bold ${TIER_TEXT[tierOf(seg)]}`}>{seg.letter}</span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${TIER_BAR[tierOf(seg)]}`} style={{ width: `${seg.confidence}%` }} />
                      </div>
                      <span className="w-8 text-right text-xs text-slate-400 tabular-nums">{seg.confidence}%</span>
                    </div>
                    {seg.inferred && (
                      <div className="ml-14 text-[11px] text-amber-600 leading-snug">
                        {seg.inferred.summary} — correct letter, wrong stroke path.
                      </div>
                    )}
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