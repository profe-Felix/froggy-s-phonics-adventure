// Shared pure functions and constants for letter/word tracing validation.
// Used by both LetterTracingCanvas (single letter) and WordTracingCanvas
// (whole word) so stroke validation is identical.

import { AUDIO_BASE } from '@/lib/audio';

export const HIT_RADIUS = 18;
export const WOBBLE_RADIUS = 85;
export const OFF_TRAVEL_BUDGET = 240;
export const FWD_RETRACE_RADIUS = 90;
export const MIN_MOVE = 5;
export const DIR_REJECT_DOT = -0.86;
export const COVERAGE_RADIUS = 22;
export const MIN_COVER_FRAC = 0.80;
export const MAX_GAP = 20;
export const START_TOL = 12;
export const END_TOL = 12;
// Dot strokes (the tittle on i/j) are tiny — a tap, not a drag. Give them a
// wider start tolerance and detect them by total pixel length so the strict
// drag/coverage/direction gates (meant for real strokes) can be skipped.
export const DOT_HIT_RADIUS = 42;
export const DOT_PIXEL_THRESHOLD = 14;

export const GUIDE_COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6'];

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function scale(pt, w, h) {
  if (!pt || pt.x == null || pt.y == null) return { x: 0, y: 0 };
  return { x: pt.x * w, y: pt.y * h };
}

// Densely sample a path through the waypoints. Sparse skeletons (≤12 control
// points, the new authoring format) are smoothed via Catmull-Rom so the
// student tracing path is a curve, not an angular polyline. Dense waypoints
// (old saved data, 64+ points) use linear interpolation at a fixed pixel step
// — identical to the previous behavior so existing letters validate the same.
import { catmullRom, resample } from '@/components/tracing/strokeMath';

export function buildDensePath(waypoints, scaleFn, step = 3) {
  const pts = waypoints.map(scaleFn);
  if (pts.length <= 1) return pts.slice();
  if (pts.length <= 12) {
    // Generate a smooth curve through the control points, then resample to a
    // fixed pixel step so coverage is proportional to actual path length.
    // Without resampling, catmullRom gives every segment the same number of
    // samples regardless of length — a short hook gets as many points as a
    // long stem, so drawing just the hook can cover 80%+ of the path while
    // the stem is never drawn. (This was the 'f' bug: the hook spanned 6 of
    // 7 segments so it got 86% of the dense points; the stem was 1 segment
    // with only 16, so the stroke validated as complete with only the hook.)
    const smooth = catmullRom(pts, 24);
    let totalLen = 0;
    for (let i = 1; i < smooth.length; i++) totalLen += dist(smooth[i], smooth[i - 1]);
    const n = Math.max(2, Math.round(totalLen / step));
    return resample(smooth, n);
  }
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

// Total arc length of a polyline — used to compare drawn ink length against
// the ideal path length. A smooth stroke ≈ ideal length; a zigzagging stroke
// that wobbles back and forth across the corridor is much longer.
function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i], pts[i - 1]);
  return len;
}

// Score a finished stroke 0–100: each drawn point's closeness to the nearest
// ideal point is averaged (proximity), then scaled by a length factor. A
// zigzag that stays in the wobble corridor scores high on proximity alone,
// but its ink is far longer than the ideal path — so the length factor
// (idealLen / drawnLen, with a 10% tolerance) pulls the score down. A smooth,
// clean trace has drawnLen ≈ idealLen and keeps its full proximity score.
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
  const proximityScore = sum / drawnPts.length;

  let lengthFactor = 1;
  if (drawnPts.length > 1 && idealDense.length > 1) {
    const drawnLen = pathLength(drawnPts);
    const idealLen = pathLength(idealDense);
    if (drawnLen > 0 && idealLen > 0) {
      const ratio = drawnLen / idealLen;
      if (ratio > 1.1) lengthFactor = 1.1 / ratio;
    }
  }

  return Math.round(proximityScore * lengthFactor);
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

// A "dot stroke" is one whose ideal path is essentially a single point (the
// tittle on a lowercase i or j). Its dense path is only a few px long, so a
// tap — not a drag — is the correct gesture. The normal gates (direction,
// wobble, forward-only coverage) unfairly reject a tap, so callers detect
// dot strokes via this helper and accept a press-and-lift instead.
export function isDotStroke(densePath) {
  if (!densePath || !densePath.length) return false;
  if (densePath.length === 1) return true;
  let len = 0;
  for (let i = 1; i < densePath.length; i++) len += dist(densePath[i], densePath[i - 1]);
  return len < DOT_PIXEL_THRESHOLD;
}

// Multisensory fonema audio — files live in the Supabase "audio" bucket under
// {lang}/letters/fonemas/, named by the plain lowercase letter: m.mp3, e.mp3, etc.
export function fonemaUrl(letter, lang = 'es') {
  return `${AUDIO_BASE}/${lang}/letters/fonemas/${letter.toLowerCase()}.mp3`;
}

// Compute the layout for a word: each letter's actual ink bounds (minX/maxX
// across all its strokes), pixel width, and x-offset. Letters are placed
// left-to-right based on their real ink width plus a small gap so the word
// reads as a connected unit instead of sitting in fixed-width cells.
export function computeWordLayout(word, waypoints, xScale = 300, gap = 20, padding = 30, repetitions = 3, wordGap = 80) {
  const baseLetters = word.split('').filter(l => waypoints[l]);
  let cursor = padding;
  const layout = [];
  for (let rep = 0; rep < repetitions; rep++) {
    if (rep > 0) cursor += wordGap;
    for (const ch of baseLetters) {
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
      layout.push({ ch, minX, maxX, width, offset, rep });
    }
  }
  const totalW = Math.max(xScale, cursor + padding);
  return { letters: layout.map(l => l.ch), layout, totalW, wordLength: baseLetters.length, repetitions };
}