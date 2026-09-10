import { useMemo } from 'react';
import { computeWordLayout } from '@/lib/tracingCore';
import { splinePathD } from '@/components/tracing/strokeMath';

// Static, non-interactive reference model of a name — renders the letter
// shapes (from the waypoint data) sitting on the same guide lines used in
// NameTracingCanvas. Shown above the dot-only tracing area so students have
// a model to look at: where lowercase letters hit the dashed mid line and
// where they sit on the green baseline.

const X_SCALE = 300;
const CANVAS_H = 375;
const LETTER_GAP = 20;
const PADDING = 30;
const SIZE_SCALE = 0.55;
const RENDER_H = CANVAS_H * SIZE_SCALE;

export default function NameReferenceStrip({ name, waypoints, renderWidth = 320 }) {
  const { layout, totalW } = useMemo(
    () => computeWordLayout(name, waypoints, X_SCALE, LETTER_GAP, PADDING, 4, 80, false),
    [name, waypoints]
  );

  const renderW = totalW > 0 ? RENDER_H * (totalW / CANVAS_H) : renderWidth;

  const scaleForLetter = (pt, li) => {
    const lay = layout[li];
    const baseX = lay ? lay.offset : 0;
    const minX = lay ? lay.minX : 0;
    return { x: baseX + (pt.x - minX) * X_SCALE, y: pt.y * CANVAS_H };
  };

  if (!layout.length) return null;

  return (
    <svg
      viewBox={`0 0 ${totalW} ${CANVAS_H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', width: renderW, height: RENDER_H }}
    >
      {/* Guide lines — same as NameTracingCanvas */}
      <line x1="0" y1={0.10 * CANVAS_H} x2={totalW} y2={0.10 * CANVAS_H} stroke="#93c5fd" strokeWidth="2.5" opacity="0.8" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1={0.367 * CANVAS_H} x2={totalW} y2={0.367 * CANVAS_H} stroke="#000" strokeWidth="2" strokeDasharray="8 6" opacity="0.8" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1={0.633 * CANVAS_H} x2={totalW} y2={0.633 * CANVAS_H} stroke="#16a34a" strokeWidth="2.5" opacity="0.8" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1={0.90 * CANVAS_H} x2={totalW} y2={0.90 * CANVAS_H} stroke="#fca5a5" strokeWidth="2.5" strokeDasharray="6 6" opacity="0.85" vectorEffect="non-scaling-stroke" />

      {/* Letter strokes as a solid model */}
      {layout.map((lay, li) => {
        const strokes = waypoints[lay.ch]?.strokes || [];
        return strokes.map((stroke, si) => {
          const clean = Array.isArray(stroke) ? stroke.filter((p) => p && p.x != null && p.y != null) : [];
          const scaled = clean.map((p) => scaleForLetter(p, li));
          if (!scaled.length) return null;
          if (scaled.length === 2 && Math.hypot(scaled[1].x - scaled[0].x, scaled[1].y - scaled[0].y) < 8) {
            return <circle key={`r-${li}-${si}`} cx={scaled[0].x} cy={scaled[0].y} r="7" fill="#475569" opacity="0.85" pointerEvents="none" />;
          }
          return (
            <path
              key={`r-${li}-${si}`}
              d={splinePathD(scaled)}
              fill="none"
              stroke="#475569"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.85"
              pointerEvents="none"
            />
          );
        });
      })}
    </svg>
  );
}