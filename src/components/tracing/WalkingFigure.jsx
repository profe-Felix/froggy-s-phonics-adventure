import React from 'react';

/**
 * WalkingFigure — an SVG silhouette of a person walking, used as the
 * left-edge grounding visual on handwriting guide lines.
 *
 * Replaces the 🚶‍➡️ emoji (a ZWJ sequence that splits into a walking
 * person + a right-pointing arrow on Fire Tablets and other devices
 * without ZWJ support). Rendered as SVG so it looks identical across
 * iPad, Fire Tablet, PC, and print.
 *
 * The figure is drawn in a 50 × 100 viewBox with feet at y=100 (the
 * baseline). The parent positions and scales it via x, y, width, height.
 */

// A simple, friendly walking-person silhouette: head, torso, and
// limbs in a mid-stride pose. Filled (not stroked) so it stays visible
// at the small sizes used on handwriting guides.
const FIGURE_PATH = `
  M25 8
  a8 8 0 1 1 0 16
  a8 8 0 1 1 0 -16
  M25 24
  C20 24 18 28 18 34
  L18 52
  C18 56 16 60 14 66
  L10 82
  C9 86 11 90 14 90
  C17 90 19 87 20 83
  L23 70
  L25 66
  L27 70
  L30 83
  C31 87 33 90 36 90
  C39 90 41 86 40 82
  L36 66
  C34 60 32 56 32 52
  L32 34
  C32 28 30 24 25 24
  Z
`;

// Arms — one forward, one back (mid-stride)
const ARM_LEFT = `M20 36 Q10 42 6 50`;
const ARM_RIGHT = `M30 36 Q40 40 44 46`;

// Legs — one forward, one back (mid-stride)
const LEG_LEFT = `M22 60 L14 88`;
const LEG_RIGHT = `M28 60 L36 88`;

export default function WalkingFigure({ x, y, width, height, color = '#334155', opacity = 0.7 }) {
  return (
    <g pointerEvents="none">
      <svg
        x={x}
        y={y}
        width={width}
        height={height}
        viewBox="0 0 50 100"
        preserveAspectRatio="xMidYMax meet"
        style={{ overflow: 'visible' }}
      >
        {/* Body silhouette */}
        <path
          d={FIGURE_PATH}
          fill={color}
          opacity={opacity}
        />
        {/* Arms */}
        <path
          d={ARM_LEFT}
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeLinecap="round"
          opacity={opacity}
        />
        <path
          d={ARM_RIGHT}
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeLinecap="round"
          opacity={opacity}
        />
        {/* Legs */}
        <path
          d={LEG_LEFT}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          opacity={opacity}
        />
        <path
          d={LEG_RIGHT}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          opacity={opacity}
        />
      </svg>
    </g>
  );
}