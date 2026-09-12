import { useMemo } from 'react';
import { computeWordLayout } from '@/lib/tracingCore';
import { splinePathD } from '@/components/tracing/strokeMath';
import GuideKeyVisual from '@/components/tracing/GuideKeyVisual';

// Static, non-interactive reference model of a name — renders the letter
// shapes (from the waypoint data) sitting on the same guide lines used in
// NameTracingCanvas. Shown for inactive rows on the "sheet" so the whole
// name is always visible, like NamePractice's dotted font rows.

const X_SCALE = 300;
const CANVAS_H = 375;
const LETTER_GAP = 20;
// PADDING is now a prop (default 160)
const SIZE_SCALE = 0.55;
const RENDER_H = CANVAS_H * SIZE_SCALE;
const SHEET_W = 800; // minimum sheet width — matches NameTracingCanvas

export default function NameReferenceStrip({ name, waypoints, renderWidth = 320, guideProps = null, padding = 160 }) {
  const { layout, totalW } = useMemo(
    () => computeWordLayout(name, waypoints, X_SCALE, LETTER_GAP, padding, 1, 80, false),
    [name, waypoints, padding]
  );

  const sheetW = Math.max(totalW, SHEET_W);
  const renderW = RENDER_H * (sheetW / CANVAS_H);

  const scaleForLetter = (pt, li) => {
    const lay = layout[li];
    const baseX = lay ? lay.offset : 0;
    const minX = lay ? lay.minX : 0;
    return { x: baseX + (pt.x - minX) * X_SCALE, y: pt.y * CANVAS_H, ...(pt.corner ? { corner: true } : {}) };
  };

  if (!layout.length) return null;

  return (
    <svg
      viewBox={`0 0 ${sheetW} ${CANVAS_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="block border-b border-slate-200 bg-white"
      style={{ display: 'block', width: renderW, height: RENDER_H }}
    >
      {/* Grounding visual — same proportions as NamePractice */}
      <GuideKeyVisual skyY={0.10 * CANVAS_H} fenceY={0.367 * CANVAS_H} grassY={0.633 * CANVAS_H} dirtY={0.90 * CANVAS_H}
        emojiHeightFactor={guideProps?.emojiHeightFactor}
        emojiFeetFactor={guideProps?.emojiFeetFactor}
        emojiSpacingRatio={guideProps?.emojiSpacingRatio}
        emojiXRatio={guideProps?.emojiXRatio}
        fenceGapRatio={guideProps?.fenceGapRatio}
        fenceWidthRatio={guideProps?.fenceWidthRatio}
        fenceOffsetRatio={guideProps?.fenceOffsetRatio}
      />
      {/* Guide lines — same as NameTracingCanvas */}
      <line x1="0" y1={0.10 * CANVAS_H} x2={sheetW} y2={0.10 * CANVAS_H} stroke="#93c5fd" strokeWidth="2.5" opacity="0.8" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1={0.367 * CANVAS_H} x2={sheetW} y2={0.367 * CANVAS_H} stroke="#000" strokeWidth="2" strokeDasharray="8 6" opacity="0.8" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1={0.633 * CANVAS_H} x2={sheetW} y2={0.633 * CANVAS_H} stroke="#16a34a" strokeWidth="2.5" opacity="0.8" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1={0.90 * CANVAS_H} x2={sheetW} y2={0.90 * CANVAS_H} stroke="#fca5a5" strokeWidth="2.5" strokeDasharray="6 6" opacity="0.85" vectorEffect="non-scaling-stroke" />

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