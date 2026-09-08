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
export const END_TOL = 4;
// Dot strokes (the tittle on i/j) are tiny — a tap, not a drag. Give them a
// wider start tolerance and detect them by total pixel length so the strict
// drag/coverage/direction gates (meant for real strokes) can be skipped.
export const DOT_HIT_RADIUS = 42;
export const DOT_PIXEL_THRESHOLD = 14;
// How far the pen may travel past the end of the ideal path before the stroke
// restarts. The "Lift your finger!" message shows as soon as the end is reached,
// but the stroke CONTINUES so the student learns to stop on their own; going
// past this budget (into the descender zone) restarts the stroke.
export const POST_COMPLETE_BUDGET = 40;

export const GUIDE_COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6'];

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function scale(pt, w, h) {
  if (!pt || pt.x == null || pt.y == null) return { x: 0, y: 0 };
  return { x: pt.x * w, y: pt.y * h };
}

// Densely sample a path through the waypoints at a fixed pixel step so
// coverage is proportional to actual path length. Linear interpolation is
// used for ALL skeletons (sparse and dense) because:
//  1. It distributes points proportional to segment length — catmullRom
//     gave every segment the same sample count, so a short hook could cover
//     86% of the path while a long stem got 14% (the 'f' bug).
//  2. It handles retraces correctly — catmullRom creates a smooth curve
//     through turn-around points (e.g. the 'a' stem goes up then down),
//     overshooting above the top and curving back, which distorts the path.
//  3. Corner flags are preserved on control points so the "Show me" replay
//     (which renders the dense path via splinePathD) still shows crisp turns.
// The display layer (splinePathD / catmullRom in StrokeAuthoringCanvas)
// handles smooth visual rendering separately from this validation path.

export function buildDensePath(waypoints, scaleFn, step = 3) {
  const pts = waypoints.map(scaleFn);
  if (pts.length <= 1) return pts.slice();
  const dense = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const segLen = dist(a, b);
    const n = Math.max(1, Math.round(segLen / step));
    for (let j = 0; j < n; j++) {
      const t = j / n;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      // Preserve corner flag on control points so splinePathD replay
      // renders crisp turns at the right positions.
      if (j === 0 && a.corner) p.corner = true;
      dense.push(p);
    }
  }
  const last = pts[pts.length - 1];
  const lastP = { x: last.x, y: last.y };
  if (last.corner) lastP.corner = true;
  dense.push(lastP);
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
      // Penalize SHORT strokes too — a clean trace that stops short of the
      // end (a "floating" letter) shouldn't score 99%. Without this, only
      // overly-long zigzags got penalized; a short clean stroke kept full marks.
      else if (ratio < 0.9) lengthFactor = ratio / 0.9;
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

// The letter waypoints use y: T=0.10 (top), M=0.42 (midline/x-height),
// B=0.72 (baseline), D=0.92 (descender). Two thresholds drive the tucking:
//   MIDLINE_Y (0.42): ink below this is the "stem" region — rightLower is
//     the rightmost x in this region. For Y/T the stem is narrow, so the
//     next letter can tuck closer.
//   UPPER_THRESHOLD (0.25): ink above this is a true ascender (h, l, k, b, d,
//     f, t). Round letters (o, e, a) have arcs that slightly exceed the
//     midline (~0.38-0.41) but are NOT ascenders — the 0.25 cutoff excludes
//     them so they can still tuck under a previous letter's arm.
const MIDLINE_Y = 0.42;
const UPPER_THRESHOLD = 0.25;

// Compute the layout for a word: each letter's actual ink bounds (minX/maxX
// across all its strokes), pixel width, and x-offset. Letters are placed
// left-to-right based on their real ink width plus a small gap so the word
// reads as a connected unit instead of sitting in fixed-width cells.
// Letters with wide tops but narrow stems (Y, T) let the next letter tuck
// under their arm when the next letter has no ascender.
export function computeWordLayout(word, waypoints, xScale = 300, gap = 20, padding = 30, repetitions = 3, wordGap = 80, useFixedCells = false) {
  const baseLetters = word.split('').filter(l => waypoints[l]);

  // Pre-pass: compute per-letter bounds including the split between
  // upper ink (above midline — arms/ascender) and lower ink (below midline
  // — stem/body). This drives the tucking logic.
  const letterBounds = baseLetters.map(ch => {
    const letterStrokes = waypoints[ch]?.strokes || [];
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let rightLower = -Infinity; // rightmost x of ink below midline (stem)
    let hasUpper = false;       // true ascender (ink above UPPER_THRESHOLD)
    for (const stroke of letterStrokes) {
      if (!Array.isArray(stroke)) continue;
      for (const p of stroke) {
        if (p && p.x != null) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y != null) {
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
            if (p.y > MIDLINE_Y) {
              if (p.x > rightLower) rightLower = p.x;
            }
            if (p.y < UPPER_THRESHOLD) {
              hasUpper = true;
            }
          }
        }
      }
    }
    if (!isFinite(minX)) { minX = 0; maxX = 1; }
    if (!isFinite(minY)) { minY = 0; maxY = 1; }
    if (!isFinite(rightLower)) rightLower = maxX; // no lower ink — use full
    return { minX, maxX, minY, maxY, rightLower, hasUpper };
  });

  // First pass: when useFixedCells is set, compute the max ink width across
  // all letters so every letter gets the same cell width (like a fixed-width
  // font). This prevents letters with wide strokes (j, q, T, Y) from
  // overlapping their neighbors — each letter is centered in its cell.
  let fixedCellWidth = null;
  if (useFixedCells) {
    let maxInkWidth = 0;
    for (const ch of baseLetters) {
      const ls = waypoints[ch]?.strokes || [];
      let mnX = Infinity, mxX = -Infinity;
      for (const stroke of ls) {
        if (!Array.isArray(stroke)) continue;
        for (const p of stroke) {
          if (p && p.x != null) {
            if (p.x < mnX) mnX = p.x;
            if (p.x > mxX) mxX = p.x;
          }
        }
      }
      if (isFinite(mnX) && isFinite(mxX)) {
        maxInkWidth = Math.max(maxInkWidth, (mxX - mnX) * xScale);
      }
    }
    fixedCellWidth = maxInkWidth;
  }

  let lastRightEdge = padding; // pixel x where the next letter can start
  const layout = [];
  for (let rep = 0; rep < repetitions; rep++) {
    if (rep > 0) lastRightEdge += wordGap;
    for (let i = 0; i < baseLetters.length; i++) {
      const ch = baseLetters[i];
      const b = letterBounds[i];
      const inkWidth = (b.maxX - b.minX) * xScale;
      const cellWidth = fixedCellWidth != null ? Math.max(fixedCellWidth, inkWidth) : inkWidth;
      const inkOffset = fixedCellWidth != null ? (cellWidth - inkWidth) / 2 : 0;

      let offset;
      if (i === 0) {
        // First letter in this repetition — starts at the cursor.
        offset = lastRightEdge + inkOffset;
      } else {
        const prev = letterBounds[i - 1];
        const prevLayout = layout[layout.length - 1];
        if (!useFixedCells && !b.hasUpper && prev.rightLower < prev.maxX) {
          // This letter has no ascender — it can tuck under the previous
          // letter's arm. Space from the previous letter's STEM right edge
          // (below midline), not its full right edge (which includes the arm).
          const prevRightLowerPx = prevLayout.offset + (prev.rightLower - prev.minX) * xScale;
          offset = prevRightLowerPx + gap + inkOffset;
        } else {
          // Standard: space from the previous letter's full right edge.
          const prevRightFullPx = prevLayout.offset + (prev.maxX - prev.minX) * xScale;
          offset = prevRightFullPx + gap + inkOffset;
        }
      }

      lastRightEdge = offset + inkWidth;
      layout.push({ ch, minX: b.minX, maxX: b.maxX, minY: b.minY, maxY: b.maxY, width: cellWidth, offset, rep });
    }
  }
  const totalW = Math.max(xScale, lastRightEdge + padding);
  return { letters: layout.map(l => l.ch), layout, totalW, wordLength: baseLetters.length, repetitions };
}