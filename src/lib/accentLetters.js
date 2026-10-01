// Accented character → { base, accent } decomposition for waypoint-based
// letter tracing. The base letter is traced with its normal waypoints; the
// accent is appended as extra strokes positioned above the letter body.
// Shared by DictadoTraceCanvas and SentenceModelAnimation (Creando Oraciones)
// so accented letters render with the same waypoint font everywhere instead
// of falling back to a different UI font (Andika) when no waypoint exists.

export const ACCENT_MAP = {
  'á': { base: 'a', accent: 'acute' },
  'é': { base: 'e', accent: 'acute' },
  'í': { base: 'i', accent: 'acute' },
  'ó': { base: 'o', accent: 'acute' },
  'ú': { base: 'u', accent: 'acute' },
  'Á': { base: 'A', accent: 'acute' },
  'É': { base: 'E', accent: 'acute' },
  'Í': { base: 'I', accent: 'acute' },
  'Ó': { base: 'O', accent: 'acute' },
  'Ú': { base: 'U', accent: 'acute' },
  'ñ': { base: 'n', accent: 'tilde' },
  'Ñ': { base: 'N', accent: 'tilde' },
  'ü': { base: 'u', accent: 'diaeresis' },
  'Ü': { base: 'U', accent: 'diaeresis' },
};

// Build accent stroke waypoints positioned just above the letter body's
// actual top edge (minY). This keeps the letter body at the same vertical
// position as non-accented words (aligned with the writing guidelines),
// and the accent sits naturally above the letter — not in a huge reserved
// space that pushes the word down.
// bounds: { minX, maxX, minY } from the base letter's waypoints.
export function buildAccentStrokes(type, { minX, maxX, minY }) {
  const cx = (minX + maxX) / 2;
  const w = maxX - minX;
  const top = minY;          // topmost ink point of the letter body
  const gap = 0.04;           // small gap between letter top and accent
  const accentH = 0.10;       // accent height in normalized units
  const baseY = top - gap;
  if (type === 'acute') {
    return [[
      { x: cx - w * 0.08, y: baseY - accentH * 0.25 },
      { x: cx + w * 0.08, y: baseY - accentH },
    ]];
  }
  if (type === 'tilde') {
    return [[
      { x: cx - w * 0.18, y: baseY - accentH * 0.2 },
      { x: cx - w * 0.06, y: baseY - accentH * 0.8 },
      { x: cx + w * 0.06, y: baseY - accentH * 0.15 },
      { x: cx + w * 0.18, y: baseY - accentH * 0.7 },
    ]];
  }
  if (type === 'diaeresis') {
    return [
      [{ x: cx - w * 0.12, y: baseY - accentH * 0.5 }],
      [{ x: cx + w * 0.12, y: baseY - accentH * 0.5 }],
    ];
  }
  return [];
}