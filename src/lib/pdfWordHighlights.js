import { normalizeSpanish } from '@/lib/literacy/lessonProgression';

let measureCtx = null;
const LETTER = /\p{L}/u;

// pdfjs registers each embedded PDF font in document.fonts under its
// loadedName (= textContent item.fontName). Measuring with that exact font
// gives the true glyph widths the canvas used.
function fontFamilyFor(fontName, styles) {
  const loaded = [...window.document.fonts].some(
    (f) => f.family.replace(/["']/g, '') === fontName && f.status === 'loaded'
  );
  if (loaded) return `"${fontName}"`;
  return styles?.[fontName]?.fontFamily || 'sans-serif';
}

// Returns highlight rects (display px) for every word in `highlightWords`
// found on the page. Builds per-character positions from each text item
// (prefix widths scaled to the item's real PDF width), joins items on the
// same line so words split across items still match.
export function computeWordHighlights({ textContent, viewport, scale, offsetX, offsetY, highlightWords }) {
  const ctx = measureCtx || (measureCtx = window.document.createElement('canvas').getContext('2d'));
  const familyCache = new Map();
  const chars = [];
  const pushBreak = () => {
    if (chars.length && chars[chars.length - 1].ch !== ' ') chars.push({ ch: ' ' });
  };

  for (const item of textContent.items) {
    const str = item.str || '';
    if (!str) { if (item.hasEOL) pushBreak(); continue; }
    const width = item.width * scale;
    const h = Math.abs(item.transform[3]) * scale || item.height * scale || 14;
    const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    if (width < 1) continue;

    if (!familyCache.has(item.fontName)) familyCache.set(item.fontName, fontFamilyFor(item.fontName, textContent.styles));
    ctx.font = `100px ${familyCache.get(item.fontName)}`;
    const total = ctx.measureText(str).width || 1;

    const prev = chars[chars.length - 1];
    if (prev && prev.ch !== ' ' && (Math.abs(prev.y - y) > h * 0.5 || x - prev.right > h * 0.15)) pushBreak();

    let prevW = 0;
    for (let i = 0; i < str.length; i++) {
      const w = ctx.measureText(str.slice(0, i + 1)).width;
      const ch = str[i];
      if (/\s/.test(ch)) pushBreak();
      else chars.push({ ch, left: x + (prevW / total) * width, right: x + (w / total) * width, y, h });
      prevW = w;
    }
    if (item.hasEOL) pushBreak();
  }

  const rects = [];
  let start = 0;
  for (let i = 0; i <= chars.length; i++) {
    if (i < chars.length && chars[i].ch !== ' ') continue;
    const word = chars.slice(start, i);
    start = i + 1;
    const letters = word.filter((c) => LETTER.test(c.ch));
    if (!letters.length) continue;
    const norm = normalizeSpanish(word.map((c) => c.ch).join('')).replace(/[^a-zñü]/g, '');
    if (!norm || !highlightWords.has(norm)) continue;
    const first = letters[0];
    const last = letters[letters.length - 1];
    const h = Math.max(...letters.map((c) => c.h));
    rects.push({
      left: first.left + offsetX,
      top: first.y - h * 0.85 + offsetY,
      width: last.right - first.left,
      height: h * 1.15,
    });
  }
  return rects;
}