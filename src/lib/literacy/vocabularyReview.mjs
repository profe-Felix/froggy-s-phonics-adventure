import { syllabifyEs } from '../lettersort/phonics.js';

export const normalizeVocabulary = text => String(text || '').normalize('NFC').trim().toLocaleLowerCase('es');
export const vocabularyKey = (kind, text) => `${kind}:${normalizeVocabulary(text)}`;
const validText = text => /^[a-záéíóúüñ]+$/iu.test(text);
export function reviewDecisions(rows = []) {
  const latest = new Map();
  for (const row of [...rows].sort((a, b) =>
    String(b.updated_date || b.created_date || '').localeCompare(String(a.updated_date || a.created_date || '')) ||
    String(b.id || '').localeCompare(String(a.id || '')))) {
    const key = vocabularyKey(row.kind, row.text);
    if (!latest.has(key)) latest.set(key, row);
  }
  return latest;
}
export async function loadVocabularyReviews(client) {
  const rows = [];
  for (let skip = 0; skip < 10000; skip += 500) {
    const page = await client.entities.BookVocabularyReview.list('-updated_date', 500, skip);
    if (!Array.isArray(page)) throw Error('The vocabulary review response was incomplete.');
    rows.push(...page);
    if (page.length < 500) return rows;
  }
  throw Error('The vocabulary review bank is too large to load completely.');
}
function wordModel(entry, decisions) {
  const original = normalizeVocabulary(entry.word);
  const rule = decisions.get(vocabularyKey('word', original));
  const corrected = rule?.status !== 'pending' && !!rule?.replacement;
  const word = corrected ? normalizeVocabulary(rule.replacement) : original;
  const syllables = rule?.status !== 'pending' && rule?.syllables?.length
    ? rule.syllables.map(normalizeVocabulary)
    : corrected ? syllabifyEs(word) : (entry.syllables || syllabifyEs(word)).map(normalizeVocabulary);
  return { original, word, syllables, rule };
}
// Review records are separate from scanned text: a rescan can never overwrite a decision.
export function applyVocabularyReviews(indexes, rows = []) {
  const decisions = reviewDecisions(rows);
  const strict = decisions.get(vocabularyKey('settings', 'bank'))?.approved_only === true;
  return indexes.map(index => ({ ...index, entries: (index.entries || []).flatMap(entry => {
    const { word, syllables, rule } = wordModel(entry, decisions);
    if (!validText(word) || rule?.status === 'excluded' ||
        decisions.get(vocabularyKey('word', word))?.status === 'excluded') return [];
    const approved = rule?.status === 'approved';
    return [{ ...entry, word, wordAllowed: !strict || approved,
      syllables: syllables.flatMap(syllable => {
        const review = decisions.get(vocabularyKey('syllable', syllable));
        if (review?.status === 'excluded') return [];
        const text = review?.status === 'approved' && review.replacement
          ? normalizeVocabulary(review.replacement) : syllable;
        if (!validText(text) || decisions.get(vocabularyKey('syllable', text))?.status === 'excluded') return [];
        return !strict || approved || review?.status === 'approved' ? [text] : [];
      }) }];
  }) }));
}
export function buildVocabularyReviewItems(indexes, books, rows = []) {
  const decisions = reviewDecisions(rows), catalog = new Map(books.map(b => [b.id, b]));
  const words = new Map(), syllables = new Map();
  const addSource = (item, source) => {
    if (!item.sourceBooks.some(b => b.id && source.id ? b.id === source.id : (b.title === source.title && b.subject === source.subject)))
      item.sourceBooks.push(source);
  };
  for (const index of indexes) {
    const book = catalog.get(index.book_id);
    const source = { id: index.book_id, title: book?.title || 'Unavailable book', subject: book?.subject || 'library' };
    for (const entry of index.entries || []) {
      const model = wordModel(entry, decisions);
      if (!model.original) continue;
      const key = vocabularyKey('word', model.original);
      if (!words.has(key)) words.set(key, { key, kind: 'word', original: model.original,
        text: model.word, syllables: model.syllables, status: model.rule?.status || 'pending',
        corrected: model.word !== model.original || !!model.rule?.syllables?.length,
        inherited: false, sourceBooks: [] });
      addSource(words.get(key), source);
    }
  }
  for (const word of words.values()) {
    if (word.status === 'excluded') continue;
    for (const original of word.syllables) {
      if (!original) continue;
      const key = vocabularyKey('syllable', original), rule = decisions.get(key);
      const inherited = rule?.status !== 'approved' && rule?.status !== 'excluded' && word.status === 'approved';
      const text = rule?.status !== 'pending' && rule?.replacement ? normalizeVocabulary(rule.replacement) : original;
      if (!syllables.has(key)) syllables.set(key, { key, kind: 'syllable', original, text,
        syllables: [], status: inherited ? 'approved' : rule?.status || 'pending', inherited,
        corrected: original !== text, sourceBooks: [] });
      const item = syllables.get(key);
      if (inherited && item.status === 'pending') { item.status = 'approved'; item.inherited = true; }
      for (const source of word.sourceBooks) addSource(item, source);
    }
  }
  const sorted = map => [...map.values()].sort((a, b) => a.text.localeCompare(b.text, 'es') || a.key.localeCompare(b.key));
  return { words: sorted(words), syllables: sorted(syllables) };
}
export function vocabularyReviewPayload(item, changes = {}) {
  if (!['word', 'syllable'].includes(item.kind)) throw Error('Choose a word or syllable to review.');
  const status = changes.status || item.status;
  if (!['pending', 'approved', 'excluded'].includes(status)) throw Error('Choose a valid review status.');
  const text = normalizeVocabulary(item.original);
  if (status === 'pending') return { kind: item.kind, text, status, replacement: '', syllables: [] };
  if (status === 'excluded' && changes.replacement === undefined) return {
    kind: item.kind, text, status, replacement: normalizeVocabulary(item.text) === text ? '' : normalizeVocabulary(item.text),
    syllables: item.kind === 'word' ? item.syllables || [] : []
  };
  const replacement = normalizeVocabulary(changes.replacement ?? item.text);
  if (!validText(replacement)) throw Error('Use one Spanish word or syllable, without spaces, numbers or punctuation.');
  const syllables = item.kind === 'word'
    ? (changes.syllables ?? (replacement === normalizeVocabulary(item.text) ? item.syllables : syllabifyEs(replacement)))
      .map(normalizeVocabulary).filter(Boolean) : [];
  if (item.kind === 'word' && (!syllables.length || syllables.some(s => !validText(s)) || syllables.join('') !== replacement))
    throw Error(`The syllables for "${text}" must join back to the corrected word, including accents.`);
  return { kind: item.kind, text, status, replacement: replacement === text ? '' : replacement, syllables };
}
