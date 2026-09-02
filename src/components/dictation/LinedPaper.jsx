/**
 * LinedPaper — SVG background rendering kindergarten writing lines.
 * Each line has: top (ascender), midline (dashed), baseline (solid), and
 * the next line's top acts as the descender line. Proportions match the
 * Zaner-Bloser handwriting model used by the tracing canvas:
 *   midline  = 0.367 of line height
 *   baseline = 0.633 of line height
 *   x-height = 0.266 of line height
 */
export default function LinedPaper({ width, height, lineCount = 6 }) {
  const lh = height / lineCount;
  const midlineY = lh * 0.367;
  const baselineY = lh * 0.633;

  const rows = [];
  for (let i = 0; i < lineCount; i++) {
    const yTop = i * lh;
    rows.push(
      <g key={i}>
        {/* Top line (ascender) — light */}
        <line x1={0} y1={yTop} x2={width} y2={yTop} stroke="#cbd5e1" strokeWidth={1} />
        {/* Midline (dashed) */}
        <line
          x1={0}
          y1={yTop + midlineY}
          x2={width}
          y2={yTop + midlineY}
          stroke="#60a5fa"
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />
        {/* Baseline (solid, darker) */}
        <line
          x1={0}
          y1={yTop + baselineY}
          x2={width}
          y2={yTop + baselineY}
          stroke="#334155"
          strokeWidth={2}
        />
      </g>
    );
  }
  // Bottom line (final descender)
  rows.push(
    <line key="bottom" x1={0} y1={height} x2={width} y2={height} stroke="#cbd5e1" strokeWidth={1} />
  );

  return (
    <svg
      width={width}
      height={height}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 1 }}
    >
      <rect x={0} y={0} width={width} height={height} fill="white" />
      {rows}
    </svg>
  );
}