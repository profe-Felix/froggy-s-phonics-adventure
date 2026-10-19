export { parseHelpLetters, normalizeLetterHelp, letterHelpForPage } from '../../base44/shared/notebookLetterHelp.mjs';

// Persistent colors encode pen lifts, not playback state. Additional strokes
// use distinct colors without taking the orange moving-tip color.
export const LETTER_HELP_STROKE_COLORS = Object.freeze([
  '#2563eb', '#16a34a', '#dc2626', '#9333ea', '#0891b2', '#db2777',
]);
export function letterHelpStrokeColor(index) {
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError('Invalid formation stroke index.');
  return LETTER_HELP_STROKE_COLORS[index % LETTER_HELP_STROKE_COLORS.length];
}
