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
  const seDist = Math.hypot(end.x - start.x, end.y - start.y);
  const closed = seDist < span * 0.25; // start≈end → closed loop
  // Initial tangent: direction of the first ~15% of the stroke (where the pen
  // started). More reliable than start→end for loops that return to near the
  // start — an 'e' drawn as a loop has start≈end (looks closed) but it STARTS with
  // a horizontal rightward flick, whereas an 'a' starts by curving left. Checking
  // the initial tangent catches that even when the loop closes.
  const k = Math.max(2, Math.round(rs.length * 0.15));
  const i0 = rs[0], i1 = rs[Math.min(k, rs.length - 1)];
  const tvec = { x: i1.x - i0.x, y: i1.y - i0.y };
  const tlen = Math.hypot(tvec.x, tvec.y) || 1;
  return {
    cloud: tr.map((p) => ({ x: p.x / span, y: p.y / span })),
    dir: { x: tvec.x / tlen, y: tvec.y / tlen },
    closed,
  };
}

function strokeMatches(d, t) {
  const D = strokeCloud(d), T = strokeCloud(t);
  if (!D.cloud.length || !T.cloud.length) return false;
  if (chamfer(D.cloud, T.cloud) > SHAPE_THRESH) return false;
  // Two true loops (both start≈end) have no meaningful start direction, so accept
  // either rotation. But a loop vs an open stroke, or two open strokes, must START
  // in the same direction — an 'e' (starts with a rightward horizontal flick) is
  // not the correct pathway of an 'a' (starts by curving back left).
  if (D.closed && T.closed) return true;
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
const DESC_BOT = 0.76;  // ink below this y → descender. Lowered from 0.80 so a student's g/q/j tail that doesn't go all the way down still registers as a descender (the g-vs-s tell); short letters bottom out ~0.62 so this stays clear of them.

function heightClass(minY, maxY) {
  return { ascender: minY < ASC_TOP, descender: maxY > DESC_BOT };
}
function classMismatch(a, b) {
  return a.ascender !== b.ascender || a.descender !== b.descender;
}

// The "family" of a letter = its ORDER-INDEPENDENT structural primitives,
// defined as a HAND-AUTHORED property of each letter (not measured from the
// template). This is the user's mental model verbatim: "these should have a
// vertical line, these should have a curve that goes this way."
//   hasVertical — the letter HAS a straight vertical stem/stroke: a,b,d,f,h,i,
//                 j,k,l,p,q,t. 'o'/'c'/'e' (curves, no stem) do NOT. This is what
//                 separates an 'a' (curve + a straight line down) from an 'o'
//                 (curve only): the drawn 'a' HAS a vertical line, 'o' does not.
//   hasCrossing — the letter HAS two strokes that cross: f,k,t,x. 'm' (humps,
//                 no crossing) does NOT — so a drawn 'm' (no crossing) is
//                 penalized away from 'x' (crossing).
// A feature is "active" for a candidate letter ONLY when that letter's saved
// TEMPLATE actually exhibits the table's value (template-detected == table).
// If a template is drawn in a style that does NOT show the table's feature
// (e.g. a closed-loop 'a' template with no straight vertical stem), the feature
// is NULL for that letter — it neither self-penalizes NOR penalizes others via
// that feature. This is the fix for the order/decomposition backfire: a student
// who draws 'a' as open-c + a separate straight stem HAS a vertical line, so
// 'o' (active vertical=false) is penalized, while 'a' (vertical=NULL, because
// its template lacks the stem) is NOT penalized — 'a' wins without the template
// having to be drawn the same way.
// EXIT direction of the dominant stroke is kept as a light order-tolerant
// tiebreaker — it is what separates 'q' (tail exits right) from 'g' (tail exits
// left), which pure structure cannot.
// leftCurve: the letter HAS a bowl/curve that bulges LEFT (opens right): the
// round letters a,c,d,e,g,o,q. 'b','p' bulge RIGHT (open left) → false. Stems/
// arches/diagonals (l,i,t,h,k,m,n,r,s,u,v,w,x,y,z,f,j) → false. This separates
// 'a' (curve + vertical line) from 'i' (vertical line only) — both have a
// vertical line, so vertical alone can't split them; the curve is the tell.
// Families now carry five order-independent primitives:
//   v  — has a (near-)vertical stem/stroke
//   xs — has two strokes that cross
//   lc — has a bowl/curve bulging LEFT (opens right)
//   h  — number of arches/humps (m=3, n=2, r=1, h=1); 0 otherwise. The cleanest
//        separator for the arch letters AND for m-vs-x (x has 0 humps), more
//        reliable than crossing for cursive m whose strokes may touch.
//   th — has a top hook (the 'f' entry curves left at the top; 't' is straight)
// h is now SIGNED: arches-up (m,n) positive, valley-down (u,v,w,y) negative.
// d = hasDiagonal (k,x,v,z have diagonal strokes; t does not — the k-vs-t tell).
// Two new primitives (the user's tells):
//   cl — HAS a closed loop (pen returns to start): a,b,d,g,o,p,q. 's' is an
//        open S-curve (endpoints far) → cl=false; 'o' is closed → cl=true. This
//        is the endpoint-distance separator the user asked for (s far, o close).
//   hz — HAS a full-width horizontal bar: only 'z' (top + bottom bars). A
//        short crossbar (t/f) is below the length gate so t stays false. The
//        second 'a'≠'z' tell: a has no horizontal, z does.
const FAMILIES = {
  a: { v: true, xs: false, lc: true, h: 0, th: false, d: false, cl: true, hz: false }, b: { v: true, xs: false, lc: false, h: 0, th: false, d: false, cl: true, hz: false },
  c: { v: false, xs: false, lc: true, h: 0, th: false, d: false, cl: false, hz: false }, d: { v: true, xs: false, lc: true, h: 0, th: false, d: false, cl: true, hz: false },
  e: { v: false, xs: false, lc: true, h: 0, th: false, d: false, cl: false, hz: true }, f: { v: true, xs: true, lc: false, h: 0, th: true, d: false, cl: false, hz: false },
  g: { v: false, xs: false, lc: true, h: 0, th: false, d: false, cl: true, hz: false }, h: { v: true, xs: false, lc: false, h: 0, th: false, d: false, cl: false, hz: false },
  i: { v: true, xs: false, lc: false, h: 0, th: false, d: false, cl: false, hz: false }, j: { v: true, xs: false, lc: false, h: 0, th: false, d: false, cl: false, hz: false },
  k: { v: true, xs: true, lc: false, h: 0, th: false, d: true, cl: false, hz: false }, l: { v: true, xs: false, lc: false, h: 0, th: false, d: false, cl: false, hz: false },
  m: { v: false, xs: false, lc: false, h: 3, th: false, d: false, cl: false, hz: false }, n: { v: false, xs: false, lc: false, h: 2, th: false, d: false, cl: false, hz: false },
  o: { v: false, xs: false, lc: true, h: 0, th: false, d: false, cl: true, hz: false }, p: { v: true, xs: false, lc: false, h: 0, th: false, d: false, cl: true, hz: false },
  q: { v: true, xs: false, lc: true, h: 0, th: false, d: false, cl: true, hz: false }, r: { v: false, xs: false, lc: false, h: 0, th: false, d: false, cl: false, hz: false },
  s: { v: false, xs: false, lc: false, h: 0, th: false, d: false, cl: false, hz: false }, t: { v: true, xs: true, lc: false, h: 0, th: false, d: false, cl: false, hz: false },
  u: { v: false, xs: false, lc: false, h: -2, th: false, d: false, cl: false, hz: false }, v: { v: false, xs: false, lc: false, h: -1, th: false, d: true, cl: false, hz: false },
  w: { v: false, xs: false, lc: false, h: -2, th: false, d: false, cl: false, hz: false }, x: { v: false, xs: true, lc: false, h: 0, th: false, d: true, cl: false, hz: false },
  y: { v: false, xs: false, lc: false, h: -1, th: false, d: true, cl: false, hz: false }, z: { v: false, xs: false, lc: false, h: 0, th: false, d: true, cl: false, hz: true },
};
const CROSSING_PENALTY = 1.5;
const CROSSING_IMPOSSIBLE_PENALTY = 3.5; // a <2-stroke drawing cannot be a crossing letter (x) — structural, not shape
const VERTICAL_PENALTY = 1.0;
const CURVE_PENALTY = 1.0;
const HUMPS_UNIT = 1.5;   // penalty per hump of difference — n(+2) vs m(+3)=1.5, n(+2) vs u(-2)=6 (the n/u split)
const DIAGONAL_PENALTY = 1.5;  // k has diagonals, t does not — separates t from k/x/v/z
const TOPHOOK_PENALTY = 1.0;
const EXIT_PENALTY = 0.8;
const CLOSED_PENALTY = 1.3;     // o/a (closed) vs s/c (open) — the endpoint tell
const HORIZONTAL_PENALTY = 1.3; // z has a full-width bar, a/s/o do not — second a≠z tell
const DOT_MIN_LEN = 0.03;
function strokeArcLen(s) {
  if (!s || s.length < 2) return 0;
  let len = 0;
  for (let i = 1; i < s.length; i++) len += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
  return len;
}
function unit(x, y) {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}
function letterBounds(strokes) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, any = false;
  for (const s of strokes) {
    if (!s) continue;
    for (const p of s) {
      any = true;
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
  }
  if (!any) return { w: 1, h: 1 };
  return { w: (maxX - minX) || 1, h: (maxY - minY) || 1 };
}
// Interior segment-segment intersection (parametric t,u both strictly in
// (0.1,0.9)). Counts a TRUE crossing only, not a shared endpoint or a loop
// closing back on its start.
function segCross(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return false;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
  return t > 0.1 && t < 0.9 && u > 0.1 && u < 0.9;
}
// A crossing between TWO DIFFERENT strokes (inter-stroke only). This cleanly
// catches 'x' (two diagonals), 't'/'f' (crossbar vs stem), 'k' (arm vs stem) —
// all drawn as separate crossing strokes — and never fires on a single closed
// loop ('a','o','d','g','p','q') whose self-overlap would otherwise read as a
// crossing.
function hasCrossing(strokes) {
  const byStroke = [];
  for (const s of strokes) {
    if (!s || s.length < 2) continue;
    const segs = [];
    for (let i = 0; i < s.length - 1; i++) segs.push([s[i], s[i + 1]]);
    byStroke.push(segs);
  }
  for (let a = 0; a < byStroke.length; a++) {
    for (let b = a + 1; b < byStroke.length; b++) {
      for (const sa of byStroke[a]) {
        for (const sb of byStroke[b]) {
          if (segCross(sa[0], sa[1], sb[0], sb[1])) return true;
        }
      }
    }
  }
  return false;
}
// A STRAIGHT vertical stem. Two ways a stem appears:
//  (A) a standalone stroke that IS a vertical line — chord near-vertical,
//      tall (>= 0.4·letterH), narrow (x-span <= 0.3·letterW), and straight
//      (total turning < 0.7 rad). Catches 'l','i','t'-stem, the separate stem
//      of a 2-stroke 'a', 'p'/'q' stems.
//  (B) a vertical run at the START or END of a stroke (an embedded stem that
//      leads into or out of a bowl/arch) — tall (>= 0.6·letterH, taller than
//      an arch's x-height rise so 'm'/'n' arches don't qualify), narrow,
//      straight. Catches 'h' (stem then arch), 'd' (bowl then stem), 'b' stem.
// 'm'/'n' arches rise only ~x-height (< 0.6·letterH) so they do NOT qualify;
// 'o'/'c'/'e' have no straight vertical run. This is decomposition-independent:
// whether the 'a' stem is a separate stroke (A) or the tail of one stroke (B),
// the vertical line is detected.
function strokeIsVertical(s, letterW, letterH, minRunY) {
  if (!s || s.length < 2) return false;
  let turn = 0, prevAng = null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of s) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  for (let i = 0; i < s.length - 1; i++) {
    const ang = Math.atan2(s[i + 1].y - s[i].y, s[i + 1].x - s[i].x);
    if (prevAng !== null) turn += Math.abs(ang - prevAng);
    prevAng = ang;
  }
  const ySpan = maxY - minY, xSpan = maxX - minX;
  const chordDx = Math.abs(s[s.length - 1].x - s[0].x);
  const chordDy = Math.abs(s[s.length - 1].y - s[0].y);
  const chordVertical = chordDy > chordDx * 2.5 && chordDy > 0.01;
  return ySpan >= minRunY && xSpan <= 0.3 * letterW && turn < 0.7 && chordVertical;
}
function runIsVertical(s, start, letterW, letterH, minRunY) {
  // walk a maximal run of near-vertical segments from `start` (forward if
  // start>=0, backward if start<0), return {ok, ySpan, xSpan, turn}.
  const fwd = start >= 0;
  let i = fwd ? start : s.length - 1 + start; // start index
  if (i < 0 || i >= s.length - 1) return { ok: false };
  let yMin = s[i].y, yMax = s[i].y, xMin = s[i].x, xMax = s[i].x, turn = 0, prevAng = null, j = i, steps = 0;
  while (fwd ? (j < s.length - 1) : (j > 0)) {
    const a = fwd ? s[j] : s[j], b = fwd ? s[j + 1] : s[j - 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dy) > Math.abs(dx) * 2 && Math.abs(dy) > 0.005) {
      yMin = Math.min(yMin, b.y); yMax = Math.max(yMax, b.y);
      xMin = Math.min(xMin, b.x); xMax = Math.max(xMax, b.x);
      const ang = Math.atan2(dy, dx);
      if (prevAng !== null) turn += Math.abs(ang - prevAng);
      prevAng = ang;
      j = fwd ? j + 1 : j - 1;
      steps++;
    } else break;
  }
  if (!steps) return { ok: false };
  return {
    // Strict straightness (turn < 0.35) + narrow (<= 0.28·letterW): a TRUE straight
    // stem has near-zero turning, while a curved wall (c/o/e/s) over the same
    // height subtends ~1 rad → rejected. This is what keeps the vertical family
    // from false-firing on curves while still catching a's straight right wall.
    ok: (yMax - yMin) >= minRunY && (xMax - xMin) <= 0.28 * letterW && turn < 0.35,
  };
}
function hasVertical(strokes, letterW, letterH) {
  const minRunStandalone = 0.4 * letterH;
  const minRunEmbedded = 0.55 * letterH;
  for (const s of strokes) {
    if (!s || s.length < 2) continue;
    // (A) standalone vertical stroke
    if (strokeIsVertical(s, letterW, letterH, minRunStandalone)) return true;
    // (B) embedded stem ANYWHERE in the stroke — not just at the start/end. A
    // closed-loop 'a' drawn as one stroke has its straight right wall in the
    // MIDDLE of the stroke; only a mid-stroke scan catches it (and separates
    // a from o, whose round right wall curves too much to qualify).
    for (let start = 0; start < s.length - 1; start++) {
      if (runIsVertical(s, start, letterW, letterH, minRunEmbedded).ok) return true;
    }
  }
  return false;
}
// A stroke that BULGES LEFT beyond both its endpoints: its leftmost point is
// left of BOTH the start and end x by a margin. A bowl/hook opening to the
// right. Order-independent (start/end symmetric). A straight '\' diagonal is
// excluded (its leftmost point IS its end); an 'm' arch is excluded (it bulges
// UP, its leftmost is its start); a closed loop ('o','a','d','p','q') qualifies
// (its leftmost is well left of where it starts/ends).
function hasLeftCurve(strokes, letterW) {
  const margin = 0.1 * letterW;
  for (const s of strokes) {
    if (!s || s.length < 3) continue;
    let minX = Infinity, startX = s[0].x, endX = s[s.length - 1].x;
    for (const p of s) if (p.x < minX) minX = p.x;
    if (minX < startX - margin && minX < endX - margin) return true;
  }
  return false;
}
// SIGNED hump count: arches-up (m,n) POSITIVE, valley-down (u,v,w,y) NEGATIVE.
// This is what separates n (+2, arches up) from u (-2, valley down) — they have
// the same down-stroke COUNT but opposite direction, so the sign flips them
// apart. Loops (left-curve letters a,d,o,g,c,e,q) read 0 (a loop is not an
// arch). The COUNT is the number of distinct downward runs on the longest
// stroke (m=3, n=2, u=2, v=1, w=2, y=1) — more reliable than peak-counting,
// which cursive entrances contaminate with spurious peaks. The SIGN comes from
// where the stroke endpoints sit: arch-up letters start AND end on the baseline
// (endpoints low → +), valley letters start and end at the midline (endpoints
// high → -).
function countHumps(strokes, letterH, letterW) {
  if (hasLeftCurve(strokes, letterW)) return 0;
  let best = null, bestLen = 0;
  for (const s of strokes) {
    const l = strokeArcLen(s);
    if (l < DOT_MIN_LEN) continue;
    if (l > bestLen) { bestLen = l; best = s; }
  }
  if (!best || best.length < 4) return 0;
  const rs = resample(best, Math.max(14, Math.min(60, best.length)));
  const minRun = 0.15 * (letterH || 1);
  let runs = 0, runLen = 0;
  for (let i = 1; i < rs.length; i++) {
    const dy = rs[i].y - rs[i - 1].y;
    const seg = Math.hypot(rs[i].x - rs[i - 1].x, dy);
    if (dy > 0.002) runLen += seg;
    else { if (runLen >= minRun) runs++; runLen = 0; }
  }
  if (runLen >= minRun) runs++;
  if (!runs) return 0;
  let sumAll = 0;
  for (const p of rs) sumAll += p.y;
  const meanAll = sumAll / rs.length;
  const k = Math.max(2, Math.round(rs.length * 0.12));
  let se = 0;
  for (let i = 0; i < k; i++) se += rs[i].y;
  for (let i = rs.length - k; i < rs.length; i++) se += rs[i].y;
  const endMean = se / (2 * k);
  const sign = endMean >= meanAll ? +1 : -1;
  return Math.max(-4, Math.min(sign * runs, 4));
}
// Diagonal detector (segment-run based, NET-turn gated): a run of consecutive
// ~45° segments totaling >= 0.22·letterH whose NET direction change is small
// (|endAngle − startAngle| < 0.6 rad). The gate is the key: a CIRCLE's tangent
// sweeps monotonically through 45° (~1 rad of NET turn), but a TRUE diagonal —
// even a jittery hand-drawn one (x, z, k, v) — keeps a roughly constant direction
// (~0 net turn; the jitter cancels out). Using CUMULATIVE |turn| wrongly rejected
// real jittery diagonals (x read turn≈1.0) while still letting smooth curves
// through; NET turn accepts jittery straights and rejects smooth curves, so a
// looped 'a' (no straight diagonal) no longer matches a jittery 'z'/'x'.
function hasDiagonal(strokes, letterH) {
  const minRun = 0.22 * (letterH || 1);
  const wrap = (a) => {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  };
  for (const s of strokes) {
    if (!s || s.length < 2) continue;
    let runLen = 0, startAng = null, endAng = null;
    for (let i = 1; i < s.length; i++) {
      const dx = s[i].x - s[i - 1].x, dy = s[i].y - s[i - 1].y;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      const seg = Math.hypot(dx, dy);
      const diag = adx > 0.004 && ady > 0.004 && ady / adx >= 0.3 && ady / adx <= 3.3;
      if (diag) {
        runLen += seg;
        const ang = Math.atan2(dy, dx);
        if (startAng === null) startAng = ang;
        endAng = ang;
      } else {
        if (runLen >= minRun && startAng !== null && Math.abs(wrap(endAng - startAng)) < 0.6) return true;
        runLen = 0; startAng = null; endAng = null;
      }
    }
    if (runLen >= minRun && startAng !== null && Math.abs(wrap(endAng - startAng)) < 0.6) return true;
  }
  return false;
}
// Closed-loop detector: a non-trivial stroke whose ENDPOINTS are close together
// (within 0.3·letter size) — i.e. the pen returned to its start, enclosing
// area. This is the "endpoints" tell: o/a/b/d/g/p/q (closed bowls) have
// endpoints together; s/c/e/r/n/m/u/v/w/x/z/l/i/t/k/h/f/j/y have endpoints far
// apart (open curves or straight strokes). This is what separates an open 's'
// (endpoints far) from a closed 'o' (endpoints together), which pure shape
// (Chamfer/coverage) could not — a fast 's' covers a circle's outline well
// enough to score close to 'o', but its endpoints never meet.
function hasClosedLoop(strokes, letterW, letterH) {
  const sz = Math.max(letterW, letterH) || 1;
  const thresh = 0.3 * sz;
  for (const s of strokes) {
    if (!s || s.length < 4) continue;
    if (strokeArcLen(s) < DOT_MIN_LEN) continue;
    const d = Math.hypot(s[s.length - 1].x - s[0].x, s[s.length - 1].y - s[0].y);
    if (d < thresh) return true;
  }
  return false;
}
// Horizontal-bar detector: a run of near-horizontal segments (|dy| <= 0.4·|dx|)
// totaling >= 0.45·letterW. The long threshold excludes short crossbars (t/f's
// crossbar is ~0.3-0.4·W; e's crossbar is short) so only a true full-width bar
// fires — z's top and bottom bars. This is the second 'a'≠'z' tell the user
// named: a has no horizontal bar, z has two.
function hasHorizontal(strokes, letterW) {
  const minRun = 0.45 * (letterW || 1);
  for (const s of strokes) {
    if (!s || s.length < 2) continue;
    let runLen = 0;
    for (let i = 1; i < s.length; i++) {
      const dx = s[i].x - s[i - 1].x, dy = s[i].y - s[i - 1].y;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      const seg = Math.hypot(dx, dy);
      const horiz = adx > 0.01 && ady <= adx * 0.4;
      if (horiz) runLen += seg;
      else { if (runLen >= minRun) return true; runLen = 0; }
    }
    if (runLen >= minRun) return true;
  }
  return false;
}
// Top hook: among the highest 25% of the longest stroke, the leftmost point is
// left of the stroke's median x by a margin — i.e. the entry curves left at
// the top (f's hook). A straight-down t top stays at the stem x → false.
function hasTopHook(strokes, letterW) {
  let best = null, bestLen = 0;
  for (const s of strokes) {
    const l = strokeArcLen(s);
    if (l < DOT_MIN_LEN) continue;
    if (l > bestLen) { bestLen = l; best = s; }
  }
  if (!best || best.length < 4) return false;
  let minY = Infinity, maxY = -Infinity, medianX = 0;
  for (const p of best) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; medianX += p.x; }
  medianX /= best.length;
  const topThresh = minY + 0.25 * (maxY - minY);
  let topMinX = Infinity;
  for (const p of best) if (p.y <= topThresh && p.x < topMinX) topMinX = p.x;
  return topMinX < medianX - 0.1 * (letterW || 1);
}
function familySignature(strokes) {
  const b = letterBounds(strokes);
  return {
    xs: hasCrossing(strokes),
    v: hasVertical(strokes, b.w, b.h),
    lc: hasLeftCurve(strokes, b.w),
    h: countHumps(strokes, b.h, b.w),
    th: hasTopHook(strokes, b.w),
    d: hasDiagonal(strokes, b.h),
    cl: hasClosedLoop(strokes, b.w, b.h),
    hz: hasHorizontal(strokes, b.w),
  };
}
// Active family: for each feature, the value the candidate letter "should"
// have — but only if its template actually exhibits it. NULL = the template
// disagrees with the table (non-standard style) → neutralize the feature for
// this letter (no penalty, no bonus).
function activeFamily(letter, detected) {
  const t = FAMILIES[letter] || { v: false, xs: false, lc: false, h: 0, th: false, d: false, cl: false, hz: false };
  return {
    v: detected.v === t.v ? t.v : null,
    xs: detected.xs === t.xs ? t.xs : null,
    lc: detected.lc === t.lc ? t.lc : null,
    h: detected.h === t.h ? t.h : null,
    th: detected.th === t.th ? t.th : null,
    d: detected.d === t.d ? t.d : null,
    cl: detected.cl === t.cl ? t.cl : null,
    hz: detected.hz === t.hz ? t.hz : null,
  };
}
// Exit direction. For descender letters (g, j, q, p, y) the TAIL is the tell
// (q exits right, g exits left), but the tail is usually SHORTER than the loop,
// so "longest stroke" picks the loop and the tail never registers. When the
// letter has a descender, prefer the stroke that extends LOWEST (the tail) and
// take its end tangent; otherwise use the longest stroke as before.
function dominantExit(strokes) {
  let maxYall = -Infinity;
  for (const s of strokes) if (s) for (const p of s) if (p.y > maxYall) maxYall = p.y;
  const hasDesc = maxYall > DESC_BOT;
  let best = null, bestKey = -Infinity;
  for (const s of strokes) {
    const len = strokeArcLen(s);
    if (len < DOT_MIN_LEN) continue;
    let key;
    if (hasDesc) { let my = -Infinity; for (const p of s) if (p.y > my) my = p.y; key = my; }
    else key = len;
    if (key > bestKey) { bestKey = key; best = s; }
  }
  if (!best) return null;
  const rs = resample(best, R);
  const k = Math.max(2, Math.round(rs.length * 0.15));
  const x0 = rs[rs.length - 1], x1 = rs[Math.max(0, rs.length - 1 - k)];
  return unit(x0.x - x1.x, x0.y - x1.y);
}
function dirAgree(a, b) {
  return !a || !b ? null : a.x * b.x + a.y * b.y;
}

// drawnStrokes: array of strokes in canvas px. templates: [{ letter, strokes(0-1) }]
// returns [{ letter, dist, confidence }] sorted best (lowest dist) first.
//
// The score is dominated by the height-class guard (a tall/descender template is
// barred from matching a short drawing) and coverage mismatch (extra/missing ink);
// Chamfer (fine shape) and an aspect-ratio term break near-ties; the direction
// "family" penalty flips same-height-class confusions (q/g, j/g). So a short 'e' (no
// ascender) can't read as 'd', and a downward 'j' won't read as the leftward bowl
// of a 'g'. Recognition is only as good as the templates: if a saved letter is drawn
// in a different style from how the student writes it, a neighbor in the SAME height
// class can still win — author a template that matches the student's handwriting.
export function recognize(drawnStrokes, templates) {
  if (!drawnStrokes.length || !templates.length) return [];
  const drawnNorm = drawnStrokes.map((s) =>
    s.map((p) => ({ x: p.x / CANVAS_W, y: p.y / CANVAS_H }))
  );
  const drawn = letterToCloud(drawnNorm);
  if (!drawn.cloud.length) return [];
  const drawnH = heightClass(drawn.minY, drawn.maxY);
  const drawnSig = familySignature(drawnNorm);
  const drawnExit = dominantExit(drawnNorm);
  const tdata = templates.map((t) => ({
    letter: t.letter,
    ...letterToCloud(t.strokes),
    sig: familySignature(t.strokes),
    exit: dominantExit(t.strokes),
  }));
  // A letter drawn without its ascender/descender must NOT match a template that has
  // one — this penalty dominates shape similarity so a short e never reads as a d.
  const CLASS_PENALTY = 1.5;
  const results = tdata.map(({ letter, cloud, aspect, minY, maxY, sig, exit }) => {
    if (!cloud.length) return { letter, dist: Infinity, confidence: 0, mismatch: 1 };
    const crossClass = classMismatch(drawnH, heightClass(minY, maxY));
    const inkMismatch = coverageMismatch(drawn.cloud, cloud);
    // Active family for this candidate: each feature is the letter's table value
    // IF the template exhibits it, else NULL (neutralized). Penalty fires when the
    // drawing's detected feature disagrees with the active value. So a 2-stroke
    // 'a' (has a vertical line) beats 'o' (active vertical=false → penalized),
    // while 'a' itself (vertical=NULL because its closed-loop template lacks the
    // stem) is never penalized.
    const active = activeFamily(letter, sig);
    // A crossing (x, and the crossbar/stem crosses of t/f/k) can ONLY come from
    // TWO DIFFERENT strokes — the hasCrossing detector checks inter-stroke
    // intersection, so a single-stroke drawing can never have one. If the
    // drawing has fewer than 2 strokes it is STRUCTURALLY IMPOSSIBLE for it to
    // be a letter that needs a crossing, so penalize hard: a single-stroke 'n'
    // (an arch that happens to look x-ish) can never beat a real 2-stroke 'x'.
    const crossingImpossible = active.xs === true && drawnNorm.length < 2;
    const structPenalty =
      (crossingImpossible ? CROSSING_IMPOSSIBLE_PENALTY : 0) +
      (active.v !== null && drawnSig.v !== active.v ? VERTICAL_PENALTY : 0) +
      (active.xs !== null && drawnSig.xs !== active.xs ? CROSSING_PENALTY : 0) +
      (active.lc !== null && drawnSig.lc !== active.lc ? CURVE_PENALTY : 0) +
      (active.h !== null ? Math.abs(drawnSig.h - active.h) * HUMPS_UNIT : 0) +
      (active.th !== null && drawnSig.th !== active.th ? TOPHOOK_PENALTY : 0) +
      (active.d !== null && drawnSig.d !== active.d ? DIAGONAL_PENALTY : 0) +
      (active.cl !== null && drawnSig.cl !== active.cl ? CLOSED_PENALTY : 0) +
      (active.hz !== null && drawnSig.hz !== active.hz ? HORIZONTAL_PENALTY : 0);
    // Exit (tail) direction: order-tolerant tiebreaker — separates q (tail right)
    // from g (tail left), which pure structure cannot.
    const exitAgree = dirAgree(drawnExit, exit);
    const dirPenalty = exitAgree !== null && exitAgree < DIR_THRESH ? EXIT_PENALTY : 0;
    const d =
      chamfer(drawn.cloud, cloud) +
      W_ASP * Math.abs(drawn.aspect - aspect) +
      (crossClass ? CLASS_PENALTY : 0) +
      UNCOVERED_WEIGHT * inkMismatch +
      structPenalty +
      dirPenalty;
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