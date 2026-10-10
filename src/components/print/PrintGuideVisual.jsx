import GuideKeyVisual from '@/components/tracing/GuideKeyVisual';

/**
 * PrintGuideVisual — renders the walking-figure + fence guide visual
 * (same as LetterTracing) in the left portion of a print handwriting row.
 * The colored zones are limited to the visual width (saves ink); the rest
 * of the row has no colored background behind the letters.
 *
 * @param {number} lineGap - line gap in inches (height of each zone)
 * @param {number} opacity - opacity of the colored zones (default 0.5)
 */
export default function PrintGuideVisual({ lineGap, opacity = 0.5 }) {
  const gPx = lineGap * 96; // inches → pixels at 96dpi
  const svgHeight = 3 * gPx;
  // Approximate where the fence ends (emojis + fence) using the default
  // layout ratios: fenceEnd ≈ 2.334 × gPx. Shrink the SVG to just past the
  // fence when rows are small (many rows) so there's no wide blank colored
  // area after the fence. Cap at 1.4in so fewer-row sheets keep the full guide.
  const fenceEndApprox = 2.334 * gPx + 0.15 * 96;
  const svgWidth = Math.min(1.4 * 96, Math.max(fenceEndApprox, 1.0 * 96));

  return (
    <svg
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
      width={svgWidth}
      height={svgHeight}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
    >
      <GuideKeyVisual
        skyY={0}
        fenceY={gPx}
        grassY={2 * gPx}
        dirtY={3 * gPx}
        width={svgWidth}
        opacity={opacity}
      />
    </svg>
  );
}