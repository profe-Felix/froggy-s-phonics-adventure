/**
 * GuideKeyVisual — a small left-edge grounding visual for handwriting guides.
 *
 * Shows colored zones (sky/grass/dirt) limited to a narrow chunk (saves ink
 * on printouts), a picket fence (first ~2 panels of the included fence SVG)
 * sitting from the grass line up to the fence/dotted line, and two 🚶‍➡️
 * walking figures scaled so their feet are on the grass and heads touch
 * the ceiling (sky for capital, fence for lowercase).
 *
 * Renders an SVG <g> group — place it inside an <svg> element.
 */

const FENCE_URL = 'https://media.base44.com/images/public/6972eada24fac6b62ccbab8e/bf7297494_156818.svg';

// Measured emoji metrics for 🚶‍➡️: bbox height / font-size and
// feet-below-baseline / bbox-height. Used to vertically scale and position
// the emoji so feet land on the grass line and head touches the ceiling.
const EMOJI_HEIGHT_FACTOR = 1.204;
const FEET_FACTOR = 0.216;

export default function GuideKeyVisual({ skyY, fenceY, grassY, dirtY, width, opacity = 0.5 }) {
  const h = dirtY - skyY;
  const skyH = fenceY - skyY;
  const grassH = grassY - fenceY;
  const dirtH = dirtY - grassY;

  // Emoji base font-sizes — narrow, will be stretched vertically to fill the zone
  const capBase = width * 0.28;
  const lowBase = width * 0.18;

  // Zone heights
  const capZoneH = grassY - skyY;
  const lowZoneH = grassY - fenceY;

  // Scale Y so the emoji's bbox height matches the zone height
  const capScaleY = capZoneH / (EMOJI_HEIGHT_FACTOR * capBase);
  const lowScaleY = lowZoneH / (EMOJI_HEIGHT_FACTOR * lowBase);

  // Shift Y up so the emoji's feet (which sit below the baseline) land on grassY
  const capTy = grassY - FEET_FACTOR * capZoneH;
  const lowTy = grassY - FEET_FACTOR * lowZoneH;

  // Fence: crop the SVG (1280×1000, ~3.5 pickets @ ~400px each) to ~2 pickets
  // (800 viewBox units), then scale to fill the grass zone height.
  const fenceW = Math.min(0.8 * grassH, width * 0.80);
  const fenceVbW = Math.min(800, (fenceW * 1000) / grassH);

  // Layout: fence at left, emojis to the right (different y-zones, no overlap)
  const capX = fenceW + (width - fenceW) * 0.28;
  const lowX = fenceW + (width - fenceW) * 0.62;

  return (
    <g pointerEvents="none">
      {/* Background zones — only this left chunk (saves ink) */}
      <rect x={0} y={skyY} width={width} height={skyH} fill="#dceaf9" opacity={opacity} />
      <rect x={0} y={fenceY} width={width} height={grassH} fill="#e8f5e9" opacity={opacity} />
      <rect x={0} y={grassY} width={width} height={dirtH} fill="#f5ebe0" opacity={opacity} />

      {/* Fence — first ~2 panels, from grass line up to fence (dotted) line */}
      <svg x={0} y={fenceY} width={fenceW} height={grassH} viewBox={`0 0 ${fenceVbW} 1000`} preserveAspectRatio="xMidYMid slice">
        <image href={FENCE_URL} x={0} y={0} width={1280} height={1000} />
      </svg>

      {/* Capital walking figure — feet at grass, head at sky */}
      <text x={0} y={0} fontSize={capBase} textAnchor="middle" transform={`translate(${capX},${capTy}) scale(1,${capScaleY})`}>🚶‍➡️</text>

      {/* Lowercase walking figure — feet at grass, head at fence */}
      <text x={0} y={0} fontSize={lowBase} textAnchor="middle" transform={`translate(${lowX},${lowTy}) scale(1,${lowScaleY})`}>🚶‍➡️</text>
    </g>
  );
}