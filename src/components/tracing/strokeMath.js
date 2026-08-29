// Math helpers for the letter-tracing authoring tool.
// Canvas coordinate space matches LetterTracingCanvas (300×375, 4:5).

export const CANVAS_W = 300;
export const CANVAS_H = 375;

// Multi-pass moving-average smoothing to remove hand jitter.
export function smoothPoints(pts, passes = 3) {
  if (!pts || pts.length < 3) return pts ? pts.slice() : [];
  let p = pts.map((o) => ({ x: o.x, y: o.y }));
  for (let pass = 0; pass < passes; pass++) {
    const out = [p[0]];
    for (let i = 1; i < p.length - 1; i++) {
      out.push({
        x: (p[i - 1].x + p[i].x + p[i + 1].x) / 3,
        y: (p[i - 1].y + p[i].y + p[i + 1].y) / 3,
      });
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

export function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len;
}

// Resample a polyline to n evenly-spaced points along its arc length.
export function resample(pts, n) {
  if (!pts || pts.length < 2) {
    return pts && pts.length === 1 ? [pts[0], { ...pts[0] }] : [];
  }
  const dists = [0];
  for (let i = 1; i < pts.length; i++) {
    dists.push(dists[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const total = dists[dists.length - 1];
  if (total === 0) return Array.from({ length: n }, () => ({ ...pts[0] }));
  const step = total / (n - 1);
  const out = [pts[0]];
  let j = 0;
  for (let k = 1; k < n - 1; k++) {
    const target = k * step;
    while (j < dists.length - 2 && dists[j + 1] < target) j++;
    const segLen = dists[j + 1] - dists[j];
    const t = segLen === 0 ? 0 : (target - dists[j]) / segLen;
    out.push({
      x: pts[j].x + t * (pts[j + 1].x - pts[j].x),
      y: pts[j].y + t * (pts[j + 1].y - pts[j].y),
    });
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Turn a raw px stroke into clean, evenly-spaced normalized (0-1) waypoints.
export function smoothAndNormalize(rawPx, maxPts = 60, density = 8) {
  const smoothed = smoothPoints(rawPx, 3);
  const len = pathLength(smoothed);
  let n = Math.round(len / density);
  n = Math.max(2, Math.min(maxPts, n));
  const rs = resample(smoothed, n);
  return rs.map((p) => ({
    x: +(p.x / CANVAS_W).toFixed(4),
    y: +(p.y / CANVAS_H).toFixed(4),
  }));
}

// Smooth interpolating spline THROUGH every control point (Catmull-Rom).
// Returns a dense polyline the curve tool previews and commits. A 2-point input
// yields a straight resampled line (no bend), which is what a no-control curve is.
export function catmullRom(points, samplesPerSegment = 16) {
  if (!points || points.length < 2) return points ? points.slice() : [];
  if (points.length === 2) {
    const out = [];
    for (let i = 0; i <= samplesPerSegment; i++) {
      const t = i / samplesPerSegment;
      out.push({ x: points[0].x + t * (points[1].x - points[0].x), y: points[0].y + t * (points[1].y - points[0].y) });
    }
    return out;
  }
  const pts = [points[0], ...points, points[points.length - 1]];
  const out = [];
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2];
    const last = i === pts.length - 3;
    const n = last ? samplesPerSegment + 1 : samplesPerSegment;
    for (let j = 0; j < n; j++) {
      const t = j / samplesPerSegment, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  return out;
}

// SVG path string through skeleton points using Catmull-Rom → cubic bezier
// conversion. Produces a smooth curve through the control points using native
// SVG C commands. Sharp corners (angle change > CORNER_THRESHOLD) are kept
// crisp by zeroing the tangent at that point — so a horizontal bar meeting a
// curve (like the 'e') stays straight then turns cleanly, instead of the
// spline rounding the transition into a soft elbow.
const CORNER_THRESHOLD = 35 * Math.PI / 180;

export function splinePathD(points) {
  if (!points || points.length < 2) return '';
  if (points.length === 2) {
    return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`;
  }
  // Detect corner points: where the turn angle between incoming and outgoing
  // segments exceeds the threshold, the spline would round it — flag it so
  // we zero the tangent there and keep the corner crisp.
  const isCorner = new Array(points.length).fill(false);
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i - 1], p1 = points[i], p2 = points[i + 1];
    const v1x = p1.x - p0.x, v1y = p1.y - p0.y;
    const v2x = p2.x - p1.x, v2y = p2.y - p1.y;
    const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    const dot = (v1x * v2x + v1y * v2y) / (l1 * l2);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    if (angle > CORNER_THRESHOLD) isCorner[i] = true;
  }
  const d = [`M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    // Zero tangent at a corner point → curve goes straight in/out, crisp turn
    const c1x = isCorner[i] ? p1.x : p1.x + (p2.x - p0.x) / 6;
    const c1y = isCorner[i] ? p1.y : p1.y + (p2.y - p0.y) / 6;
    const c2x = isCorner[i + 1] ? p2.x : p2.x - (p3.x - p1.x) / 6;
    const c2y = isCorner[i + 1] ? p2.y : p2.y - (p3.y - p1.y) / 6;
    d.push(`C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`);
  }
  return d.join(' ');
}

// Ramer-Douglas-Peucker simplification: keep only the points that matter
// (max perpendicular deviation from the chord). Used to recover skeleton
// control points from old dense saved waypoints so edit mode shows a
// manageable handle set instead of 64+ points.
export function simplify(pts, tolerance = 3) {
  if (!pts || pts.length <= 2) return pts ? pts.slice() : [];
  const perpDist = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
  };
  const stack = [[0, pts.length - 1]];
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(pts[i], pts[s], pts[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx >= 0 && maxD >= tolerance) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// Return {x,y,angle} at a fraction (0-1) along a polyline — for arrowheads.
export function pointAtLength(pts, frac) {
  if (!pts || pts.length < 2) return { x: 0, y: 0, angle: 0 };
  const dists = [0];
  for (let i = 1; i < pts.length; i++) {
    dists.push(dists[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const total = dists[dists.length - 1];
  const target = total * frac;
  let j = 0;
  while (j < dists.length - 2 && dists[j + 1] < target) j++;
  const segLen = dists[j + 1] - dists[j];
  const t = segLen === 0 ? 0 : (target - dists[j]) / segLen;
  return {
    x: pts[j].x + t * (pts[j + 1].x - pts[j].x),
    y: pts[j].y + t * (pts[j + 1].y - pts[j].y),
    angle: Math.atan2(pts[j + 1].y - pts[j].y, pts[j + 1].x - pts[j].x),
  };
}