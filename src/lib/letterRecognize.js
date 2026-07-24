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

// --- Pathway matching (green vs amber) ---
// "Correct pathway" = the drawn strokes follow the saved template's stroke
// structure: same number of strokes, each drawn stroke matching the
// corresponding template stroke in shape and (for open strokes) direction.
// Stricter than the point-cloud shape match: a 'b' drawn as a circle + a
// separate vertical line (2 strokes) does NOT match a single-stroke 'b'
// template even though the point cloud is recognizable → amber, not green.

const SHAPE_THRESH = 0.42; // per-stroke normalized Chamfer above this = different stroke
const DIR_THRESH = 0.5;     // open-stroke start→end direction dot below this = reversed

function strokeCloud(pts) {
  if (!pts || pts.length < 2) return { cloud: [], dir: { x: 0, y: 0 }, closed: true };
  const rs = resample(pts, R);
  let cx = 0, cy = 0;
  for (const p of rs) { cx += p.x; cy += p.y; }
  cx /= rs.length; cy /= rs.length;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const tr = rs.map((p) => {
    const x = p.x - cx, y = p.y - cy;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    return { x, y };
  });
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const start = rs[0], end = rs[rs.length - 1];
  const dvec = { x: end.x - start.x, y: end.y - start.y };
  const closed = Math.hypot(dvec.x, dvec.y) < span * 0.25; // start≈end → closed loop
  const dlen = Math.hypot(dvec.x, dvec.y) || 1;
  return {
    cloud: tr.map((p) => ({ x: p.x / span, y: p.y / span })),
    dir: { x: dvec.x / dlen, y: dvec.y / dlen },
    closed,
  };
}

function strokeMatches(d, t) {
  const D = strokeCloud(d), T = strokeCloud(t);
  if (!D.cloud.length || !T.cloud.length) return false;
  if (chamfer(D.cloud, T.cloud) > SHAPE_THRESH) return false;
  if (D.closed || T.closed) return true; // closed loop: direction is ambiguous → accept
  return D.dir.x * T.dir.x + D.dir.y * T.dir.y > DIR_THRESH;
}

// drawnStrokes: array of strokes in canvas px. template: { letter, strokes(0-1) }.
// Returns true if the drawn strokes follow the template's correct pathway.
export function pathwayMatch(drawnStrokes, template) {
  if (!template || !Array.isArray(template.strokes) || !template.strokes.length) return false;
  const drawn = drawnStrokes.map((s) => s.map((p) => ({ x: p.x / CANVAS_W, y: p.y / CANVAS_H })));
  if (drawn.length !== template.strokes.length) return false;
  for (let i = 0; i < drawn.length; i++) {
    if (!strokeMatches(drawn[i], template.strokes[i])) return false;
  }
  return true;
}

// Fraction of drawn points with NO template point within COVERAGE_THRESH — i.e. ink
// the candidate template cannot account for. A bidirectional Chamfer averages over
// all points, so a small extra feature (the crossbar of an 'e' vs a 'c') barely
// moves the score: every bar point finds a nearby arc point and the average stays
// low. Counting those uncovered points instead makes the extra ink matter, so a 'c'
// template (no bar) is rejected when the student drew a bar, while the real 'e'
// template (which has the bar) covers them and wins.
const COVERAGE_THRESH = 0.07; // unit-scale distance beyond which a drawn point is "uncovered"
// Coverage mismatch is the DECIDING factor: a template that has ink the drawing
// lacks (e.g. b's stem vs a drawn c) or lacks ink the drawing has must lose to a
// template that fully accounts for the drawn shape. Weighted high enough that any
// meaningful extra/missing structure dominates the Chamfer shape-distance
// difference, so Chamfer only breaks near-ties between templates with equally
// good coverage. This is the "most overlap without extra or missing ink" rule.
const UNCOVERED_WEIGHT = 3.0;

function uncoveredFraction(drawnCloud, tmplCloud) {
  if (!drawnCloud.length) return 0;
  let uncovered = 0;
  const t2 = COVERAGE_THRESH * COVERAGE_THRESH;
  for (const a of drawnCloud) {
    let mn = Infinity;
    for (const b of tmplCloud) {
      const d = (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
      if (d < mn) mn = d;
    }
    if (mn > t2) uncovered++;
  }
  return uncovered / drawnCloud.length;
}

// Mutual coverage mismatch: the worse of "drawn ink the template lacks" (extraInk)
// and "template ink the drawing lacks" (missingInk). A closed-bowl 'a' template has a
// vertical stem an open 'e' never draws → missingInk is high → 'a' is rejected for an
// 'e'. Symmetric so it also catches the reverse (a template simpler than the drawn
// shape). Using the max (not the average) keeps a single small gap in an otherwise
// good match from double-counting.
function coverageMismatch(drawnCloud, tmplCloud) {
  return Math.max(uncoveredFraction(drawnCloud, tmplCloud), uncoveredFraction(tmplCloud, drawnCloud));
}

// drawnStrokes: array of strokes in canvas px. templates: [{ letter, strokes(0-1) }]
// returns [{ letter, dist, confidence }] sorted best (lowest dist) first.
//
// The score is dominated by coverage mismatch (extra/missing ink): the template
// that best accounts for the drawn shape with no unexplained ink wins. Chamfer
// (fine shape distance) and an aspect-ratio penalty only break near-ties between
// templates with equally good coverage, so a 'b' (stem + bowl) loses to a 'c'
// (arc) for a drawn c — the stem is missing ink the drawing lacks — and a simple
// 'c' can't win against a drawn 'e' that has a crossbar it lacks.
// Recognition is only as good as the templates, though: if a saved letter is drawn
// in a different style from how the student writes it, a neighbor letter can still
// win — author a template that matches the student's handwriting (a second template
// per letter is fine; the best match across all saved templates wins).
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
    if (!cloud.length) return { letter, dist: Infinity, confidence: 0, mismatch: 1 };
    const crossClass = (drawn.aspect < TALL) !== (aspect < TALL);
    const inkMismatch = coverageMismatch(drawn.cloud, cloud);
    const d =
      chamfer(drawn.cloud, cloud) +
      W_ASP * Math.abs(drawn.aspect - aspect) +
      (crossClass ? CLASS_PENALTY : 0) +
      UNCOVERED_WEIGHT * inkMismatch;
    return { letter, dist: d, confidence: 0, mismatch: inkMismatch };
  });
  results.sort((a, b) => a.dist - b.dist);
  // Certainty reflects how cleanly a template accounts for the drawn ink — its
  // coverage mismatch (0 = no extra/missing ink). This is scale-invariant (coverage
  // is already normalized 0–1), so the coverage penalty's inflated absolute distance
  // can't zero out a correct match, and a winner that only wins because the right
  // template is missing reads as low certainty instead of a false 100%. Each letter's
  // bar is its own coverage quality, so wrong-but-won guesses no longer all show 100%.
  const MISMATCH_BAD = 0.35; // coverage mismatch at/above this => 0% certainty
  for (const r of results) {
    if (!isFinite(r.dist)) { r.confidence = 0; continue; }
    r.confidence = Math.max(0, Math.min(100, Math.round(100 * (1 - r.mismatch / MISMATCH_BAD))));
  }
  return results;
}