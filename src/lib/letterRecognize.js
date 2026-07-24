// Handwriting recognition by DIRECT SHAPE MATCHING against saved templates.
//
// Mental model (the user's): a student who followed the taught stroke
// DIRECTIONALITY drew a letter that is, at worst, a distorted version of the
// correct template — squashed, skinny, or starting/ending a little off. So the
// right letter is simply the template the drawing has to DISTORT THE LEAST to
// become. No hand-coded "tells" (vertical? crossing? humps?) — those broke on
// real handwriting (m→u, e→z, t→l). Instead:
//
//   1. ANISOTROPIC ALIGNMENT (Procrustes without rotation): scale the drawing's
//      bounding box onto each template's bounding box, independently in x and y.
//      A squashed/skinny letter is stretched to the template's proportions, so
//      "squashed m" matches "normal m" — exactly the variance the user named.
//      (Letters are never rotated by kids, so rotation is skipped.)
//   2. PER-STROKE DYNAMIC TIME WARPING: each drawn stroke is matched, in stroke
//      ORDER, to the corresponding template stroke by warping one point sequence
//      onto the other monotonically. DTW absorbs a different start/end point
//      and slightly different speeds while PRESERVING ORDER and DIRECTION — a
//      backwards stroke can't warp into a forwards one. This is the
//      "distort-and-match, least distortion wins" rule, and it is why 'm'
//      (down-up-down-up-down) no longer reads as 'u' (down-up-down): the ordered
//      point sequences simply don't align.
//   3. STROKE COUNT is a first-class signal: a 't' (stem + crossbar, 2 strokes)
//      cannot be an 'l' (1 stroke). A per-stroke penalty makes the count matter
//      without making it a hard gate (a student who merges two taught strokes
//      into one still scores, just worse).
//
// The only remaining geometric guard is HEIGHT CLASS (ascender / descender):
// a letter whose ink never reaches the top line is not an ascender (b,d,h,l…),
// and one that never drops below the baseline is not a descender (g,j,p,q,y).
// This is geometry, not a heuristic "tell" — and anisotropic scaling alone can
// over-fit a short drawing onto a tall template, so the guard stays as a light
// safety net.
//
// Templates are the saved LetterWaypoint strokes, normalized 0-1 in guide-line
// space; the drawing is normalized the same way, so both share one frame.

import { resample, CANVAS_W, CANVAS_H } from '@/components/tracing/strokeMath';

const R = 36;            // points per stroke after resampling — enough shape detail for DTW, small enough that O(R²) is cheap
const DTW_BAND = 8;      // Sakoe-Chiba band: allow a point to warp ±8 indices — absorbs start/speed variance without the full O(R²) and without letting a stroke warp wildly onto an unrelated one
const STROKE_COUNT_PENALTY = 0.16;   // per-stroke cost when the drawing and template disagree on stroke count — comparable to a stroke's DTW cost, so a 2-stroke 't' beats a 1-stroke 'l' but a near-match still wins
const HEIGHT_CLASS_PENALTY = 0.30;   // a short drawing matched to a tall template (or vice versa) — light safety net over the anisotropic fit
const ASC_TOP = 0.22;    // ink above this y → ascender (guide top≈0.10; short letters top out ~0.37)
const DESC_BOT = 0.74;   // ink below this y → descender (guide base≈0.63, descender to 0.90; short letters bottom out ~0.63)

// --- normalization to guide-line space ---
function normalize(pxStrokes) {
  return pxStrokes.map((s) => s.map((p) => ({ x: p.x / CANVAS_W, y: p.y / CANVAS_H })));
}

function bbox(strokes) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, any = false;
  for (const s of strokes) {
    if (!s) continue;
    for (const p of s) {
      any = true;
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
  }
  if (!any) return { minX: 0, maxX: 0, minY: 0, maxY: 0, w: 0, h: 0 };
  return { minX, maxX, minY, maxY, w: (maxX - minX) || 0, h: (maxY - minY) || 0 };
}

function heightClass(b) {
  return { ascender: b.minY < ASC_TOP, descender: b.maxY > DESC_BOT };
}
function classMismatch(a, b) {
  // Asymmetric: only penalize when the DRAWING has a height feature the template
  // LACKS. A tall drawing reaching the top line is not a short letter (a/c/e/o…);
  // a drawing dropping below the baseline is not a non-descender (r/n/m…). The
  // reverse is NOT penalized: a kid's short 'l' (ink never reaches the top) is
  // still an 'l', and must not be pushed toward 'i' just because the 'l' template
  // is tall. The DTW/stroke-count already keep a short vertical off tall letters
  // with bowls/humps (b, d, h, k); the guard's job is only the tall/short and
  // descender/non-descender boundary, one-way.
  return (a.ascender && !b.ascender) || (a.descender && !b.descender);
}

// Anisotropically map the drawing onto the template, scaled around their
// CENTERS. x and y scale independently so a skinny letter widens and a squashed
// letter stretches to the template's proportions. BUT the aspect distortion is
// CAPPED: without a cap, a thin fragment (a 't' crossbar — wide, nearly zero
// height) gets stretched ~100× in y to fill a tall 'l' template and reads as a
// confident 'l', which makes the splitter tear 't' into "l + l". Capping at
// ASP_CAP lets a genuinely squashed/skinny letter (≈1.5× distortion) match while
// stopping a degenerate line from flipping orientation into a different letter.
const ASP_CAP = 2.5;
function alignTo(drawn, dBox, tBox) {
  let sx = dBox.w > 1e-4 ? tBox.w / dBox.w : 1;
  let sy = dBox.h > 1e-4 ? tBox.h / dBox.h : 1;
  if (sy > sx * ASP_CAP) sy = sx * ASP_CAP;
  else if (sx > sy * ASP_CAP) sx = sy * ASP_CAP;
  const dcx = dBox.minX + dBox.w / 2, dcy = dBox.minY + dBox.h / 2;
  const tcx = tBox.minX + tBox.w / 2, tcy = tBox.minY + tBox.h / 2;
  return drawn.map((s) => s.map((p) => ({
    x: tcx + (p.x - dcx) * sx,
    y: tcy + (p.y - dcy) * sy,
  })));
}

// Bounded DTW (Sakoe-Chiba band). Returns the average per-step cost along the
// optimal monotonic warp — order- and direction-preserving by construction.
function dtw(A, B) {
  const n = A.length, m = B.length;
  if (!n || !m) return 1;
  const INF = Infinity;
  const band = DTW_BAND;
  // dp[i][j]; we only fill |i-j| <= band.
  const dp = new Array(n + 1);
  for (let i = 0; i <= n; i++) dp[i] = new Float64Array(m + 1).fill(INF);
  dp[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    const jLo = Math.max(1, i - band);
    const jHi = Math.min(m, i + band);
    for (let j = jLo; j <= jHi; j++) {
      const d = Math.hypot(A[i - 1].x - B[j - 1].x, A[i - 1].y - B[j - 1].y);
      let best = dp[i - 1][j - 1];
      if (dp[i - 1][j] < best) best = dp[i - 1][j];
      if (dp[i][j - 1] < best) best = dp[i][j - 1];
      dp[i][j] = d + best;
    }
  }
  // normalize by the warp path length (≈ n + m steps) so the cost is an average,
  // independent of how many points a stroke was resampled to.
  return dp[n][m] / (n + m);
}

// One drawn stroke vs one template stroke, both resampled to R points. The
// strokes are already in the aligned (template-bbox) frame.
function pathLen(pts) { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return l; }
const DOT_LEN = 0.01; // a resampled stroke shorter than this (normalized) is a dot — a point, not a path
function centroid(pts) { let x = 0, y = 0; for (const p of pts) { x += p.x; y += p.y; } return { x: x / pts.length, y: y / pts.length }; }
function nearestDist(pt, stroke) { let mn = Infinity; for (const p of stroke) { const d = (p.x - pt.x) ** 2 + (p.y - pt.y) ** 2; if (d < mn) mn = d; } return Math.sqrt(mn); }
function strokeDtw(dStroke, tStroke) {
  const a = resample(dStroke, R);
  const b = resample(tStroke, R);
  const aDot = a.length < 2 || pathLen(a) < DOT_LEN;
  const bDot = b.length < 2 || pathLen(b) < DOT_LEN;
  // A dot is a single point, not a path — it cannot "warp" monotonically onto a
  // real stroke. Critically, a tap dot resamples to 2 coincident points, which
  // is far too few to span banded DTW against a 36-point template stroke (the
  // Sakoe-Chiba band can't reach the final cell, so DTW returns Infinity and the
  // dot matches nothing). So a dot is matched purely by position: point-to-
  // point if both are dots, otherwise the distance from the dot to the nearest
  // point of the real stroke.
  if (aDot || bDot) {
    if (!a.length || !b.length) return 1;
    if (aDot && bDot) { const ca = centroid(a), cb = centroid(b); return Math.hypot(ca.x - cb.x, ca.y - cb.y); }
    const pt = aDot ? centroid(a) : centroid(b);
    const stroke = aDot ? b : a;
    return nearestDist(pt, stroke);
  }
  // Emphasize the START point: a stroke that begins somewhere different costs a
  // little more. 'f' begins with a small top hook (up, then over and down) while
  // 't' begins straight down at the top — same stroke count, both ascenders, so
  // the hook's start position is what keeps 'f' off 't'. The weight is small so a
  // slightly-off start still matches; reversed strokes (which start at the wrong
  // end entirely) already fail DTW on direction and fall to the shape rescue.
  const startCost = Math.hypot(a[0].x - b[0].x, a[0].y - b[0].y);
  return dtw(a, b) + 0.10 * startCost;
}

// A dot (the i/j dot, or a tilde mark) is a small isolated MARK, not a path —
// it has no direction or order. Whether the student dotted before or after the
// stem, and whether the dot is a tap (a point) or a tiny vertical, it should
// match the template's dot purely by WHERE it sits. So a dot is detected by
// bounding-box SIZE (a mark well under a letter's smallest real stroke — a
// crossbar is ~0.06 wide, a dot is < ~0.04), and dots are paired POSITIONALLY
// (nearest centroid) rather than by stroke order. This is the user's rule: "it
// shouldn't matter where to begin — the point is to get the known pathway to
// coincide with the ink." For a dot, the "pathway" is just its position.
const DOT_SIZE = 0.04;
function bboxMaxDim(s) {
  let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
  for (const p of s) { if (p.x < mnX) mnX = p.x; if (p.x > mxX) mxX = p.x; if (p.y < mnY) mnY = p.y; if (p.y > mxY) mxY = p.y; }
  return Math.max(mxX - mnX, mxY - mnY);
}
function isDotStroke(s) { return !s || s.length <= 2 || bboxMaxDim(s) < DOT_SIZE; }

// Per-pair stroke-match costs between a drawing and one template (aligned to the
// template's bbox). Dots are paired positionally (a dot is a mark, not a path);
// real strokes are DTW'd in order. Returns the array of per-pair costs so callers
// can take the AVERAGE (a letter whose strokes match on average — recognition) or
// the MAX (a letter whose EVERY stroke matches — segmentation: keeps a 2-stroke
// 't' together while splitting a touching 'c'+'l' whose second stroke matches
// nothing).
function pairCosts(drawn, dBox, tmpl) {
  if (!drawn.length || !tmpl.length) return [];
  const tBox = bbox(tmpl);
  const aligned = alignTo(drawn, dBox, tBox);
  const n = aligned.length, m = tmpl.length;

  const dDotIdx = []; for (let i = 0; i < n; i++) if (isDotStroke(drawn[i])) dDotIdx.push(i);
  const tDotIdx = []; for (let i = 0; i < m; i++) if (isDotStroke(tmpl[i])) tDotIdx.push(i);

  const costs = [];
  if (dDotIdx.length > 0 && dDotIdx.length === tDotIdx.length) {
    // Match dots positionally (nearest centroid in the aligned frame), and the
    // real strokes in order. A crossbar (wide, not a dot) is never pulled into
    // this path, so a 't' (stem + crossbar, zero dots) still uses ordered DTW.
    const used = new Array(tDotIdx.length).fill(false);
    for (const i of dDotIdx) {
      const dc = centroid(resample(aligned[i], R));
      let best = Infinity, bi = -1;
      for (let k = 0; k < tDotIdx.length; k++) {
        if (used[k]) continue;
        const tc = centroid(resample(tmpl[tDotIdx[k]], R));
        const dd = Math.hypot(dc.x - tc.x, dc.y - tc.y);
        if (dd < best) { best = dd; bi = k; }
      }
      if (bi >= 0) { used[bi] = true; costs.push(best); }
    }
    const dReal = []; for (let i = 0; i < n; i++) if (!dDotIdx.includes(i)) dReal.push(aligned[i]);
    const tReal = []; for (let i = 0; i < m; i++) if (!tDotIdx.includes(i)) tReal.push(tmpl[i]);
    const rp = Math.min(dReal.length, tReal.length);
    for (let i = 0; i < rp; i++) costs.push(strokeDtw(dReal[i], tReal[i]));
  } else {
    // No dots, or a mismatched dot count — fall back to ordered DTW, which
    // correctly penalizes a dot-vs-crossbar mismatch (a dot can't warp onto a
    // wide crossbar).
    const p = Math.min(n, m);
    for (let i = 0; i < p; i++) costs.push(strokeDtw(aligned[i], tmpl[i]));
  }
  return costs;
}

// Total distance from a drawing to one template: average per-pair cost, then add
// the stroke-count penalty and height-class guard.
function letterDistance(drawn, dBox, tmpl) {
  const costs = pairCosts(drawn, dBox, tmpl);
  if (!costs.length) return Infinity;
  const tBox = bbox(tmpl);
  let dist = costs.reduce((s, c) => s + c, 0) / costs.length;
  // unmatched strokes (extra or missing) cost a flat penalty each — this is what
  // keeps a 2-stroke 't' from collapsing into a 1-stroke 'l'.
  dist += STROKE_COUNT_PENALTY * Math.abs(drawn.length - tmpl.length);
  if (classMismatch(heightClass(dBox), heightClass(tBox))) dist += HEIGHT_CLASS_PENALTY;
  return dist;
}

// drawnStrokes: array of strokes in canvas px. templates: [{ letter, strokes(0-1) }].
// Returns [{ letter, dist, dir, shape, confidence }] sorted best (lowest dist) first.
//
// PATHWAY-FIRST SCORING. The directional DTW (the taught pathway) is the PRIMARY
// signal: a letter drawn the taught way has a good directional match and wins on
// it alone — a mediocre SHAPE match from a DIFFERENT letter can no longer override
// it (a weird 'm' no longer collapses onto 'k', a plain 'l' no longer pulls onto
// 'h'). The order-agnostic shape Chamfer is a RESCUE only: it overrides the
// directional score when the directional match is poor (drawn reversed / in a
// weird order) AND the shape match is confident (the outline genuinely looks like
// the template) — so reversed and oddly-drawn letters whose outline is still
// right are still recognised.
//
// CONFIDENCE is a softmax over the final scores, so EVERY letter gets a real
// probability (not just the winner). A clean letter reads ~98%; a torn call
// reads ~55/45 and shows the runner-up was close — the "it just said k and gave
// 0% for everything else" view is gone.
const DIR_GOOD = 0.18;    // directional DTW at/below this = a confident taught-pathway match — trust it, shape cannot override
const SHAPE_GOOD = 0.12;  // shape Chamfer at/below this = a confident outline match — may rescue a poor pathway
const SOFTMAX_T = 0.025;  // softmax temperature: sharp enough that a clean letter reads high, soft enough that a close call shows both
function combinedScore(dir, shape) {
  if (dir <= DIR_GOOD) return dir;
  if (shape <= SHAPE_GOOD) return shape;
  return dir; // neither is confident — prefer the closest PATHWAY (the user's rule), not a mediocre shape
}
export function recognize(drawnStrokes, templates) {
  if (!drawnStrokes.length || !templates.length) return [];
  const drawn = normalize(drawnStrokes);
  const dBox = bbox(drawn);
  if (dBox.w === 0 && dBox.h === 0) return [];
  const results = templates.map((t) => {
    const dir = letterDistance(drawn, dBox, t.strokes);
    const shape = shapeDistance(drawn, dBox, t.strokes);
    return { letter: t.letter, dist: combinedScore(dir, shape), dir, shape, confidence: 0 };
  });
  results.sort((a, b) => (isFinite(a.dist) ? a.dist : Infinity) - (isFinite(b.dist) ? b.dist : Infinity));
  const finite = results.filter((r) => isFinite(r.dist));
  if (finite.length) {
    let sum = 0;
    for (const r of finite) sum += Math.exp(-r.dist / SOFTMAX_T);
    for (const r of results) r.confidence = isFinite(r.dist) ? Math.round((Math.exp(-r.dist / SOFTMAX_T) / sum) * 100) : 0;
  }
  return results;
}

// ORDER-AGNOSTIC SHAPE DISTANCE — the "second test". Merge every stroke into one
// point cloud, align the whole cloud to the template's cloud (same capped
// anisotropic fit), and take the bidirectional nearest-neighbour (Chamfer)
// distance. Stroke order and direction are irrelevant, so this catches a letter
// that LOOKS right even when it was drawn in a weird order or direction — the
// case the directional DTW misses. Used by segmentation to decide whether a
// multi-stroke group is one letter (e.g. 't', 'f', 'k') or two letters that
// happen to touch (e.g. 'c' + 'l'): the group is one letter if its overall
// shape confidently matches a template WITH THE SAME STROKE COUNT.
function cloudOf(strokes) {
  const all = [];
  for (const s of strokes) { if (!s || !s.length) continue; const rs = resample(s, R); for (const p of rs) all.push(p); }
  return all;
}
function chamfer(A, B) {
  if (!A.length || !B.length) return 1;
  let sa = 0;
  for (const a of A) { let mn = Infinity; for (const b of B) { const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2; if (d < mn) mn = d; } sa += Math.sqrt(mn); }
  let sb = 0;
  for (const b of B) { let mn = Infinity; for (const a of A) { const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2; if (d < mn) mn = d; } sb += Math.sqrt(mn); }
  return (sa / A.length + sb / B.length) / 2;
}
function shapeDistance(drawn, dBox, tmpl) {
  const tBox = bbox(tmpl);
  const aligned = alignTo(drawn, dBox, tBox);
  const dCloud = cloudOf(aligned);
  const tCloud = cloudOf(tmpl);
  // The shape test is ORDER-agnostic and answers "which letter does this LOOK
  // like?" — so a letter drawn in the wrong order, or split into the wrong
  // NUMBER of pieces, still matches. But "wrong number of pieces" is not the
  // same both ways:
  //   - EXTRA strokes (drawing has MORE strokes than the template) do NOT change
  //     the outline — a 'p' drawn as two strokes is the same silhouette as the
  //     one-stroke 'p' template, just drawn in two pieces. Not penalized.
  //   - MISSING strokes (drawing has FEWER strokes than the template) DO mean a
  //     feature is absent — a 1-stroke vertical 'l' is missing the 't' crossbar,
  //     so it must not shape-match 't'. The crossbar sits ON the stem, so pure
  //     Chamfer barely notices it is gone; without this guard a plain vertical
  //     reads as 't'. Penalized.
  // So the stroke-count penalty here is ASYMMETRIC: only when the drawing is
  // missing strokes the template has. The directional DTW path keeps the
  // symmetric penalty — it rewards the taught pathway, where any count
  // difference is a different pathway; the shape path is the "looks the same
  // but written incorrectly" rescue, lenient about extra pieces, strict about
  // missing features.
  let dist = chamfer(dCloud, tCloud);
  const missing = Math.max(0, tmpl.length - drawn.length);
  dist += STROKE_COUNT_PENALTY * missing;
  if (classMismatch(heightClass(dBox), heightClass(tBox))) dist += HEIGHT_CLASS_PENALTY;
  return dist;
}

// Does a multi-stroke group clearly form ONE known letter? Same stroke count is
// required, AND every stroke pair must match the template (directional) OR the
// overall outline must be a confident shape match. The EVERY-pair rule (MAX, not
// average) is what tells a 2-stroke 't' (stem→stem AND crossbar→crossbar both
// good) from a touching 'c'+'l' forced onto a 2-stroke template (l→stem good, but
// c→arm/crossbar/dot bad — the MAX stays high, so it is NOT one letter). The
// shape rescue keeps a hand-drawn 't' whose crossbar is a bit off: its outline
// still confidently matches 't', so it stays together instead of splitting into
// 'l' + 'z'.
const GROUP_PAIR_DIR = 0.26;    // every stroke pair's DTW at/below this = the group is this letter, directionally
const GROUP_SHAPE_RESCUE = 0.10; // ...or the shape Chamfer at/below this = the outline is confidently this letter
export function groupFormsLetter(strokesPx, templates) {
  const drawn = normalize(strokesPx);
  if (!drawn.length) return null;
  const dBox = bbox(drawn);
  if (dBox.w === 0 && dBox.h === 0) return null;
  let best = null, bestScore = Infinity;
  for (const t of templates) {
    if (!t.strokes || drawn.length !== t.strokes.length) continue;
    const costs = pairCosts(drawn, dBox, t.strokes);
    if (!costs.length) continue;
    const maxPair = Math.max(...costs);
    const sd = shapeDistance(drawn, dBox, t.strokes);
    const forms = maxPair <= GROUP_PAIR_DIR || sd <= GROUP_SHAPE_RESCUE;
    if (forms) {
      const score = Math.min(maxPair, sd);
      if (score < bestScore) { bestScore = score; best = t.letter; }
    }
  }
  return best;
}

// "Correct pathway" = the drawn strokes follow the template's stroke structure:
// same stroke count, each stroke matching the corresponding template stroke in
// shape, AND starting in the same direction (DTW is monotonic so a reversed
// stroke already scores poorly; the start-tangent check makes it explicit).
// Stricter than recognize(): the whole letter must clearly be THIS template,
// not just the closest one.
const PATHWAY_DIST = 0.14;    // average per-stroke DTW below this = the stroke shapes genuinely match (not just "closest available")
const DIR_THRESH = 0.5;       // start-tangent dot above this = same starting direction

function startDir(stroke) {
  const rs = resample(stroke, R);
  if (rs.length < 2) return { x: 0, y: 0 };
  const k = Math.max(2, Math.round(rs.length * 0.15));
  const a = rs[0], b = rs[Math.min(k, rs.length - 1)];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

export function pathwayMatch(drawnStrokes, template) {
  if (!template || !Array.isArray(template.strokes) || !template.strokes.length) return false;
  const drawn = normalize(drawnStrokes);
  if (drawn.length !== template.strokes.length) return false;
  const dBox = bbox(drawn);
  const aligned = alignTo(drawn, dBox, bbox(template.strokes));
  let sum = 0;
  for (let i = 0; i < drawn.length; i++) {
    const a = aligned[i], b = template.strokes[i];
    if (strokeDtw(a, b) > PATHWAY_DIST) return false;
    sum += strokeDtw(a, b);
    const da = startDir(a), db = startDir(b);
    if (da.x * db.x + da.y * db.y < DIR_THRESH) return false;
  }
  return sum / drawn.length < PATHWAY_DIST;
}