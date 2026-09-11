/**
 * GuideKeyVisual — a small left-edge grounding visual for handwriting guides.
 *
 * Shows colored zones (sky/grass/dirt) limited to a narrow bgWidth (saves ink
 * on printouts), two 🚶‍➡️ walking figures on the LEFT whose feet are on the
 * grass and heads touch the ceiling (sky for capital, fence for lowercase),
 * and a picket fence on the RIGHT (cropped from the included fence SVG).
 *
 * TEMP: emojiHeightFactor, emojiFeetFactor, emojiXAdjust, fenceCrop are manual
 * tuning sliders passed from NamePractice. Once values are finalized, hardcode them.
 *
 * Renders an SVG <g> group — place it inside an <svg> element.
 */

const FENCE_URL = 'https://media.base44.com/images/public/6972eada24fac6b62ccbab8e/bf7297494_156818.svg';

export default function GuideKeyVisual({ skyY, fenceY, grassY, dirtY, width, opacity = 0.5,
  emojiHeightFactor = 0.84, emojiFeetFactor = 0.26, emojiXAdjust = 0, fenceCrop = 800,
  bgWidth }) {
  const h = dirtY - skyY;
  const skyH = fenceY - skyY;
  const grassH = grassY - fenceY;
  const dirtH = dirtY - grassY;
  const bg = bgWidth ?? width;

  // Zone heights
  const capZoneH = grassY - skyY;
  const lowZoneH = grassY - fenceY;

  // Direct font-size: emoji visual height ≈ font-size, so font-size = zone * factor.
  const capFSize = capZoneH * emojiHeightFactor;
  const lowFSize = lowZoneH * emojiHeightFactor;

  // Y position: baseline at grassY, shifted up by emojiFeetFactor * fontSize
  const capY = grassY - emojiFeetFactor * capFSize;
  const lowY = grassY - emojiFeetFactor * lowFSize;

  // Layout: emojis on the LEFT (spread apart), fence on the RIGHT
  const capX = width * 0.10 + emojiXAdjust;
  const lowX = width * 0.58 + emojiXAdjust;

  // Fence: crop the SVG (1280×1000) to fenceCrop viewBox units, on the right side.
  const fenceW = width * 0.24;
  const fenceX = width * 0.74;

  return (
    <g pointerEvents="none">
      {/* Background zones — limited to bgWidth (saves ink) */}
      <rect x={0} y={skyY} width={bg} height={skyH} fill="#dceaf9" opacity={opacity} />
      <rect x={0} y={fenceY} width={bg} height={grassH} fill="#e8f5e9" opacity={opacity} />
      <rect x={0} y={grassY} width={bg} height={dirtH} fill="#f5ebe0" opacity={opacity} />

      {/* Capital walking figure — feet at grass, head at sky (LEFT) */}
      <text x={capX} y={capY} fontSize={capFSize} textAnchor="middle">🚶‍➡️</text>

      {/* Lowercase walking figure — feet at grass, head at fence (LEFT, next to capital) */}
      <text x={lowX} y={lowY} fontSize={lowFSize} textAnchor="middle">🚶‍➡️</text>

      {/* Fence — cropped panels, from grass line up to fence (dotted) line (RIGHT) */}
      <svg x={fenceX} y={fenceY} width={fenceW} height={grassH} viewBox={`0 0 ${fenceCrop} 1000`} preserveAspectRatio="xMidYMid slice">
        <image href={FENCE_URL} x={0} y={0} width={1280} height={1000} />
      </svg>
    </g>
  );
}