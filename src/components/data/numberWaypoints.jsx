// Number tracing waypoints (0-20). Coordinates normalized 0-1.
// Digits sit between topline (0.10) and baseline (0.633), matching the
// writing lines drawn in LetterTracingCanvas. Teachers can refine these
// defaults from the Letter Tracing Authoring page.

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

// Single digits 0-9 — each fills the full canvas width.
const DIGITS = {
  '0': {
    strokes: [arc(0.50, 0.37, 0.20, 0.27, -80, 280, 20)],
    hint: 'Circle back all the way around',
  },
  '1': {
    strokes: [[{ x: 0.40, y: 0.20 }, { x: 0.50, y: 0.10 }, { x: 0.50, y: 0.633 }]],
    hint: 'Slant right, pull down',
  },
  '2': {
    strokes: [[
      ...arc(0.50, 0.24, 0.18, 0.14, 40, 220, 10),
      { x: 0.34, y: 0.40 },
      { x: 0.66, y: 0.633 },
    ]],
    hint: 'Curve over, slant down, slide right',
  },
  '3': {
    strokes: [[
      ...arc(0.50, 0.22, 0.18, 0.13, 30, 320, 10),
      { x: 0.50, y: 0.37 },
      ...arc(0.50, 0.50, 0.18, 0.13, 220, 360, 10),
    ]],
    hint: 'Curve over, curve forward',
  },
  '4': {
    strokes: [
      [{ x: 0.62, y: 0.10 }, { x: 0.32, y: 0.45 }, { x: 0.68, y: 0.45 }],
      [{ x: 0.55, y: 0.45 }, { x: 0.55, y: 0.633 }],
    ],
    hint: 'Slant left, slide right. Lift. Pull down',
  },
  '5': {
    strokes: [[
      { x: 0.62, y: 0.10 }, { x: 0.35, y: 0.10 }, { x: 0.35, y: 0.32 },
      ...arc(0.50, 0.50, 0.18, 0.13, 220, 360, 10),
    ]],
    hint: 'Slide left, pull down, curve forward',
  },
  '6': {
    strokes: [[
      ...arc(0.55, 0.22, 0.18, 0.13, 60, 300, 10),
      { x: 0.50, y: 0.37 },
      ...arc(0.50, 0.50, 0.18, 0.13, 0, 360, 16),
    ]],
    hint: 'Curve over, circle all the way around',
  },
  '7': {
    strokes: [[{ x: 0.32, y: 0.10 }, { x: 0.68, y: 0.10 }, { x: 0.45, y: 0.633 }]],
    hint: 'Slide right, slant down',
  },
  '8': {
    strokes: [[
      ...arc(0.50, 0.22, 0.14, 0.10, 30, 330, 10),
      ...arc(0.50, 0.48, 0.18, 0.15, 0, 360, 16),
    ]],
    hint: 'Curve over, circle all the way around',
  },
  '9': {
    strokes: [[
      ...arc(0.50, 0.22, 0.18, 0.13, 0, 360, 16),
      { x: 0.50, y: 0.37 },
      ...arc(0.45, 0.50, 0.18, 0.13, 180, 420, 10),
    ]],
    hint: 'Circle all the way around, pull down, curve back',
  },
};

// Compose a two-digit number from its digit strokes. Each digit is scaled to
// ~48% width and shifted so both sit side-by-side in the same 0-1 canvas.
function composeNumber(tensKey, onesKey) {
  const tens = DIGITS[tensKey].strokes;
  const ones = DIGITS[onesKey].strokes;
  const transform = (strokes, xShift) =>
    strokes.map(stroke =>
      stroke.map(p => ({
        x: +(p.x * 0.48 + xShift).toFixed(4),
        y: p.y,
        ...(p.corner ? { corner: true } : {}),
      }))
    );
  return [...transform(tens, 0.02), ...transform(ones, 0.50)];
}

const TWO_DIGIT_HINTS = {
  10: 'One, then zero', 11: 'One, then one', 12: 'One, then two',
  13: 'One, then three', 14: 'One, then four', 15: 'One, then five',
  16: 'One, then six', 17: 'One, then seven', 18: 'One, then eight',
  19: 'One, then nine', 20: 'Two, then zero',
};

export const NUMBER_WAYPOINTS = { ...DIGITS };
for (let n = 10; n <= 20; n++) {
  const key = String(n);
  const tens = key[0];
  const ones = key[1];
  NUMBER_WAYPOINTS[key] = {
    strokes: composeNumber(tens, ones),
    hint: TWO_DIGIT_HINTS[n] || `${tens}, then ${ones}`,
  };
}

export const TRACING_NUMBERS = Object.keys(NUMBER_WAYPOINTS); // ['0'..'20']