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
  return dtw(a, b);
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

// Total distance from a drawing to one template: align the whole drawing to the
// template's bbox, then match strokes. Dots are paired positionally (a dot is a
// mark, not an ordered path); the remaining real strokes are DTW'd in order.
// Average the per-pair cost, then add the stroke-count penalty and height-class
// guard.
function letterDistance(drawn, dBox, tmpl) {
  if (!drawn.length || !tmpl.length) return Infinity;
  const tBox = bbox(tmpl);
  const aligned = alignTo(drawn, dBox, tBox);
  const n = aligned.length, m = tmpl.length;

  const dDotIdx = []; for (let i = 0; i < n; i++) if (isDotStroke(drawn[i])) dDotIdx.push(i);
  const tDotIdx = []; for (let i = 0; i < m; i++) if (isDotStroke(tmpl[i])) tDotIdx.push(i);

  let sum = 0, pairs = 0;
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
      if (bi >= 0) { used[bi] = true; sum += best; pairs++; }
    }
    const dReal = []; for (let i = 0; i < n; i++) if (!dDotIdx.includes(i)) dReal.push(aligned[i]);
    const tReal = []; for (let i = 0; i < m; i++) if (!tDotIdx.includes(i)) tReal.push(tmpl[i]);
    const rp = Math.min(dReal.length, tReal.length);
    for (let i = 0; i < rp; i++) { sum += strokeDtw(dReal[i], tReal[i]); pairs++; }
  } else {
    // No dots, or a mismatched dot count (a dot drawn where the template has
    // none, or vice versa) — fall back to ordered DTW, which correctly penalizes
    // a dot-vs-crossbar mismatch (a dot can't warp onto a wide crossbar).
    const p = Math.min(n, m);
    for (let i = 0; i < p; i++) { sum += strokeDtw(aligned[i], tmpl[i]); pairs++; }
  }

  let dist = pairs ? sum / pairs : 1;
  // unmatched strokes (extra or missing) cost a flat penalty each — this is what
  // keeps a 2-stroke 't' from collapsing into a 1-stroke 'l'.
  dist += STROKE_COUNT_PENALTY * Math.abs(n - m);
  if (classMismatch(heightClass(dBox), heightClass(tBox))) dist += HEIGHT_CLASS_PENALTY;
  return dist;
}

// drawnStrokes: array of strokes in canvas px. templates: [{ letter, strokes(0-1) }].
// Returns [{ letter, dist, confidence }] sorted best (lowest dist) first.
//
// RECOGNITION = min(DIRECTIONAL DTW, ORDER-AGNOSTIC SHAPE). A letter drawn the
// taught way wins on the directional DTW (its cost is ~0.02, so shape never
// matters). A letter drawn REVERSED or in a weird stroke order fails the
// directional DTW — but its point cloud is identical to the forward letter's
// cloud, so the Chamfer shape distance still matches it. One uniform measure
// thus handles every kind of reversal (point-reversed, order-reversed, partial
// scramble) without generating reversed template copies. Direction is kept
// only as a TIEBREAK: when the cloud shape is torn between two candidates, a
// genuine directional match wins out (the m/u, e/z, t/l pairs differ enough in
// cloud that this rarely fires, but it's the safety net).
const SHAPE_TIE_RATIO = 1.5; // a directional match within this multiple of the best shape score overrides a shape-only winner
export function recognize(drawnStrokes, templates) {
  if (!drawnStrokes.length || !templates.length) return [];
  const drawn = normalize(drawnStrokes);
  const dBox = bbox(drawn);
  if (dBox.w === 0 && dBox.h === 0) return [];
  const results = templates.map((t) => {
    const dir = letterDistance(drawn, dBox, t.strokes);
    const shape = shapeDistance(drawn, dBox, t.strokes);
    return { letter: t.letter, dist: Math.min(dir, shape), dir, shape, confidence: 0 };
  });
  results.sort((a, b) => a.dist - b.dist);
  // Tiebreak: if the cloud-shape winner (best combined score, won on shape) is
  // not also the directional winner, and some other template's DIRECTIONAL
  // distance is within 1.5× of the winner's combined score, that directional
  // match is the real letter — shape was just torn. Move it to the front.
  if (results.length > 1 && isFinite(results[0].dist)) {
    let dirBest = null;
    for (const r of results) if (isFinite(r.dir) && (!dirBest || r.dir < dirBest.dir)) dirBest = r;
    if (dirBest && dirBest !== results[0] && dirBest.dir <= SHAPE_TIE_RATIO * (results[0].dist || 1e-4)) {
      const idx = results.indexOf(dirBest);
      results.splice(idx, 1);
      results.unshift(dirBest);
    }
  }
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