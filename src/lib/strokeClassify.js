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
function analyzeCurve(pts, start, end) {
  const cx = end.x - start.x, cy = end.y - start.y;
  const clen = Math.hypot(cx, cy);
  let arc = 0;
  for (let i = 1; i < pts.length; i++) arc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (arc < 1e-4) return { opens: '', humps: 0, closed: true };
  if (clen / arc < 0.18) return { opens: 'closed', humps: 0, closed: true };
  const cmx = (start.x + end.x) / 2, cmy = (start.y + end.y) / 2;
  const nx = -cy / clen, ny = cx / clen; // unit normal to the chord
  const absD = pts.map((p) => Math.abs((p.x - start.x) * nx + (p.y - start.y) * ny));
  let apexI = 0, apexAbs = 0;
  for (let i = 0; i < absD.length; i++) if (absD[i] > apexAbs) { apexAbs = absD[i]; apexI = i; }
  if (apexAbs < 1e-4) return { opens: '', humps: 0, closed: false };
  const apex = pts[apexI];
  return { opens: dirLabel(cmx - apex.x, cmy - apex.y), humps: countHumps(absD, apexAbs), closed: false };
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

  let kind, direction, bend = null, curve = null, shoulder = null;
  if (straightness < STRAIGHT_THRESHOLD) {
    const sh = detectShoulder(pts);
    if (sh) {
      kind = 'shoulder';
      direction = '';
      sh.humps = humpsOnTail(pts, sh.baseIdx);
      shoulder = sh;
    } else {
      const detected = detectBend(pts);
      if (detected) {
        kind = 'bent';
        direction = '';
        const v = pts[detected.vertexIdx];
        const h1 = classifyChord(v.x - start.x, v.y - start.y);
        const h2 = classifyChord(end.x - v.x, end.y - v.y);
        bend = { dir1: h1.direction, dir2: h2.direction, kind1: h1.kind, kind2: h2.kind, vertexY: v.y, turnDeg: detected.turnDeg };
      } else {
        kind = 'curve';
        direction = '';
        curve = analyzeCurve(pts, start, end);
      }
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
  } else if (kind === 'curve' || kind === 'shoulder') {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
    const gTop = nearestGuide(minY), gBot = nearestGuide(maxY);
    span = gTop.key === gBot.key ? `near the ${gTop.label}` : `from ${gTop.label} to ${gBot.label}`;
  } else {
    const gStart = nearestGuide(start.y), gEnd = nearestGuide(end.y);
    span = gStart.key === gEnd.key ? `on the ${gStart.label}` : `from ${gStart.label} to ${gEnd.label}`;
  }

  return { kind, direction, span, angleDeg, straightness, bend, curve, shoulder };
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
  if (c.kind === 'curve') {
    const cv = c.curve || {};
    if (cv.closed) return `A closed loop (no opening). Spans ${c.span}.`;
    const humps = cv.humps > 1 ? ` with ${cv.humps} humps` : '';
    return `A curve${humps}, opening ${cv.opens}. Spans ${c.span}.`;
  }
  const cap = c.kind[0].toUpperCase() + c.kind.slice(1);
  const dir = c.direction ? `, going ${c.direction}` : '';
  const ang = c.kind === 'diagonal' ? ` (≈${Math.round(c.angleDeg)}°)` : '';
  return `${cap} line${ang}${dir}, ${c.span}.`;
}