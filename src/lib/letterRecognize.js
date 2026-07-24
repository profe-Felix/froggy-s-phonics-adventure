import { resample, CANVAS_W, CANVAS_H } from '@/components/tracing/strokeMath';

const R = 60; // resampled points per stroke
const W_ASP = 1.0; // weight for the aspect-ratio penalty — a short shape (no ascender/descender) must not match a tall letter (b/d/h/l/k/p/q), so height mismatch is penalized hard

// Turn a letter (array of strokes) into one centered, unit-scaled point cloud.
// Each stroke is resampled to R points, then all are flattened. Centering on the
// centroid + scaling to the max dimension removes position and size, so we compare
// pure shape while preserving aspect ratio (no stretching). Stroke order, stroke
// direction, and stroke count are all irrelevant — this is a point set.
function letterToCloud(strokes) {
  if (!strokes || !strokes.length) return { cloud: [], aspect: 1, minY: 0.5, maxY: 0.5 };
  const per = strokes.map((s) => resample(s, R)).filter((s) => s && s.length);
  const all = per.flat();
  if (!all.length) return { cloud: [], aspect: 1, minY: 0.5, maxY: 0.5 };
  // Raw vertical extent in normalized 0-1 (guide-line) space, computed BEFORE
  // centering so the letter's height class reflects where the ink actually sits on
  // the guide lines. Dot strokes (i, j) are excluded — they're tiny and vary in
  // height, so they must not set the letter's height class (a high dot shouldn't
  // make an 'i' read as an ascender letter).
  let rawMinY = Infinity, rawMaxY = -Infinity;
  for (const s of strokes) {
    if (!s || s.length < 2) continue;
    let len = 0;
    for (let i = 1; i < s.length; i++) len += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
    if (len < 0.03) continue; // skip dots
    for (const p of s) {
      if (p.y < rawMinY) rawMinY = p.y;
      if (p.y > rawMaxY) rawMaxY = p.y;
    }
  }
  if (!isFinite(rawMinY)) { // only dots / no substantial ink → fall back to all points
    for (const p of all) {
      if (p.y < rawMinY) rawMinY = p.y;
      if (p.y > rawMaxY) rawMaxY = p.y;
    }
  }
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
    minY: rawMinY,
    maxY: rawMaxY,
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
  // Height guard: the drawn ink must reach the same guide lines the template
  // expects. A short 'e' (no ascender) cannot follow a tall 'd's pathway, because
  // d's pathway includes the up-to-top stroke the e never drew — so a short letter
  // is never marked as a tall letter's "correct pathway".
  const dExt = letterToCloud(drawn);
  const tExt = letterToCloud(template.strokes);
  if (classMismatch(heightClass(dExt.minY, dExt.maxY), heightClass(tExt.minY, tExt.maxY))) return false;
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
const COVERAGE_THRESH = 0.10; // unit-scale distance beyond which a drawn point is "uncovered" — loose enough that a fast/slightly-offset stroke still counts as covered
// Coverage mismatch is a tiebreaker, not the dominant term: a template with a
// large chunk of un-drawn ink (b's whole stem vs a drawn c) loses, but a stemmed
// letter drawn fast — whose stem is only slightly off — must NOT be rejected just
// because a simpler arc (c) has less ink to be "missing". Weighted to flip the
// clear cases (big absent structure) without overriding Chamfer for fast same-letter
// matches. This is the "most overlap without extra or missing ink" rule.
const UNCOVERED_WEIGHT = 1.6;

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

// Guide-line positions (Zaner-Bloser, normalized 0-1, y down): T=0.10, M=0.42,
// B=0.72, D=0.92. A letter's HEIGHT CLASS is set by whether its ink actually
// reaches the top line (ascender: b,d,f,h,k,l,t) or below the baseline (descender:
// g,j,p,q,y) — NOT by shape. Normalizing to unit size erases absolute height, so a
// short 'e' blown up can overlap a 'd' bowl; this guard restores "the strokes must
// touch the lines they should": a letter with no ascender can never match a tall
// template, in both the recognition score and the pathway check.
const ASC_TOP = 0.28;   // ink above this y → ascender (ascenders reach ~0.10-0.20; short letters top out ~0.38)
const DESC_BOT = 0.80;  // ink below this y → descender (descenders reach ~0.88-0.95; short letters bottom out ~0.75)

function heightClass(minY, maxY) {
  return { ascender: minY < ASC_TOP, descender: maxY > DESC_BOT };
}
function classMismatch(a, b) {
  return a.ascender !== b.ascender || a.descender !== b.descender;
}

// drawnStrokes: array of strokes in canvas px. templates: [{ letter, strokes(0-1) }]
// returns [{ letter, dist, confidence }] sorted best (lowest dist) first.
//
// The score is dominated by the height-class guard (a tall/descender template is
// barred from matching a short drawing) and coverage mismatch (extra/missing ink);
// Chamfer (fine shape) and an aspect-ratio term break near-ties. So a short 'e' (no
// ascender) can't read as 'd' (d's stem reaches the top line the e lacks), and a 'c'
// (arc only) can't win against a drawn 'e' that has a crossbar it lacks.
// Recognition is only as good as the templates: if a saved letter is drawn in a
// different style from how the student writes it, a neighbor in the SAME height
// class can still win — author a template that matches the student's handwriting.
export function recognize(drawnStrokes, templates) {
  if (!drawnStrokes.length || !templates.length) return [];
  const drawnNorm = drawnStrokes.map((s) =>
    s.map((p) => ({ x: p.x / CANVAS_W, y: p.y / CANVAS_H }))
  );
  const drawn = letterToCloud(drawnNorm);
  if (!drawn.cloud.length) return [];
  const drawnH = heightClass(drawn.minY, drawn.maxY);
  const tdata = templates.map((t) => ({ letter: t.letter, ...letterToCloud(t.strokes) }));
  // A letter drawn without its ascender/descender must NOT match a template that has
  // one — this penalty dominates shape similarity so a short e never reads as a d.
  const CLASS_PENALTY = 1.5;
  const results = tdata.map(({ letter, cloud, aspect, minY, maxY }) => {
    if (!cloud.length) return { letter, dist: Infinity, confidence: 0, mismatch: 1 };
    const crossClass = classMismatch(drawnH, heightClass(minY, maxY));
    const inkMismatch = coverageMismatch(drawn.cloud, cloud);
    const d =
      chamfer(drawn.cloud, cloud) +
      W_ASP * Math.abs(drawn.aspect - aspect) +
      (crossClass ? CLASS_PENALTY : 0) +
      UNCOVERED_WEIGHT * inkMismatch;
    return { letter, dist: d, confidence: 0, mismatch: inkMismatch };
  });
  results.sort((a, b) => a.dist - b.dist);
  // Certainty = how clearly the winner beat the runner-up (scale-invariant). A clean,
  // clear match reads high; a winner that barely edged out another letter reads low,
  // signalling the guess is uncertain. Losers read 0 (they didn't win the cluster).
  // Independent of the absolute score, so the coverage penalty's magnitude can't zero
  // out a correct match or inflate a weak one to 100%.
  const finite = results.filter((r) => isFinite(r.dist));
  const best = finite.length ? finite[0].dist : 0;
  const second = finite.length > 1 ? finite[1].dist : null;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!isFinite(r.dist)) { r.confidence = 0; continue; }
    if (i > 0) { r.confidence = 0; continue; }
    const margin = second !== null ? second - best : Math.max(0, 1 - best);
    r.confidence = Math.max(0, Math.min(100, Math.round(margin * 250)));
  }
  return results;
}