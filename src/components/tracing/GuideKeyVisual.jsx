/**
 * GuideKeyVisual — a small left-edge grounding visual for handwriting guides.
 *
 * Shows colored zones (sky/grass/dirt) limited to bgWidth (saves ink on
 * printouts), two 🚶‍➡️ walking figures on the LEFT whose feet are on the
 * grass and heads touch the ceiling (sky for capital, fence for lowercase),
 * and a picket fence AFTER the emojis — rendered at full height and clipped
 * to show only a horizontal window (2-3 pickets) via fenceWidth/fenceOffset.
 *
 * LAYOUT SCALING: When explicit spacing props (emojiSpacing, fenceGap, etc.)
 * are NOT provided, the layout auto-scales by emoji font-size (capFSize),
 * which is derived from the zone height × emojiHeightFactor. This keeps the
 * fence clip window proportional to the fence image (always ~3 planks)
 * regardless of canvas dimensions. A smaller emojiHeightFactor produces a
 * proportionally narrower guide. NamePractice passes explicit tuned values
 * that override the auto-scaling entirely.
 *
 * Renders an SVG <g> group — place it inside an <svg> element.
 */

import { useId } from 'react';

const FENCE_URL = 'https://media.base44.com/images/public/6972eada24fac6b62ccbab8e/bf7297494_156818.svg';
const FENCE_ASPECT = 1280 / 1000; // natural w/h of the fence SVG

// Height-based auto-scaling ratios derived from NamePractice tuned values.
// NamePractice: capFSize=102.8, grassH=53.4 (emojiHeightFactor=0.96, lh=67)
//   base=20, emojiX=13, emojiSpacing=45, fenceGap=35, fenceWidth=26
// Ratios are relative to capFSize (= capZoneH * emojiHeightFactor) so the
// entire guide scales with the emoji size — a smaller emojiHeightFactor
// produces a proportionally narrower guide.
// fenceWidth is relative to grassH (the fence image height) so the clip
// window always shows ~3 planks regardless of canvas dimensions.
const R_BASE_F = 0.195;        // baseX / capFSize
const R_EMOJI_X_F = 0.126;     // emojiX / capFSize
const R_EMOJI_SPACING_F = 0.438; // emojiSpacing / capFSize
const R_FENCE_GAP_F = 0.340;   // fenceGap / capFSize
const R_FENCE_WIDTH_H = 0.487; // fenceWidth / grassH (shows ~3 planks)

export default function GuideKeyVisual({ skyY, fenceY, grassY, dirtY, width, opacity = 0.5,
  emojiHeightFactor = 0.84, emojiFeetFactor = 0.26, emojiSpacing, bgWidth,
  fenceWidth, fenceOffset = 0, emojiX, fenceGap }) {

  const clipId = useId();

  // Effective background width — falls back to `width` then to a default.
  const effBg = bgWidth ?? width ?? 80;

  // Zone heights — drive the height-based auto-scaling so the visual is
  // proportional to the writing lines regardless of canvas aspect ratio.
  const skyH = fenceY - skyY;
  const grassH = grassY - fenceY;
  const dirtH = dirtY - grassY;
  const capZoneH = grassY - skyY;
  const lowZoneH = grassY - fenceY;

  // Emoji font-sizes (computed early so auto-scaling can use capFSize).
  const capFSize = capZoneH * emojiHeightFactor;
  const lowFSize = lowZoneH * emojiHeightFactor;

  // Auto-scale layout by emoji font-size when not explicitly provided.
  // NamePractice passes explicit values → those override (unaffected).
  // Tracing canvases pass only width → layout scales to the emoji size.
  const baseX = capFSize * R_BASE_F;
  const effEmojiX = emojiX ?? capFSize * R_EMOJI_X_F;
  const effEmojiSpacing = emojiSpacing ?? capFSize * R_EMOJI_SPACING_F;
  const effFenceGap = fenceGap ?? capFSize * R_FENCE_GAP_F;
  const effFenceWidth = fenceWidth ?? grassH * R_FENCE_WIDTH_H;

  // Y position: baseline at grassY, shifted up by emojiFeetFactor * fontSize
  const capY = grassY - emojiFeetFactor * capFSize;
  const lowY = grassY - emojiFeetFactor * lowFSize;

  // Emojis on the LEFT — capital then lowercase, spaced by emojiSpacing
  const capX = baseX + effEmojiX;
  const lowX = capX + effEmojiSpacing;

  // Fence AFTER the emojis — full height, clipped to a horizontal window.
  // Image rendered at natural aspect ratio (height = grassH), then clipped.
  // fenceOffset shifts the image left → shows different pickets.
  const fenceImgW = grassH * FENCE_ASPECT;
  const fenceX = lowX + effFenceGap; // positioned after the lowercase emoji
  const imgX = fenceX - fenceOffset;

  // Background must cover all visual elements (emojis + fence) so the
  // colored zone wraps around the fence, not just the emojis.
  const fenceEnd = fenceX + effFenceWidth;
  const bgDrawWidth = Math.max(effBg, fenceEnd);

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
        <rect x={fenceX} y={fenceY} width={effFenceWidth} height={grassH} />
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