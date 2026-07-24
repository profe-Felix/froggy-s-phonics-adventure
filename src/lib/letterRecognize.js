import { resample, CANVAS_W, CANVAS_H } from '@/components/tracing/strokeMath';

const R = 24; // resampled points per stroke

// Turn a letter (array of strokes) into one centered, unit-scaled sequence:
// each stroke is resampled to R points, then all are concatenated in stroke
// order. Centering on the centroid + scaling to the max dimension removes
// position and size, so we compare pure shape (and stroke order).
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

// drawnStrokes: array of strokes in canvas px. templates: [{ letter, strokes(0-1) }]
// returns [{ letter, dist, confidence }] sorted best (lowest dist) first.
export function recognize(drawnStrokes, templates) {
  if (!drawnStrokes.length || !templates.length) return [];
  const drawnNorm = drawnStrokes.map((s) =>
    s.map((p) => ({ x: p.x / CANVAS_W, y: p.y / CANVAS_H }))
  );
  const drawnSeq = letterToSequence(drawnNorm);
  if (!drawnSeq.length) return [];
  const results = templates.map((t) => {
    const dist = dtw(drawnSeq, letterToSequence(t.strokes));
    const confidence = Math.max(0, Math.min(100, Math.round(100 - dist * 180)));
    return { letter: t.letter, dist, confidence };
  });
  results.sort((a, b) => a.dist - b.dist);
  return results;
}