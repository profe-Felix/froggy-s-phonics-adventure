// Faithful port of the legacy Letter Sort parameter / row / group parsers.
// Source: public/lettersort/index.html — ported verbatim with ESM exports.

import { normalizeMarkers } from './phonics';

// Special parser for ?words= that keeps "u,," together (ü marker)
export function parseWordsParam(raw) {
  const s = (Array.isArray(raw) ? raw.join(',') : (raw == null ? '' : String(raw))).trim();
  if (!s) return [];
  const out = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === ',') {
      const prev = s[i - 1];
      const next = s[i + 1];
      if (prev === 'u' && next === ',') { cur += ',,'; i++; continue; }
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// "1-3" or "1,2,3" -> [1,2,3]
export function parseCountsParam(v) {
  const raw = (Array.isArray(v) ? v.join(',') : (v == null ? '' : String(v))).trim();
  if (!raw) return [];
  if (/^\d+\s*-\s*\d+$/.test(raw)) {
    const [a, b] = raw.split('-').map((x) => parseInt(x.trim(), 10));
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const lo = Math.min(a, b), hi = Math.max(a, b);
      return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    }
  }
  return raw.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
}

// Row mode: "prompt~choice1,choice2; prompt2~choice3"
export function parseRows(str) {
  return str.split(';').map((seg) => seg.trim()).filter(Boolean).map((seg) => {
    const [left, right] = seg.split('~');
    const prompt = (left || '').trim();
    const choices = (right || '').split(',').map((s) => s.trim()).filter(Boolean);
    return { prompt, choices };
  }).filter((r) => r.prompt && r.choices.length);
}

// rowsyll: "palabra:init; palabra2:final"
export function parseRowSyllDefs(str) {
  return str.split(';').map((seg) => seg.trim()).filter(Boolean).map((seg) => {
    const [left] = seg.split('~');
    const [prompt, howRaw] = (left || '').split(':').map((s) => s.trim());
    const howLower = (howRaw || 'init').toString().trim().toLowerCase();
    const how = howLower === 'final' ? 'final' : howLower === 'second' ? 'second' : 'init';
    return { prompt, how };
  }).filter((r) => r.prompt);
}

// rowsyllcols: "ma,pa | sa,ta"  (pipe = column, comma = target within)
export function parseRowsyllCols(str) {
  return str.split('|')
    .map((col) => col.split(',').map((s) => s.trim()).filter(Boolean))
    .filter((col) => col.length);
}

// syllgroups: "n | ch | br" (pipe = col) or "n,ch,br" (comma = col)
export function parseSyllGroups(str) {
  // Remote presets may store `groups` as an array (e.g. ["k","x","w"]).
  // Coerce to a pipe-joined string so each element becomes its own group.
  const raw = (Array.isArray(str) ? str.join('|') : (str == null ? '' : String(str))).trim();
  if (!raw) return [];
  const cols = raw.includes('|') ? raw.split('|') : raw.split(',');
  return cols.map((col) => col.trim()).filter(Boolean);
}

// Expand a single syllgroup token into target syllables.
// "n" -> [na,ne,ni,no,nu]; "ch" -> [cha,che,...]; "que,qui" -> [que,qui]; "gue" -> [gue]
export function expandSyllGroupToken(token) {
  const t = normalizeMarkers(token || '');
  if (t.includes(',')) {
    return t.split(',').map((s) => normalizeMarkers(s)).filter(Boolean);
  }
  if (/^[bcdfghjklmnñpqrstvwxyz]$/.test(t)) {
    return ['a', 'e', 'i', 'o', 'u'].map((v) => `${t}${v}`);
  }
  if (/^[a-zñ]{2,3}$/.test(t) && !/[aeiouáéíóúü]/.test(t)) {
    return ['a', 'e', 'i', 'o', 'u'].map((v) => `${t}${v}`);
  }
  return [t];
}

// rowalli / allisyll: "manzana,mayo,mano; pana,pato,piso"  (semicolon = row, comma = item)
export function parseAlliGroups(str) {
  return str.split(';').map((seg) => seg.trim()).filter(Boolean).map((seg) =>
    seg.split(',').map((s) => s.trim()).filter(Boolean)
  ).filter((items) => items.length >= 2);
}

// Generate riddle: "Text |hidden1| more text |hidden2|"
// -> { parts: [{type:'text'|'hidden', text}], answers: [hidden1, hidden2] }
export function parseGenerateRiddle(raw) {
  const parts = [];
  const answers = [];
  const text = raw || '';
  let current = '';
  let hidden = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '|') {
      if (hidden) { answers.push(current); parts.push({ type: 'hidden', text: current }); }
      else if (current) { parts.push({ type: 'text', text: current.replace(/ $/, '\u00A0') }); }
      current = '';
      hidden = !hidden;
      continue;
    }
    current += ch;
  }
  if (current) {
    parts.push({ type: hidden ? 'hidden' : 'text', text: current });
    if (hidden) answers.push(current);
  }
  return { parts, answers };
}

// manualsort answers: "perro:collar,hueso|gato:leche,raton"
export function parseManualSortAnswers(raw) {
  const out = [];
  (raw || '').split('|').forEach((groupText) => {
    const [headerRaw, wordsRaw] = groupText.split(':');
    const header = (headerRaw || '').trim();
    if (!header) return;
    const words = parseWordsParam(wordsRaw || '');
    out.push({ header, words });
  });
  return out;
}