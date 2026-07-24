import { resample, CANVAS_W, CANVAS_H } from '@/components/tracing/strokeMath';

const R = 60; // resampled points per stroke
const W_ASP = 1.0; // weight for the aspect-ratio penalty — a short shape (no ascender/descender) must not match a tall letter (b/d/h/l/k/p/q), so height mismatch is penalized hard

// Turn a letter (array of strokes) into one centered, unit-scaled point cloud.
// Each stroke is resampled to R points, then all are flattened. Centering on the
// centroid + scaling to the max dimension removes position and size, so we compare
// pure shape while preserving aspect ratio (no stretching). Stroke order, stroke
// direction, and stroke count are all irrelevant — this is a point set.
function letterToCloud(strokes) {
  if (!strokes || !strokes.length) return { cloud: [], aspect: 1 };
  const per = strokes.map((s) => resample(s, R)).filter((s) => s && s.length);
  const all = per.flat();
  if (!all.length) return { cloud: [], aspect: 1 };
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
  return {
    cloud: tr.map((p) => ({ x: p.x / span, y: p.y / span })),
    aspect: (maxX - minX) / (maxY - minY || 1),
  };
}

// Bidirectional Chamfer distance: the average nearest-neighbor distance from each
// drawn point to the template AND from each template point back to the drawn shape.
// Pure shape coverage — stroke order/direction/count irrelevant.
function chamfer(A, B) {
  let sumA = 0;
  for (const a of A) {
    let mn = Infinity;
    for (const b of B) {
      const d = (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
      if (d < mn) mn = d;
    }
    sumA += mn;
  }
  let sumB = 0;
  for (const b of B) {
    let mn = Infinity;
    for (const a of A) {
      const d = (b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y);
      if (d < mn) mn = d;
    }
    sumB += mn;
  }
  return Math.sqrt((sumA / A.length + sumB / B.length) / 2);
}

// drawnStrokes: array of strokes in canvas px. templates: [{ letter, strokes(0-1) }]
// returns [{ letter, dist, confidence }] sorted best (lowest dist) first.
//
// The score is Chamfer (fine shape coverage) plus an aspect-ratio penalty, so a
// round-bowl 'a' no longer drifts to a tall 'd'/'b' (and vice-versa). Recognition is
// only as good as the templates, though: if a saved letter is drawn in a different
// style from how the student writes it, a neighbor letter can still win — author a
// template that matches the student's handwriting (a second template per letter is
// fine; the best match across all saved templates wins).
export function recognize(drawnStrokes, templates) {
  if (!drawnStrokes.length || !templates.length) return [];
  const drawnNorm = drawnStrokes.map((s) =>
    s.map((p) => ({ x: p.x / CANVAS_W, y: p.y / CANVAS_H }))
  );
  const drawn = letterToCloud(drawnNorm);
  if (!drawn.cloud.length) return [];
  const tdata = templates.map((t) => ({ letter: t.letter, ...letterToCloud(t.strokes) }));
  // Height-class guard: a short letter (no tall ascender/descender — aspect w/h
  // > 0.7) must not match a tall template (b/d/h/l/k/f/t/p/q/g/j, aspect < 0.7), no
  // matter how well the normalized point clouds overlap. Normalizing to unit size
  // erases absolute height, so a short 'e' blown up can cover a 'b' bowl; this flat
  // cross-class penalty dominates that shape similarity and keeps a letter with
  // "no big line going up and down" from ever reading as a tall letter.
  const TALL = 0.7;
  const CLASS_PENALTY = 0.8;
  const results = tdata.map(({ letter, cloud, aspect }) => {
    if (!cloud.length) return { letter, dist: Infinity, confidence: 0 };
    const crossClass = (drawn.aspect < TALL) !== (aspect < TALL);
    const d =
      chamfer(drawn.cloud, cloud) +
      W_ASP * Math.abs(drawn.aspect - aspect) +
      (crossClass ? CLASS_PENALTY : 0);
    return { letter, dist: d, confidence: Math.max(0, Math.min(100, Math.round(100 - d * 110))) };
  });
  results.sort((a, b) => a.dist - b.dist);
  return results;
}