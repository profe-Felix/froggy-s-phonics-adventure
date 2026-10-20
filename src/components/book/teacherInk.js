import { inkPath } from '../../lib/external-notebook/ink-model.js';
// Pure helpers for the teacher-only page annotator. Strokes are stored in
// page-normalized coordinates (0..1 of the rendered page box) so they stay
// aligned when the reader resizes or toggles 2-up. Nothing here touches the
// network or student data.

export function inkBookKey(book) {
  return String(book?.catalog_book_id || book?.id || book?.title || 'book');
}

export function inkPageKey(book, pageNumber) {
  return `${inkBookKey(book)}::p${Number(pageNumber) || 0}`;
}

export function normalizePoint(clientX, clientY, rect) {
  if (!rect || !rect.width || !rect.height) return null;
  const clamp = (v) => Math.min(1, Math.max(0, v));
  return [clamp((clientX - rect.left) / rect.width), clamp((clientY - rect.top) / rect.height)];
}

export function addStroke(state, key, stroke) {
  if (!stroke || !stroke.points || stroke.points.length === 0) return state;
  return { ...state, [key]: [...(state[key] || []), stroke] };
}

export function undoStroke(state, key) {
  const list = state[key] || [];
  if (!list.length) return state;
  return { ...state, [key]: list.slice(0, -1) };
}

export function clearPage(state, key) {
  if (!(state[key] || []).length) return state;
  const next = { ...state };
  delete next[key];
  return next;
}

function distToSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  let t = len ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx, y = a[1] + t * dy;
  return Math.hypot(p[0] - x, p[1] - y);
}

// Removes any stroke on the page passing within radius of point.
export function eraseAt(state, key, point, radius = 0.025) {
  const list = state[key] || [];
  const kept = list.filter((s) => {
    const pts = s.points;
    if (pts.length === 1) return Math.hypot(pts[0][0] - point[0], pts[0][1] - point[1]) > radius;
    for (let i = 1; i < pts.length; i++) if (distToSegment(point, pts[i - 1], pts[i]) <= radius) return false;
    return true;
  });
  return kept.length === list.length ? state : { ...state, [key]: kept };
}

// Smooth midpoint/quadratic path shared with the notebook canvas.
export function strokePath(points, w, h) {
  if (!points.length) return '';
  return inkPath(points.map(([x, y]) => ({ x: (x * w) / 1000, y })), h, true);
}

export const MIN_POINT_GAP = 0.0006;
const round = (v) => Math.round(v * 1e5) / 1e5;

// Appends sampled points, skipping near-duplicates; final=true always keeps the last sample.
export function appendPoints(points, incoming, final = false, gap = MIN_POINT_GAP) {
  const out = points.slice();
  incoming.forEach((p, i) => {
    if (!p) return;
    const last = out[out.length - 1];
    const isLast = final && i === incoming.length - 1;
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > gap) out.push(p);
    else if (isLast && out.length > 1 && (p[0] !== last[0] || p[1] !== last[1])) out[out.length - 1] = p;
  });
  return out;
}

export function finalizePoints(points) {
  return points.map(([x, y]) => [round(x), round(y)]);
}
