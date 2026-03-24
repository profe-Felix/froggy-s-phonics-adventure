// Waypoints derived from Zaner-Bloser stroke order guide
// Coordinates are normalized 0-1 within a square canvas
// Key y positions: T=ascender(0.10), M=midline(0.42), B=baseline(0.72), D=descender(0.92)
// Key x positions: L=0.18, CL=0.35, C=0.50, CR=0.65, R=0.82

const T = 0.10, M = 0.42, MID = 0.57, B = 0.72, D = 0.92;
const L = 0.18, CL = 0.35, C = 0.50, CR = 0.65, R = 0.82;

// Each letter has strokes: array of arrays of {x,y} points
// A "lift" between strokes is implied by separate stroke arrays
export const LETTER_WAYPOINTS = {
  a: {
    strokes: [[
      {x:CR,  y:MID}, {x:C,   y:M},   {x:CL,  y:0.48}, {x:0.28,y:MID},
      {x:CL,  y:0.67},{x:C,   y:B},   {x:CR,  y:0.65}, {x:CR,  y:M},
      {x:CR,  y:B},
    ]],
    hint: 'Circle back all the way around, push up, pull down'
  },
  b: {
    strokes: [[
      {x:CL, y:T},  {x:CL, y:B},
      {x:CL, y:M},  {x:C,  y:0.38}, {x:CR, y:MID},
      {x:C,  y:0.68},{x:CL, y:B},
    ]],
    hint: 'Pull down, push up, circle forward'
  },
  c: {
    strokes: [[
      {x:CR, y:0.48},{x:C,  y:M},   {x:CL, y:0.46},
      {x:0.28,y:MID},{x:CL, y:0.67},{x:C,  y:B},   {x:CR, y:0.68},
    ]],
    hint: 'Circle back'
  },
  d: {
    strokes: [[
      {x:CR,  y:MID},{x:C,   y:M},   {x:CL,  y:0.48},
      {x:0.28,y:MID},{x:CL,  y:0.67},{x:C,   y:B},
      {x:CR,  y:0.65},{x:CR, y:M},   {x:CR,  y:T},
      {x:CR,  y:B},
    ]],
    hint: 'Circle back all the way, push up to top, pull down'
  },
  e: {
    strokes: [[
      {x:CL, y:MID},{x:CR, y:MID},{x:R,  y:0.50},
      {x:C,  y:M},  {x:CL, y:0.46},{x:0.28,y:MID},
      {x:CL, y:0.68},{x:C, y:B},  {x:CR, y:0.68},
    ]],
    hint: 'Slide right, circle back'
  },
  f: {
    strokes: [
      [{x:0.60,y:0.16},{x:C,  y:T},  {x:CL, y:0.14},{x:CL, y:M}, {x:CL, y:B}],
      [{x:0.27,y:M},   {x:0.60,y:M}],
    ],
    hint: 'Curve back, pull down. Lift. Slide right'
  },
  g: {
    strokes: [[
      {x:CR,  y:MID},{x:C,   y:M},   {x:CL,  y:0.48},
      {x:0.28,y:MID},{x:CL,  y:0.68},{x:C,   y:B},
      {x:CR,  y:0.65},{x:CR, y:M},   {x:CR,  y:D-0.04},
      {x:C,   y:D},   {x:CL, y:D-0.04},
    ]],
    hint: 'Circle back all the way, push up, pull down, curve back'
  },
  h: {
    strokes: [[
      {x:CL, y:T},   {x:CL, y:B},
      {x:CL, y:0.52},{x:C,  y:M},   {x:CR, y:0.50},
      {x:CR, y:B},
    ]],
    hint: 'Pull down, push up, curve forward, pull down'
  },
  i: {
    strokes: [
      [{x:C, y:M},   {x:C, y:B}],
      [{x:C, y:0.30},{x:C, y:0.32}],
    ],
    hint: 'Pull down. Dot'
  },
  j: {
    strokes: [
      [{x:CR, y:M},   {x:CR, y:D-0.06},{x:C,  y:D},   {x:CL, y:D-0.04}],
      [{x:CR, y:0.30},{x:CR, y:0.32}],
    ],
    hint: 'Pull down, curve back. Dot'
  },
  k: {
    strokes: [
      [{x:CL, y:T}, {x:CL, y:B}],
      [{x:R,  y:M}, {x:CL, y:MID},{x:R,  y:B}],
    ],
    hint: 'Pull down. Lift. Slant left, slant right'
  },
  l: {
    strokes: [[{x:C, y:T}, {x:C, y:B}]],
    hint: 'Pull down'
  },
  m: {
    strokes: [[
      {x:0.20,y:M},  {x:0.20,y:B},
      {x:0.20,y:0.52},{x:0.36,y:M},  {x:0.50,y:0.50},
      {x:0.50,y:B},
      {x:0.50,y:0.52},{x:0.64,y:M},  {x:0.76,y:0.50},
      {x:0.76,y:B},
    ]],
    hint: 'Pull down, push up, curve forward, pull down — twice'
  },
  n: {
    strokes: [[
      {x:CL, y:M},   {x:CL, y:B},
      {x:CL, y:0.52},{x:C,  y:M},   {x:CR, y:0.50},
      {x:CR, y:B},
    ]],
    hint: 'Pull down, push up, curve forward, pull down'
  },
  o: {
    strokes: [[
      {x:CR, y:MID},{x:C,   y:M},   {x:CL, y:0.46},
      {x:0.28,y:MID},{x:CL, y:0.67},{x:C,  y:B},
      {x:CR, y:0.67},{x:R,  y:MID}, {x:CR, y:0.48},
    ]],
    hint: 'Circle back all the way around'
  },
  p: {
    strokes: [[
      {x:CL, y:M},   {x:CL, y:D},
      {x:CL, y:0.52},{x:C,  y:M},   {x:CR, y:MID},
      {x:C,  y:0.68},{x:CL, y:B},
    ]],
    hint: 'Pull down, push up, circle forward'
  },
  q: {
    strokes: [[
      {x:CR,  y:MID},{x:C,   y:M},   {x:CL,  y:0.48},
      {x:0.28,y:MID},{x:CL,  y:0.67},{x:C,   y:B},
      {x:CR,  y:0.65},{x:CR, y:M},   {x:CR,  y:D},
      {x:R,   y:D+0.02},
    ]],
    hint: 'Circle back all the way, push up, pull down, curve forward'
  },
  r: {
    strokes: [[
      {x:CL, y:M},   {x:CL, y:B},
      {x:CL, y:0.52},{x:C,  y:M},   {x:CR, y:0.46},
    ]],
    hint: 'Pull down, push up, curve forward'
  },
  s: {
    strokes: [[
      {x:CR, y:0.46},{x:C,  y:M},   {x:CL, y:0.47},
      {x:C,  y:MID}, {x:CR, y:0.63},{x:C,  y:B},
      {x:CL, y:0.70},
    ]],
    hint: 'Curve back, curve forward'
  },
  t: {
    strokes: [
      [{x:C, y:0.18},{x:C, y:B}],
      [{x:CL,y:M},   {x:CR,y:M}],
    ],
    hint: 'Pull down. Lift. Slide right'
  },
  u: {
    strokes: [[
      {x:CL, y:M},   {x:CL, y:0.65},{x:C,  y:B},
      {x:CR, y:0.65},{x:CR, y:M},   {x:CR, y:B},
    ]],
    hint: 'Pull down, curve forward, push up, pull down'
  },
  v: {
    strokes: [[
      {x:L,  y:M},   {x:C,  y:B},   {x:R,  y:M},
    ]],
    hint: 'Slant right, slant up'
  },
  w: {
    strokes: [[
      {x:0.14,y:M},  {x:0.32,y:B},  {x:0.50,y:0.58},
      {x:0.68,y:B},  {x:0.86,y:M},
    ]],
    hint: 'Slant right, slant up, slant right, slant up'
  },
  x: {
    strokes: [
      [{x:L, y:M},   {x:R, y:B}],
      [{x:R, y:M},   {x:L, y:B}],
    ],
    hint: 'Slant right. Lift. Slant left'
  },
  y: {
    strokes: [
      [{x:CL, y:M},   {x:C,  y:0.60}],
      [{x:CR, y:M},   {x:C,  y:0.60},{x:CL, y:D}],
    ],
    hint: 'Slant right. Lift. Slant left, pull down'
  },
  z: {
    strokes: [[
      {x:CL, y:M},   {x:CR, y:M},
      {x:CL, y:B},   {x:CR, y:B},
    ]],
    hint: 'Slide right, slant left, slide right'
  },
};

export const TRACING_LETTERS = 'aeiouбcdfghjklmnopqrstuvwxyz'
  .split('')
  .filter(l => LETTER_WAYPOINTS[l]);