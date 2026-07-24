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
  return a.ascender !== b.ascender || a.descender !== b.descender;
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
function strokeDtw(dStroke, tStroke) {
  const a = resample(dStroke, R);
  const b = resample(tStroke, R);
  if (a.length < 2 || b.length < 2) {
    // a dot vs anything: cost is how far the dot sits from the template stroke's
    // nearest point (a dot can't "warp" — it's a point).
    if (a.length && b.length) {
      let mn = Infinity;
      for (const p of a) for (const q of b) { const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2; if (d < mn) mn = d; }
      return Math.sqrt(mn);
    }
    return 1;
  }
  return dtw(a, b);
}

// Total distance from a drawing to one template: align the whole drawing to the
// template's bbox, DTW each stroke pair in order, average, then add the stroke-
// count penalty and the height-class guard.
function letterDistance(drawn, dBox, tmpl) {
  if (!drawn.length || !tmpl.length) return Infinity;
  const tBox = bbox(tmpl);
  const aligned = alignTo(drawn, dBox, tBox);
  const n = aligned.length, m = tmpl.length;
  const pairs = Math.min(n, m);
  let sum = 0;
  for (let i = 0; i < pairs; i++) sum += strokeDtw(aligned[i], tmpl[i]);
  let dist = pairs ? sum / pairs : 1;
  // unmatched strokes (extra or missing) cost a flat penalty each — this is what
  // keeps a 2-stroke 't' from collapsing into a 1-stroke 'l'.
  dist += STROKE_COUNT_PENALTY * Math.abs(n - m);
  if (classMismatch(heightClass(dBox), heightClass(tBox))) dist += HEIGHT_CLASS_PENALTY;
  return dist;
}

// drawnStrokes: array of strokes in canvas px. templates: [{ letter, strokes(0-1) }].
// Returns [{ letter, dist, confidence }] sorted best (lowest dist) first.
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
  results.sort((a, b) => a.dist - b.dist);
  const finite = results.filter((r) => isFinite(r.dist));
  const best = finite.length ? finite[0].dist : 0;
  const second = finite.length > 1 ? finite[1].dist : null;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!isFinite(r.dist) || i > 0) { r.confidence = 0; continue; }
    // certainty = how much the winner dominated the runner-up, relative to the
    // winner's own cost. A clean win (runner-up much worse) reads high; a
    // near-tie reads low. Independent of the absolute scale.
    const ratio = second !== null ? (second - best) / (second || 1e-4) : 1;
    r.confidence = Math.max(0, Math.min(100, Math.round(ratio * 220)));
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
  return chamfer(dCloud, tCloud);
}

// Does a multi-stroke group clearly form ONE known letter? True when some
// template with the SAME stroke count matches the group — either directionally
// (drawn the taught way) OR by overall shape (drawn a weird way but looks
// right). Same-stroke-count is what keeps 'c'+'l' (2 strokes, but their combined
// shape is not any 2-stroke letter) splitting while 't' (2 strokes, matches the
// 2-stroke 't' template) stays together.
const GROUP_DIR_CONF = 0.20;   // directional DTW below this = clearly this letter
const GROUP_SHAPE_CONF = 0.13; // shape Chamfer below this = clearly this letter's outline
export function groupFormsLetter(strokesPx, templates) {
  const drawn = normalize(strokesPx);
  if (!drawn.length) return null;
  const dBox = bbox(drawn);
  if (dBox.w === 0 && dBox.h === 0) return null;
  let best = null, bestScore = Infinity;
  for (const t of templates) {
    if (!t.strokes || drawn.length !== t.strokes.length) continue;
    const dd = letterDistance(drawn, dBox, t.strokes);
    const sd = shapeDistance(drawn, dBox, t.strokes);
    const score = Math.min(dd, sd);
    if (score < bestScore) { bestScore = score; best = t.letter; }
  }
  return bestScore < Math.max(GROUP_DIR_CONF, GROUP_SHAPE_CONF) ? best : null;
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