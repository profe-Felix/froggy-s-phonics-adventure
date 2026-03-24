// Waypoints derived from Zaner-Bloser stroke order guide
// Coordinates are normalized 0-1 within a square canvas
// Key y positions: T=ascender(0.10), M=midline(0.42), B=baseline(0.72), D=descender(0.92)

// Helper: generate arc points (cx, cy = center, rx/ry = radii, startDeg, endDeg, steps)
function arc(cx, cy, rx, ry, startDeg, endDeg, steps = 16) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = startDeg + (endDeg - startDeg) * (i / steps);
    const rad = (t * Math.PI) / 180;
    pts.push({ x: cx + rx * Math.cos(rad), y: cy + ry * Math.sin(rad) });
  }
  return pts;
}

// o: full circle, center (0.50, 0.57), rx=0.20, ry=0.18
// Start at top-right (~-50 deg), go counterclockwise (circle back = clockwise in screen coords = increasing angle from -50 → 310)
const O_CIRCLE = arc(0.50, 0.57, 0.20, 0.17, -50, 310, 20);

// c: 3/4 circle, open on right
const C_ARC = arc(0.50, 0.57, 0.20, 0.17, -50, 230, 16);

// a circle part (same as c)
const A_CIRCLE = arc(0.50, 0.57, 0.19, 0.16, -50, 290, 16);

// d circle part
const D_CIRCLE = arc(0.50, 0.57, 0.19, 0.16, -50, 290, 16);

// g circle part
const G_CIRCLE = arc(0.50, 0.57, 0.19, 0.16, -50, 290, 16);

// q circle part
const Q_CIRCLE = arc(0.50, 0.57, 0.19, 0.16, -50, 290, 16);

// e: horizontal then arc
const E_ARC = arc(0.50, 0.57, 0.20, 0.17, 180, 230, 8);

// b forward circle
const B_CIRCLE = arc(0.50, 0.57, 0.19, 0.16, 230, 590, 20); // 230→-130 forward

// p forward circle
const P_CIRCLE = arc(0.50, 0.57, 0.19, 0.16, 230, 590, 20);

// s curves
const S_BACK = arc(0.50, 0.49, 0.18, 0.10, 0, 200, 10);
const S_FWD  = arc(0.50, 0.63, 0.18, 0.10, 180, 380, 10);

export const LETTER_WAYPOINTS = {
  a: {
    strokes: [[
      ...A_CIRCLE,
      {x: 0.69, y: 0.57},
      {x: 0.69, y: 0.72},
    ]],
    hint: 'Circle back all the way around, push up, pull down'
  },
  b: {
    strokes: [[
      {x: 0.35, y: 0.10},
      {x: 0.35, y: 0.72},
      ...B_CIRCLE,
    ]],
    hint: 'Pull down, push up, circle forward'
  },
  c: {
    strokes: [C_ARC],
    hint: 'Circle back'
  },
  d: {
    strokes: [[
      ...D_CIRCLE,
      {x: 0.69, y: 0.57},
      {x: 0.69, y: 0.10},
      {x: 0.69, y: 0.72},
    ]],
    hint: 'Circle back all the way, push up to top, pull down'
  },
  e: {
    strokes: [[
      {x: 0.30, y: 0.57},
      {x: 0.70, y: 0.57},
      ...arc(0.50, 0.57, 0.20, 0.17, 0, 230, 14),
    ]],
    hint: 'Slide right, circle back'
  },
  f: {
    strokes: [
      [...arc(0.58, 0.18, 0.14, 0.10, -90, 180, 10), {x: 0.44, y: 0.72}],
      [{x: 0.28, y: 0.42}, {x: 0.62, y: 0.42}],
    ],
    hint: 'Curve back, pull down. Lift. Slide right'
  },
  g: {
    strokes: [[
      ...G_CIRCLE,
      {x: 0.69, y: 0.57},
      {x: 0.69, y: 0.88},
      ...arc(0.50, 0.88, 0.19, 0.06, 0, 180, 8),
    ]],
    hint: 'Circle back all the way, push up, pull down, curve back'
  },
  h: {
    strokes: [[
      {x: 0.35, y: 0.10},
      {x: 0.35, y: 0.72},
      {x: 0.35, y: 0.52},
      ...arc(0.54, 0.50, 0.17, 0.12, 180, 360, 10),
      {x: 0.65, y: 0.72},
    ]],
    hint: 'Pull down, push up, curve forward, pull down'
  },
  i: {
    strokes: [
      [{x: 0.50, y: 0.42}, {x: 0.50, y: 0.72}],
      [{x: 0.50, y: 0.30}, {x: 0.50, y: 0.32}],
    ],
    hint: 'Pull down. Dot'
  },
  j: {
    strokes: [
      [{x: 0.58, y: 0.42}, ...arc(0.50, 0.84, 0.16, 0.10, 0, 200, 10)],
      [{x: 0.58, y: 0.30}, {x: 0.58, y: 0.32}],
    ],
    hint: 'Pull down, curve back. Dot'
  },
  k: {
    strokes: [
      [{x: 0.35, y: 0.10}, {x: 0.35, y: 0.72}],
      [{x: 0.72, y: 0.42}, {x: 0.35, y: 0.57}, {x: 0.72, y: 0.72}],
    ],
    hint: 'Pull down. Lift. Slant left, slant right'
  },
  l: {
    strokes: [[{x: 0.50, y: 0.10}, {x: 0.50, y: 0.72}]],
    hint: 'Pull down'
  },
  m: {
    strokes: [[
      {x: 0.20, y: 0.42}, {x: 0.20, y: 0.72},
      {x: 0.20, y: 0.52},
      ...arc(0.34, 0.50, 0.14, 0.12, 180, 360, 8),
      {x: 0.48, y: 0.72},
      {x: 0.48, y: 0.52},
      ...arc(0.60, 0.50, 0.14, 0.12, 180, 360, 8),
      {x: 0.74, y: 0.72},
    ]],
    hint: 'Pull down, push up, curve forward, pull down — twice'
  },
  n: {
    strokes: [[
      {x: 0.33, y: 0.42}, {x: 0.33, y: 0.72},
      {x: 0.33, y: 0.52},
      ...arc(0.50, 0.50, 0.17, 0.12, 180, 360, 10),
      {x: 0.67, y: 0.72},
    ]],
    hint: 'Pull down, push up, curve forward, pull down'
  },
  o: {
    strokes: [O_CIRCLE],
    hint: 'Circle back all the way around'
  },
  p: {
    strokes: [[
      {x: 0.35, y: 0.42},
      {x: 0.35, y: 0.92},
      {x: 0.35, y: 0.52},
      ...P_CIRCLE,
    ]],
    hint: 'Pull down, push up, circle forward'
  },
  q: {
    strokes: [[
      ...Q_CIRCLE,
      {x: 0.69, y: 0.57},
      {x: 0.69, y: 0.92},
      {x: 0.78, y: 0.95},
    ]],
    hint: 'Circle back all the way, push up, pull down, curve forward'
  },
  r: {
    strokes: [[
      {x: 0.33, y: 0.42}, {x: 0.33, y: 0.72},
      {x: 0.33, y: 0.52},
      ...arc(0.50, 0.46, 0.17, 0.10, 180, 340, 8),
    ]],
    hint: 'Pull down, push up, curve forward'
  },
  s: {
    strokes: [[
      ...S_BACK.slice(0).reverse().slice(0, 9),
      ...S_FWD.slice(1),
    ]],
    hint: 'Curve back, curve forward'
  },
  t: {
    strokes: [
      [{x: 0.50, y: 0.18}, {x: 0.50, y: 0.72}],
      [{x: 0.33, y: 0.42}, {x: 0.67, y: 0.42}],
    ],
    hint: 'Pull down. Lift. Slide right'
  },
  u: {
    strokes: [[
      {x: 0.33, y: 0.42},
      ...arc(0.50, 0.62, 0.17, 0.12, 180, 360, 10),
      {x: 0.67, y: 0.72},
    ]],
    hint: 'Pull down, curve forward, push up, pull down'
  },
  v: {
    strokes: [[{x: 0.25, y: 0.42}, {x: 0.50, y: 0.72}, {x: 0.75, y: 0.42}]],
    hint: 'Slant right, slant up'
  },
  w: {
    strokes: [[{x: 0.14, y: 0.42}, {x: 0.30, y: 0.72}, {x: 0.50, y: 0.55}, {x: 0.70, y: 0.72}, {x: 0.86, y: 0.42}]],
    hint: 'Slant right, slant up, slant right, slant up'
  },
  x: {
    strokes: [
      [{x: 0.28, y: 0.42}, {x: 0.72, y: 0.72}],
      [{x: 0.72, y: 0.42}, {x: 0.28, y: 0.72}],
    ],
    hint: 'Slant right. Lift. Slant left'
  },
  y: {
    strokes: [
      [{x: 0.33, y: 0.42}, {x: 0.50, y: 0.62}],
      [{x: 0.67, y: 0.42}, {x: 0.50, y: 0.62}, ...arc(0.42, 0.82, 0.16, 0.12, 20, 200, 8)],
    ],
    hint: 'Slant right. Lift. Slant left, pull down'
  },
  z: {
    strokes: [[{x: 0.28, y: 0.42}, {x: 0.72, y: 0.42}, {x: 0.28, y: 0.72}, {x: 0.72, y: 0.72}]],
    hint: 'Slide right, slant left, slide right'
  },
};

export const TRACING_LETTERS = 'abcdefghijklmnopqrstuvwxyz'
  .split('')
  .filter(l => LETTER_WAYPOINTS[l]);