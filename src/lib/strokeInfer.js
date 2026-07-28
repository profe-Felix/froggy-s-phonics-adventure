// Structural letter inference for "recognize stroke" mode.
//
// Per-stroke classification (classifyStroke) already describes each stroke
// (bowl, shoulder, curve, line …). This module maps the SHAPE of the stroke(s)
// to a LETTER — so a single-stroke 'b' (stem + bowl) or a 'u' (cup) is read as
// the letter from its geometry, not from a taught-pathway template match. It is
// the single-stroke counterpart to strokeInteract's multi-stroke rules.
//
// This is deliberately a different signal from the DTW template matcher in
// letterRecognize: that one rewards following the taught stroke order/direction;
// this one rewards drawing the right SHAPES. A student who forms the letter
// correctly but in the "wrong" order still gets the right letter here.

import { CANVAS_W, CANVAS_H } from '@/components/tracing/strokeMath';
import { GUIDES } from '@/lib/strokeClassify';
import { analyzeStrokesInteraction } from '@/lib/strokeInteract';
import { drawingHasCrossbar } from '@/lib/letterRecognize';

const ASC = 0.22;   // above this y = reaches the ascender
const DESC = 0.78;  // below this y = reaches the descender

function nearestGuide(y) {
  let best = GUIDES[0], bd = Infinity;
  for (const g of GUIDES) { const d = Math.abs(g.y - y); if (d < bd) { bd = d; best = g; } }
  return best;
}

function extent(raw) {
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  for (const p of raw) {
    const yn = p.y / CANVAS_H, xn = p.x / CANVAS_W;
    if (yn < minY) minY = yn; if (yn > maxY) maxY = yn;
    if (xn < minX) minX = xn; if (xn > maxX) maxX = xn;
  }
  return { minY, maxY, minX, maxX, cx: (minX + maxX) / 2, topGuide: nearestGuide(minY), botGuide: nearestGuide(maxY) };
}

function arc(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return L; }

// For a bowl stroke with a stem attached (single-stroke b/d/a), which side is
// the stem on? The stem is the longer of the lead (before the loop) / tail
// (after the loop); compare its x-center to the loop's x-center.
function stemSideOfBowl(raw, bowl) {
  if (!bowl) return null;
  const bi = bowl.loopStartIdx, ci = bowl.closureIdx;
  const loop = raw.slice(bi, ci + 1);
  if (loop.length < 2) return null;
  const loopCx = loop.reduce((s, p) => s + p.x, 0) / loop.length;
  const lead = raw.slice(0, bi);
  const tail = raw.slice(ci + 1);
  const la = arc(lead), ta = arc(tail);
  let stem;
  if (la > ta && la > 0) stem = lead;
  else if (ta > 0) stem = tail;
  else return null;
  if (stem.length < 2) return null;
  const stemCx = stem.reduce((s, p) => s + p.x, 0) / stem.length;
  return stemCx < loopCx ? 'left' : 'right';
}

function guess(letter, why) {
  return { letter, formation: 'structural', summary: `Looks like a '${letter}' — ${why}.`, note: 'Inferred from the stroke shape, not a taught-pathway match.' };
}

// Infer a letter from a SINGLE stroke's classification.
export function inferSingleStrokeLetter(cls, raw) {
  if (!cls || cls.kind === 'dot') return null;
  const e = extent(raw);
  const ascends = e.minY < ASC;
  const descends = e.maxY > DESC;
  const k = cls.kind;

  if (k === 'vertical') {
    if (ascends) return guess('l', 'a tall vertical stroke from the ascender to the baseline');
    return guess('i', 'a short vertical stroke at the midline');
  }
  if (k === 'shoulder') {
    const h = cls.shoulder?.humps || 0;
    if (h >= 2) return guess('m', `${h} arches in a row`);
    if (h === 1) {
      // 'r' is a stem with a small hook that does NOT return to the baseline;
      // 'n'/'h' have a full arch that comes back down to the baseline.
      const endsNearBase = raw[raw.length - 1].y / CANVAS_H > 0.58;
      if (!endsNearBase) return guess('r', 'a stem with a small hook at the top');
      return guess(ascends ? 'h' : 'n', ascends ? 'a tall stem with one arch down to the baseline' : 'one arch from the midline down to the baseline');
    }
    return null;
  }
  if (k === 'bowl') {
    const b = cls.bowl || {};
    // The eye flag can be suppressed when the stroke has a near-vertical lead-in
    // (an 'e' drawn bottom-to-top reads as "stem + bowl"), so also detect the
    // crossbar geometrically — a straight horizontal bar through the loop is an
    // 'e' regardless of how the stroke was entered.
    if (b.eye || drawingHasCrossbar([raw])) return guess('e', 'a closed loop with a horizontal crossbar (the eye)');
    const hasStem = b.leadFrac > 0.15 || b.tailFrac > 0.15;
    if (ascends) {
      const side = stemSideOfBowl(raw, b);
      if (side === 'left') return guess('b', 'a stem up to the ascender with a bowl on the right');
      if (side === 'right') return guess('d', 'a bowl with a stem up to the ascender on the right');
      return null;
    }
    if (descends) return guess('g', 'a bowl with a tail down to the descender');
    // midzone bowl: 'a' (bowl + short stem) vs 'o' (round, no stem)
    if (hasStem) return guess('a', 'a bowl with a short stem on the side');
    return guess('o', 'a round closed loop');
  }
  if (k === 'curve') {
    const cv = cls.curve || {};
    if (cv.closed) return drawingHasCrossbar([raw]) ? guess('e', 'a closed loop with a horizontal crossbar') : guess('o', 'a closed loop');
    if (cv.sCurve) return guess('s', 'an S-curve');
    if (cv.cup) return guess('u', 'a curve opening upward');
    const h = cv.humps || 1;
    if (h >= 2) {
      if (cv.opens && /up/.test(cv.opens)) return guess('w', 'two valleys opening upward');
      return guess('m', 'two arches');
    }
    if (cv.opens) {
      if (/right/.test(cv.opens)) return guess('c', 'a curve opening to the right');
      if (/down/.test(cv.opens)) return guess('n', 'an arch opening downward');
    }
    return null;
  }
  if (k === 'zigzag') return guess('z', "a 'z' — a top bar, a diagonal, and a bottom bar");
  if (k === 'hooked') return guess('j', 'a straight stem with a hook curving at the bottom');
  if (k === 'topHook') {
    if (ascends) return guess('f', 'a curve over the top that straightens into a tall stem');
    return guess('t', 'a curve over the top that straightens into a short stem');
  }
  if (k === 'bent') {
    const b = cls.bend || {};
    if (b.kind1 === 'diagonal' && b.kind2 === 'diagonal') return guess('v', 'two diagonal strokes meeting at a point');
    return null;
  }
  return null;
}

// Unified entry: infer a letter from one or more strokes.
export function inferLetter(strokes, classifications) {
  if (!strokes || !strokes.length) return null;
  if (strokes.length === 1) return inferSingleStrokeLetter(classifications[0], strokes[0]);
  const inter = analyzeStrokesInteraction(strokes, classifications);
  return inter && inter.inferred ? inter.inferred : null;
}