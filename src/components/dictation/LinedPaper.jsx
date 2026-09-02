/**
 * LinedPaper — SVG background rendering kindergarten writing lines.
 * Matches the LetterTracingCanvas line style exactly:
 *   - Light blue (#93c5fd) ascender, midline, and baseline
 *   - Pink (#fca5a5) descender line (dashed)
 *   - Proportions: ascender 0.10, midline 0.367, baseline 0.633, descender 0.90
 *   - Same stroke widths, dash patterns, and opacities as the tracing canvas
 */
export default function LinedPaper({ width, height, lineCount = 6 }) {
  const lh = height / lineCount;

  const rows = [];
  for (let i = 0; i < lineCount; i++) {
    const yTop = i * lh;
    rows.push(
      <g key={i}>
        {/* Ascender line — solid light blue */}
        <line x1={0} y1={yTop + lh * 0.10} x2={width} y2={yTop + lh * 0.10}
          stroke="#93c5fd" strokeWidth={1.5} opacity={0.7} />
        {/* Midline — dashed light blue (thin) */}
        <line x1={0} y1={yTop + lh * 0.367} x2={width} y2={yTop + lh * 0.367}
          stroke="#93c5fd" strokeWidth={0.5} strokeDasharray="8 6" opacity={0.7} />
        {/* Baseline — solid light blue */}
        <line x1={0} y1={yTop + lh * 0.633} x2={width} y2={yTop + lh * 0.633}
          stroke="#93c5fd" strokeWidth={1.5} opacity={0.7} />
        {/* Descender line — solid pink */}
        <line x1={0} y1={yTop + lh * 0.90} x2={width} y2={yTop + lh * 0.90}
          stroke="#fca5a5" strokeWidth={1.5} opacity={0.85} />
      </g>
    );
  }

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