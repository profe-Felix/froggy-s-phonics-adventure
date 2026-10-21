import { syllabifyEs } from '../lettersort/phonics.js';

const normalize = text => String(text || '').normalize('NFC').toLocaleLowerCase('es');

// Character offsets refer to the printed source, never the teacher's replacement.
// Keep combining accents attached when converting normalized syllable offsets.
function sourceOffset(raw, normalizedOffset) {
  let length = 0;
  for (const cluster of raw.matchAll(/\P{M}\p{M}*/gu)) {
    if (length >= normalizedOffset) return cluster.index;
    length += cluster[0].normalize('NFC').length;
  }
  return raw.length;
}

export function findVocabularyOccurrences(text, item) {
  const targets = new Set([item.original, item.text].map(normalize).filter(Boolean));
  const hits = [];
  for (const token of String(text).matchAll(/[\p{L}\p{M}]+/gu)) {
    const raw = token[0], word = normalize(raw);
    if (item.kind === 'word') {
      if (targets.has(word)) hits.push({ start: token.index, end: token.index + raw.length, matchedWord: raw });
    } else {
      let offset = 0;
      for (const syllable of syllabifyEs(word)) {
        if (targets.has(normalize(syllable))) hits.push({
          start: token.index + sourceOffset(raw, offset),
          end: token.index + sourceOffset(raw, offset + syllable.length),
          matchedWord: raw,
        });
        offset += syllable.length;
      }
    }
  }
  return hits;
}

export function vocabularyContextParts(text, hit) {
  const start = Math.max(0, hit.start - 80), end = Math.min(text.length, hit.end + 100);
  return [
    { text: `${start ? '…' : ''}${text.slice(start, hit.start)}`, match: false },
    { text: text.slice(hit.start, hit.end), match: true },
    { text: `${text.slice(hit.end, end)}${end < text.length ? '…' : ''}`, match: false },
  ];
}

export function contextRectangles(chars, hit, width, height) {
  const lines = [];
  for (const char of chars.slice(hit.start, hit.end)) {
    if (!(char.w > 0 && char.h > 0)) continue;
    let line = lines.find(row => Math.abs(row.y - char.y) < Math.min(row.h, char.h) * 0.4);
    if (!line) { line = { ...char }; lines.push(line); }
    else {
      const right = Math.max(line.x + line.w, char.x + char.w);
      const bottom = Math.max(line.y + line.h, char.y + char.h);
      line.x = Math.min(line.x, char.x); line.y = Math.min(line.y, char.y);
      line.w = right - line.x; line.h = bottom - line.y;
    }
  }
  return lines.flatMap(rect => {
    const x = Math.max(0, rect.x), y = Math.max(0, rect.y);
    const right = Math.min(width, rect.x + rect.w), bottom = Math.min(height, rect.y + rect.h);
    return right > x && bottom > y
      ? [{ x: x / width, y: y / height, w: (right - x) / width, h: (bottom - y) / height }] : [];
  });
}

// Advance only after a page has successfully loaded. A retry must neither skip
// a failed page nor repeat an occurrence already delivered to the teacher.
export function createContextCursor({ sources, getPageCount, readMatches, onBookComplete }) {
  let bookIndex = 0, pageNumber = 1, queue = [], closed = false;
  const check = () => { if (closed) throw new DOMException('Preview closed', 'AbortError'); };
  return {
    async next() {
      check();
      if (queue.length) return { value: queue.shift(), done: false };
      while (bookIndex < sources.length) {
        const source = sources[bookIndex];
        const count = await getPageCount(source);
        check();
        if (!count) throw Error('This book has no saved pages to preview.');
        if (pageNumber > count) {
          await onBookComplete?.(source);
          check(); bookIndex++; pageNumber = 1; continue;
        }
        const matches = await readMatches(source, pageNumber);
        check(); queue = matches; pageNumber++;
        if (queue.length) return { value: queue.shift(), done: false };
      }
      return { done: true };
    },
    dispose() { closed = true; queue = []; },
  };
}
