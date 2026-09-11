/**
 * GuideKeyVisual — a small left-edge grounding visual for handwriting guides.
 *
 * Shows colored zones (sky/grass/dirt) limited to bgWidth (saves ink on
 * printouts), two 🚶‍➡️ walking figures on the LEFT whose feet are on the
 * grass and heads touch the ceiling (sky for capital, fence for lowercase),
 * and a picket fence AFTER the emojis — rendered at full height and clipped
 * to show only a horizontal window (2-3 pickets) via fenceWidth/fenceOffset.
 *
 * TEMP: all tuning props are manual sliders from NamePractice. Once values
 * are finalized, hardcode them.
 *
 * Renders an SVG <g> group — place it inside an <svg> element.
 */

import { useId } from 'react';

const FENCE_URL = 'https://media.base44.com/images/public/6972eada24fac6b62ccbab8e/bf7297494_156818.svg';
const FENCE_ASPECT = 1280 / 1000; // natural w/h of the fence SVG

export default function GuideKeyVisual({ skyY, fenceY, grassY, dirtY, width, opacity = 0.5,
  emojiHeightFactor = 0.84, emojiFeetFactor = 0.26, emojiSpacing = 70, bgWidth = 80,
  fenceWidth = 40, fenceOffset = 0, emojiX = 0, fenceGap = 35 }) {

  const clipId = useId();

  const skyH = fenceY - skyY;
  const grassH = grassY - fenceY;
  const dirtH = dirtY - grassY;

  // Zone heights
  const capZoneH = grassY - skyY;
  const lowZoneH = grassY - fenceY;

  // Direct font-size: emoji visual height ≈ font-size, so font-size = zone * factor.
  const capFSize = capZoneH * emojiHeightFactor;
  const lowFSize = lowZoneH * emojiHeightFactor;

  // Y position: baseline at grassY, shifted up by emojiFeetFactor * fontSize
  const capY = grassY - emojiFeetFactor * capFSize;
  const lowY = grassY - emojiFeetFactor * lowFSize;

  // Emojis on the LEFT — capital then lowercase, spaced by emojiSpacing
  const capX = 20 + emojiX;
  const lowX = capX + emojiSpacing;

  // Fence AFTER the emojis — full height, clipped to a horizontal window.
  // Image rendered at natural aspect ratio (height = grassH), then clipped.
  // fenceOffset shifts the image left → shows different pickets.
  const fenceImgW = grassH * FENCE_ASPECT;
  const fenceX = lowX + fenceGap; // positioned after the lowercase emoji
  const imgX = fenceX - fenceOffset;

  // Background must cover all visual elements (emojis + fence) so the
  // colored zone wraps around the fence, not just the emojis.
  const fenceEnd = fenceX + fenceWidth;
  const bgDrawWidth = Math.max(bgWidth, fenceEnd);

  return (
    <g pointerEvents="none">
      {/* Background zones — extend to cover emojis + fence (saves ink vs full width) */}
      <rect x={0} y={skyY} width={bgDrawWidth} height={skyH} fill="#dceaf9" opacity={opacity} />
      <rect x={0} y={fenceY} width={bgDrawWidth} height={grassH} fill="#e8f5e9" opacity={opacity} />
      <rect x={0} y={grassY} width={bgDrawWidth} height={dirtH} fill="#f5ebe0" opacity={opacity} />

      {/* Capital walking figure — feet at grass, head at sky (LEFT) */}
      <text x={capX} y={capY} fontSize={capFSize} textAnchor="middle">🚶‍➡️</text>

      {/* Lowercase walking figure — feet at grass, head at fence (next to capital) */}
      <text x={lowX} y={lowY} fontSize={lowFSize} textAnchor="middle">🚶‍➡️</text>

      {/* Fence — full height, clipped to show a window of pickets */}
      <clipPath id={clipId}>
        <rect x={fenceX} y={fenceY} width={fenceWidth} height={grassH} />
      </clipPath>
      <image
        href={FENCE_URL}
        x={imgX}
        y={fenceY}
        width={fenceImgW}
        height={grassH}
        clipPath={`url(#${clipId})`}
      />
    </g>
  );
}