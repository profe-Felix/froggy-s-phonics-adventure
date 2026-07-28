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
import { classifyStroke } from '@/lib/strokeClassify';

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

// --- structural-kind gate (combines "recognize stroke" with "recognize letter") ---
// DTW warps one stroke onto another and only cares that the points are close
// AFTER anisotropic alignment — so a 'b' bowl and a 'k' bent chevron, which cover
// overlapping area, can score close. But they are NOT the same structural shape:
// a bowl is a closed loop, a bent stroke is an open chevron. Classifying each
// stroke (the same classifyStroke used in "recognize stroke" mode) and requiring
// the kinds to agree is what stops the 'b'→'k' false positive: the bowl can't
// pass the 'k' pathway no matter how many points it hits.
const LINE_KINDS = new Set(['vertical', 'horizontal', 'diagonal']);
// Two kinds are compatible if they are the same, or both lines (a slightly
// tilted stem is still a stem), or a curve↔bowl (a 'c' and a barely-closed bowl
// differ only by closure). Everything else — bowl vs bent, bowl vs shoulder,
// bent vs curve — is a real structural mismatch.
function kindsCompatible(ka, kb) {
  if (ka === 'dot' || kb === 'dot') return true;   // dots are matched by position, not shape
  if (ka === kb) return true;
  if (LINE_KINDS.has(ka) && LINE_KINDS.has(kb)) return true;
  const pair = [ka, kb].sort().join('|');
  return pair === 'bowl|curve';
}
// Classify a normalized (0-1) stroke. classifyStroke takes canvas px and divides
// by CANVAS_W/H, so scale the normalized points back to px first.
function strokeKind(strokeNorm) {
  if (!strokeNorm || strokeNorm.length < 2) return 'dot';
  const px = strokeNorm.map((p) => ({ x: p.x * CANVAS_W, y: p.y * CANVAS_H }));
  return classifyStroke(px).kind;
}
// Template strokes never change — cache their kinds per template.
const _kindCache = new WeakMap();
function tmplKind(tmpl, i) {
  let arr = _kindCache.get(tmpl);
  if (!arr) { arr = tmpl.map(strokeKind); _kindCache.set(tmpl, arr); }
  return arr[i];
}
const KIND_PENALTY = 0.18;        // per mismatched stroke pair — pushes a structurally-wrong letter down in the ranking
const PATHWAY_START_POS = 0.15;   // a pathway stroke must BEGIN within this (normalized) distance of the template's start

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
  // Structural-kind penalty: a bowl is not a bent chevron even if DTW warps them
  // close. This is what stops a 'b' (bowl) from ranking as a 'k' (bent) — the two
  // "hit a lot of the same points" after anisotropic alignment, but the second
  // stroke is a closed loop in one and an open chevron in the other.
  const p = Math.min(drawn.length, tmpl.length);
  for (let i = 0; i < p; i++) {
    if (!kindsCompatible(strokeKind(drawn[i]), tmplKind(tmpl, i))) dist += KIND_PENALTY;
  }
  return dist;
}

// drawnStrokes: array of strokes in canvas px. templates: [{ letter, strokes(0-1) }].
// Returns [{ letter, dist, confidence }] sorted best (lowest dist) first.
//
// IDEAL-PATHWAY ONLY. The drawing is compared to each template's TAUGHT stroke
// pathway: anisotropic alignment (lenient about SCALE — a skinny, wide, or
// shorter-than-usual letter is stretched onto the template's proportions) plus
// banded per-stroke DTW in stroke order (lenient about the START POINT and
// drawing speed, strict about DIRECTION and ORDER). A stroke-count penalty and a
// height-class guard keep letters with different STRUCTURE apart — this is what
// separates 'i' (stem + a dot drawn above it = TWO strokes) from 'l' (one
// vertical stroke = ONE stroke): the count penalty plus the dot's positional
// match make 'i' read as 'i', not as 'l'. There is NO order-/direction-agnostic
// shape fallback: that "second test" let a stem+dot outline read as a tall 'l',
// which is exactly the i→l confusion being removed. A letter drawn the wrong
// way (reversed, wrong order, merged/split strokes) simply scores worse against
// its taught template — so a student who forms a letter incorrectly is, by
// design, penalised or misunderstood, which is the teaching signal we want.
//
// CONFIDENCE is a softmax over the distances, so EVERY letter gets a real
// probability (not just the winner). A clean letter reads ~98%; a torn call
// reads ~55/45 and shows the runner-up was close.
const SOFTMAX_T = 0.025;  // softmax temperature: sharp enough that a clean letter reads high, soft enough that a close call shows both
export function recognize(drawnStrokes, templates) {
  if (!drawnStrokes.length || !templates.length) return [];
  const drawn = normalize(drawnStrokes);
  const dBox = bbox(drawn);
  if (dBox.w === 0 && dBox.h === 0) return [];
  const results = templates.map((t) => ({
    letter: t.letter,
    dist: letterDistance(drawn, dBox, t.strokes),
    confidence: 0,
  }));
  results.sort((a, b) => (isFinite(a.dist) ? a.dist : Infinity) - (isFinite(b.dist) ? b.dist : Infinity));
  const finite = results.filter((r) => isFinite(r.dist));
  if (finite.length) {
    let sum = 0;
    for (const r of finite) sum += Math.exp(-r.dist / SOFTMAX_T);
    for (const r of results) r.confidence = isFinite(r.dist) ? Math.round((Math.exp(-r.dist / SOFTMAX_T) / sum) * 100) : 0;
  }
  return results;
}

// Does a multi-stroke group clearly form ONE known letter? Same stroke count is
// required, AND every stroke pair must match the template along the taught
// pathway. The EVERY-pair rule (MAX, not average) is what tells a 2-stroke 't'
// (stem→stem AND crossbar→crossbar both good) from a touching 'c'+'l' forced onto
// a 2-stroke template (l→stem good, but c→arm/crossbar/dot bad — the MAX stays
// high, so it is NOT one letter). No shape fallback — the group is a letter only
// if its strokes follow the taught pathway of some same-count template.
const GROUP_PAIR_DIR = 0.26;    // every stroke pair's DTW at/below this = the group is this letter, directionally
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
    if (maxPair <= GROUP_PAIR_DIR && maxPair < bestScore) { bestScore = maxPair; best = t.letter; }
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
    const c = strokeDtw(a, b);
    if (c > PATHWAY_DIST) return false;
    sum += c;
    // START DIRECTION must agree (DTW is monotonic so a reversed stroke already
    // scores poorly; this makes the start explicit).
    const da = startDir(a), db = startDir(b);
    if (da.x * db.x + da.y * db.y < DIR_THRESH) return false;
    // START POINT must be near the template's start — 'k' second stroke starts
    // at the midline on the stem; a 'b' bowl starts mid-stem. The start-position
    // gap rejects the false positive even when DTW warps the rest of the stroke
    // close and both head "to the right."
    const startPos = Math.hypot(a[0].x - b[0].x, a[0].y - b[0].y);
    if (startPos > PATHWAY_START_POS) return false;
    // STRUCTURAL KIND must agree — a closed bowl is not an open bent chevron,
    // no matter how well the points align. This is "recognize stroke" applied
    // inside "recognize letter": the per-stroke shape must match the taught
    // stroke's shape, not just cover the same area.
    if (!kindsCompatible(strokeKind(drawn[i]), tmplKind(template.strokes, i))) return false;
  }
  return sum / drawn.length < PATHWAY_DIST;
}

// Is a DTW winner structurally plausible for what was drawn? Every drawn
// stroke's structural kind must match the winner template's corresponding
// stroke kind. This is the "no false positive just because b and k hit a lot of
// points" gate: a 'b' bowl (a closed curve) scores high against a 'k' chevron (a
// bent stroke) under DTW + anisotropic alignment, but a bowl is not a bent
// chevron — so 'k' is NOT plausible for a 'b' drawing, even at 100% DTW. The
// canvas uses this to reject the DTW winner and fall back to the structural
// inference (bowl + stem → 'b').
export function strokeKindsPlausible(drawnStrokes, template) {
  if (!template || !Array.isArray(template.strokes) || !template.strokes.length) return false;
  if (!drawnStrokes || drawnStrokes.length !== template.strokes.length) return false;
  const drawn = normalize(drawnStrokes);
  for (let i = 0; i < drawn.length; i++) {
    if (!kindsCompatible(strokeKind(drawn[i]), tmplKind(template.strokes, i))) return false;
  }
  return true;
}