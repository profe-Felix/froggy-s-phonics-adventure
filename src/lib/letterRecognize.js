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
// The anisotropic scale that maps the drawing's bbox onto the template's bbox,
// independently in x and y (a skinny letter widens, a squashed letter stretches),
// with the aspect distortion CAPPED so a degenerate line can't flip orientation.
// Exposed so the "match overlap" visual can render the exact stretch the recognizer
// applies — the user can see when a letter is being deformed to fit a template.
function alignTransform(dBox, tBox) {
  let sx = dBox.w > 1e-4 ? tBox.w / dBox.w : 1;
  let sy = dBox.h > 1e-4 ? tBox.h / dBox.h : 1;
  let capped = false;
  if (sy > sx * ASP_CAP) { sy = sx * ASP_CAP; capped = true; }
  else if (sx > sy * ASP_CAP) { sx = sy * ASP_CAP; capped = true; }
  const dcx = dBox.minX + dBox.w / 2, dcy = dBox.minY + dBox.h / 2;
  const tcx = tBox.minX + tBox.w / 2, tcy = tBox.minY + tBox.h / 2;
  return { sx, sy, capped, dcx, dcy, tcx, tcy };
}
function applyAlign(drawn, tr) {
  return drawn.map((s) => s.map((p) => ({
    x: tr.tcx + (p.x - tr.dcx) * tr.sx,
    y: tr.tcy + (p.y - tr.dcy) * tr.sy,
  })));
}
function alignTo(drawn, dBox, tBox) {
  return applyAlign(drawn, alignTransform(dBox, tBox));
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
  // Emphasize the END DIRECTION: letters that share a bowl but differ in tail
  // direction (q tail ends RIGHT, g tail ends LEFT) differ only in a small
  // fraction of the stroke, so DTW — which averages over all points — dilutes
  // the tail. The explicit end-direction term keeps the tail decisive: a q
  // drawing's rightward tail costs 'g' (leftward tail) extra, while 'q'
  // (matching direction) pays nothing.
  const endA = endDir(a), endB = endDir(b);
  const endDot = endA.x * endB.x + endA.y * endB.y;
  const endPenalty = Math.max(0, 1 - endDot);
  return dtw(a, b) + 0.10 * startCost + 0.05 * endPenalty;
}

function endDir(stroke) {
  if (!stroke || stroke.length < 2) return { x: 0, y: 0 };
  const k = Math.max(2, Math.round(stroke.length * 0.15));
  const a = stroke[stroke.length - 1], b = stroke[Math.max(0, stroke.length - 1 - k)];
  const len = Math.hypot(a.x - b.x, a.y - b.y) || 1;
  return { x: (a.x - b.x) / len, y: (a.y - b.y) / len };
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

// --- Gate A: stroke-count parity for multi-stroke templates ---
// A multi-stroke template (m >= 2: f, i, j, k, t, x, y, ñ) can only be the
// answer if the drawing actually CONTAINS its components. Without this gate,
// anisotropic DTW fusion stretches ONE drawn stroke across several template
// strokes, inventing a crossbar / diagonal / dot the kid never drew — the
// 1-stroke 'a' warped ×2.00 in y onto a 't' stem+crossbar, the 1-stroke 'b'
// warped onto a 'k' stem+diagonal. So for m >= 2 we require count parity:
//   n == m     — exact
//   n == m+1   — one extra stroke (a doubled dot or a split stem) is fine
//   n == m-1   — one missing stroke, ONLY when the template's missing stroke
//                is a dot (the i/j dot the kid forgot); a missing crossbar or
//                diagonal is never tolerated — that component can't be
//                stretched into existence.
// Single-stroke templates (m < 2 — the 19 single-stroke letters) are always
// allowed: fusion already joins extra strokes onto one template stroke, and
// a 1-stroke drawing against a 1-stroke template is the normal case.
function templateHasDot(tmplStrokes) {
  return tmplStrokes.some((s) => isDotStroke(s));
}
function strokeCountAllowed(n, m, tmplStrokes) {
  if (m < 2) return true;
  // Fusion joins N drawn strokes onto M template strokes (M ≤ N), so ANY n ≥ m is
  // allowed — a 4-stroke 'x' (each diagonal split in two) fuses onto the 2-stroke
  // 'x' template. Only n < m is restricted (a missing component can't be stretched
  // into existence), and even then only when the missing stroke is a dot.
  if (n >= m) return true;
  if (n === m - 1 && templateHasDot(tmplStrokes)) return true;
  return false;
}

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
  if (ka === kb) return true;
  // A dot is a defining MARK, not a stroke shape — it is NOT structurally
  // compatible with any real stroke. A bowl of extra ink where a dot should be
  // (a 2-stroke 'a' mis-read as 'i') is a real mismatch: 'i' REQUIRES a dot
  // above the midline, and a bowl of ink below is not that dot. (Dots are still
  // paired positionally inside pairCosts; this only governs the structural-kind
  // penalty, so a genuine dot-vs-dot pair stays compatible via the ka===kb rule.)
  if (ka === 'dot' || kb === 'dot') return false;
  // Straight stems are interchangeable (a slightly tilted vertical is still a
  // stem). Every other shape is ITSELF only — a bowl is a closed loop, a curve
  // is an open arc, a bent is an open chevron; they are not each other. The old
  // bowl|curve allowance let a closed 'd'/'b' bowl match 'k's open chevron (when
  // the chevron classified as a curve), which is exactly the false positive we
  // are removing: features must be accurately recognized.
  if (LINE_KINDS.has(ka) && LINE_KINDS.has(kb)) return true;
  // 'curve' is the generic "this stroke bends" classification that real
  // handwriting falls into when a clean template stem/shoulder/hook is drawn
  // with slight wobble — a not-quite-straight vertical classifies as 'curve'
  // instead of 'vertical', a soft shoulder as 'curve' instead of 'shoulder'.
  // Those are the SAME structural stroke, just messier, so 'curve' is
  // compatible with any other non-dot, non-bowl kind EXCEPT 'horizontal'. A
  // 'horizontal' crossbar is a STRAIGHT line by definition; a curve is not
  // straight, so a curve is NOT a crossbar. This is the a→t / b→k protection:
  // the 'c' curve of a 2-stroke 'a' (curve + stem) cannot fill the 't' crossbar,
  // and a 'b' bowl cannot fill the 'k' bent stroke once it reads as a curve —
  // the structural kind gates the match BEFORE anisotropic DTW can stretch the
  // curve onto the short crossbar. 'bowl' stays strict (a closed loop is a real
  // structural difference — the b→k protection relies on bowl≠shoulder/bent,
  // and a curve↔bowl pairing would dissolve that). curve↔vertical/diagonal
  // stays: a wobbly stem/diagonal legitimately classifies as curve.
  if ((ka === 'curve' || kb === 'curve') && ka !== 'bowl' && kb !== 'bowl') {
    if (ka === 'horizontal' || kb === 'horizontal') return false;
    return true;
  }
  return false;
}
// Classify a normalized (0-1) stroke. classifyStroke takes canvas px and divides
// by CANVAS_W/H, so scale the normalized points back to px first.
function strokeKind(strokeNorm) {
  if (!strokeNorm || strokeNorm.length < 2) return 'dot';
  const px = strokeNorm.map((p) => ({ x: p.x * CANVAS_W, y: p.y * CANVAS_H }));
  return classifyStroke(px).kind;
}
// Classify a FUSED group (one or more drawn strokes joined into one template
// stroke). A single stroke is classified directly. For a MULTI-stroke group we
// must avoid the "artificial bowl" artifact: concatenating non-contiguous
// strokes creates pen-up JUMPS between them, and the loop detector can treat a
// jump as the closing edge of a loop — so a 'k' drawn as stem + two diagonals
// fuses into a polyline that classifies as 'bowl' (the stem up, then a jump back
// down to a diagonal's start closes a "loop"), and a 'd' (which needs a REAL
// closed bowl) then passes the structural gate and wins. Fix: a bowl detected
// on a multi-stroke group is only real if the strokes CONNECT end-to-start (no
// pen-up gap). With gaps the group is an OPEN assembly, so downgrade 'bowl' to
// 'curve' — the kind gate then fires against bowl-templates, pushing 'd' below
// 'k' for a 'k' drawing.
const FUSED_JUMP = 0.06;
function fusedGroupKind(strokesArr) {
  if (!strokesArr || !strokesArr.length) return 'dot';
  if (strokesArr.length === 1) return strokeKind(strokesArr[0]);
  let connects = true;
  for (let i = 0; i < strokesArr.length - 1; i++) {
    const a = strokesArr[i], b = strokesArr[i + 1];
    if (!a || !b || !a.length || !b.length) continue;
    if (Math.hypot(a[a.length - 1].x - b[0].x, a[a.length - 1].y - b[0].y) > FUSED_JUMP) { connects = false; break; }
  }
  const kind = strokeKind(concatStrokes(strokesArr));
  if (kind === 'bowl' && !connects) return 'curve';
  return kind;
}
// Template strokes never change — cache their kinds per template.
const _kindCache = new WeakMap();
function tmplKind(tmpl, i) {
  let arr = _kindCache.get(tmpl);
  if (!arr) { arr = tmpl.map(strokeKind); _kindCache.set(tmpl, arr); }
  return arr[i];
}
// Number of humps on a shoulder stroke (the 'r' shoulder has 1 hump, the 'n'
// shoulder has 2, the 'm' shoulder has 3). Returns null when the stroke is NOT a
// shoulder — humps are a shoulder concept, so we only compare humps when BOTH the
// drawn and template strokes are shoulders (and thus share the same structural
// kind, so the kind gate has already passed). This is the "missing ink" signal: a
// 1-hump drawing cannot be a 2-hump letter no matter how DTW stretches over the
// absent hump.
function strokeShoulderHumps(strokeNorm) {
  if (!strokeNorm || strokeNorm.length < 2) return null;
  const px = strokeNorm.map((p) => ({ x: p.x * CANVAS_W, y: p.y * CANVAS_H }));
  const c = classifyStroke(px);
  if (c.kind !== 'shoulder' || !c.shoulder) return null;
  return c.shoulder.humps || 0;
}
const _humpCache = new WeakMap();
function tmplHumps(tmpl, i) {
  let arr = _humpCache.get(tmpl);
  if (!arr) { arr = tmpl.map(strokeShoulderHumps); _humpCache.set(tmpl, arr); }
  return arr[i];
}
const KIND_PENALTY = 0.18;        // per mismatched stroke pair — pushes a structurally-wrong letter down in the ranking
const PATHWAY_START_POS = 0.15;   // a pathway stroke must BEGIN within this (normalized) distance of the template's start
const START_POS_PENALTY = 0.5;    // per unit of start-point drift beyond the allowance — a stroke that begins somewhere different from the taught path costs more, the "wrong start path" deduction (d's bowl start vs k's midline-right start)
// ABSOLUTE start-height gate. The aligned (template-bbox) start check above is
// done AFTER anisotropic scaling, so it can't tell a stroke that began at the
// TOP guide line from one that began at the BOTTOM — a backwards 'z' (starts at
// the baseline, bottom-left) anisotropically aligns its bbox onto the 'v' bbox
// and its start lands exactly one bbox-height from the 'v' start (which begins
// at the midline, top-left), squeaking under the aligned gate. The ABSOLUTE
// vertical start position is anchored to the guide LINES (a 'v' begins at the
// midline; a 'z' begins at the midline; a backwards 'z' begins at the baseline),
// so it is invariant to anisotropic stretching: a stroke that began at a
// different guide-line height than the taught pathway is simply NOT that
// pathway, no matter how the bbox is stretched. X is left to the aligned gate
// (a letter may be drawn at any horizontal position on the wide canvas). The
// threshold (0.15) comfortably separates a same-guide-line start (correct
// letter, ≤~0.08 with natural variance + the tracing-vs-recognition guide-line
// convention offset) from an opposite-guide-line start (≥~0.21).
const ABS_START_Y = 0.15;
function startYZoneOK(drawnStartY, tmplStartY) {
  return Math.abs(drawnStartY - tmplStartY) <= ABS_START_Y;
}
const HUMP_PENALTY = 0.15;        // per missing/extra hump on a shoulder — the "missing ink" deduction: a 1-hump 'r' matched to a 2-hump 'n' costs 'n' this, because the drawing simply does not contain the second hump 'n' requires
const LINE_ANGLE_TOL = 30;       // a drawn line and a template line must point within this many degrees — a 40° diagonal is not an 85° vertical stem (r/n/h), and a crossbar is not a diagonal. The user's "gates for verticals/horizontals/diagonals": the three line KINDS are no longer freely interchangeable.
// Chord angle (0–90° from horizontal) of a stroke's net displacement — the line
// direction. Used by the line-angle gate so a diagonal can't pose as a vertical.
function chordAngleDeg(strokeNorm) {
  if (!strokeNorm || strokeNorm.length < 2) return null;
  const a = strokeNorm[0], b = strokeNorm[strokeNorm.length - 1];
  const ax = Math.abs(b.x - a.x), ay = Math.abs(b.y - a.y);
  if (ax < 1e-4 && ay < 1e-4) return null;
  return Math.atan2(ay, ax) * 180 / Math.PI;
}

// --- stroke fusion: match N drawn strokes onto an M-stroke template (M ≤ N) ---
// A student who draws a letter in MORE strokes than taught — a 'k' as a stem
// plus two separate diagonals, a 'p' as a bowl plus a stem — should still match
// the taught pathway once their strokes are JOINED IN THE RIGHT ORDER. We try
// every way to partition the drawn strokes (in every order, for small counts)
// into M contiguous groups, concatenate each group into one polyline, and
// DTW-match it to the corresponding template stroke. The best fusion wins. This
// is the "connect the strokes and fit an ideal pathway, even if drawn with a
// different stroke count or order" rule.
function concatStrokes(arr) { const o = []; for (const s of arr) for (const p of s) o.push({ x: p.x, y: p.y }); return o; }
function rangeN(n) { return Array.from({ length: n }, (_, i) => i); }
function permutationsOf(a) {
  if (a.length <= 1) return [a.slice()];
  const out = [];
  for (let i = 0; i < a.length; i++) {
    const rest = a.filter((_, k) => k !== i);
    for (const p of permutationsOf(rest)) out.push([a[i], ...p]);
  }
  return out;
}
// All ways to split n items into m contiguous non-empty groups (as group sizes).
function compositionsOf(n, m) {
  if (m === 1) return [[n]];
  const out = [];
  for (let g = 1; g <= n - (m - 1); g++) for (const r of compositionsOf(n - g, m - 1)) out.push([g, ...r]);
  return out;
}
// Build the fused groups for one (order, sizes) combination. `order` is a list of
// stroke indices (the draw order to try); `src` is the stroke array to pull from
// (aligned or original). Returns m concatenated polylines.
function buildGroups(order, sizes, src) {
  const out = []; let k = 0;
  for (const sz of sizes) {
    const slice = [];
    for (let i = 0; i < sz; i++) slice.push(src[order[k + i]]);
    out.push(concatStrokes(slice));
    k += sz;
  }
  return out;
}
// Like buildGroups, but returns each group's CONSTITUENT strokes (not
// concatenated), so fusedGroupKind can tell whether a bowl is real or a pen-up
// artifact (concatenated polylines hide the jumps between non-touching strokes).
function buildGroupedStrokes(order, sizes, src) {
  const out = []; let k = 0;
  for (const sz of sizes) {
    const slice = [];
    for (let i = 0; i < sz; i++) slice.push(src[order[k + i]]);
    out.push(slice);
    k += sz;
  }
  return out;
}
// Full distance (DTW + all penalties) for one fused grouping: aGroups are the
// aligned concatenated polylines, dGroups the original-frame ones (for kind
// classification), matched to the template's M strokes. n = drawn stroke count
// (for the stroke-count penalty), m = template stroke count.
function scoreGrouping(aGroups, dGroups, dGroupStrokes, tmpl, n, m, dBox, tBox) {
  const costs = aGroups.map((g, j) => strokeDtw(g, tmpl[j]));
  let dist = costs.reduce((s, c) => s + c, 0) / costs.length;
  dist += STROKE_COUNT_PENALTY * Math.abs(n - m);
  if (classMismatch(heightClass(dBox), heightClass(tBox))) dist += HEIGHT_CLASS_PENALTY;
  for (let j = 0; j < m; j++) {
    const dk = fusedGroupKind(dGroupStrokes[j]);
    const tk = tmplKind(tmpl, j);
    if (!kindsCompatible(dk, tk)) dist += KIND_PENALTY;
    // Line-angle gate: a drawn line and a template line must point the same way.
    // A 40° diagonal is not an 85° vertical stem (r/n/h), and a crossbar is not a
    // diagonal — so a clearly-wrong line direction excludes this fusion outright.
    if (LINE_KINDS.has(dk) && LINE_KINDS.has(tk)) {
      const da = chordAngleDeg(dGroups[j]), ta = chordAngleDeg(tmpl[j]);
      if (da != null && ta != null && Math.abs(da - ta) > LINE_ANGLE_TOL) return Infinity;
    }
    if (!isDotStroke(dGroups[j]) && !isDotStroke(tmpl[j])) {
      // Absolute start-height gate: a fused group whose first point began at a
      // different guide-line height than the template stroke's start is NOT this
      // pathway (a backwards 'z' begins at the baseline; 'v' begins at the
      // midline) — exclude the fusion outright instead of letting anisotropic
      // stretching hide the wrong start.
      if (!startYZoneOK(dGroups[j][0].y, tmpl[j][0].y)) return Infinity;
      const sp = Math.hypot(aGroups[j][0].x - tmpl[j][0].x, aGroups[j][0].y - tmpl[j][0].y);
      if (sp > PATHWAY_START_POS) dist += START_POS_PENALTY * (sp - PATHWAY_START_POS);
    }
    const dh = strokeShoulderHumps(dGroups[j]);
    const th = tmplHumps(tmpl, j);
    if (dh != null && th != null && dh !== th) dist += HUMP_PENALTY * Math.abs(dh - th);
  }
  return dist;
}

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

// Total distance from a drawing to one template. For n ≥ m and n > 1 we FUSE:
// try every way to join the drawn strokes (in every order, for small counts)
// into the template's M strokes, then DTW each fused group to its template
// stroke. This is what lets a 'k' drawn as 3 strokes (stem + two diagonals)
// match the 2-stroke 'k' pathway — the two diagonals fuse into the bent stroke.
// A single drawn stroke, or fewer strokes than the template, uses the ordered
// un-fused match (with the dot-aware pairing) plus the stroke-count penalty.
function letterDistance(drawn, dBox, tmpl) {
  const n = drawn.length, m = tmpl.length;
  const tBox = bbox(tmpl);
  if (n >= m && n > 1) {
    const aligned = alignTo(drawn, dBox, tBox);
    const orders = n <= 4 ? permutationsOf(rangeN(n)) : [rangeN(n)];
    let best = Infinity;
    for (const order of orders) {
      for (const sizes of compositionsOf(n, m)) {
        const aG = buildGroups(order, sizes, aligned);
        const dG = buildGroups(order, sizes, drawn);
        const dGS = buildGroupedStrokes(order, sizes, drawn);
        const d = scoreGrouping(aG, dG, dGS, tmpl, n, m, dBox, tBox);
        if (d < best) best = d;
      }
    }
    return best;
  }
  const aligned = alignTo(drawn, dBox, tBox);
  const costs = pairCosts(drawn, dBox, tmpl);
  if (!costs.length) return Infinity;
  let dist = costs.reduce((s, c) => s + c, 0) / costs.length;
  // unmatched strokes (extra or missing) cost a flat penalty each — this is what
  // keeps a 2-stroke 't' from collapsing into a 1-stroke 'l'.
  dist += STROKE_COUNT_PENALTY * Math.abs(n - m);
  if (classMismatch(heightClass(dBox), heightClass(tBox))) dist += HEIGHT_CLASS_PENALTY;
  // Per-stroke structural + start-position deductions. A bowl is not a bent
  // chevron even if DTW warps them close (KIND_PENALTY), AND a stroke that begins
  // somewhere different from the taught path costs more.
  const p = Math.min(aligned.length, tmpl.length);
  for (let i = 0; i < p; i++) {
    const dk = strokeKind(drawn[i]), tk = tmplKind(tmpl, i);
    if (!kindsCompatible(dk, tk)) dist += KIND_PENALTY;
    if (LINE_KINDS.has(dk) && LINE_KINDS.has(tk)) {
      const da = chordAngleDeg(drawn[i]), ta = chordAngleDeg(tmpl[i]);
      if (da != null && ta != null && Math.abs(da - ta) > LINE_ANGLE_TOL) return Infinity;
    }
    if (!isDotStroke(drawn[i]) && !isDotStroke(tmpl[i])) {
      // Absolute start-height gate (see ABS_START_Y): a stroke beginning at a
      // different guide-line height than the taught pathway can't be this letter
      // — excludes it outright so a backwards 'z' (baseline start) can't read as
      // 'v' (midline start) regardless of anisotropic alignment.
      if (!startYZoneOK(drawn[i][0].y, tmpl[i][0].y)) return Infinity;
      const sp = Math.hypot(aligned[i][0].x - tmpl[i][0].x, aligned[i][0].y - tmpl[i][0].y);
      if (sp > PATHWAY_START_POS) dist += START_POS_PENALTY * (sp - PATHWAY_START_POS);
    }
    const dh = strokeShoulderHumps(drawn[i]);
    const th = tmplHumps(tmpl, i);
    if (dh != null && th != null && dh !== th) dist += HUMP_PENALTY * Math.abs(dh - th);
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
// An 'e' crossbar is a STRAIGHT horizontal run spanning a good fraction of the
// drawing's width. The closed-loop bowl letters (o, a, d, g, q, b, p) have NO
// such run — their tops/bottoms are curved arcs that only flatten briefly
// (~30% of width) before turning, and a real crossbar is a drawn line (~60%+
// of width, nearly constant y). This gate answers the user's "a horizontal bar
// should not match o, a, d, g": when the drawing contains a straight
// crossbar, those bowl letters are excluded and the match falls to 'e'. It is
// ASYMMETRIC — only fires when a crossbar IS detected — so a faint 'e' whose
// crossbar wasn't picked up still competes normally (no regression on
// hard-to-read e's), and a clean 'o' (curved, no straight run) is untouched.
const CROSSBAR_W_FRAC = 0.50;     // the bar must span >= half the drawing width — an 'o' arc flattens over only ~32%
const CROSSBAR_STRAIGHT = 0.08;   // over a long run the bar's y varies < this fraction of the height — a curved bowl edge deviates more
const NO_CROSSBAR_BOWLS = new Set(['o', 'a', 'd', 'g', 'q', 'b', 'p']);
// Letters whose horizontal bar sits at the MIDLINE (top of x-height): 't' and 'f'.
// An 'e' bar sits in the MIDDLE of the loop — clearly below the midline, between
// midline (0.367) and baseline (0.633). So a crossbar detected in that lower band
// is an 'e' bar and cannot be 't'/'f'; a crossbar at/above the midline is a 't'/'f'
// bar. This is the user's rule: "the horizontal stroke between midline and baseline
// is unique to 'e'." CROSSBAR_LOW_MIN is the y below which a bar counts as low
// (e-position) — set at 0.43, just under the 'e' middle (~0.50) and above the
// 't' midline (0.367), so the two do not collide.
const CROSSBAR_LOW_MIN = 0.43;
const NO_LOW_CROSSBAR = new Set(['t', 'f']);
// Detect a straight horizontal crossbar and return { present, y } — y is the
// average y of the longest qualifying straight run (normalized, 0=top). Callers
// use `present` as a boolean AND `y` to decide whether the bar is low (e) or
// high (t/f).
function crossbarInfo(drawnNorm) {
  const pts = [];
  for (const s of drawnNorm) if (s) for (const p of s) pts.push(p);
  if (pts.length < 4) return { present: false, y: null };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
  const w = maxX - minX, h = maxY - minY;
  if (w < 0.05 || h < 0.05) return { present: false, y: null };
  // Track the longest qualifying run so its midpoint y is the bar's position.
  let best = { dx: 0, y: null };
  let runDx = 0, runMinY = Infinity, runMaxY = -Infinity;
  const flush = () => {
    if (runDx >= CROSSBAR_W_FRAC * w && (runMaxY - runMinY) <= CROSSBAR_STRAIGHT * h) {
      if (runDx > best.dx) best = { dx: runDx, y: (runMinY + runMaxY) / 2 };
    }
    runDx = 0; runMinY = Infinity; runMaxY = -Infinity;
  };
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
    if (Math.abs(dx) >= 4 * Math.abs(dy) && Math.abs(dx) > 0.004) {
      runDx += Math.abs(dx);
      if (pts[i].y < runMinY) runMinY = pts[i].y;
      if (pts[i].y > runMaxY) runMaxY = pts[i].y;
    } else {
      flush();
    }
  }
  flush();
  return { present: best.y != null, y: best.y };
}
function hasECrossbar(drawnNorm) { return crossbarInfo(drawnNorm).present; }
// Is the detected crossbar in the LOWER band (between midline and baseline)?
// That is the 'e' position — distinct from 't'/'f' whose bar sits at the midline.
function crossbarIsLow(drawnNorm) {
  const c = crossbarInfo(drawnNorm);
  return c.present && c.y != null && c.y >= CROSSBAR_LOW_MIN;
}
// A template "has a horizontal run" if its taught pathway contains a straight
// horizontal ink run — a crossbar (t, f), the middle bar of an 'e', or the
// top/bottom bars of a zigzag (z). When the drawing contains a horizontal
// crossbar, letters WITHOUT such a run cannot be the answer: the crossbar is
// structural ink those letters' forms don't have. This is the "a horizontal
// line should remove v, r, m, u" rule — shoulders, curves, and bowls (v, r, m,
// u, n, h, c, o, s…) have no straight horizontal run, so a drawn crossbar
// excludes them, leaving only the crossbar/zigzag letters (t, f, e, z).
const _hRunCache = new WeakMap();
function templateHasHorizontalRun(t) {
  if (_hRunCache.has(t)) return _hRunCache.get(t);
  const v = crossbarInfo(t.strokes).present;
  _hRunCache.set(t, v);
  return v;
}

// --- DIAGONAL gate (the user's "diagonal line test") ---
// A 'k' leg is a straight DIAGONAL run (down-right then down-left at ~45°). An
// 'h' arch is a SMOOTH curve: the up-stroke is vertical (90°, out of the diagonal
// band) and the curve over the top is horizontal-ish at the apex — there is no
// sustained straight diagonal anywhere. Anisotropic DTW can stretch the 'h' arch
// onto the 'k' chevron's bounding box and score it close (a 'bowl'/'curve' leg
// passing the kind gate once the template leg reads as 'curve' rather than
// 'bent'), but the 'h' simply does not CONTAIN a diagonal — the ink the 'k' leg
// requires is absent. So the diagonal gate, symmetric in spirit to the crossbar
// gate: when the drawing contains NO straight diagonal run, any template whose
// taught pathway DOES contain a straight diagonal run is excluded. The 'k' leg,
// the 'v'/'w'/'x' arms, the 'y' diagonals, and the 'z' connector all have a
// diagonal run in their templates; an 'h' (or 'n','m','r','b','d'…) drawing has
// none, so 'k' (and v/w/x/y/z) drop out for an 'h' drawing. A real 'k' drawing
// HAS diagonals, so the gate (drawing LACKS a diagonal) does not fire and 'k' is
// unaffected — this is the asymmetric safety: only the absence of diagonal ink
// is penalized, never its presence.
const DIAG_ANGLE_LO = 20;   // degrees from horizontal — below this a run is horizontal, not diagonal
const DIAG_ANGLE_HI = 70;   // above this a run is vertical, not diagonal
const DIAG_MIN_LEN = 0.14;  // the straight diagonal run must span >= this fraction of the drawing's larger dimension — an 'h' arch has no diagonal this long; a 'k' leg is ~0.2-0.3
// Detect a straight MONOTONIC diagonal run in the drawing (normalized 0-1).
// "Straight" here means the run's segments keep the same x-sign and y-sign
// (monotonic — no zigzag, so a curve that doubles back doesn't qualify) AND each
// segment's angle sits in the diagonal band (20-70°), AND the accumulated arc
// length reaches DIAG_MIN_LEN of the drawing's larger bbox dimension. A smooth
// 'h' arch breaks the band on every vertical up/down stroke and never accumulates
// a diagonal run; a 'k' leg stays in-band and monotonic for its full length.
function hasDiagonalRun(drawnNorm) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, any = false;
  for (const s of drawnNorm) if (s) for (const p of s) {
    any = true;
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  if (!any) return false;
  const w = maxX - minX, h = maxY - minY;
  if (w < 0.05 || h < 0.05) return false;
  const minLen = DIAG_MIN_LEN * Math.max(w, h);
  let best = 0;
  for (const s of drawnNorm) {
    if (!s || s.length < 2) continue;
    let runLen = 0, runSx = 0, runSy = 0, curSx = 0, curSy = 0;
    const flush = () => {
      if (runLen >= minLen) {
        const ax = Math.abs(runSx), ay = Math.abs(runSy);
        if (ax > 1e-4 && ay > 1e-4) {
          const ang = Math.atan2(ay, ax) * 180 / Math.PI;
          if (ang >= DIAG_ANGLE_LO && ang <= DIAG_ANGLE_HI && runLen > best) best = runLen;
        }
      }
      runLen = 0; runSx = 0; runSy = 0; curSx = 0; curSy = 0;
    };
    for (let i = 1; i < s.length; i++) {
      const dx = s[i].x - s[i - 1].x, dy = s[i].y - s[i - 1].y;
      const seg = Math.hypot(dx, dy);
      if (seg < 1e-5) continue;
      const sx = Math.sign(dx), sy = Math.sign(dy);
      const ang = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;
      const inBand = ang >= DIAG_ANGLE_LO && ang <= DIAG_ANGLE_HI;
      const sameSign = (curSx === 0 || sx === curSx) && (curSy === 0 || sy === curSy);
      if (inBand && sameSign) {
        runLen += seg; runSx += dx; runSy += dy; curSx = sx; curSy = sy;
      } else {
        flush();
        if (inBand) { runLen = seg; runSx = dx; runSy = dy; curSx = sx; curSy = sy; }
      }
    }
    flush();
  }
  return best > 0;
}
const _diagCache = new WeakMap();
function templateHasDiagonalRun(t) {
  if (_diagCache.has(t)) return _diagCache.get(t);
  const v = hasDiagonalRun(t.strokes);
  _diagCache.set(t, v);
  return v;
}

// px-stroke wrapper for callers that have canvas-pixel strokes (not normalized).
export function drawingHasCrossbar(pxStrokes) { return hasECrossbar(normalize(pxStrokes)); }

// --- END-DIRECTION gate (the robust h→k discriminator) ---
// The diagonal-run gate above is tripped by a hump's up-right START: a smooth
// 'h' hump begins by going up-and-to-the-right, which registers a short diagonal
// run, so the gate decides "the drawing has a diagonal" and lets 'k' through.
// The RELIABLE structural difference is the END direction — the signal the stroke
// recognizer already reports ("a curve… that straightens into a vertical stem"):
// the 'h' hump ENDS in a VERTICAL descent (the right stem of the 'h'), while the
// 'k' leg ENDS in a DIAGONAL kick. So when a template has a stroke that ends
// DIAGONALLY (the k leg, the v/w/x/y arms, the c/e/s sideways exit) but NO drawn
// stroke ends diagonally, the template requires a kick/exit the drawing simply
// lacks — exclude it. Asymmetric (only "template needs a diagonal end, drawing
// has none"): a real 'k' drawing HAS a diagonal end so 'k' is never excluded, and
// a vertical-ending template ('h','n','m','r','u'…) is never excluded for a
// diagonal drawing. Dots are marks with no direction and are skipped. The 'k'
// template leg classifies as a smooth 'curve' (not 'bent'), so the structural-
// kind gate cannot separate it from the hump — but its diagonal END is invariant.
const END_VERT_X = 0.25;
const END_DIAG_X = 0.45;
const END_DIAG_Y = 0.30;
function endIsVertical(d) { return Math.abs(d.x) <= END_VERT_X; }
function endIsDiagonal(d) { return Math.abs(d.x) >= END_DIAG_X && Math.abs(d.y) >= END_DIAG_Y; }
function strokeEndsDiagonal(stroke) {
  if (!stroke || stroke.length < 2 || isDotStroke(stroke)) return false;
  return endIsDiagonal(endDir(stroke));
}
const _endDiagCache = new WeakMap();
function templateEndsDiagonal(t) {
  if (_endDiagCache.has(t)) return _endDiagCache.get(t);
  const v = (t.strokes || []).some(strokeEndsDiagonal);
  _endDiagCache.set(t, v);
  return v;
}
function drawingEndsDiagonal(drawn) { return drawn.some(strokeEndsDiagonal); }

export function recognize(drawnStrokes, templates) {
  if (!drawnStrokes.length || !templates.length) return [];
  const drawn = normalize(drawnStrokes);
  const dBox = bbox(drawn);
  if (dBox.w === 0 && dBox.h === 0) return [];
  const n = drawn.length;
  const drawHasBar = hasECrossbar(drawn);
  const lowBar = crossbarIsLow(drawn);
  const drawHasDiag = hasDiagonalRun(drawn);
  const drawEndsDiag = drawingEndsDiagonal(drawn);
  const results = templates.map((t) => {
    let excluded = false;
    if (drawHasBar) {
      if (NO_CROSSBAR_BOWLS.has(t.letter)) excluded = true;
      if (!templateHasHorizontalRun(t)) excluded = true;
      if (lowBar && NO_LOW_CROSSBAR.has(t.letter)) excluded = true;
    }
    // Diagonal gate: a template whose taught pathway contains a straight diagonal
    // run (k leg, v/w/x arms, y, z connector) cannot be the answer when the drawing
    // contains NO straight diagonal — the diagonal ink those letters require is
    // simply absent (an 'h' arch has no diagonal). Asymmetric: only absence is
    // penalized, so a real 'k' (which has diagonals) is never excluded.
    if (!drawHasDiag && templateHasDiagonalRun(t)) excluded = true;
    // End-direction gate: a template whose stroke ENDS in a diagonal kick/exit
    // (k leg, v/w/x/y, c/e/s) cannot be the answer when NO drawn stroke ends
    // diagonally — the hump ends in a VERTICAL stem, not a kick. The diagonal-run
    // gate is tripped by the hump's up-right start; the END direction is invariant.
    if (!drawEndsDiag && templateEndsDiagonal(t)) excluded = true;
    return {
      letter: t.letter,
      dist: excluded ? Infinity : (strokeCountAllowed(n, t.strokes.length, t.strokes) ? letterDistance(drawn, dBox, t.strokes) : Infinity),
      confidence: 0,
    };
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

// --- order-tolerant SHAPE match (the letter GUESS, decoupled from pathway) ---
// The GUESS ("I'm 80% sure you wrote a b") must be driven by SHAPE: does the ink
// fill the letter's form, regardless of stroke ORDER, COUNT, or DIRECTION. A
// student who draws the stem first and then attaches the bowl still drew a 'b' —
// the shape is a b. The pathway check (DTW in taught order + stroke count +
// direction) is a SEPARATE signal — the badge: green when followed, YELLOW when
// the letter is right but the taught path wasn't. This is the "don't let
// stroke-count override the certainty of the letter" rule: count/order penalize
// the PATHWAY, not the IDENTITY. So a 'b' drawn in 2 strokes reads "b, 80% sure"
// and gets a yellow pathway badge — instead of being misread as 'k' (which only
// won because it matched the 2-stroke COUNT, not the b SHAPE).
//
// Shape distance = bidirectional CHAMFER after anisotropic alignment (does each
// drawing point land on the template, and is the template covered) + light
// structural-identity penalties that chamfer alone blurs: a closed bowl vs an
// open bent chevron cover similar area (KIND), shoulder hump count (the missing
// ink signal), and height class. ALL structural checks are ORDER- and
// COUNT-tolerant (set-based): a template kind is "covered" if ANY drawn stroke is
// compatible; a MISSING template kind costs (a 'k' needs a bent the drawing
// lacks), but extra drawn ink does NOT (a 2-stroke 'b' stem is not "extra" — the
// chamfer d2t already charges for ink that doesn't land on the template, and the
// stem IS part of a b).
const SHAPE_R = 28;       // points per stroke for chamfer — dense enough to resolve shape, cheap for the O(n*m) nearest sweep
const SHAPE_T = 0.012;    // softmax temperature for the shape distance (chamfer scale is tighter than DTW, so a sharper T gives a clean letter a confident read)
function allPoints(strokes, r) {
  const out = [];
  for (const s of strokes) { const rs = resample(s, r); for (const p of rs) out.push(p); }
  return out;
}
// Bidirectional chamfer: avg(drawing→template) + avg(template→drawing). The first
// charges for ink that lands off the template (an 'i' dot over an 'l' line), the
// second for template parts the ink fails to cover. Both are order/direction
// agnostic — that is exactly what makes a stem-then-bowl 'b' still read as 'b'.
function chamfer(A, B) {
  if (!A.length || !B.length) return 1;
  let sumAB = 0;
  for (const p of A) { let mn = Infinity; for (const q of B) { const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2; if (d < mn) mn = d; } sumAB += Math.sqrt(mn); }
  let sumBA = 0;
  for (const p of B) { let mn = Infinity; for (const q of A) { const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2; if (d < mn) mn = d; } sumBA += Math.sqrt(mn); }
  return (sumAB / A.length + sumBA / B.length) / 2;
}
// Order-/count-tolerant structural identity. Missing template kinds cost; extra
// drawn ink does not (a stem fused into a 1-stroke 'b' template is not "extra" —
// the template's bowl stroke already covers the stem geometrically).
function shapeStructPenalty(drawn, tmpl) {
  let pen = 0;
  const dKinds = drawn.map(strokeKind);
  const tKindsArr = tmpl.map(strokeKind);
  for (const tk of tKindsArr) {
    let covered = false;
    for (const dk of dKinds) if (kindsCompatible(dk, tk)) { covered = true; break; }
    if (!covered) pen += KIND_PENALTY;
  }
  // Humps are a shoulder concept — compare total humps (order-tolerant). A 1-hump
  // drawing cannot be a 2-hump 'n' or 3-hump 'm' no matter how chamfer stretches.
  const dHumps = drawn.map(strokeShoulderHumps).filter((h) => h != null);
  const tHumps = tmpl.map(strokeShoulderHumps).filter((h) => h != null);
  if (dHumps.length && tHumps.length) {
    pen += HUMP_PENALTY * Math.abs(dHumps.reduce((a, b) => a + b, 0) - tHumps.reduce((a, b) => a + b, 0));
  }
  return pen;
}
function shapeDistance(drawn, dBox, tmpl) {
  const tBox = bbox(tmpl);
  const aligned = alignTo(drawn, dBox, tBox);
  let dist = chamfer(allPoints(aligned, SHAPE_R), allPoints(tmpl, SHAPE_R));
  dist += shapeStructPenalty(drawn, tmpl);
  if (classMismatch(heightClass(dBox), heightClass(tBox))) dist += HEIGHT_CLASS_PENALTY;
  return dist;
}
// drawnStrokes: array of strokes in canvas px. templates: [{ letter, strokes }].
// Returns [{ letter, dist, confidence }] sorted best (lowest shape dist) first —
// the SHAPE identity of the ink, decoupled from the taught pathway. Use
// pathwayMatch() separately to decide the green/yellow pathway badge.
export function shapeGuess(drawnStrokes, templates) {
  if (!drawnStrokes.length || !templates.length) return [];
  const drawn = normalize(drawnStrokes);
  const dBox = bbox(drawn);
  if (dBox.w === 0 && dBox.h === 0) return [];
  const n = drawn.length;
  const drawHasBar = hasECrossbar(drawn);
  const lowBar = crossbarIsLow(drawn);
  const drawHasDiag = hasDiagonalRun(drawn);
  const drawEndsDiag = drawingEndsDiagonal(drawn);
  const results = templates.map((t) => {
    let excluded = false;
    if (drawHasBar) {
      if (NO_CROSSBAR_BOWLS.has(t.letter)) excluded = true;
      if (!templateHasHorizontalRun(t)) excluded = true;
      if (lowBar && NO_LOW_CROSSBAR.has(t.letter)) excluded = true;
    }
    // Diagonal gate (see recognize): a template requiring a diagonal run is
    // excluded when the drawing has no straight diagonal — the 'h'→'k' shape
    // confusion. Shape IDENTITY still drops 'k' for an 'h' drawing because the
    // diagonal ink is absent; a real 'k' drawing keeps its diagonals.
    if (!drawHasDiag && templateHasDiagonalRun(t)) excluded = true;
    // End-direction gate (see recognize): the 'h' hump ends in a vertical stem,
    // the 'k' leg ends in a diagonal kick — exclude templates needing a diagonal
    // end when no drawn stroke ends diagonally. Robust where the diagonal-run
    // gate is tripped by the hump's up-right start.
    if (!drawEndsDiag && templateEndsDiagonal(t)) excluded = true;
    return {
      letter: t.letter,
      dist: excluded ? Infinity : (strokeCountAllowed(n, t.strokes.length, t.strokes) ? shapeDistance(drawn, dBox, t.strokes) : Infinity),
      confidence: 0,
    };
  });
  results.sort((a, b) => (isFinite(a.dist) ? a.dist : Infinity) - (isFinite(b.dist) ? b.dist : Infinity));
  const finite = results.filter((r) => isFinite(r.dist));
  if (finite.length) {
    let sum = 0;
    for (const r of finite) sum += Math.exp(-r.dist / SHAPE_T);
    for (const r of results) r.confidence = isFinite(r.dist) ? Math.round((Math.exp(-r.dist / SHAPE_T) / sum) * 100) : 0;
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
const GROUP_PAIR_DIR = 0.26;    // every fused stroke pair's DTW at/below this = the group is this letter, directionally
export function groupFormsLetter(strokesPx, templates) {
  const drawn = normalize(strokesPx);
  if (!drawn.length) return null;
  const dBox = bbox(drawn);
  if (dBox.w === 0 && dBox.h === 0) return null;
  const n = drawn.length;
  let best = null, bestScore = Infinity;
  for (const t of templates) {
    if (!t.strokes) continue;
    const m = t.strokes.length;
    if (n < m) continue;               // can't fuse up to more strokes than were drawn
    const tBox = bbox(t.strokes);
    const aligned = alignTo(drawn, dBox, tBox);
    const orders = n <= 4 ? permutationsOf(rangeN(n)) : [rangeN(n)];
    for (const order of orders) {
      for (const sizes of compositionsOf(n, m)) {
        const aG = buildGroups(order, sizes, aligned);
        const costs = aG.map((g, j) => strokeDtw(g, t.strokes[j]));
        const maxPair = Math.max(...costs);
        if (maxPair <= GROUP_PAIR_DIR && maxPair < bestScore) { bestScore = maxPair; best = t.letter; }
      }
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
const PATHWAY_DIST = 0.18;    // average per-stroke DTW below this = the stroke shapes genuinely match (not just "closest available") — loosened from 0.14: real handwriting sits ~0.10–0.16 and was failing the stricter bar
const DIR_THRESH = 0.0;       // start-tangent dot above this = same starting direction — 0.0 rejects only genuinely REVERSED strokes (dot<0). The old 0.5 falsely rejected diagonals (v/x/y) and slightly-off stems whose first-segment direction wobbled under handwriting variance. Reversed strokes still fail — the f hook points up/right while the k stem points down (dot<0) — so the f→k protection holds.
const PATHWAY_START_GATE = 0.30;  // hard start-position gate for the pathway BADGE — deliberately looser than the 0.15 soft penalty in recognize(): a multi-stroke letter's 2nd/3rd stroke naturally begins at a different relative spot (a 't' crossbar begun at center vs the template's left end; a 'k' chevron begun mid-right) and that is proportion variance, NOT a wrong pathway. The soft penalty still nudges recognition; the badge no longer hard-fails on it.

function startDir(stroke) {
  const rs = resample(stroke, R);
  if (rs.length < 2) return { x: 0, y: 0 };
  const k = Math.max(2, Math.round(rs.length * 0.15));
  const a = rs[0], b = rs[Math.min(k, rs.length - 1)];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

// Does one fused grouping follow the template's taught pathway cleanly? Every
// fused group must match its template stroke in shape (DTW), starting direction,
// start position, structural kind, and hump count. Shared by the n==m and the
// fused (n>m) paths.
// Returns '' when the grouping follows the taught pathway cleanly, else a short
// reason tag naming the first failing gate (s1:shape / s1:dir / s1:start /
// s1:kind / s1:humps / avg). Used by pathwayMatch (boolean) and the diagnostic
// pathwayMatchDebug (reason) so the UI can show WHY a correct-looking letter was
// flagged "wrong pathway".
function fusedPathwayOk(aGroups, dGroups, dGroupStrokes, template) {
  const m = template.strokes.length;
  let sum = 0;
  for (let i = 0; i < m; i++) {
    const a = aGroups[i], b = template.strokes[i];
    const c = strokeDtw(a, b);
    if (c > PATHWAY_DIST) return `s${i + 1}:shape ${c.toFixed(2)}`;
    sum += c;
    // A dot is a MARK — its direction, start position, and structural kind are
    // noise (a tap, a tiny up-flick, a small down-flick are all "a dot"). So when
    // the TEMPLATE stroke is a dot, skip the direction, start-position, and kind
    // gates for this pair; the shape (centroid/nearest) check above already
    // verified the mark sits in the right place. When the DRAWN stroke is a dot
    // but the template expects a real stroke, the kind gate still fires (a dot
    // where a stem/crossbar should be is a real mismatch).
    const bIsDot = isDotStroke(b);
    // A straight LINE (vertical stem, horizontal crossbar, diagonal) has no
    // meaningful "direction" for the pathway badge: drawing it left-to-right or
    // right-to-left, top-to-bottom or bottom-to-top, is the SAME correct stroke.
    // The direction gate was firing -1.00 (exactly reversed) on a correctly-drawn
    // crossbar after the anisotropic x-stretch on a narrow drawing — a false
    // "wrong pathway" on a letter the student formed correctly. The DTW SHAPE
    // gate (direction-preserving by construction) already rejects a stroke that
    // goes the genuinely wrong way (a bottom-up stem, a right-to-left crossbar
    // against a left-to-right template scores high DTW), so skipping the
    // direction gate for line template strokes is safe: curves, bowls,
    // shoulders and hooks keep the gate (their direction is structural).
    const bIsLine = !bIsDot && LINE_KINDS.has(tmplKind(template.strokes, i));
    if (!isDotStroke(dGroups[i]) && !bIsDot) {
      // Absolute start-height gate (see ABS_START_Y): the green "correct pathway"
      // badge requires the stroke to have BEGUN at the taught guide-line height.
      // A backwards 'z' starts at the baseline while 'v' starts at the midline —
      // different guide lines — so the badge comes back yellow, not green, even
      // though anisotropic alignment made the shapes overlap. dGroups[i] is the
      // RAW (pre-alignment) stroke, so this reads the true start height.
      if (!startYZoneOK(dGroups[i][0].y, b[0].y)) return `s${i + 1}:ystart ${Math.abs(dGroups[i][0].y - b[0].y).toFixed(2)}`;
      if (!bIsLine) {
        const da = startDir(a), db = startDir(b);
        const dot = da.x * db.x + da.y * db.y;
        if (dot < DIR_THRESH) return `s${i + 1}:dir ${dot.toFixed(2)}`;
      }
      const startPos = Math.hypot(a[0].x - b[0].x, a[0].y - b[0].y);
      if (startPos > PATHWAY_START_GATE) return `s${i + 1}:start ${startPos.toFixed(2)}`;
    }
    if (!bIsDot) {
      const dk = fusedGroupKind(dGroupStrokes[i]), tk = tmplKind(template.strokes, i);
      if (!kindsCompatible(dk, tk)) return `s${i + 1}:kind ${dk}/${tk}`;
    }
    const dh = strokeShoulderHumps(dGroups[i]);
    const th = tmplHumps(template.strokes, i);
    if (dh != null && th != null && dh !== th) return `s${i + 1}:humps ${dh}/${th}`;
  }
  if (sum / m >= PATHWAY_DIST) return `avg ${(sum / m).toFixed(2)}`;
  return '';
}

export function pathwayMatch(drawnStrokes, template) {
  return pathwayMatchDebug(drawnStrokes, template) === '';
}

// Same as pathwayMatch but returns the failing-gate reason ('' = ok). For the
// diagnostic self-test and for surfacing "why wrong pathway" in the UI.
export function pathwayMatchDebug(drawnStrokes, template) {
  if (!template || !Array.isArray(template.strokes) || !template.strokes.length) return 'no-template';
  const drawn = normalize(drawnStrokes);
  const n = drawn.length;
  if (!n) return 'no-strokes';
  const m = template.strokes.length;
  // Gate A: a multi-stroke template whose components the drawing doesn't
  // contain can't be a followed pathway — the crossbar/diagonal/dot is missing.
  if (!strokeCountAllowed(n, m, template.strokes)) return `count ${n}/${m}`;
  // GREEN "correct pathway" requires the EXACT taught stroke count. When the
  // drawing has MORE strokes than the template, recognition may still match by
  // JOINING strokes (fusion) — but a joined result is "right letter, wrong
  // pathway", not a followed pathway. So n > m never returns '' here, even when
  // the fused shapes happen to line up. This stops a 3-stroke 'e' from showing a
  // green 'x' (2-stroke) badge: 'x' can still be the guess, but the badge flags
  // that the ink was joined, not drawn as taught. (A drawing with FEWER strokes
  // than the template already failed Gate A above unless the missing stroke is a
  // dot — and a missing dot is still not the taught pathway, so n < m also stays
  // non-green.)
  if (n !== m) return `count ${n}/${m}`;
  const dBox = bbox(drawn);
  const tBox = bbox(template.strokes);
  const aligned = alignTo(drawn, dBox, tBox);
  return fusedPathwayOk(aligned, drawn, drawn.map((s) => [s]), template);
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

// Build the exact anisotropic alignment the recognizer uses to fit a drawing onto
// a template, plus the scale factors and aspect-cap flag — for the "match overlap"
// visual. Returns the aligned drawn strokes (indigo, the stretched drawing) and the
// template strokes (gray), both in normalized 0-1 template-bbox space, so they can
// be rendered overlaid in one frame. sx/sy are the per-axis stretch; capped=true
// means the aspect distortion hit the ASP_CAP clamp (the distortion was so extreme
// it got clamped — the case the user wants to spot for h/v/z).
export function overlapAlignment(drawnStrokes, template) {
  if (!template || !Array.isArray(template.strokes) || !template.strokes.length) return null;
  const drawn = normalize(drawnStrokes);
  const dBox = bbox(drawn);
  if (dBox.w === 0 && dBox.h === 0) return null;
  const tBox = bbox(template.strokes);
  const tr = alignTransform(dBox, tBox);
  const aligned = applyAlign(drawn, tr);
  return { aligned, template: template.strokes, drawn, sx: tr.sx, sy: tr.sy, capped: tr.capped, dBox, tBox };
}