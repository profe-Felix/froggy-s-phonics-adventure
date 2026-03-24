// Waypoints derived from Zaner-Bloser stroke order guide
// Coordinates normalized 0-1. y: T=0.10, M=0.42, B=0.72, D=0.92

// Generate smooth arc points around (cx,cy) with radii rx,ry from startDeg to endDeg
function arc(cx, cy, rx, ry, startDeg, endDeg, steps) {
  const pts = [];
  const n = steps || 16;
  for (let i = 0; i <= n; i++) {
    const deg = startDeg + (endDeg - startDeg) * (i / n);
    const rad = (deg * Math.PI) / 180;
    pts.push({ x: +(cx + rx * Math.cos(rad)).toFixed(4), y: +(cy + ry * Math.sin(rad)).toFixed(4) });
  }
  return pts;
}

export const LETTER_WAYPOINTS = {
  a: {
    strokes: [[
      { x: 0.63, y: 0.494 },
      { x: 0.6194, y: 0.4725 },
      { x: 0.6056, y: 0.4559 },
      { x: 0.5886, y: 0.4443 },
      { x: 0.5684, y: 0.4377 },
      { x: 0.545, y: 0.436 },
      { x: 0.5153, y: 0.4271 },
      { x: 0.4862, y: 0.4229 },
      { x: 0.4577, y: 0.4233 },
      { x: 0.4298, y: 0.4283 },
      { x: 0.4025, y: 0.438 },
      { x: 0.3819, y: 0.4499 },
      { x: 0.3641, y: 0.4649 },
      { x: 0.3491, y: 0.4829 },
      { x: 0.3369, y: 0.5039 },
      { x: 0.3275, y: 0.528 },
      { x: 0.3265, y: 0.5551 },
      { x: 0.3275, y: 0.5789 },
      { x: 0.3305, y: 0.5993 },
      { x: 0.3355, y: 0.6163 },
      { x: 0.3425, y: 0.63 },
      { x: 0.3643, y: 0.6536 },
      { x: 0.3857, y: 0.6716 },
      { x: 0.4067, y: 0.684 },
      { x: 0.4273, y: 0.6908 },
      { x: 0.4475, y: 0.692 },
      { x: 0.4792, y: 0.6964 },
      { x: 0.5083, y: 0.6952 },
      { x: 0.5348, y: 0.6884 },
      { x: 0.5587, y: 0.676 },
      { x: 0.58, y: 0.658 },
      { x: 0.6044, y: 0.6474 },
      { x: 0.6236, y: 0.6318 },
      { x: 0.6376, y: 0.611 },
      { x: 0.6464, y: 0.585 },
      { x: 0.65, y: 0.554 },
      { x: 0.648, y: 0.5091 },
      { x: 0.646, y: 0.4737 },
      { x: 0.644, y: 0.4477 },
      { x: 0.642, y: 0.4311 },
      { x: 0.64, y: 0.424 },
      { x: 0.65, y: 0.71 },
    ]],
    hint: 'Circle back all the way around, push up, pull down'
  },
  b: {
    strokes: [[
      // pull down straight from ascender
      { x: 0.35, y: 0.10 }, { x: 0.35, y: 0.72 },
      // push up to midline then circle forward
      { x: 0.35, y: 0.52 },
      ...arc(0.52, 0.57, 0.17, 0.15, 180, 540, 20),
    ]],
    hint: 'Pull down, push up, circle forward'
  },
  c: {
    strokes: [arc(0.50, 0.57, 0.19, 0.16, -50, 230, 18)],
    hint: 'Circle back'
  },
  d: {
    strokes: [[
      ...arc(0.50, 0.57, 0.19, 0.16, -50, 300, 20),
      { x: 0.69, y: 0.57 },
      { x: 0.69, y: 0.10 },
      { x: 0.69, y: 0.72 },
    ]],
    hint: 'Circle back all the way, push up to top, pull down'
  },
  e: {
    strokes: [[
      { x: 0.30, y: 0.57 }, { x: 0.70, y: 0.57 },
      ...arc(0.50, 0.57, 0.20, 0.16, 0, 230, 16),
    ]],
    hint: 'Slide right, circle back'
  },
  f: {
    strokes: [
      [...arc(0.58, 0.20, 0.14, 0.12, -90, 180, 10), { x: 0.44, y: 0.72 }],
      [{ x: 0.28, y: 0.42 }, { x: 0.62, y: 0.42 }],
    ],
    hint: 'Curve back, pull down. Lift. Slide right'
  },
  g: {
    strokes: [[
      ...arc(0.50, 0.57, 0.19, 0.16, -50, 300, 20),
      { x: 0.69, y: 0.57 },
      { x: 0.69, y: 0.88 },
      ...arc(0.50, 0.88, 0.19, 0.06, 0, 180, 8),
    ]],
    hint: 'Circle back all the way, push up, pull down, curve back'
  },
  h: {
    strokes: [[
      { x: 0.35, y: 0.10 }, { x: 0.35, y: 0.72 },
      { x: 0.35, y: 0.52 },
      ...arc(0.52, 0.52, 0.17, 0.12, 180, 360, 10),
      { x: 0.69, y: 0.72 },
    ]],
    hint: 'Pull down, push up, curve forward, pull down'
  },
  i: {
    strokes: [
      [{ x: 0.50, y: 0.42 }, { x: 0.50, y: 0.72 }],
      [{ x: 0.50, y: 0.30 }, { x: 0.50, y: 0.31 }],
    ],
    hint: 'Pull down. Dot'
  },
  j: {
    strokes: [
      [{ x: 0.55, y: 0.42 }, ...arc(0.46, 0.84, 0.14, 0.10, 0, 210, 10)],
      [{ x: 0.55, y: 0.30 }, { x: 0.55, y: 0.31 }],
    ],
    hint: 'Pull down, curve back. Dot'
  },
  k: {
    strokes: [
      [{ x: 0.35, y: 0.10 }, { x: 0.35, y: 0.72 }],
      [{ x: 0.72, y: 0.42 }, { x: 0.35, y: 0.57 }, { x: 0.72, y: 0.72 }],
    ],
    hint: 'Pull down. Lift. Slant left, slant right'
  },
  l: {
    strokes: [[{ x: 0.50, y: 0.10 }, { x: 0.50, y: 0.72 }]],
    hint: 'Pull down'
  },
  m: {
    strokes: [[
      { x: 0.20, y: 0.42 }, { x: 0.20, y: 0.72 },
      { x: 0.20, y: 0.52 },
      ...arc(0.34, 0.52, 0.14, 0.12, 180, 360, 8),
      { x: 0.48, y: 0.72 },
      { x: 0.48, y: 0.52 },
      ...arc(0.60, 0.52, 0.14, 0.12, 180, 360, 8),
      { x: 0.74, y: 0.72 },
    ]],
    hint: 'Pull down, push up, curve forward, pull down — twice'
  },
  n: {
    strokes: [[
      { x: 0.33, y: 0.42 }, { x: 0.33, y: 0.72 },
      { x: 0.33, y: 0.52 },
      ...arc(0.50, 0.52, 0.17, 0.12, 180, 360, 10),
      { x: 0.67, y: 0.72 },
    ]],
    hint: 'Pull down, push up, curve forward, pull down'
  },
  o: {
    strokes: [arc(0.50, 0.57, 0.20, 0.16, -50, 310, 24)],
    hint: 'Circle back all the way around'
  },
  p: {
    strokes: [[
      { x: 0.35, y: 0.42 }, { x: 0.35, y: 0.92 },
      { x: 0.35, y: 0.52 },
      ...arc(0.52, 0.57, 0.17, 0.15, 180, 540, 20),
    ]],
    hint: 'Pull down, push up, circle forward'
  },
  q: {
    strokes: [[
      ...arc(0.50, 0.57, 0.19, 0.16, -50, 300, 20),
      { x: 0.69, y: 0.57 },
      { x: 0.69, y: 0.92 },
      { x: 0.78, y: 0.95 },
    ]],
    hint: 'Circle back all the way, push up, pull down, curve forward'
  },
  r: {
    strokes: [[
      { x: 0.33, y: 0.42 }, { x: 0.33, y: 0.72 },
      { x: 0.33, y: 0.50 },
      ...arc(0.50, 0.46, 0.18, 0.10, 180, 340, 8),
    ]],
    hint: 'Pull down, push up, curve forward'
  },
  s: {
    strokes: [[
      ...arc(0.50, 0.48, 0.17, 0.10, -10, 220, 12),
      ...arc(0.50, 0.65, 0.17, 0.10, 170, 380, 12),
    ]],
    hint: 'Curve back, curve forward'
  },
  t: {
    strokes: [
      [{ x: 0.50, y: 0.18 }, { x: 0.50, y: 0.72 }],
      [{ x: 0.33, y: 0.42 }, { x: 0.67, y: 0.42 }],
    ],
    hint: 'Pull down. Lift. Slide right'
  },
  u: {
    strokes: [[
      { x: 0.33, y: 0.42 },
      ...arc(0.50, 0.63, 0.17, 0.12, 180, 360, 12),
      { x: 0.67, y: 0.42 },
      { x: 0.67, y: 0.72 },
    ]],
    hint: 'Pull down, curve forward, push up, pull down'
  },
  v: {
    strokes: [[{ x: 0.25, y: 0.42 }, { x: 0.50, y: 0.72 }, { x: 0.75, y: 0.42 }]],
    hint: 'Slant right, slant up'
  },
  w: {
    strokes: [[
      { x: 0.14, y: 0.42 }, { x: 0.30, y: 0.72 },
      { x: 0.50, y: 0.55 },
      { x: 0.70, y: 0.72 }, { x: 0.86, y: 0.42 }
    ]],
    hint: 'Slant right, slant up, slant right, slant up'
  },
  x: {
    strokes: [
      [{ x: 0.28, y: 0.42 }, { x: 0.72, y: 0.72 }],
      [{ x: 0.72, y: 0.42 }, { x: 0.28, y: 0.72 }],
    ],
    hint: 'Slant right. Lift. Slant left'
  },
  y: {
    strokes: [
      [{ x: 0.33, y: 0.42 }, { x: 0.50, y: 0.62 }],
      [{ x: 0.67, y: 0.42 }, { x: 0.50, y: 0.62 }, ...arc(0.42, 0.80, 0.15, 0.12, 20, 210, 8)],
    ],
    hint: 'Slant right. Lift. Slant left, pull down'
  },
  z: {
    strokes: [[
      { x: 0.28, y: 0.42 }, { x: 0.72, y: 0.42 },
      { x: 0.28, y: 0.72 }, { x: 0.72, y: 0.72 }
    ]],
    hint: 'Slide right, slant left, slide right'
  },
};

export const TRACING_LETTERS = 'abcdefghijklmnopqrstuvwxyz'
  .split('')
  .filter(l => LETTER_WAYPOINTS[l]);