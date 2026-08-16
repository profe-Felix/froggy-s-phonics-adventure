// Shared pure functions and constants for letter/word tracing validation.
// Used by both LetterTracingCanvas (single letter) and WordTracingCanvas
// (whole word) so stroke validation is identical.

import { AUDIO_BASE } from '@/lib/audio';

export const HIT_RADIUS = 14;
export const WOBBLE_RADIUS = 62;
export const OFF_TRAVEL_BUDGET = 140;
export const FWD_RETRACE_RADIUS = 70;
export const MIN_MOVE = 5;
export const DIR_REJECT_DOT = -0.78;
export const COVERAGE_RADIUS = 16;
export const MIN_COVER_FRAC = 0.95;
export const MAX_GAP = 10;
export const START_TOL = 6;
export const END_TOL = 5;

export const GUIDE_COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6'];

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function scale(pt, w, h) {
  if (!pt || pt.x == null || pt.y == null) return { x: 0, y: 0 };
  return { x: pt.x * w, y: pt.y * h };
}

// Densely sample a path by interpolating between waypoints at a fixed pixel
// step. Takes a scale function so the same logic works for single-letter and
// multi-letter (word) canvases with different coordinate transforms.
export function buildDensePath(waypoints, scaleFn, step = 3) {
  const pts = waypoints.map(scaleFn);
  if (pts.length === 1) return [pts[0]];
  const dense = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const segLen = dist(a, b);
    const n = Math.max(1, Math.round(segLen / step));
    for (let j = 0; j < n; j++) {
      const t = j / n;
      dense.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  dense.push(pts[pts.length - 1]);
  return dense;
}

// Score a finished stroke 0–100: each drawn point's closeness to the nearest
// ideal point is averaged.
export function strokeAccuracy(drawnPts, idealDense, penalty = 30) {
  if (!drawnPts.length || !idealDense.length) return 100;
  let sum = 0;
  for (const p of drawnPts) {
    let minD = Infinity;
    for (const q of idealDense) {
      const d = dist(p, q);
      if (d < minD) minD = d;
    }
    sum += Math.max(0, 100 * (1 - minD / penalty));
  }
  return Math.round(sum / drawnPts.length);
}

// Decide whether the pen has traced enough of the ideal path to count the
// stroke complete (coverage fraction, max gap, start + end reached).
export function coverageComplete(visited, denseLen) {
  if (denseLen <= 1) return true;
  const sorted = [...visited].sort((a, b) => a - b);
  if (!sorted.length) return false;
  let maxGap = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    maxGap = Math.max(maxGap, sorted[i] - sorted[i - 1] - 1);
  }
  maxGap = Math.max(maxGap, denseLen - 1 - sorted[sorted.length - 1]);
  const frac = sorted.length / denseLen;
  const startCovered = sorted[0] <= START_TOL;
  const endCovered = denseLen - 1 - sorted[sorted.length - 1] <= END_TOL;
  return frac >= MIN_COVER_FRAC && maxGap <= MAX_GAP && startCovered && endCovered;
}

// Multisensory fonema audio — files live in the Supabase "audio" bucket under
// {lang}/letters/fonemas/, named per case:
// A_mayu_fonema.mp3 (uppercase) / a_minu_fonema.mp3 (lowercase).
export function fonemaUrl(letter, lang = 'es') {
  const isUpper = letter && letter.length === 1 && letter === letter.toUpperCase() && letter !== letter.toLowerCase();
  const name = isUpper ? `${letter}_mayu_fonema` : `${letter.toLowerCase()}_minu_fonema`;
  return `${AUDIO_BASE}/${lang}/letters/fonemas/${name}.mp3`;
}

// Compute the layout for a word: each letter's actual ink bounds (minX/maxX
// across all its strokes), pixel width, and x-offset. Letters are placed
// left-to-right based on their real ink width plus a small gap so the word
// reads as a connected unit instead of sitting in fixed-width cells.
export function computeWordLayout(word, waypoints, xScale = 300, gap = 20) {
  const letters = word.split('').filter(l => waypoints[l]);
  let cursor = 0;
  const layout = letters.map((ch) => {
    const letterStrokes = waypoints[ch]?.strokes || [];
    let minX = Infinity, maxX = -Infinity;
    for (const stroke of letterStrokes) {
      if (!Array.isArray(stroke)) continue;
      for (const p of stroke) {
        if (p && p.x != null) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
        }
      }
    }
    if (!isFinite(minX)) { minX = 0; maxX = 1; }
    const width = (maxX - minX) * xScale;
    const offset = cursor;
    cursor += width + gap;
    return { ch, minX, maxX, width, offset };
  });
  const totalW = Math.max(xScale, cursor);
  return { letters, layout, totalW };
}