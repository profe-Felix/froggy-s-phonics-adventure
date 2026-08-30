// Native Letter Sort engine — unified round builder + card classifier for ALL
// sort modes. Classic column modes (letters, random-initial, syllables,
// syllable-count, phonemes, stress) plus the non-classic families:
//   - column-group modes (manualsort, syllgroups, rowalli, allisyll, rowsyllcols)
//   - row modes (row, rowsyll)
//   - continuum (sort)
//   - generate (riddle -> drag answers into blanks)
//   - stressreveal (tap the stressed syllable)
//
// Every column carries its own `match(coreRaw) => boolean` predicate, so the
// column views share one `classifyCard(card, col)` call.

import {
  markersToPretty, normalizeMarkers, initialFromStem,
  phonemeCount, syllablesNormalized, syllableCount, stressedSyllIndex, cmpSyll,
} from './phonics';
import {
  parseWordsParam, parseCountsParam, parseRows, parseRowSyllDefs,
  parseRowsyllCols, parseSyllGroups, expandSyllGroupToken, parseAlliGroups,
  parseGenerateRiddle, parseManualSortAnswers,
} from './parsers';
import { headerImageUrl } from './storage';

export function parseList(raw) {
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  return String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);
}

// Classic column modes (letters/syllables/syllcount/phonemes/stress) carry no
// explicit `mode` param — the mode is inferred from which field is present.
// NOTE: syllcount presets use the `syllcount` field (not `counts`).
function inferClassicMode(v) {
  if (parseList(v.syllables).length) return 'syllables';
  if (parseCountsParam(v.counts ?? v.syllcount).length) return 'syllcount';
  if (parseCountsParam(v.phonemes).length) return 'phonemes';
  if (parseCountsParam(v.stress).length) return 'stress';
  if (parseList(v.letters).length) return 'letters';
  return 'letters';
}

const LABELS = {
  is: (L) => `/${L}/`,
  not: (L) => `No empieza con /${L}/`,
  emojiIs: (L) => `👍 Sílaba con /${L}/`,
  emojiNot: (L) => `👎 Sílaba sin /${L}/`,
  syllOne: (n) => `${n} sílaba`,
  syllMany: (n) => `${n} sílabas`,
  stressBase: (p) => (p === 1 ? 'última' : p === 2 ? 'penúltima' : p === 3 ? 'antepenúltima' : `${p}ª desde el final`),
  stressLabel: (base) => `sílaba tónica: ${base}`,
};

export function buildConfig(modeKey, internalMode, v = {}) {
  const mode = internalMode || inferClassicMode(v);
  return {
    modeKey,
    mode,
    letters: parseList(v.letters),
    syllables: parseList(v.syllables),
    counts: parseCountsParam(v.counts ?? v.syllcount),
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
    cardtype: v.cardtype || (isClassic(mode) ? 'image' : 'word'),
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
    headerimages: Array.isArray(v.headerimages)
      ? v.headerimages.map((s) => String(s).trim()).filter(Boolean)
      : (v.headerimages ? String(v.headerimages).split('|').map((s) => s.trim()).filter(Boolean) : []),
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

// modes rendered by ColumnsView (rack -> N labeled groups)
const COLUMN_MODES = ['letters', 'randinit', 'syllables', 'syllcount', 'phonemes', 'stress', 'manualsort', 'syllgroups', 'rowalli', 'allisyll', 'rowsyllcols'];
export function isClassic(mode) { return ['letters', 'randinit', 'syllables', 'syllcount', 'phonemes', 'stress'].includes(mode); }
export function isColumnMode(mode) { return COLUMN_MODES.includes(mode); }

let idc = 0;
function uid() { return `c${(idc++).toString(36)}${Date.now().toString(36).slice(-3)}`; }
function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function initialSyll(coreRaw) { return syllablesNormalized(coreRaw)[0] || ''; }

function applyTitleOverrides(cols, titles) {
  if (!titles || !titles.length) return cols;
  return cols.map((c, i) => ({ ...c, label: titles[i] || c.label }));
}

// Attach pre-rendered header pictures (headerimages param) to non-special
// columns by index. Syllable/count/stress/phoneme columns keep their tile
// headers; everything else (letters, manualsort, syllgroups, alli, rowsyllcols)
// shows the picture label instead of text when one is provided.
function withHeaderImages(columns, headerimages) {
  if (!headerimages || !headerimages.length) return columns;
  return columns.map((c, i) => {
    if (c.headerImg) return c;
    if (/^(syll:|count:|stress:|phon:)/.test(c.key)) return c;
    const img = headerimages[i];
    return img ? { ...c, headerImg: headerImageUrl(img) } : c;
  });
}

function labelTextFor(letter, type, labelStyle) {
  if (labelStyle === 'emoji') return type === 'is' ? LABELS.emojiIs(letter) : LABELS.emojiNot(letter);
  return type === 'is' ? LABELS.is(letter) : LABELS.not(letter);
}

function pickNoRepeat(list, n, usedSet) {
  const pool = list.filter((f) => !usedSet.has(f.path));
  const sh = shuffle(pool);
  const chosen = sh.slice(0, n);
  if (chosen.length < n) {
    // Fallback when a column's own pool is exhausted: reuse this column's
    // files, but never ones already claimed by another column (prevents the
    // same image appearing in two columns when pools overlap, e.g. syllables 'any').
    const more = shuffle(list.filter((f) => !chosen.includes(f) && !usedSet.has(f.path)));
    chosen.push(...more.slice(0, n - chosen.length));
  }
  return chosen;
}

function makeCardsFromFile(f, splitCards) {
  if (splitCards) {
    return [
      { id: uid(), imgUrl: '', word: f.stem, coreRaw: f.rawCore },
      { id: uid(), imgUrl: f.url, word: '', coreRaw: f.rawCore },
    ];
  }
  return [{ id: uid(), imgUrl: f.url, word: f.stem, coreRaw: f.rawCore }];
}

// index imageFiles by normalized core for word -> image lookup
function indexByCore(imageFiles) {
  const m = new Map();
  for (const f of imageFiles) { const k = normalizeMarkers(f.rawCore); if (!m.has(k)) m.set(k, f); }
  return m;
}

// Build cards from explicit words, honoring cardtype (word tile vs image tile)
// and splitCards (word+image halves).
function buildWordCards(words, imageFiles, { splitCards, cardtype }) {
  const idx = indexByCore(imageFiles);
  const out = [];
  for (const w of words) {
    const f = idx.get(normalizeMarkers(w));
    if (splitCards) {
      out.push({ id: uid(), imgUrl: '', word: markersToPretty(w), coreRaw: w });
      if (f) out.push({ id: uid(), imgUrl: f.url, word: '', coreRaw: f.rawCore });
    } else if (cardtype === 'word') {
      out.push({ id: uid(), imgUrl: '', word: markersToPretty(w), coreRaw: w });
    } else {
      out.push({ id: uid(), imgUrl: f ? f.url : '', word: f ? f.stem : markersToPretty(w), coreRaw: f ? f.rawCore : w });
    }
  }
  return out;
}

// ---- column builders ----
function columnsForLetters(letters, labelStyle, titles) {
  const cols = [];
  if (letters.length === 1) {
    const L = letters[0];
    cols.push({ key: L, label: labelTextFor(L, 'is', labelStyle), match: (c) => initialFromStem(c) === L });
    cols.push({ key: `not-${L}`, label: labelTextFor(L, 'not', labelStyle), match: (c) => initialFromStem(c) !== L });
  } else {
    letters.forEach((L) => cols.push({ key: L, label: labelTextFor(L, 'is', labelStyle), match: (c) => initialFromStem(c) === L }));
  }
  return applyTitleOverrides(cols, titles);
}
function columnsForSyllables(sylls, syllmatch, syllcmp, titles) {
  const cols = sylls.map((s) => {
    const target = normalizeMarkers(s);
    const match = syllmatch === 'any'
      ? (c) => syllablesNormalized(c).some((x) => cmpSyll(x, target, syllcmp))
      : (c) => cmpSyll(syllablesNormalized(c)[0], target, syllcmp);
    return { key: `syll:${target}`, label: s, display: s, match };
  });
  return applyTitleOverrides(cols, titles);
}
function columnsForSyllCount(counts, titles) {
  const cols = counts.map((n) => ({ key: `count:${n}`, label: n === 1 ? LABELS.syllOne(n) : LABELS.syllMany(n), display: `${n}`, match: (c) => syllableCount(c) === n }));
  return applyTitleOverrides(cols, titles);
}
function columnsForPhonemeCount(counts, titles) {
  const cols = counts.map((n) => ({ key: `phon:${n}`, label: `${n} sonido${n === 1 ? '' : 's'}`, display: `${n}`, match: (c) => phonemeCount(c) === n }));
  return applyTitleOverrides(cols, titles);
}
function columnsForStress(positions, titles) {
  const cols = positions.map((p) => ({ key: `stress:${p}`, label: LABELS.stressLabel(LABELS.stressBase(p)), display: String(p), match: (c) => stressedSyllIndex(c) === p }));
  return applyTitleOverrides(cols, titles);
}

function columnsForManualSort(headers, answers, headertype, imageFiles, titles) {
  const idx = indexByCore(imageFiles);
  const parsed = parseManualSortAnswers(answers);
  // answers string drives grouping; headers param is a fallback when answers omitted
  const groups = parsed.length
    ? parsed
    : headers.map((h) => ({ header: h, words: [] }));
  const cols = groups.map((g, i) => {
    const headerImg = headertype === 'image' ? (idx.get(normalizeMarkers(g.header))?.url || '') : '';
    const wordSet = new Set(g.words.map((w) => normalizeMarkers(w)));
    return { key: `manual:${i}`, label: markersToPretty(g.header) || g.header, headerImg, match: (c) => wordSet.has(normalizeMarkers(c)) };
  });
  return applyTitleOverrides(cols, titles);
}

function columnsForSyllGroups(groupsStr, titles) {
  const tokens = parseSyllGroups(groupsStr);
  const cols = tokens.map((tok, i) => {
    const targets = new Set(expandSyllGroupToken(tok).map(normalizeMarkers));
    return { key: `group:${i}`, label: tok, match: (c) => targets.has(initialSyll(c)) };
  });
  return applyTitleOverrides(cols, titles);
}

function columnsForAlli(groupsStr, bySyllable, titles) {
  const groups = parseAlliGroups(groupsStr);
  const cols = groups.map((items, i) => {
    const head = items[0];
    const headVal = bySyllable ? initialSyll(head) : initialFromStem(head);
    const label = bySyllable ? headVal : headVal.toUpperCase();
    return { key: `alli:${i}`, label, match: (c) => (bySyllable ? initialSyll(c) : initialFromStem(c)) === headVal };
  });
  return applyTitleOverrides(cols, titles);
}

function columnsForRowsyllCols(colsStr, matchMode, titles) {
  const colTargets = parseRowsyllCols(colsStr);
  const cols = colTargets.map((targetList, i) => {
    // a column matches if the card satisfies ANY of the column's target syllables
    const targets = targetList.map(normalizeMarkers);
    const match = (c) => {
      const syls = syllablesNormalized(c);
      const pretty = markersToPretty(c);
      return targets.some((t) => {
        if (matchMode === 'contains') return syls.some((s) => s.includes(t));
        if (matchMode === 'word-contains') return pretty.toLowerCase().includes(t);
        return syls[0] === t; // syllable-start
      });
    };
    return { key: `rscol:${i}`, label: targetList.join(' / '), match };
  });
  return applyTitleOverrides(cols, titles);
}

// Match predicate for a rowsyll-form row (a group of target syllables).
function rowsyllRowMatch(sylls, matchMode) {
  const targets = sylls.map(normalizeMarkers);
  return (coreRaw) => {
    const syls = syllablesNormalized(coreRaw);
    const pretty = markersToPretty(coreRaw).toLowerCase();
    return targets.some((t) => {
      if (matchMode === 'contains') return syls.some((s) => s.includes(t));
      if (matchMode === 'word-contains') return pretty.includes(t);
      return syls[0] === t; // syllable-start (default)
    });
  };
}

// ---- main builder ----
export function buildRound(config, imageFiles = []) {
  const {
    mode, letters, syllables, counts, phonemes, stress, pool, words, per,
    splitCards, titles, labelStyle, syllmatch, syllcmp,
    groups, rows, rowsyll, headers, answers, headertype, cardtype, match,
    direction, bottom, top, left, right, distractors, riddle, columns: colLabels, slots, headerimages,
  } = config;
  // Dedupe by normalized word so the same picture (e.g. a word stored as both
  // <base>.jpg and <base>_pic.png) never produces two cards in one round.
  const rawFiles = imageFiles || [];
  const seenCore = new Set();
  const files = rawFiles.filter((f) => {
    const k = f.core || normalizeMarkers(f.rawCore);
    if (!k) return true;
    if (seenCore.has(k)) return false;
    seenCore.add(k);
    return true;
  });
  const hasWords = words && words.length > 0;

  // ----- column-group modes (ColumnsView) -----
  if (mode === 'letters') {
    const columns = withHeaderImages(columnsForLetters(letters, labelStyle, titles), headerimages);
    let cards;
    if (hasWords) { cards = buildWordCards(words, files, config); return { view: 'columns', columns, cards }; }
    cards = [];
    const byInitial = new Map();
    for (const f of files) { const k = f.initial; if (!byInitial.has(k)) byInitial.set(k, []); byInitial.get(k).push(f); }
    const used = new Set();
    for (const col of columns) {
      const picks = col.key.startsWith('not-')
        ? pickNoRepeat(files.filter((f) => f.initial !== col.key.slice(4)), per, used)
        : pickNoRepeat(byInitial.get(col.key) || [], per, used);
      picks.forEach((f) => used.add(f.path));
      picks.forEach((f) => cards.push(...makeCardsFromFile(f, splitCards)));
    }
    return { view: 'columns', columns, cards };
  }

  if (mode === 'randinit') {
    const clean = (pool || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean);
    const poolArr = clean.length ? clean : (letters.length ? letters : ['a']);
    const picked = poolArr[Math.floor(Math.random() * poolArr.length)];
    return buildRound({ ...config, mode: 'letters', letters: [picked], words: [], pool: [] }, files);
  }

  if (mode === 'syllables') {
    const columns = columnsForSyllables(syllables, syllmatch, syllcmp, titles);
    let cards;
    if (hasWords) { cards = buildWordCards(words, files, config); return { view: 'columns', columns, cards }; }
    cards = [];
    const used = new Set();
    for (const col of columns) {
      const target = col.key.slice(5);
      const list = files.filter((f) => syllmatch === 'any'
        ? syllablesNormalized(f.rawCore).some((s) => cmpSyll(s, target, syllcmp))
        : cmpSyll(syllablesNormalized(f.rawCore)[0], target, syllcmp));
      pickNoRepeat(list, per, used).forEach((f) => { used.add(f.path); cards.push(...makeCardsFromFile(f, splitCards)); });
    }
    return { view: 'columns', columns, cards };
  }

  if (mode === 'syllcount') {
    const columns = columnsForSyllCount(counts, titles);
    let cards;
    if (hasWords) { cards = buildWordCards(words, files, config); return { view: 'columns', columns, cards }; }
    cards = [];
    const used = new Set();
    for (const col of columns) {
      const need = parseInt(col.key.slice(6), 10);
      pickNoRepeat(files.filter((f) => syllableCount(f.rawCore) === need), per, used)
        .forEach((f) => { used.add(f.path); cards.push({ id: uid(), imgUrl: f.url, word: f.stem, coreRaw: f.rawCore }); });
    }
    return { view: 'columns', columns, cards };
  }

  if (mode === 'phonemes') {
    const columns = columnsForPhonemeCount(phonemes, titles);
    let cards;
    if (hasWords) { cards = buildWordCards(words, files, config); return { view: 'columns', columns, cards }; }
    cards = [];
    const used = new Set();
    for (const col of columns) {
      const need = parseInt(col.key.slice(5), 10);
      pickNoRepeat(files.filter((f) => phonemeCount(f.rawCore) === need), per, used)
        .forEach((f) => { used.add(f.path); cards.push({ id: uid(), imgUrl: f.url, word: f.stem, coreRaw: f.rawCore }); });
    }
    return { view: 'columns', columns, cards };
  }

  if (mode === 'stress') {
    const columns = columnsForStress(stress, titles);
    let cards;
    if (hasWords) { cards = buildWordCards(words, files, config); return { view: 'columns', columns, cards }; }
    cards = [];
    const used = new Set();
    for (const col of columns) {
      const pos = parseInt(col.key.slice(7), 10);
      pickNoRepeat(files.filter((f) => stressedSyllIndex(f.rawCore) === pos), per, used)
        .forEach((f) => { used.add(f.path); cards.push({ id: uid(), imgUrl: f.url, word: f.stem, coreRaw: f.rawCore }); });
    }
    return { view: 'columns', columns, cards };
  }

  if (mode === 'manualsort') {
    const columns = withHeaderImages(columnsForManualSort(headers, answers, headertype, files, titles), headerimages);
    const parsed = parseManualSortAnswers(answers);
    const allWords = parsed.length ? parsed.flatMap((g) => g.words) : [];
    const cards = buildWordCards(allWords, files, config);
    return { view: 'columns', columns, cards };
  }

  if (mode === 'syllgroups') {
    const columns = withHeaderImages(columnsForSyllGroups(groups, titles), headerimages);
    const cards = buildWordCards(words, files, config);
    return { view: 'columns', columns, cards };
  }

  if (mode === 'rowalli' || mode === 'allisyll') {
    const columns = withHeaderImages(columnsForAlli(rows, mode === 'allisyll', titles), headerimages);
    const items = parseAlliGroups(rows).flat();
    const cards = buildWordCards(items, files, config);
    return { view: 'columns', columns, cards };
  }

  if (mode === 'rowsyllcols') {
    // rowsyll form: groups of syllables rendered as ROWS (header image + drop zone)
    if (rowsyll) {
      const groups = String(rowsyll).split('|').map((g) => parseList(g));
      const rowsData = groups.map((sylls, i) => ({
        key: `rsrow:${i}`,
        syllables: sylls,
        headerImg: headerimages[i] ? headerImageUrl(headerimages[i]) : '',
        match: rowsyllRowMatch(sylls, match),
      }));
      const cards = buildWordCards(words, files, { ...config, cardtype: 'word' });
      if (distractors > 0 && files.length) {
        const extra = [];
        const usedCores = new Set(cards.map((c) => normalizeMarkers(c.coreRaw)));
        const pool = shuffle(files.filter((f) => !usedCores.has(normalizeMarkers(f.rawCore))));
        for (const f of pool) {
          if (extra.length >= distractors) break;
          if (rowsData.some((r) => r.match(f.rawCore))) continue;
          extra.push({ id: uid(), imgUrl: f.url, word: f.stem, coreRaw: f.rawCore });
        }
        cards.push(...extra);
      }
      return { view: 'rowsyllrows', rows: rowsData, cards };
    }
    // groups form: column view
    const columns = withHeaderImages(columnsForRowsyllCols(groups, match, titles), headerimages);
    const cards = buildWordCards(words, files, config);
    if (distractors > 0 && files.length) {
      const extra = [];
      const usedCores = new Set(cards.map((c) => normalizeMarkers(c.coreRaw)));
      const pool = shuffle(files.filter((f) => !usedCores.has(normalizeMarkers(f.rawCore))));
      for (const f of pool) {
        if (extra.length >= distractors) break;
        const core = f.rawCore;
        if (columns.some((col) => col.match(core))) continue;
        extra.push({ id: uid(), imgUrl: f.url, word: f.stem, coreRaw: f.rawCore });
      }
      cards.push(...extra);
    }
    return { view: 'columns', columns, cards };
  }

  // ----- row modes (RowView) -----
  if (mode === 'row') {
    const parsed = parseRows(rows);
    const idx = indexByCore(files);
    const rowsData = parsed.map((r) => ({
      prompt: r.prompt,
      promptImg: idx.get(normalizeMarkers(r.prompt))?.url || '',
      maxPerSlot: 1,
      match: (coreRaw) => initialFromStem(coreRaw) === initialFromStem(r.prompt),
    }));
    const choices = parsed.flatMap((r) => r.choices);
    const cards = buildWordCards(choices, files, { ...config, cardtype: config.cardtype || 'image' });
    return { view: 'rows', rows: rowsData, cards };
  }

  if (mode === 'rowsyll') {
    const defs = parseRowSyllDefs(rows);
    const idx = indexByCore(files);
    const rowsData = defs.map((d) => {
      const syls = syllablesNormalized(d.prompt);
      const pos = d.how === 'final' ? syls.length - 1 : d.how === 'second' ? 1 : 0;
      const target = syls[pos] || '';
      const match = (coreRaw) => {
        const s = syllablesNormalized(coreRaw);
        const p = d.how === 'final' ? s.length - 1 : d.how === 'second' ? 1 : 0;
        return (s[p] || '') === target;
      };
      return { prompt: d.prompt, promptImg: idx.get(normalizeMarkers(d.prompt))?.url || '', maxPerSlot: 99, match };
    });
    const cards = buildWordCards(words, files, { ...config, cardtype: config.cardtype || 'image' });
    return { view: 'rows', rows: rowsData, cards };
  }

  // ----- continuum (sort) -----
  if (mode === 'sort') {
    const cards = buildWordCards(words, files, { ...config, cardtype: config.cardtype || 'word' });
    return { view: 'continuum', direction, bottom, top, left, right, cards };
  }

  // ----- generate (free response) -----
  // Two forms, both teacher-typed free response (no image bucket, no verify):
  // a riddle ("text |hidden| ...") with a covered answer the teacher reveals
  // after students guess, or a labeled column grid where the teacher types the
  // words students generate for each column.
  if (mode === 'generate') {
    const hasRiddle = !!(riddle && String(riddle).trim());
    let parts = null, answers = null;
    if (hasRiddle) {
      const parsed = parseGenerateRiddle(riddle);
      parts = parsed.parts;
      answers = parsed.answers;
    }
    const colDefs = (colLabels && colLabels.length) ? colLabels : (hasRiddle ? ['', ''] : []);
    const rowsArr = Array.isArray(config.rows)
      ? config.rows.map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n) && n > 0)
      : String(config.rows || '').split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
    const slotCount = Math.max(1, parseInt(slots, 10) || 1);
    const columns = colDefs.map((c, i) => ({
      key: `gen:${i}`,
      label: markersToPretty(c) || c,
      rows: rowsArr[i] ?? rowsArr[0] ?? 4,
      slots: slotCount,
    }));
    return { view: 'generate', hasRiddle, parts, answers, columns };
  }

  // ----- stressreveal -----
  if (mode === 'stressreveal') {
    const cards = buildWordCards(words, files, { ...config, cardtype: config.cardtype || 'image' });
    return { view: 'stressreveal', cards };
  }

  return null;
}

export function classifyCard(card, col) {
  return col && col.match ? !!col.match(card.coreRaw) : false;
}

// Flat list of words that need an image resolved for a config (so the activity
// can resolve just those instead of listing the whole bucket). Empty -> bucket.
export function cardWordsForConfig(config) {
  const m = config.mode;
  if (m === 'manualsort') {
    const parsed = parseManualSortAnswers(config.answers);
    const words = parsed.flatMap((g) => g.words);
    return config.headertype === 'image' ? [...words, ...parsed.map((g) => g.header)] : words;
  }
  if (m === 'syllgroups') return config.words;
  if (m === 'rowalli' || m === 'allisyll') return parseAlliGroups(config.rows).flat();
  if (m === 'rowsyllcols') return config.words;
  if (m === 'row') return parseRows(config.rows).flatMap((r) => [r.prompt, ...r.choices]);
  if (m === 'rowsyll') return [...parseRowSyllDefs(config.rows).map((d) => d.prompt), ...config.words];
  if (m === 'sort' || m === 'stressreveal') return config.words;
  if (m === 'generate') return config.riddle ? parseGenerateRiddle(config.riddle).answers : (config.words || []);
  return config.words || [];
}