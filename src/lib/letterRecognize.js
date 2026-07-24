import { resample, CANVAS_W, CANVAS_H } from '@/components/tracing/strokeMath';

const R = 24; // resampled points per stroke

// Turn a letter (array of strokes) into one centered, unit-scaled sequence:
// each stroke is resampled to R points, then all are concatenated in stroke
// order. Centering on the centroid + scaling to the max dimension removes
// position and size, so we compare pure shape.
function letterToSequence(strokes) {
  if (!strokes || !strokes.length) return [];
  const per = strokes.map((s) => resample(s, R)).filter((s) => s && s.length);
  const all = per.flat();
  if (!all.length) return [];
  let cx = 0, cy = 0;
  for (const p of all) { cx += p.x; cy += p.y; }
  cx /= all.length; cy /= all.length;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const tr = all.map((p) => {
    const x = p.x - cx, y = p.y - cy;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    return { x, y };
  });
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  return tr.map((p) => ({ x: p.x / span, y: p.y / span }));
}

// Classic DTW distance between two 2D point sequences. Handles different
// lengths (different stroke counts) by warping.
function dtw(s, t) {
  const n = s.length, m = t.length;
  if (!n || !m) return Infinity;
  let prev = new Array(m + 1).fill(Infinity);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    const cur = new Array(m + 1).fill(Infinity);
    for (let j = 1; j <= m; j++) {
      const dx = s[i - 1].x - t[j - 1].x;
      const dy = s[i - 1].y - t[j - 1].y;
      const cost = dx * dx + dy * dy;
      let best = prev[j];
      if (cur[j - 1] < best) best = cur[j - 1];
      if (prev[j - 1] < best) best = prev[j - 1];
      cur[j] = cost + best;
    }
    prev = cur;
  }
  return Math.sqrt(prev[m] / Math.max(n, m));
}

// All orderings of the strokes. Recognition is order-invariant: a student who
// draws the circle of a 'b' before the line still matches a line-first template,
// because we take the best DTW over every permutation. Capped at 5 strokes
// (120 permutations) — beyond that the letter was likely over-merged, so we
// fall back to the drawn order.
function permutations(arr) {
  const n = arr.length;
  if (n <= 1) return [arr.slice()];
  if (n > 5) return [arr.slice()];
  const out = [];
  const idx = arr.map((_, i) => i);
  const perm = (k) => {
    if (k === n) { out.push(idx.map((i) => arr[i])); return; }
    for (let i = k; i < n; i++) {
      [idx[k], idx[i]] = [idx[i], idx[k]];
      perm(k + 1);
      [idx[k], idx[i]] = [idx[i], idx[k]];
    }
  };
  perm(0);
  return out;
}

// drawnStrokes: array of strokes in canvas px. templates: [{ letter, strokes(0-1) }]
// returns [{ letter, dist, confidence }] sorted best (lowest dist) first.
export function recognize(drawnStrokes, templates) {
  if (!drawnStrokes.length || !templates.length) return [];
  const drawnNorm = drawnStrokes.map((s) =>
    s.map((p) => ({ x: p.x / CANVAS_W, y: p.y / CANVAS_H }))
  );
  const drawnSeqs = permutations(drawnNorm)
    .map((p) => letterToSequence(p))
    .filter((s) => s.length);
  if (!drawnSeqs.length) return [];
  const tseqs = templates.map((t) => ({ letter: t.letter, seq: letterToSequence(t.strokes) }));
  const results = tseqs.map(({ letter, seq }) => {
    if (!seq.length) return { letter, dist: Infinity, confidence: 0 };
    let best = Infinity;
    for (const dseq of drawnSeqs) {
      const d = dtw(dseq, seq);
      if (d < best) best = d;
    }
    return { letter, dist: best, confidence: Math.max(0, Math.min(100, Math.round(100 - best * 180))) };
  });
  results.sort((a, b) => a.dist - b.dist);
  return results;
}