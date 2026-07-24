// "Caza en el texto" — find targets in connected text. One umbrella activity
// with a sub-type (hunt type) chosen by the teacher:
//   phoneme    : tap the letter for a target sound (single-letter target)
//   digraph    : tap a target digraph (ch / ll / rr) — digraph-aware ranges
//   word       : tap words that start with a target letter
//   punctuation: tap all punctuation marks (no target)
//   space      : tap all spaces (no target)
//   syllable   : tap the stressed (tónica) syllable of each word (no target)
//
// buildHunt() turns a passage into a list of segments — tappable ranges with a
// precomputed `correct` flag — so the student component only has to dot ranges
// and the replay only has to color them.

import { syllabifyEs, stressedSyllIndex, stripDiacritics } from '@/lib/lettersort/phonics';

const PUNCT = new Set(['.', ',', '!', '?', ';', ':', '¿', '¡', '"', "'", '(', ')', '-', '—', '…']);

export const HUNT_TYPES = [
  { key: 'phoneme', label: 'Fonema (letra)', needsTarget: true, targetPh: 's' },
  { key: 'digraph', label: 'Dígrafo (ch / ll / rr)', needsTarget: true, targetPh: 'ch' },
  { key: 'word', label: 'Palabra (empieza con)', needsTarget: true, targetPh: 'm' },
  { key: 'punctuation', label: 'Puntuación', needsTarget: false },
  { key: 'space', label: 'Espacios', needsTarget: false },
  { key: 'syllable', label: 'Sílaba tónica', needsTarget: false },
];

const eq = (a, b) => stripDiacritics(a || '').toLowerCase() === stripDiacritics(b || '').toLowerCase();

export function buildHunt(config, itemText) {
  const type = config?.huntType || 'phoneme';
  const typeDef = HUNT_TYPES.find((t) => t.key === type) || HUNT_TYPES[0];
  const target = (config?.target || '').trim();
  const text = String(itemText || '');
  const segments = [];

  if (type === 'word') {
    let idx = 0;
    for (const part of text.split(/(\s+)/)) {
      if (part === '') continue;
      if (/^\s+$/.test(part)) { segments.push({ text: part, tap: false }); continue; }
      const correct = !!target && eq(part[0] || '', target[0] || '');
      segments.push({ text: part, tap: true, index: idx, correct }); idx++;
    }
  } else if (type === 'syllable') {
    let idx = 0;
    for (const part of text.split(/(\s+)/)) {
      if (part === '') continue;
      if (/^\s+$/.test(part)) { segments.push({ text: part, tap: false }); continue; }
      const syls = syllabifyEs(part);
      const fromEnd = stressedSyllIndex(part);
      const stressedIdx = syls.length - fromEnd;
      syls.forEach((s, si) => {
        segments.push({ text: s, tap: true, index: idx, correct: si === stressedIdx }); idx++;
      });
    }
  } else if (type === 'digraph') {
    let i = 0, idx = 0;
    while (i < text.length) {
      if (text[i] === ' ') { segments.push({ text: ' ', tap: false }); i++; continue; }
      const two = text.slice(i, i + 2).toLowerCase();
      if (['ch', 'll', 'rr'].includes(two)) {
        const seg = text.slice(i, i + 2);
        segments.push({ text: seg, tap: true, index: idx, correct: !!target && eq(seg, target) }); idx++; i += 2; continue;
      }
      const seg = text[i];
      segments.push({ text: seg, tap: true, index: idx, correct: !!target && eq(seg, target) }); idx++; i++;
    }
  } else {
    // char-level: phoneme, punctuation, space
    let idx = 0;
    for (const ch of text) {
      if (ch === ' ') {
        if (type === 'space') { segments.push({ text: ' ', tap: true, index: idx, correct: true }); idx++; }
        else { segments.push({ text: ' ', tap: false }); }
        continue;
      }
      let correct = false;
      if (type === 'phoneme') correct = !!target && eq(ch, target);
      else if (type === 'punctuation') correct = PUNCT.has(ch);
      segments.push({ text: ch, tap: true, index: idx, correct }); idx++;
    }
  }

  const correctCount = segments.filter((s) => s.tap && s.correct).length;
  return { type, typeDef, target, segments, correctCount };
}