/**
 * GuideKeyVisual — a small left-edge grounding visual for handwriting guides.
 *
 * Shows colored zones (sky/grass/dirt) limited to a narrow chunk (saves ink
 * on printouts), a picket fence (first ~2 panels of the included fence SVG)
 * sitting from the grass line up to the fence/dotted line, and two 🚶‍➡️
 * walking figures whose feet are on the grass and heads touch the ceiling
 * (sky for capital, fence for lowercase).
 *
 * TEMP: emojiHeightFactor, emojiFeetFactor, emojiXAdjust are manual tuning
 * sliders passed from NamePractice. Once values are finalized, hardcode them.
 *
 * Renders an SVG <g> group — place it inside an <svg> element.
 */

const FENCE_URL = 'https://media.base44.com/images/public/6972eada24fac6b62ccbab8e/bf7297494_156818.svg';

export default function GuideKeyVisual({ skyY, fenceY, grassY, dirtY, width, opacity = 0.5,
  emojiHeightFactor = 1.25, emojiFeetFactor = 0.0, emojiXAdjust = 0 }) {
  const h = dirtY - skyY;
  const skyH = fenceY - skyY;
  const grassH = grassY - fenceY;
  const dirtH = dirtY - grassY;

  // Zone heights
  const capZoneH = grassY - skyY;
  const lowZoneH = grassY - fenceY;

  // Direct font-size: emoji visual height ≈ font-size, so font-size = zone * factor.
  // User adjusts emojiHeightFactor until the head touches the ceiling.
  const capFSize = capZoneH * emojiHeightFactor;
  const lowFSize = lowZoneH * emojiHeightFactor;

  // Y position: baseline at grassY, shifted up by emojiFeetFactor * fontSize
  // (emoji feet sit slightly below baseline; user adjusts to land on grass)
  const capY = grassY - emojiFeetFactor * capFSize;
  const lowY = grassY - emojiFeetFactor * lowFSize;

  // Fence: crop the SVG (1280×1000, ~3.5 pickets @ ~400px each) to ~2 pickets
  // (800 viewBox units), then scale to fill the grass zone height.
  const fenceW = Math.min(0.8 * grassH, width * 0.80);
  const fenceVbW = Math.min(800, (fenceW * 1000) / grassH);

  // Layout: fence at left, emojis to the right
  const capX = fenceW + (width - fenceW) * 0.28 + emojiXAdjust;
  const lowX = fenceW + (width - fenceW) * 0.62 + emojiXAdjust;

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
      <text x={capX} y={capY} fontSize={capFSize} textAnchor="middle">🚶‍➡️</text>

      {/* Lowercase walking figure — feet at grass, head at fence */}
      <text x={lowX} y={lowY} fontSize={lowFSize} textAnchor="middle">🚶‍➡️</text>
    </g>
  );
}