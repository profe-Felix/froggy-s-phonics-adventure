// Print-only rendering of a word from the tracing waypoints (a copy of the
// on-screen tracing paths, never edits them). Each stroke is drawn dotted
// with a start dot, a stroke-order number and a direction arrow — matching
// the look of the ZBKidLettersArrowDot font but using our own letter paths.
import { useMemo } from 'react';
import { computeWordLayout, buildDensePath } from '@/lib/tracingCore';
import { splinePathD } from '@/components/tracing/strokeMath';

const X_SCALE = 600;
const CANVAS_H = 750;
const LETTER_GAP = 45;
const TOP = 0.10 * CANVAS_H; // sky line
const ZONE = (0.367 - 0.10) * CANVAS_H; // one line gap in canvas units (200)

function pointAt(dense, frac) {
  const i = Math.min(dense.length - 2, Math.max(0, Math.floor((dense.length - 1) * frac)));
  const a = dense[i];
  const b = dense[Math.min(dense.length - 1, i + 3)] || a;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: a.x, y: a.y, dx: (b.x - a.x) / len, dy: (b.y - a.y) / len };
}

export default function WaypointWord({ word, waypoints, lineGap, color = '#2e7d32' }) {
  const k = ZONE / lineGap; // canvas units per inch
  const { strokes, totalW } = useMemo(() => {
    const { layout, totalW } = computeWordLayout(word, waypoints, X_SCALE, LETTER_GAP, 0, 1, 0);
    const out = [];
    layout.forEach((lay) => {
      (waypoints[lay.ch]?.strokes || []).forEach((stroke, si) => {
        const pts = stroke.map((p) => ({
          x: lay.offset + (p.x - lay.minX) * X_SCALE,
          y: p.y * CANVAS_H,
          ...(p.corner ? { corner: true } : {}),
        }));
        out.push({ pts, dense: buildDensePath(pts, (p) => p, 3), n: si + 1 });
      });
    });
    return { strokes: out, totalW };
  }, [word, waypoints]);

  const dotW = 0.035 * k;
  const arrow = 0.07 * k;
  const numSize = 0.11 * k;
  const pad = 0.15 * k;

  return (
    <svg
      viewBox={`${-pad} ${TOP} ${totalW + 2 * pad} ${3 * ZONE}`}
      style={{ height: `${3 * lineGap}in`, width: `${(totalW + 2 * pad) / k}in`, overflow: 'visible' }}
    >
      {strokes.map(({ pts, dense, n }, i) => {
        const len = dense.reduce((s, p, j) => (j ? s + Math.hypot(p.x - dense[j - 1].x, p.y - dense[j - 1].y) : 0), 0);
        const start = pts[0];
        if (len < 14) {
          return (
            <g key={i}>
              <circle cx={start.x} cy={start.y} r={dotW * 1.3} fill={color} />
              <text x={start.x - numSize * 0.9} y={start.y - numSize * 0.4} fontSize={numSize} fill={color} fontFamily="sans-serif">{n}</text>
            </g>
          );
        }
        const s0 = pointAt(dense, 0);
        const a = pointAt(dense, 0.45);
        // Number sits just "behind" the start point, opposite its travel direction.
        const nx = start.x - s0.dx * numSize * 0.9 - s0.dy * numSize * 0.5;
        const ny = start.y - s0.dy * numSize * 0.9 + s0.dx * numSize * 0.5;
        const tip = { x: a.x + a.dx * arrow * 0.5, y: a.y + a.dy * arrow * 0.5 };
        const bx = a.x - a.dx * arrow * 0.5;
        const by = a.y - a.dy * arrow * 0.5;
        const head = `${tip.x},${tip.y} ${bx - a.dy * arrow * 0.55},${by + a.dx * arrow * 0.55} ${bx + a.dy * arrow * 0.55},${by - a.dx * arrow * 0.55}`;
        return (
          <g key={i}>
            <path
              d={splinePathD(pts)}
              fill="none"
              stroke={color}
              strokeWidth={dotW}
              strokeLinecap="round"
              strokeDasharray={`0 ${dotW * 2}`}
            />
            <circle cx={start.x} cy={start.y} r={dotW * 1.4} fill={color} />
            <polygon points={head} fill={color} />
            <text x={nx} y={ny} fontSize={numSize} fill={color} fontFamily="sans-serif" textAnchor="middle" dominantBaseline="middle">{n}</text>
          </g>
        );
      })}
    </svg>
  );
}