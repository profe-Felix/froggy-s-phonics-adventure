// Stroke-interaction analysis for "recognize stroke" mode.
//
// Per-stroke classification (straight line / curve / shoulder / bowl / hook) is
// only half the story: a 'y' is two diagonals that CROSS, an 'x' is two
// diagonals that cross without a tail. This module looks at how the strokes
// relate — where they intersect, which guide lines each spans — and infers the
// intended letter from the COMBINATION. The point is that a student who veers
// from the taught stroke order or shape can still be read: two crossing
// diagonals with a descending tail read as 'y' whether or not the formation was
// textbook, so we can deduct for formation but still credit the right letter.

import { CANVAS_W, CANVAS_H } from '@/components/tracing/strokeMath';
import { GUIDES } from '@/lib/strokeClassify';

function nearestGuide(y) {
  let best = GUIDES[0], bd = Infinity;
  for (const g of GUIDES) { const d = Math.abs(g.y - y); if (d < bd) { bd = d; best = g; } }
  return best;
}

// Segment intersection of [a1,a2] and [b1,b2] in canvas px. Returns the crossing
// point plus t,u (fraction along each segment) or null if they don't cross.
function segCross(a1, a2, b1, b2) {
  const r1 = a2.x - a1.x, r2 = a2.y - a1.y;
  const s1 = b2.x - b1.x, s2 = b2.y - b1.y;
  const denom = r1 * s2 - r2 * s1;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((b1.x - a1.x) * s2 - (b1.y - a1.y) * s1) / denom;
  const u = ((b1.x - a1.x) * r2 - (b1.y - a1.y) * r1) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a1.x + t * r1, y: a1.y + t * r2, t, u };
}

// First crossing between two strokes (canvas px). tA/tB are fractions along
// each stroke where the crossing happens.
function strokesCrossing(A, B) {
  for (let i = 0; i < A.length - 1; i++) {
    for (let j = 0; j < B.length - 1; j++) {
      const c = segCross(A[i], A[i + 1], B[j], B[j + 1]);
      if (c) return { x: c.x, y: c.y, tA: c.t, tB: c.u };
    }
  }
  return null;
}

function strokeExtent(rawPx) {
  let minY = Infinity, maxY = -Infinity;
  let minX = Infinity, maxX = -Infinity;
  for (const p of rawPx) {
    const yn = p.y / CANVAS_H, xn = p.x / CANVAS_W;
    if (yn < minY) minY = yn; if (yn > maxY) maxY = yn;
    if (xn < minX) minX = xn; if (xn > maxX) maxX = xn;
  }
  return { minY, maxY, minX, maxX, cx: (minX + maxX) / 2, topGuide: nearestGuide(minY), botGuide: nearestGuide(maxY) };
}

// Visual lean of a straight stroke, from its actual drawn chord (not the
// classified kind — a steep 'y' tail reads as "vertical" but still leans left).
//   -1 = '\'  (upper-left → lower-right, or lower-right → upper-left)
//   +1 = '/'  (upper-right → lower-left, or lower-left → upper-right)
//    0 = vertical or horizontal — no lean (can't be a 'y'/'x' branch)
function leanSign(rawPx) {
  const a = rawPx[0], b = rawPx[rawPx.length - 1];
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) < 1 || Math.abs(dy) < 1) return 0;
  return dx * dy > 0 ? -1 : 1;
}

// A 'y' is two diagonals of OPPOSITE slope that cross, where one branch stops at
// the baseline and the other carries down to the descender. An 'x' is the same
// two crossing diagonals but BOTH stop at the baseline (no tail). The descender
// is what separates them — so a student who forms the branches backwards still
// gets credit for the right letter, just with a formation note.
function inferFromDiagonals(cls, strokes, exts, crossings) {
  if (cls.length !== 2) return null;
  // Both strokes must be straight stems (a line, not a curve/loop/hook).
  if (cls[0].kind !== 'vertical' && cls[0].kind !== 'diagonal') return null;
  if (cls[1].kind !== 'vertical' && cls[1].kind !== 'diagonal') return null;
  const s0 = leanSign(strokes[0]), s1 = leanSign(strokes[1]);
  if (!s0 || !s1 || s0 === s1) return null;        // need opposite leans
  if (!crossings.length) return null;             // need them to actually cross
  const cross = crossings[0];
  const crossGuide = nearestGuide(cross.y / CANVAS_H).label;
  const descOne = exts.some(e => e.botGuide.key === 'descender');
  if (descOne) {
    const cleanBranch = exts.some(e => e.botGuide.key === 'baseline') && exts.some(e => e.botGuide.key === 'descender');
    return {
      letter: 'y',
      formation: cleanBranch ? 'correct' : 'approximate',
      summary: `Looks like a 'y' — two crossing strokes near the ${crossGuide}, one tail down to the descender.`,
      note: cleanBranch ? '' : "Reads as 'y' even though the branches weren't formed cleanly.",
    };
  }
  const bothShort = exts.every(e => e.botGuide.key === 'baseline' || e.botGuide.key === 'midline');
  if (bothShort) {
    return {
      letter: 'x',
      formation: 'correct',
      summary: `Looks like an 'x' — two crossing strokes near the ${crossGuide}, both between midline and baseline.`,
      note: '',
    };
  }
  return null;
}

// A bowl + a vertical stem. Where the stem sits relative to the bowl and which
// way it points tells the letter:
//   stem on the RIGHT, short (midline→baseline)  → 'a'
//   stem on the RIGHT, up to the ascender        → 'd'
//   stem on the RIGHT, down to the descender      → 'q' (straight) or 'g' (hooked tail)
//   stem on the LEFT,  up to the ascender         → 'b'
//   stem on the LEFT,  down to the descender      → 'p'
// The bowl always lives in the midline–baseline zone; the stem must touch its
// edge so a floating circle + a stray line don't read as a letter.
// Does a descending stem finish with a leftward hook (a 'g' tail)? The stem
// may still classify as a plain "vertical line" because the hook is small, so we
// look at the raw points: the tail end sits clearly left of the stem's column.
function stemHooksLeft(rawPx) {
  const N = rawPx.length;
  if (N < 6) return false;
  const head = rawPx.slice(0, Math.floor(N * 0.6));
  const col = head.reduce((s, p) => s + p.x, 0) / head.length;
  const tailEnd = rawPx[rawPx.length - 1];
  return col - tailEnd.x > 12;
}

function inferBowlStem(cls, strokes, exts) {
  if (cls.length !== 2) return null;
  // The "bowl" is a closed loop (kind 'bowl') OR a bowl-shaped curve: an open
  // arc (the 'a' bowl drawn as a 'c'-like curve "opening to the right") or a
  // loop that detectBowl missed but the curve analyzer still called "closed".
  // A multi-hump arch (m/w, 2+ humps) or an S-curve is NOT a bowl.
  const bowlIdx = cls.findIndex((c) => {
    if (c.kind === 'bowl') return true;
    if (c.kind === 'curve') {
      const cv = c.curve;
      if (!cv) return false;
      if (cv.sCurve) return false;
      return cv.closed || cv.humps <= 1;
    }
    return false;
  });
  if (bowlIdx < 0) return null;
  const stemIdx = bowlIdx === 0 ? 1 : 0;
  const stemCls = cls[stemIdx];
  const stemRaw = strokes[stemIdx];
  if (stemCls.kind !== 'vertical' && stemCls.kind !== 'hooked') return null;
  const bowl = exts[bowlIdx], stem = exts[stemIdx];
  // bowl sits in the midline–baseline zone
  if (bowl.botGuide.key !== 'baseline' && bowl.botGuide.key !== 'midline') return null;
  // stem touches/overlaps the bowl horizontally (at its edge, not floating)
  const xGap = Math.max(bowl.minX - stem.maxX, stem.minX - bowl.maxX, 0);
  if (xGap > 0.10) return null;
  // stem overlaps the bowl vertically (they connect)
  if (stem.minY > bowl.maxY || stem.maxY < bowl.minY) return null;

  const stemRight = stem.cx > bowl.cx;
  const ascends = stem.topGuide.key === 'ascender';
  const descends = stem.botGuide.key === 'descender';
  // A descender that finishes with a leftward hook is a TAIL (g/q), whether or
  // not the stroke was curvy enough to classify as 'hooked' — a fairly-straight
  // drop with a small left hook still reads as a 'g' tail, not a 'p' stem.
  const hasTail = stemCls.kind === 'hooked' || stemHooksLeft(stemRaw);

  let letter = null, formation = 'approximate', note = '';
  if (stemRight) {
    if (ascends) letter = 'd';
    else if (descends) letter = hasTail ? 'g' : 'q';
    else if (stem.topGuide.key === 'midline') letter = 'a';
  } else {
    if (ascends) letter = 'b';
    else if (descends) letter = hasTail ? 'g' : 'p';
  }
  if (!letter) return null;
  if (letter === 'd' || letter === 'b') formation = ascends ? 'correct' : 'approximate';
  if (letter === 'p' || letter === 'q' || letter === 'g') formation = descends ? 'correct' : 'approximate';
  if (letter === 'a') formation = stem.topGuide.key === 'midline' && stem.botGuide.key === 'baseline' ? 'correct' : 'approximate';
  if (letter === 'g' && stemCls.kind !== 'hooked') note = 'Calling it "g" because of the leftward hook at the end of the tail.';

  const dirWord = ascends ? 'a tall stem up to the ascender' : descends ? (hasTail ? 'a tail down to the descender' : 'a stem down to the descender') : 'a short stem at the midline';
  const sideWord = stemRight ? 'right of the bowl' : 'left of the bowl';
  const article = 'aeiou'.includes(letter) ? 'an' : 'a';
  return {
    letter,
    formation,
    summary: `Looks like ${article} '${letter}' — a bowl with ${dirWord} on the ${sideWord}.`,
    note,
  };
}

// Given raw strokes and their per-stroke classifications, return how they
// interact: the pairwise crossings and the best letter inference (if any).
export function analyzeStrokesInteraction(strokes, strokeResults) {
  if (!strokes || strokes.length < 2) return null;
  const cls = strokeResults;
  const exts = strokes.map(strokeExtent);
  const crossings = [];
  for (let i = 0; i < strokes.length; i++) {
    for (let j = i + 1; j < strokes.length; j++) {
      const c = strokesCrossing(strokes[i], strokes[j]);
      if (c) crossings.push({ ...c, a: i, b: j });
    }
  }
  // More interaction rules can be added here (t-crossings for 't', etc.).
  const inferred = inferFromDiagonals(cls, strokes, exts, crossings) || inferBowlStem(cls, strokes, exts);
  return { crossings, inferred };
}