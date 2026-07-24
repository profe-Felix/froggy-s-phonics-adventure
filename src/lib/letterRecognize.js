import { resample, CANVAS_W, CANVAS_H } from '@/components/tracing/strokeMath';

const R = 40; // resampled points per stroke — finer sampling sharpens b/d-style distinctions

// Turn a letter (array of strokes) into one centered, unit-scaled point cloud:
// each stroke is resampled to R points, then all are flattened. Centering on the
// centroid + scaling to the max dimension removes position and size, so we compare
// pure shape. Order/direction within a stroke don't matter — this is a point set.
function letterToCloud(strokes) {
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

// Bidirectional Chamfer distance: the average nearest-neighbor distance from each
// drawn point to the template, AND from each template point back to the drawn
// shape. The back-direction term is what catches a short 'a' drawn against a tall
// 'b' template — the 'b' ascender points have nothing nearby in the 'a', so the
// distance stays high. This is the "it would have hit most of the points" metric:
// a drawn letter wins when its points actually cover the template's points.
// Stroke order, stroke direction, and stroke count are all irrelevant here, so a
// clockwise circle or a bottom-first 'e' matches just as well as the "correct" way.
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
      const d = (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
      if (d < mn) mn = d;
    }
    sumB += mn;
  }
  return Math.sqrt((sumA / A.length + sumB / B.length) / 2);
}

// drawnStrokes: array of strokes in canvas px. templates: [{ letter, strokes(0-1) }]
// returns [{ letter, dist, confidence }] sorted best (lowest dist) first.
export function recognize(drawnStrokes, templates) {
  if (!drawnStrokes.length || !templates.length) return [];
  const drawnNorm = drawnStrokes.map((s) =>
    s.map((p) => ({ x: p.x / CANVAS_W, y: p.y / CANVAS_H }))
  );
  const drawnCloud = letterToCloud(drawnNorm);
  if (!drawnCloud.length) return [];
  const tclouds = templates.map((t) => ({ letter: t.letter, cloud: letterToCloud(t.strokes) }));
  const results = tclouds.map(({ letter, cloud }) => {
    if (!cloud.length) return { letter, dist: Infinity, confidence: 0 };
    const d = chamfer(drawnCloud, cloud);
    return { letter, d, confidence: Math.max(0, Math.min(100, Math.round(100 - d * 180))) };
  });
  results.sort((a, b) => a.d - b.d);
  return results;
}