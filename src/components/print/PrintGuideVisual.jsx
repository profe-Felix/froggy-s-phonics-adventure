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
  const svgWidth = 1.4 * 96; // 1.4in — covers the guide visual
  const svgHeight = 3 * gPx;

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