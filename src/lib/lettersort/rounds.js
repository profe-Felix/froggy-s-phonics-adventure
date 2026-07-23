// Native Letter Sort engine — unified round builder + card classifier for the
// classic column modes (letters, random-initial, syllables, syllable-count,
// phonemes, stress). Faithful port of the legacy imperative logic, refactored
// so the 4 duplicated word-list builders + 5 auto-pick builders collapse into
// one dispatch driven by a `mode` string + a small set of helpers.
//
// Non-classic modes (sort, manualsort, row*, generate, stressreveal) are NOT
// built here yet — the activity falls back to the legacy iframe for those.

import {
  markersToPretty, normalizeMarkers, initialFromStem,
  phonemeCount, syllablesNormalized, syllableCount, stressedSyllIndex, cmpSyll,
} from './phonics';
import { parseWordsParam, parseCountsParam } from './parsers';

export function parseList(raw) {
  return (raw || '').split(',').map((s) => s.trim()).filter(Boolean);
}

// ---- i18n labels (Spanish, ported verbatim from legacy T.es.labels) ----
const LABELS = {
  is: (L) => `Empieza con /${L}/`,
  not: (L) => `No empieza con /${L}/`,
  emojiIs: (L) => `👍 Sílaba con /${L}/`,
  emojiNot: (L) => `👎 Sílaba sin /${L}/`,
  syllOne: (n) => `${n} sílaba`,
  syllMany: (n) => `${n} sílabas`,
  stressBase: (p) => (p === 1 ? 'última' : p === 2 ? 'penúltima' : p === 3 ? 'antepenúltima' : `${p}ª desde el final`),
  stressLabel: (base) => `sílaba tónica: ${base}`,
};

// ---- config normalization (page calls this; values come from vals or a preset) ----
export function buildConfig(modeKey, internalMode, v = {}) {
  const mode = internalMode || 'letters';
  return {
    modeKey,
    mode,
    letters: parseList(v.letters),
    syllables: parseList(v.syllables),
    counts: parseCountsParam(v.counts),
    phonemes: parseCountsParam(v.phonemes),
    stress: parseCountsParam(v.stress),
    pool: parseList(v.pool),
    words: parseWordsParam(v.words),
    rows: v.rows || '',
    rowsyll: v.rowsyll || '',
    groups: v.groups || '',
    headers: parseList(v.headers),
    answers: v.answers || '',
    headertype: v.headertype || 'text',
    cardtype: v.cardtype || 'word',
    match: v.match || 'syllable-start',
    layout: v.layout || 'side',
    direction: v.direction || 'bottom-up',
    bottom: v.bottom || '', top: v.top || '', left: v.left || '', right: v.right || '',
    distractors: parseInt(v.distractors, 10) || 0,
    rowtitle: !!v.rowtitle,
    titles: parseList(v.titles),
    riddle: v.riddle || '',
    columns: parseList(v.columns),
    rowsGen: v.rows || '',
    slots: parseInt(v.slots, 10) || 1,
    bg: v.bg || '',
    per: Math.max(1, Math.min(8, parseInt(v.per, 10) || 4)),
    syllmatch: v.syllmatch || 'initial',
    syllcmp: v.syllcmp || 'equals',
    tilesOnly: !!v.tilesonly,
    hideWords: !!v.hidewords,
    splitCards: !!v.splitcards,
    hideTitle: !!v.hidetitle,
    labelStyle: v.emoji ? 'emoji' : 'text',
    lang: 'es',
  };
}

export const CLASSIC_MODES = ['letters', 'randinit', 'syllables', 'syllcount', 'phonemes', 'stress'];
export function isClassic(mode) { return CLASSIC_MODES.includes(mode); }

let idc = 0;
function uid() { return `c${(idc++).toString(36)}${Date.now().toString(36).slice(-3)}`; }

function applyTitleOverrides(cols, titles) {
  if (!titles || !titles.length) return cols;
  return cols.map((c, i) => ({ ...c, label: titles[i] || c.label }));
}

function labelTextFor(letter, type, labelStyle) {
  if (labelStyle === 'emoji') return type === 'is' ? LABELS.emojiIs(letter) : LABELS.emojiNot(letter);
  return type === 'is' ? LABELS.is(letter) : LABELS.not(letter);
}

function buildColumnsForLetters(letters, labelStyle, titles) {
  const cols = [];
  if (letters.length === 1) {
    const L = letters[0];
    cols.push({ label: labelTextFor(L, 'is', labelStyle), key: `${L}` });
    cols.push({ label: labelTextFor(L, 'not', labelStyle), key: `not-${L}` });
  } else {
    letters.forEach((L) => cols.push({ label: labelTextFor(L, 'is', labelStyle), key: `${L}` }));
  }
  return applyTitleOverrides(cols, titles);
}
function buildColumnsForSyllables(sylls, titles) {
  const cols = sylls.map((s) => ({ label: s, key: `syll:${normalizeMarkers(s)}`, display: s }));
  return applyTitleOverrides(cols, titles);
}
function buildColumnsForSyllCount(counts, titles) {
  const cols = counts.map((n) => ({ label: n === 1 ? LABELS.syllOne(n) : LABELS.syllMany(n), key: `count:${n}`, display: `${n}` }));
  return applyTitleOverrides(cols, titles);
}
function buildColumnsForPhonemeCount(counts, titles) {
  const cols = counts.map((n) => ({ label: `${n} sonido${n === 1 ? '' : 's'}`, key: `phon:${n}`, display: `${n}` }));
  return applyTitleOverrides(cols, titles);
}
function buildColumnsForStress(positions, titles) {
  const cols = positions.map((p) => ({ label: LABELS.stressLabel(LABELS.stressBase(p)), key: `stress:${p}`, display: String(p) }));
  return applyTitleOverrides(cols, titles);
}

// pick n unique files from list, avoiding already-used paths
function pickNoRepeat(list, n, usedSet) {
  const pool = list.filter((f) => !usedSet.has(f.path));
  // shuffle
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const chosen = pool.slice(0, n);
  if (chosen.length < n) {
    const more = list.filter((f) => !chosen.includes(f));
    for (let i = more.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [more[i], more[j]] = [more[j], more[i]]; }
    chosen.push(...more.slice(0, n - chosen.length));
  }
  return chosen;
}

// Produce card(s) from an image file, honoring splitCards (word+image halves).
function makeCardsFromFile(f, splitCards) {
  if (splitCards) {
    return [
      { id: uid(), imgUrl: '', word: f.stem, coreRaw: f.rawCore },
      { id: uid(), imgUrl: f.url, word: '', coreRaw: f.rawCore },
    ];
  }
  return [{ id: uid(), imgUrl: f.url, word: f.stem, coreRaw: f.rawCore }];
}

// Build cards from an explicit word list, mapping each word to its image.
function buildWordListCards(words, imageFiles, splitCards) {
  const index = new Map();
  for (const f of imageFiles) { const k = normalizeMarkers(f.rawCore); if (!index.has(k)) index.set(k, f); }
  const cards = [];
  for (const w of words) {
    const f = index.get(normalizeMarkers(w));
    if (!f) continue;
    if (splitCards) {
      cards.push({ id: uid(), imgUrl: '', word: markersToPretty(f.rawCore) || w, coreRaw: f.rawCore });
      cards.push({ id: uid(), imgUrl: f.url, word: '', coreRaw: f.rawCore });
    } else {
      cards.push({ id: uid(), imgUrl: f.url, word: f.stem, coreRaw: f.rawCore });
    }
  }
  return cards;
}

// ---- main round builder for classic modes ----
export function buildRound(config, imageFiles) {
  const { mode, letters, syllables, counts, phonemes, stress, pool, words, per, splitCards, titles, labelStyle, syllmatch, syllcmp } = config;
  const used = new Set();
  const hasWords = words && words.length > 0;

  let columns = [];
  let cards = [];

  if (mode === 'letters') {
    columns = buildColumnsForLetters(letters, labelStyle, titles);
    if (hasWords) { cards = buildWordListCards(words, imageFiles, splitCards); return { columns, cards }; }
    const byInitial = new Map();
    for (const f of imageFiles) { const k = f.initial; if (!byInitial.has(k)) byInitial.set(k, []); byInitial.get(k).push(f); }
    const everything = [...imageFiles];
    for (const col of columns) {
      let picks = [];
      if (col.key.startsWith('not-')) {
        const L = col.key.slice(4);
        picks = pickNoRepeat(everything.filter((f) => f.initial !== L), per, used);
      } else {
        picks = pickNoRepeat(byInitial.get(col.key) || [], per, used);
      }
      picks.forEach((f) => used.add(f.path));
      picks.forEach((f) => cards.push(...makeCardsFromFile(f, splitCards)));
    }
    return { columns, cards };
  }

  if (mode === 'randinit') {
    const clean = (pool || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean);
    const fallback = letters.length ? letters : ['a'];
    const poolArr = clean.length ? clean : fallback;
    const picked = poolArr[Math.floor(Math.random() * poolArr.length)];
    return buildRound({ ...config, mode: 'letters', letters: [picked], words: [] }, imageFiles);
  }

  if (mode === 'syllables') {
    columns = buildColumnsForSyllables(syllables, titles);
    if (hasWords) { cards = buildWordListCards(words, imageFiles, splitCards); return { columns, cards }; }
    for (const col of columns) {
      const targetSyl = col.key.slice(5);
      const list = imageFiles.filter((f) => {
        const syls = syllablesNormalized(f.rawCore);
        return syllmatch === 'any' ? syls.some((s) => cmpSyll(s, targetSyl, syllcmp)) : cmpSyll(syls[0], targetSyl, syllcmp);
      });
      const picks = pickNoRepeat(list, per, used);
      picks.forEach((f) => used.add(f.path));
      picks.forEach((f) => cards.push(...makeCardsFromFile(f, splitCards)));
    }
    return { columns, cards };
  }

  if (mode === 'syllcount') {
    columns = buildColumnsForSyllCount(counts, titles);
    if (hasWords) { cards = buildWordListCards(words, imageFiles, splitCards); return { columns, cards }; }
    for (const col of columns) {
      const need = parseInt(col.key.slice(6), 10);
      const picks = pickNoRepeat(imageFiles.filter((f) => syllableCount(f.rawCore) === need), per, used);
      picks.forEach((f) => used.add(f.path));
      picks.forEach((f) => cards.push({ id: uid(), imgUrl: f.url, word: f.stem, coreRaw: f.rawCore }));
    }
    return { columns, cards };
  }

  if (mode === 'phonemes') {
    columns = buildColumnsForPhonemeCount(phonemes, titles);
    if (hasWords) { cards = buildWordListCards(words, imageFiles, splitCards); return { columns, cards }; }
    for (const col of columns) {
      const need = parseInt(col.key.slice(5), 10);
      const picks = pickNoRepeat(imageFiles.filter((f) => phonemeCount(f.rawCore) === need), per, used);
      picks.forEach((f) => used.add(f.path));
      picks.forEach((f) => cards.push({ id: uid(), imgUrl: f.url, word: f.stem, coreRaw: f.rawCore }));
    }
    return { columns, cards };
  }

  if (mode === 'stress') {
    columns = buildColumnsForStress(stress, titles);
    if (hasWords) { cards = buildWordListCards(words, imageFiles, splitCards); return { columns, cards }; }
    for (const col of columns) {
      const pos = parseInt(col.key.slice(7), 10);
      const picks = pickNoRepeat(imageFiles.filter((f) => stressedSyllIndex(f.rawCore) === pos), per, used);
      picks.forEach((f) => used.add(f.path));
      picks.forEach((f) => cards.push({ id: uid(), imgUrl: f.url, word: f.stem, coreRaw: f.rawCore }));
    }
    return { columns, cards };
  }

  return null;
}

// ---- card classifier (replaces the verifyNow switch for classic modes) ----
export function classifyCard(card, col, config) {
  const key = col.key;
  let target;
  if (key.startsWith('not-')) target = { type: 'not', letter: key.slice(4) };
  else if (key.startsWith('syll:')) target = { type: 'syll', syll: key.slice(5) };
  else if (key.startsWith('count:')) target = { type: 'count', n: parseInt(key.slice(6), 10) };
  else if (key.startsWith('phon:')) target = { type: 'phon', n: parseInt(key.slice(5), 10) };
  else if (key.startsWith('stress:')) target = { type: 'stress', pos: parseInt(key.slice(7), 10) };
  else target = { type: 'is', letter: key };

  const coreRaw = card.coreRaw;
  if (target.type === 'syll') {
    const syls = syllablesNormalized(coreRaw);
    return config.syllmatch === 'any'
      ? syls.some((s) => cmpSyll(s, target.syll, config.syllcmp))
      : cmpSyll(syls[0], target.syll, config.syllcmp);
  }
  if (target.type === 'count') return syllableCount(coreRaw) === target.n;
  if (target.type === 'phon') return phonemeCount(coreRaw) === target.n;
  if (target.type === 'stress') return stressedSyllIndex(coreRaw) === target.pos;
  const initial = initialFromStem(coreRaw);
  return target.type === 'is' ? initial === target.letter : initial !== target.letter;
}