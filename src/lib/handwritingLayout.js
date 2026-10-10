// Shared layout math for handwriting print sheets (NounPractice, handout).
export const ROW_GAP_IN = 0.3; // space between handwriting rows (inches)
export const ASC_FACTOR = 1.166667; // ZBKidLettersArrowDot ascender / em
export const DEFAULT_FONT_RATIO = 1.9;
export const DEFAULT_SHIFT_RATIO = 0;

export const PAGE_SIZES = {
  portrait: { w: 8.5, h: 11, usable: 10.5 },
  landscape: { w: 11, h: 8.5, usable: 8.0 },
};

// Fit the line gap (one zone height) so `rows` rows fill the usable height.
export function fitLineGap(rows, usableHeight, maxGap = 0.65) {
  const totalGaps = (rows - 1) * ROW_GAP_IN;
  return Math.min(maxGap, (usableHeight - totalGaps) / (3 * rows));
}