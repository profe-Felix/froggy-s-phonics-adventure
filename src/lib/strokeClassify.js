// Stroke classification for the "recognize stroke" mode.
//
// A stroke is the raw polyline the user drew between pointer-down and pointer-up.
// We classify it as a LINE (vertical / horizontal / diagonal) or a CURVE, report
// the DIRECTION it was drawn (using the start→end vector — we keep every point so
// direction is reliable), and which WRITING-GUIDE lines it spans.
//
// Guide lines (normalized y, 0 = top of canvas, 1 = bottom):
//   ascender  0.10   midline  0.367   baseline  0.633   descender  0.90
// These match the four guide lines drawn in LetterRecognitionCanvas.
//
// Straightness = net displacement ÷ arc length. A perfectly straight line is 1.0;
// the more a stroke wanders/curves, the lower it drops. Below the threshold we call
// it a curve (a real line is almost always > 0.9). Direction is only meaningful for
// a line, but we still report the guide-line span for curves.

import { CANVAS_W, CANVAS_H } from '@/components/tracing/strokeMath';

export const GUIDES = [
  { y: 0.10, key: 'ascender', label: 'ascender line' },
  { y: 0.367, key: 'midline', label: 'midline' },
  { y: 0.633, key: 'baseline', label: 'baseline' },
  { y: 0.90, key: 'descender', label: 'descender line' },
];

const STRAIGHT_THRESHOLD = 0.82;   // below this → curve, not a line
const VERT_MIN = 70;               // angle from horizontal (deg) above this → vertical
const HORIZ_MAX = 20;              // angle from horizontal below this → horizontal
                                    // in between (20–70°) → diagonal ("about 45°")

function nearestGuide(yn) {
  let best = GUIDES[0], bd = Infinity;
  for (const g of GUIDES) {
    const d = Math.abs(g.y - yn);
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}

// Classify a straight chord (dx, dy) as vertical / horizontal / diagonal with its
// drawing direction. Shared by the whole-stroke and per-half classifiers.
function classifyChord(dx, dy) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  const angleDeg = Math.atan2(ay, ax) * 180 / Math.PI;
  let kind, direction;
  if (angleDeg > VERT_MIN) {
    kind = 'vertical';
    direction = dy > 0 ? 'top to bottom' : 'bottom to top';
  } else if (angleDeg < HORIZ_MAX) {
    kind = 'horizontal';
    direction = dx > 0 ? 'left to right' : 'right to left';
  } else {
    kind = 'diagonal';
    const down = dy > 0, right = dx > 0;
    if (down && right) direction = 'top-left to bottom-right';
    else if (down && !right) direction = 'top-right to bottom-left';
    else if (!down && right) direction = 'bottom-left to top-right';
    else direction = 'bottom-right to top-left';
  }
  return { kind, direction, angleDeg };
}

function halfStraightness(pts, a, b) {
  let arc = 0;
  for (let i = a + 1; i <= b; i++) arc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const chord = Math.hypot(pts[b].x - pts[a].x, pts[b].y - pts[a].y);
  return arc < 1e-4 ? 0 : chord / arc;
}
function chordAngle(pts, a, b) {
  return Math.atan2(pts[b].y - pts[a].y, pts[b].x - pts[a].x) * 180 / Math.PI;
}
function angleBetween(aDeg, bDeg) {
  let d = Math.abs(aDeg - bDeg) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

// Detect a "bent" (chevron) stroke — two fairly-straight segments joined at a
// sharp vertex, like the right stroke of a 'k' (diagonally down-left, then
// diagonally down-right). The vertex is the point farthest from the start→end
// chord; we split there and require BOTH halves to be straight and the turn at
// the vertex to be a real bend. This is what keeps it off a SMOOTH BOWL: a bowl
// is a continuous curve, so its halves (split at the apex) are quarter-arcs
// (straightness ≈ 0.90), not straight lines — they fail the straightness gate,
// while a real chevron's straight halves (≈ 0.97+) pass.
const BEND_HALF_STRAIGHT = 0.93;   // each half must be this straight — rejects bowl quarter-arcs (≈0.90)
const BEND_TURN_DEG = 35;          // minimum turn at the vertex to count as a bend, not a slight kink
const BEND_HALF_FRAC = 0.20;       // each half must be at least this fraction of the stroke's arc
function detectBend(pts) {
  const N = pts.length;
  if (N < 6) return null;
  const start = pts[0], end = pts[N - 1];
  const cx = end.x - start.x, cy = end.y - start.y;
  const clen = Math.hypot(cx, cy);
  if (clen < 1e-4) return null;
  let arc = 0; const cum = [0];
  for (let i = 1; i < N; i++) { arc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); cum.push(arc); }
  if (arc < 1e-4) return null;
  // vertex = point of max perpendicular distance from the start→end chord
  let bestI = -1, bestD = 0;
  for (let i = 1; i < N - 1; i++) {
    const t = ((pts[i].x - start.x) * cx + (pts[i].y - start.y) * cy) / (clen * clen);
    const px = start.x + t * cx, py = start.y + t * cy;
    const d = Math.hypot(pts[i].x - px, pts[i].y - py);
    if (d > bestD) { bestD = d; bestI = i; }
  }
  if (bestI < 0) return null;
  const arcA = cum[bestI], arcB = arc - cum[bestI];
  if (arcA / arc < BEND_HALF_FRAC || arcB / arc < BEND_HALF_FRAC) return null;
  const sA = halfStraightness(pts, 0, bestI);
  const sB = halfStraightness(pts, bestI, N - 1);
  if (sA < BEND_HALF_STRAIGHT || sB < BEND_HALF_STRAIGHT) return null;
  const turn = angleBetween(chordAngle(pts, 0, bestI), chordAngle(pts, bestI, N - 1));
  if (turn < BEND_TURN_DEG) return null;
  return { vertexIdx: bestI, turnDeg: turn, sA, sB };
}

// Detect a "shoulder" — the down-then-up RETRACE that begins h, r, m, n. The
// pen drops in a straight vertical line, reaches a base, then reverses upward
// (a near-180° reversal = a retrace, NOT the 40-90° corner of a 'v'/'k'). After
// the base it may round right into one or more arches (r, n, m) or just stop
// (a pure down-up practice stroke). Two gates keep bowls out: the downstroke
// (start→base) must be a STRAIGHT, near-VERTICAL line. A bowl's "down" side is
// a quarter-arc — low straightness (≈0.50 for a 'c') or a diagonal chord (a
// 'u') — so bowls fail and stay curves, while a real shoulder's plumb
// downstroke (straightness ≈0.98, vertical) passes.
const SHOULDER_DOWN_STRAIGHT = 0.90;
const SHOULDER_TURN_DEG = 130;
function detectShoulder(pts) {
  const N = pts.length;
  if (N < 6) return null;
  const win = Math.max(2, Math.round(N * 0.10));
  // candidate bases = local y-maxima (the low points of the stroke), left to
  // right — so an 'm' picks its FIRST downstroke, not the last.
  const cands = [];
  for (let i = win; i < N - win; i++) {
    let isMax = true;
    for (let k = 1; k <= win; k++) { if (pts[i - k].y > pts[i].y || pts[i + k].y > pts[i].y) { isMax = false; break; } }
    if (isMax) cands.push(i);
  }
  if (!cands.length) {
    let bi = 0, my = -Infinity;
    for (let i = 0; i < N; i++) if (pts[i].y > my) { my = pts[i].y; bi = i; }
    if (bi >= 2 && bi <= N - 3) cands.push(bi);
  }
  for (const baseI of cands) {
    if (baseI < 2 || baseI > N - 3) continue;
    // downstroke start→base must be a straight, near-vertical line
    const downChord = classifyChord(pts[baseI].x - pts[0].x, pts[baseI].y - pts[0].y);
    if (downChord.kind !== 'vertical') continue;
    let arcDown = 0;
    for (let i = 1; i <= baseI; i++) arcDown += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (arcDown < 1e-4) continue;
    const downStraight = Math.hypot(pts[baseI].x - pts[0].x, pts[baseI].y - pts[0].y) / arcDown;
    if (downStraight < SHOULDER_DOWN_STRAIGHT) continue;
    // reversal at the base (down → up): near-180°, not a 40-90° corner
    const w2 = Math.max(2, Math.round(N * 0.12));
    const preDir = chordAngle(pts, Math.max(0, baseI - w2), baseI);
    const postB = Math.min(N - 1, baseI + w2);
    const postDir = chordAngle(pts, baseI, postB);
    const turn = angleBetween(preDir, postDir);
    if (turn < SHOULDER_TURN_DEG) continue;
    if (pts[baseI].y - pts[postB].y < 0.01) continue;   // must rise out of the base
    let arc = 0, arcAfter = 0;
    for (let i = 1; i < N; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); arc += d; if (i > baseI) arcAfter += d; }
    const archFrac = arc > 1e-4 ? arcAfter / arc : 0;
    return { baseIdx: baseI, turnDeg: turn, baseY: pts[baseI].y, archFrac };
  }
  return null;
}

// Detect a "bowl" — a closed rounded loop in the stroke, like the round part of
// a, b, d, g, o, p, q. The pen leaves a point, curves around, and returns close to
// where it started, enclosing real area. This is what separates a bowl from a
// shoulder retrace: a retrace goes out and back along the SAME line, so it
// encloses ~0 area; a bowl bulges away and encloses a real region. A bowl may
// have a stem lead-in (b, p) or a tail (d, g), so we find the earliest closed
// sub-loop anywhere in the stroke and report the lead/tail around it.
const BOWL_AREA = 0.004;       // min enclosed area (normalized) for a real loop
const BOWL_CLOSURE = 0.22;     // loop start/end within this fraction of stroke size
function detectBowl(pts) {
  const N = pts.length;
  if (N < 8) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
  const size = Math.max(maxX - minX, maxY - minY);
  if (size < 0.06) return null;
  const closure = BOWL_CLOSURE * size;
  const minLoop = Math.max(6, Math.round(N * 0.18));
  let total = 0;
  const cum = [0];
  for (let k = 1; k < N; k++) { const d = Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y); total += d; cum.push(total); }
  if (total < 1e-4) return null;
  // earliest closure (smallest j) whose loop encloses real area
  for (let j = minLoop; j <= N - 1; j++) {
    let bi = -1, bd = Infinity;
    for (let i = 0; i <= j - minLoop; i++) {
      const d = Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
      if (d < bd) { bd = d; bi = i; }
    }
    if (bi < 0 || bd > closure) continue;
    // shoelace area over i..j plus closing edge j->i
    let area = 0;
    for (let k = bi; k < j; k++) area += pts[k].x * pts[k + 1].y - pts[k + 1].x * pts[k].y;
    area += pts[j].x * pts[bi].y - pts[bi].x * pts[j].y;
    area = Math.abs(area) / 2;
    if (area < BOWL_AREA) continue;
    const leadFrac = cum[bi] / total;
    const tailFrac = (total - cum[j]) / total;
    const leadDir = leadFrac > 0.12 ? dirLabel(pts[bi].x - pts[0].x, pts[bi].y - pts[0].y) : '';
    const tailDir = tailFrac > 0.12 ? dirLabel(pts[N - 1].x - pts[j].x, pts[N - 1].y - pts[j].y) : '';
    return { loopStartIdx: bi, closureIdx: j, area, leadFrac, leadDir, tailFrac, tailDir };
  }
  return null;
}

// Detect the 'e' "eye" — a closed loop that contains a long HORIZONTAL run
// (the crossbar across the middle of an 'e'). Round bowls (o, a, b, d, g, p, q)
// curve continuously and never hold a long flat segment, so a horizontal run
// spanning a good fraction of the loop's width is the 'e' signature.
function detectEye(pts, bi, j) {
  const loop = pts.slice(bi, j + 1);
  if (loop.length < 6) return false;
  let minX = Infinity, maxX = -Infinity;
  for (const p of loop) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; }
  const w = maxX - minX;
  if (w < 0.05) return false;
  let best = 0, run = 0;
  for (let i = 1; i < loop.length; i++) {
    const dseg = Math.abs(loop[i].y - loop[i - 1].y);
    const xseg = Math.abs(loop[i].x - loop[i - 1].x);
    if (dseg < 0.012 && xseg > 0.004) run += xseg;
    else { if (run > best) best = run; run = 0; }
  }
  if (run > best) best = run;
  return best >= 0.30 * w;
}

// Detect a "hooked line" — a long, mostly-straight stem (vertical or diagonal)
// that finishes with a curving hook at the end, like the single stroke of a 'j'
// (straight drop, then a leftward hook) or a 'y' tail. The hook is what pulls the
// whole-stroke straightness below the line threshold even though the bulk of
// the stroke is straight. We peel the straight leading stem off and confirm the
// remainder is a genuine curving tail that turns away from the stem WITHOUT
// rising back up into an arch — that rise is what makes it a shoulder (h/r/m/n),
// not a hook. A hook stays low near the stem's bottom; a shoulder's tail climbs.
const HOOK_STEM_STRAIGHT = 0.93;   // the stem prefix must stay this straight
const HOOK_STEM_FRAC = 0.50;       // stem must be at least this fraction of total arc
const HOOK_TURN_DEG = 35;          // hook must turn this far from the stem direction
const HOOK_RISE_FRAC = 0.25;       // hook endpoint may rise at most this fraction of stem height
function detectHookedLine(pts) {
  const N = pts.length;
  if (N < 8) return null;
  let total = 0;
  const cum = [0];
  for (let i = 1; i < N; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); total += d; cum.push(total); }
  if (total < 1e-4) return null;
  // Walk forward; find how far the straight stem extends before the hook begins.
  let stemEnd = -1;
  for (let i = 6; i <= N - 3; i++) {
    if (halfStraightness(pts, 0, i) >= HOOK_STEM_STRAIGHT) stemEnd = i;
    else if (stemEnd > 0) break;
  }
  if (stemEnd < 6) return null;
  const stemArc = cum[stemEnd];
  if (stemArc / total < HOOK_STEM_FRAC) return null;
  const stemChord = classifyChord(pts[stemEnd].x - pts[0].x, pts[stemEnd].y - pts[0].y);
  if (stemChord.kind === 'horizontal') return null;   // a hook hangs off a real stem, not a horizontal flick
  // Hook must turn away from the stem direction.
  const stemDir = chordAngle(pts, 0, stemEnd);
  const hookDir = chordAngle(pts, stemEnd, N - 1);
  const turn = angleBetween(stemDir, hookDir);
  if (turn < HOOK_TURN_DEG) return null;
  const hookArc = total - stemArc;
  if (hookArc / total < 0.06) return null;
  // Reject a shoulder-style arch: if the tail climbs back up above the stem's
  // lowest point by more than a quarter of the stem height, it's an arch (h/r/m),
  // not a hook. A hook stays near the stem's bottom.
  let stemBottomY = -Infinity;
  for (let i = 0; i <= stemEnd; i++) if (pts[i].y > stemBottomY) stemBottomY = pts[i].y;
  const stemHeight = (stemBottomY - pts[0].y) || 1e-4;
  if (stemBottomY - pts[N - 1].y > HOOK_RISE_FRAC * stemHeight) return null;
  const hookDirLabel = dirLabel(pts[N - 1].x - pts[stemEnd].x, pts[N - 1].y - pts[stemEnd].y);
  return { stemEnd, stemKind: stemChord.kind, stemDir: stemChord.direction, stemFrac: stemArc / total, hookFrac: hookArc / total, turnDeg: turn, hookDir: hookDirLabel };
}

// Detect a "top hook that straightens into a stem" — the top stroke of an 'f'
// (or 't'): the pen curves over at the top, then the curve straightens into a
// near-vertical line for the rest of the stroke. This is the mirror of a 'j'
// (straight stem, hook at the END): here the hook is at the START and the stem
// is the straight suffix. A plain curve ('c') has no straight vertical suffix;
// a plain vertical line has no curving top — so this isolates the f/t "curve
// that straightens by the midpoint" the user described.
const TOPHOOK_STEM_STRAIGHT = 0.93;
const TOPHOOK_STEM_FRAC = 0.45;
const TOPHOOK_HOOK_FRAC = 0.12;
const TOPHOOK_TURN_DEG = 35;
function detectTopHook(pts) {
  const N = pts.length;
  if (N < 8) return null;
  let total = 0; const cum = [0];
  for (let i = 1; i < N; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); total += d; cum.push(total); }
  if (total < 1e-4) return null;
  // Earliest start of a straight, vertical, DOWNWARD suffix = the stem.
  let stemStart = -1;
  for (let s = 2; s <= N - 6; s++) {
    if (halfStraightness(pts, s, N - 1) < TOPHOOK_STEM_STRAIGHT) continue;
    const chord = classifyChord(pts[N - 1].x - pts[s].x, pts[N - 1].y - pts[s].y);
    if (chord.kind !== 'vertical' || pts[N - 1].y - pts[s].y <= 0) continue;
    stemStart = s; break;
  }
  if (stemStart < 0) return null;
  const stemArc = total - cum[stemStart];
  if (stemArc / total < TOPHOOK_STEM_FRAC) return null;
  const hookArc = cum[stemStart];
  if (hookArc / total < TOPHOOK_HOOK_FRAC) return null;
  const stemDir = chordAngle(pts, stemStart, N - 1);
  const hookDir = chordAngle(pts, 0, stemStart);
  const turn = angleBetween(hookDir, stemDir);
  if (turn < TOPHOOK_TURN_DEG) return null;
  const hookDirLabel = dirLabel(pts[stemStart].x - pts[0].x, pts[stemStart].y - pts[0].y);
  return { stemStart, stemFrac: stemArc / total, hookFrac: hookArc / total, turnDeg: turn, hookDir: hookDirLabel };
}

function angleFromHorizontal(dx, dy) { return Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI; }

// Detect a "zigzag" — three straight segments joined by two sharp turns, like
// a 'z' (top horizontal bar, diagonal, bottom horizontal bar). The two bars
// sit on different guide rows and the middle is a real diagonal. This keeps
// 'z' off both the S-curve and the generic "curve with humps": a 'z' has
// straight bars and sharp corners, an 's' is one continuous curve.
const ZIGZAG_SEG_STRAIGHT = 0.93;
const ZIGZAG_TURN_DEG = 50;
function detectZigzag(pts) {
  const N = pts.length;
  if (N < 8) return null;
  const w = Math.max(2, Math.round(N * 0.08));
  const raw = [];
  for (let i = w; i < N - w; i++) {
    const turn = angleBetween(chordAngle(pts, i - w, i), chordAngle(pts, i, i + w));
    if (turn >= ZIGZAG_TURN_DEG) raw.push({ i, turn });
  }
  if (raw.length < 2) return null;
  raw.sort((a, b) => b.turn - a.turn);
  const chosen = [];
  for (const c of raw) {
    if (chosen.every(x => Math.abs(x.i - c.i) > w)) chosen.push(c);
    if (chosen.length === 2) break;
  }
  if (chosen.length < 2) return null;
  chosen.sort((a, b) => a.i - b.i);
  const c1 = chosen[0].i, c2 = chosen[1].i;
  if (c2 - c1 < w) return null;
  if (halfStraightness(pts, 0, c1) < ZIGZAG_SEG_STRAIGHT) return null;
  if (halfStraightness(pts, c1, c2) < ZIGZAG_SEG_STRAIGHT) return null;
  if (halfStraightness(pts, c2, N - 1) < ZIGZAG_SEG_STRAIGHT) return null;
  const a1 = angleFromHorizontal(pts[c1].x - pts[0].x, pts[c1].y - pts[0].y);
  const a2 = angleFromHorizontal(pts[c2].x - pts[c1].x, pts[c2].y - pts[c1].y);
  const a3 = angleFromHorizontal(pts[N - 1].x - pts[c2].x, pts[N - 1].y - pts[c2].y);
  if (a1 >= 35 || a3 >= 35) return null;       // top & bottom bars near-horizontal
  if (a2 < 25 || a2 > 75) return null;          // middle is a real diagonal
  const y1 = (pts[0].y + pts[c1].y) / 2;
  const y3 = (pts[c2].y + pts[N - 1].y) / 2;
  if (Math.abs(y1 - y3) < 0.12) return null;    // bars on different rows
  return { c1, c2 };
}

// Direction label for a vector in screen space (y grows downward). 0° = right,
// 90° = up. Returns cardinal/ordinal phrases.
function dirLabel(vx, vy) {
  let a = Math.atan2(-vy, vx) * 180 / Math.PI;
  if (a < 0) a += 360;
  const S = 22.5;
  if (a >= 360 - S || a < S) return 'to the right';
  if (a < 90 - S) return 'up and to the right';
  if (a < 90 + S) return 'upward';
  if (a < 180 - S) return 'up and to the left';
  if (a < 180 + S) return 'to the left';
  if (a < 270 - S) return 'down and to the left';
  if (a < 270 + S) return 'downward';
  return 'down and to the right';
}

// Count prominent humps (local maxima of |perpendicular distance| from the
// chord). 1 = a bowl (c) or single arch (n/h); 2 = 'm' or 'w'; an S-curve also
// reads 2 (one bulge each side). Peaks must clear 40% of the tallest and be
// separated, so a wobbly line isn't over-counted.
function countHumps(absD, maxAbs) {
  const n = absD.length;
  if (n < 6) return 1;
  // Smooth |dist| with a moving average so pixel jitter doesn't invent peaks.
  const w = Math.max(1, Math.round(n * 0.06));
  const sm = absD.map((_, i) => {
    let s = 0, c = 0;
    for (let k = -w; k <= w; k++) { const j = i + k; if (j >= 0 && j < n) { s += absD[j]; c++; } }
    return s / c;
  });
  const thr = 0.35 * maxAbs;
  const win = Math.max(2, Math.round(n * 0.12));
  const sep = Math.max(win, Math.round(n * 0.25));   // humps must be well separated
  let count = 0, lastPeak = -sep;
  for (let i = win; i < n - win; i++) {
    if (sm[i] < thr) continue;
    let isPeak = true;
    for (let k = 1; k <= win; k++) {
      if (sm[i - k] > sm[i] || sm[i + k] > sm[i]) { isPeak = false; break; }
    }
    if (isPeak && i - lastPeak >= sep) { count++; lastPeak = i; }
  }
  return Math.max(count, 1);
}

// Count humps on just the TAIL of the stroke (from a shoulder's base onward) —
// the arch part after the retrace. This is what stops an 'm' from counting its
// leading down-up retrace as a 3rd hump: the retrace is excluded, so only the
// real arches (1 for r/n/h, 2 for m) are counted.
function humpsOnTail(pts, baseIdx) {
  const tail = pts.slice(baseIdx);
  const n = tail.length;
  if (n < 4) return 0;
  const s = tail[0], e = tail[n - 1];
  const cx = e.x - s.x, cy = e.y - s.y;
  const clen = Math.hypot(cx, cy);
  if (clen < 1e-4) return 0;
  const nx = -cy / clen, ny = cx / clen;
  const absD = tail.map((p) => Math.abs((p.x - s.x) * nx + (p.y - s.y) * ny));
  let maxAbs = 0;
  for (const d of absD) if (d > maxAbs) maxAbs = d;
  if (maxAbs < 0.015) return 0;   // a straight retrace-back-up has no hump
  return countHumps(absD, maxAbs);
}

// For a curve, work out which way it OPENS and how many HUMPS it has. The opening
// is the concave side — opposite the bulge. Take the chord start→end, find the
// apex (point farthest from the chord, on the bulge side); the opening faces
// from the apex back toward the chord's midpoint. A 'c' (bulge left) opens
// right; an 'n' arch (bulge up) opens down; a 'u' (bulge down) opens up. A
// nearly-closed loop (start≈end) has no opening.
// An 's' (or any S-curve / "spine") is one stroke whose two humps lie on
// OPPOSITE sides of the start→end chord — the concavity flips halfway down. This
// is the shape the user described: the top opens one way, the bottom opens the
// other. A 'w' or 'm' keeps both humps on the SAME side, so it is not an S. We
// split the stroke at its arc midpoint and compare the dominant bulge of each
// half; opposite signs (and both substantial) = an S. Each half's opening is
// read from that half's OWN chord, so the description is "opens right on top,
// left on the bottom" instead of the meaningless single-opening read that an
// S used to get ("opening up and to the left").
function detectSCurve(pts, start, end, signed, clen) {
  const N = pts.length;
  if (N < 8 || clen < 1e-4) return null;
  let total = 0; const cum = [0];
  for (let i = 1; i < N; i++) { total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); cum.push(total); }
  if (total < 1e-4) return null;
  const midArc = total / 2;
  let midI = 1; while (midI < N - 2 && cum[midI] < midArc) midI++;
  let firstMax = 0, firstMin = 0, secondMax = 0, secondMin = 0;
  for (let i = 0; i <= midI; i++) { if (signed[i] > firstMax) firstMax = signed[i]; if (signed[i] < firstMin) firstMin = signed[i]; }
  for (let i = midI; i < N; i++) { if (signed[i] > secondMax) secondMax = signed[i]; if (signed[i] < secondMin) secondMin = signed[i]; }
  const firstDom = Math.abs(firstMax) >= Math.abs(firstMin) ? firstMax : firstMin;
  const secondDom = Math.abs(secondMax) >= Math.abs(secondMin) ? secondMax : secondMin;
  const THRESH = 0.03;
  if (Math.abs(firstDom) < THRESH || Math.abs(secondDom) < THRESH) return null;
  // Each half's bulge must be a substantial fraction of the stroke's overall
  // bulge. A single bowl like a 'u' (one big hump + a small secondary wobble)
  // would otherwise sneak through as an S; a real S has two comparable humps.
  let globalMax = 0;
  for (let i = 0; i < signed.length; i++) if (Math.abs(signed[i]) > globalMax) globalMax = Math.abs(signed[i]);
  if (Math.abs(firstDom) < 0.5 * globalMax || Math.abs(secondDom) < 0.5 * globalMax) return null;
  if ((firstDom > 0) === (secondDom > 0)) return null;   // same side → m/w, not an S
  // An S is one continuous CURVE. Reject a half that's basically a straight
  // line — that's a 'u' drawn as a curve + a straight down-tail, not a smooth S.
  if (halfStraightness(pts, 0, midI) >= 0.95 || halfStraightness(pts, midI, N - 1) >= 0.95) return null;
  // A 'u' (or a 'u' with a straight down-tail) reverses direction ~180° at the
  // bottom (and again at the tail). An 's' curves smoothly — its tangent turns
  // gradually, never near 180°. A near-180° local turn is a back-and-forth, not
  // an S.
  const revWin = Math.max(2, Math.round(N * 0.10));
  for (let i = revWin; i < N - revWin; i++) {
    if (angleBetween(chordAngle(pts, i - revWin, i), chordAngle(pts, i, i + revWin)) >= 150) return null;
  }
  // opening of each half = from its apex toward its chord midpoint
  let fApexI = 0, fApexAbs = 0;
  for (let i = 0; i <= midI; i++) { if (Math.abs(signed[i]) > fApexAbs) { fApexAbs = Math.abs(signed[i]); fApexI = i; } }
  const fApex = pts[fApexI];
  const fChordMid = { x: (start.x + pts[midI].x) / 2, y: (start.y + pts[midI].y) / 2 };
  const topOpens = dirLabel(fChordMid.x - fApex.x, fChordMid.y - fApex.y);
  let sApexI = midI, sApexAbs = 0;
  for (let i = midI; i < N; i++) { if (Math.abs(signed[i]) > sApexAbs) { sApexAbs = Math.abs(signed[i]); sApexI = i; } }
  const sApex = pts[sApexI];
  const sChordMid = { x: (pts[midI].x + end.x) / 2, y: (pts[midI].y + end.y) / 2 };
  const bottomOpens = dirLabel(sChordMid.x - sApex.x, sChordMid.y - sApex.y);
  return { topOpens, bottomOpens };
}

function analyzeCurve(pts, start, end) {
  const cx = end.x - start.x, cy = end.y - start.y;
  const clen = Math.hypot(cx, cy);
  let arc = 0;
  for (let i = 1; i < pts.length; i++) arc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (arc < 1e-4) return { opens: '', humps: 0, closed: true };
  if (clen / arc < 0.18) return { opens: 'closed', humps: 0, closed: true };
  const cmx = (start.x + end.x) / 2, cmy = (start.y + end.y) / 2;
  const nx = -cy / clen, ny = cx / clen; // unit normal to the chord
  const signed = pts.map((p) => (p.x - start.x) * nx + (p.y - start.y) * ny);
  const absD = signed.map(Math.abs);
  let apexI = 0, apexAbs = 0;
  for (let i = 0; i < absD.length; i++) if (absD[i] > apexAbs) { apexAbs = absD[i]; apexI = i; }
  if (apexAbs < 1e-4) return { opens: '', humps: 0, closed: false };
  const apex = pts[apexI];
  const humps = countHumps(absD, apexAbs);
  const sCurve = humps >= 2 ? detectSCurve(pts, start, end, signed, clen) : null;
  return { opens: dirLabel(cmx - apex.x, cmy - apex.y), humps, closed: false, sCurve };
}

export function classifyStroke(strokePx) {
  if (!strokePx || strokePx.length < 2) return { kind: 'dot', direction: '', span: '', angleDeg: 0, straightness: 0 };
  const pts = strokePx.map((p) => ({ x: p.x / CANVAS_W, y: p.y / CANVAS_H }));
  const start = pts[0], end = pts[pts.length - 1];
  const dx = end.x - start.x, dy = end.y - start.y;
  const netLen = Math.hypot(dx, dy);
  let arc = 0;
  for (let i = 1; i < pts.length; i++) arc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (arc < 0.01) return { kind: 'dot', direction: '', span: '', angleDeg: 0, straightness: 0 };

  const straightness = netLen / arc;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  const angleDeg = Math.atan2(ay, ax) * 180 / Math.PI;  // 0 = horizontal, 90 = vertical

  let kind, direction, bend = null, curve = null, shoulder = null, bowl = null, hook = null, topHook = null, zigzag = null;
  if (straightness < STRAIGHT_THRESHOLD) {
    // Try the specific shapes first; the first that fits wins.
    const bw = detectBowl(pts);
    const hk = !bw ? detectHookedLine(pts) : null;
    const th = !bw && !hk ? detectTopHook(pts) : null;
    const sh = !bw && !hk && !th ? detectShoulder(pts) : null;
    const bd = !bw && !hk && !th && !sh ? detectBend(pts) : null;
    const zz = !bw && !hk && !th && !sh && !bd ? detectZigzag(pts) : null;
    if (bw) {
      bw.eye = detectEye(pts, bw.loopStartIdx, bw.closureIdx);
      kind = 'bowl'; direction = ''; bowl = bw;
    } else if (hk) {
      kind = 'hooked'; direction = ''; hook = hk;
    } else if (th) {
      kind = 'topHook'; direction = ''; topHook = th;
    } else if (sh) {
      kind = 'shoulder'; direction = '';
      sh.humps = humpsOnTail(pts, sh.baseIdx);
      shoulder = sh;
    } else if (bd) {
      kind = 'bent'; direction = '';
      const v = pts[bd.vertexIdx];
      const h1 = classifyChord(v.x - start.x, v.y - start.y);
      const h2 = classifyChord(end.x - v.x, end.y - v.y);
      bend = { dir1: h1.direction, dir2: h2.direction, kind1: h1.kind, kind2: h2.kind, vertexY: v.y, turnDeg: bd.turnDeg };
    } else if (zz) {
      kind = 'zigzag'; direction = ''; zigzag = zz;
    } else {
      kind = 'curve'; direction = '';
      curve = analyzeCurve(pts, start, end);
    }
  } else {
    const c = classifyChord(dx, dy);
    kind = c.kind;
    direction = c.direction;
  }

  // Guide-line span. For vertical/diagonal lines the span is which guide the
  // START sits on → which guide the END sits on (this encodes direction too:
  // a down-stroke reads "from midline to baseline", an up-stroke "from baseline
  // to midline"). For a horizontal line both ends share a y, so we report the
  // single guide it sits on. For a curve we report the full vertical extent
  // (min-y guide → max-y guide).
  let span;
  if (kind === 'horizontal') {
    const mid = (start.y + end.y) / 2;
    span = `sitting on the ${nearestGuide(mid).label}`;
  } else if (kind === 'curve' || kind === 'shoulder' || kind === 'bowl' || kind === 'hooked' || kind === 'topHook' || kind === 'zigzag') {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
    const gTop = nearestGuide(minY), gBot = nearestGuide(maxY);
    span = gTop.key === gBot.key ? `near the ${gTop.label}` : `from ${gTop.label} to ${gBot.label}`;
  } else {
    const gStart = nearestGuide(start.y), gEnd = nearestGuide(end.y);
    span = gStart.key === gEnd.key ? `on the ${gStart.label}` : `from ${gStart.label} to ${gEnd.label}`;
  }

  return { kind, direction, span, angleDeg, straightness, bend, curve, shoulder, bowl, hook, topHook, zigzag };
}

// One human-readable sentence, e.g. "Vertical line, going top to bottom, from
// midline to baseline."
export function describeStroke(strokePx) {
  const c = classifyStroke(strokePx);
  if (c.kind === 'dot') return 'A dot (a tap).';
  if (c.kind === 'bent') {
    const vGuide = nearestGuide(c.bend.vertexY).label;
    return `A bent stroke — first going ${c.bend.dir1}, then going ${c.bend.dir2}, with a sharp turn (≈${Math.round(c.bend.turnDeg)}°) near the ${vGuide}. Spans ${c.span}.`;
  }
  if (c.kind === 'shoulder') {
    const sh = c.shoulder || {};
    const h = sh.humps || 0;
    if (!h) return `A shoulder retrace — a vertical down then back up (pen retraced). Spans ${c.span}.`;
    const humpTxt = h > 1 ? `${h} humps` : 'a hump';
    return `A shoulder — down, back up, then ${humpTxt} rounding to the right. Spans ${c.span}.`;
  }
  if (c.kind === 'bowl') {
    const b = c.bowl || {};
    if (b.eye) {
      let s = "An 'e' — a closed loop with a horizontal crossbar across the middle (the eye)";
      if (b.tailFrac > 0.12) s += ` and a tail going ${b.tailDir}`;
      s += `. Spans ${c.span}.`;
      return s;
    }
    let s = 'A bowl — a closed rounded loop';
    if (b.leadFrac > 0.12) s = `A stem going ${b.leadDir}, then a bowl (closed loop)`;
    if (b.tailFrac > 0.12) s += ` with a tail going ${b.tailDir}`;
    s += `. Spans ${c.span}.`;
    return s;
  }
  if (c.kind === 'hooked') {
    const h = c.hook || {};
    return `A ${h.stemKind} line going ${h.stemDir}, then a hook curving ${h.hookDir}. Spans ${c.span}.`;
  }
  if (c.kind === 'topHook') {
    const h = c.topHook || {};
    return `A curve at the top going ${h.hookDir} that straightens into a vertical stem. Spans ${c.span}.`;
  }
  if (c.kind === 'zigzag') {
    return `A 'z' — a horizontal bar on top, a diagonal down, then a horizontal bar on the bottom. Spans ${c.span}.`;
  }
  if (c.kind === 'curve') {
    const cv = c.curve || {};
    if (cv.closed) return `A closed loop (no opening). Spans ${c.span}.`;
    if (cv.sCurve) return `An S-curve — opens ${cv.sCurve.topOpens} on top, opens ${cv.sCurve.bottomOpens} on the bottom. Spans ${c.span}.`;
    const humps = cv.humps > 1 ? ` with ${cv.humps} humps` : '';
    return `A curve${humps}, opening ${cv.opens}. Spans ${c.span}.`;
  }
  const cap = c.kind[0].toUpperCase() + c.kind.slice(1);
  const dir = c.direction ? `, going ${c.direction}` : '';
  const ang = c.kind === 'diagonal' ? ` (≈${Math.round(c.angleDeg)}°)` : '';
  return `${cap} line${ang}${dir}, ${c.span}.`;
}