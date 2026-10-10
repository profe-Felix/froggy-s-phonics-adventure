// Print-only rendering of a word from the tracing waypoints (a copy of the
// on-screen tracing paths, never edits them). Strokes are split at their
// authored corner points so each motion (down, around, across…) gets its own
// stroke-order number and direction arrow — like the ZBKidLettersArrowDot
// font. Segments that just retrace an earlier one (e.g. back up a stem) are
// drawn but not numbered.
import { useMemo } from 'react';
import { computeWordLayout, buildDensePath } from '@/lib/tracingCore';
import { splinePathD } from '@/components/tracing/strokeMath';

const X_SCALE = 600;
const CANVAS_H = 750;
const LETTER_GAP = 45;
const TOP = 0.10 * CANVAS_H; // sky line
const ZONE = (0.367 - 0.10) * CANVAS_H; // one line gap in canvas units (200)

function splitAtCorners(pts) {
  const segs = [];
  let cur = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    cur.push(pts[i]);
    if (pts[i].corner && i < pts.length - 1) {
      segs.push(cur);
      cur = [{ x: pts[i].x, y: pts[i].y }];
    }
  }
  if (cur.length > 1) segs.push(cur);
  return segs;
}

function pathLen(d) {
  let s = 0;
  for (let j = 1; j < d.length; j++) s += Math.hypot(d[j].x - d[j - 1].x, d[j].y - d[j - 1].y);
  return s;
}

function pointAt(dense, frac) {
  const i = Math.min(dense.length - 2, Math.max(0, Math.floor((dense.length - 1) * frac)));
  const a = dense[i];
  const b = dense[Math.min(dense.length - 1, i + 4)];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: a.x, y: a.y, dx: (b.x - a.x) / len, dy: (b.y - a.y) / len };
}

function isRetrace(dense, prior, tol) {
  if (!prior.length) return false;
  return dense.every((p) => prior.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < tol));
}

export default function WaypointWord({ word, waypoints, lineGap, color = '#2e7d32', mode = 'full' }) {
  const k = ZONE / lineGap; // canvas units per inch
  const dotW = 0.035 * k;

  const { parts, totalW } = useMemo(() => {
    // Accented vowels use the base letter's path plus an accent mark.
    const chars = [...word.normalize('NFC')].map((ch) => {
      if (waypoints[ch]) return { base: ch, accent: false };
      const base = ch.normalize('NFD')[0];
      return { base, accent: ch !== base && !!waypoints[base] };
    });
    const { layout, totalW } = computeWordLayout(chars.map((c) => c.base).join(''), waypoints, X_SCALE, LETTER_GAP, 0, 1, 0);
    const out = [];
    const known = chars.filter((c) => waypoints[c.base]);
    layout.forEach((lay, li) => {
      const toPx = (p) => ({ x: lay.offset + (p.x - lay.minX) * X_SCALE, y: p.y * CANVAS_H, ...(p.corner ? { corner: true } : {}) });
      const strokes = (waypoints[lay.ch]?.strokes || []).map((s) => s.map(toPx));
      if (known[li]?.accent) {
        const cx = lay.offset + ((lay.maxX - lay.minX) * X_SCALE) / 2;
        strokes.push([{ x: cx + 25, y: 0.22 * CANVAS_H }, { x: cx - 15, y: 0.32 * CANVAS_H }]);
      }
      let n = 0;
      const prior = [];
      strokes.forEach((stroke) => {
        splitAtCorners(stroke).forEach((seg, si) => {
          const dense = buildDensePath(seg, (p) => p, 3);
          const len = pathLen(dense);
          const dot = len < 14 && si === 0;
          const retrace = !dot && isRetrace(dense, prior, dotW * 3);
          const numbered = !retrace && (si === 0 || len > 40);
          if (numbered) n += 1;
          out.push({ seg, dense, dot, numbered, n, first: si === 0 });
          prior.push(...dense);
        });
      });
    });
    return { parts: out, totalW };
  }, [word, waypoints, dotW]);

  const arrow = 0.1 * k;
  const numSize = 0.12 * k;
  const pad = 0.2 * k;

  return (
    <svg
      viewBox={`${-pad} ${TOP} ${totalW + 2 * pad} ${3 * ZONE}`}
      style={{ height: `${3 * lineGap}in`, width: `${(totalW + 2 * pad) / k}in`, overflow: 'visible' }}
    >
      {parts.map(({ seg, dense, dot, numbered, n, first }, i) => {
        const start = seg[0];
        if (mode === 'dots') {
          if (!first) return null;
          return <circle key={i} cx={start.x} cy={start.y} r={dotW * 1.0} fill={color} />;
        }
        if (mode === 'outline') {
          if (dot) return null;
          return <path key={i} d={splinePathD(seg)} fill="none" stroke={color} strokeWidth={dotW} strokeLinecap="round" strokeDasharray={`0 ${dotW * 2}`} />;
        }
        if (dot) {
          return (
            <g key={i}>
              <circle cx={start.x} cy={start.y} r={dotW * 1.5} fill={color} />
              <text x={start.x - numSize} y={start.y} fontSize={numSize} fill={color} fontFamily="sans-serif" textAnchor="middle" dominantBaseline="middle">{n}</text>
            </g>
          );
        }
        const s0 = pointAt(dense, 0);
        const a = pointAt(dense, 0.5);
        // Arrow sits beside the path (offset to its left side) so the dotted line stays clear.
        const off = dotW * 3.2;
        const ax = a.x + a.dy * off;
        const ay = a.y - a.dx * off;
        const tip = { x: ax + a.dx * arrow * 0.5, y: ay + a.dy * arrow * 0.5 };
        const bx = ax - a.dx * arrow * 0.5;
        const by = ay - a.dy * arrow * 0.5;
        const head = `${tip.x},${tip.y} ${bx - a.dy * arrow * 0.45},${by + a.dx * arrow * 0.45} ${bx + a.dy * arrow * 0.45},${by - a.dx * arrow * 0.45}`;
        const nx = start.x - s0.dx * numSize * 0.9 + s0.dy * numSize * 0.6;
        const ny = start.y - s0.dy * numSize * 0.9 - s0.dx * numSize * 0.6;
        return (
          <g key={i}>
            <path
              d={splinePathD(seg)}
              fill="none"
              stroke={color}
              strokeWidth={dotW}
              strokeLinecap="round"
              strokeDasharray={`0 ${dotW * 2}`}
            />
            {first && <circle cx={start.x} cy={start.y} r={dotW * 1.4} fill={color} />}
            {numbered && <polygon points={head} fill={color} />}
            {numbered && (
              <text x={nx} y={ny} fontSize={numSize} fill={color} fontFamily="sans-serif" textAnchor="middle" dominantBaseline="middle">{n}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}