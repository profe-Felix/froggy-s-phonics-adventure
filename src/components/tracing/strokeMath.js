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