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
        {/* Ascender line — solid blue */}
        <line x1={0} y1={yTop + lh * 0.10} x2={width} y2={yTop + lh * 0.10}
          stroke="#2563eb" strokeWidth={2.5} opacity={0.9} />
        {/* Midline — dashed black */}
        <line x1={0} y1={yTop + lh * 0.367} x2={width} y2={yTop + lh * 0.367}
          stroke="#000000" strokeWidth={1.8} strokeDasharray="12 8" opacity={0.9} />
        {/* Baseline — solid green */}
        <line x1={0} y1={yTop + lh * 0.633} x2={width} y2={yTop + lh * 0.633}
          stroke="#16a34a" strokeWidth={2.5} opacity={0.9} />
        {/* Descender line — solid pink */}
        <line x1={0} y1={yTop + lh * 0.90} x2={width} y2={yTop + lh * 0.90}
          stroke="#db2777" strokeWidth={2.5} opacity={0.95} />
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