import { getNewGraphemesAt, getIntroducedGraphemesThrough } from './curriculumGraphemes.js';
import { knownSightWordsAt } from './sightWordProgression.mjs';
import { canDecodeWord, normalizeSpanish } from './lessonProgression.js';
import { syllabifyEs } from '../lettersort/phonics.js';
import { cleanPracticeWords } from './dailyFluency.mjs';
import { bookLessonTags } from '../book/lessonTags.mjs';

export const PATH_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
export function pathwayLabel(number) {
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1) return '';
  return n <= 36 ? `M${Math.floor((n - 1) / 4) + 1}.W${(n - 1) % 4 + 1}` : `B${n - 36}`;
}
export function pathwayPosition(number, dayIndex) {
  const n = Number(number);
  if (n < 1 || n > 36 || !Number.isInteger(n) || dayIndex < 0 || dayIndex > 4) return null;
  return { moduleNumber: Math.floor((n - 1) / 4) + 1, lessonNumber: ((n - 1) % 4) * 5 + dayIndex + 1 };
}
export const positionKey = p => `M${p.moduleNumber}.L${p.lessonNumber}`;
export function introductionBooks(books, position) {
  return books.filter(book => {
    const tags = bookLessonTags(book);
    return book.subject === 'df' && book.module === `M${position.moduleNumber}` &&
      tags.length > 0 && Number(tags[0].slice(1)) === position.lessonNumber;
  });
}
export function sourceSignature(book) {
  // A metadata-only retag also invalidates the index, without altering edited lists.
  return JSON.stringify([book.id, book.updated_date, book.pdf_url, book.subject, book.module, book.lessons, book.lesson,
    (book.pages || []).map(p => [p.page_number, p.html_url, p.text, p.page_text, p.words])]);
}
export function indexVocabulary(values) {
  return cleanPracticeWords(values).map(word => ({ word, syllables: syllabifyEs(word) }));
}
export function decodableBookPool(indexes, position, { books = [], kind = 'words', limit = 80 } = {}) {
  const graphemes = getIntroducedGraphemesThrough(position);
  const hfw = new Set(knownSightWordsAt({ moduleNumber: 9, lessonNumber: 20 }).map(normalizeSpanish));
  const byId = new Map(books.map(b => [b.id, b]));
  const selected = [];
  for (const row of indexes) {
    const book = byId.get(row.book_id);
    if (!book || (book.language && !['es', 'bilingual'].includes(book.language))) continue;
    let priority = 0;
    if (book.subject === 'df') {
      const moduleNumber = Number((book.module || '').slice(1));
      const tags = bookLessonTags(book);
      if (!moduleNumber || !tags.length || moduleNumber > position.moduleNumber ||
        (moduleNumber === position.moduleNumber && Number(tags[0].slice(1)) > position.lessonNumber)) continue;
      priority = 1000 + moduleNumber * 20 + Number(tags[0].slice(1));
    }
    for (const entry of row.entries || []) {
      if (hfw.has(normalizeSpanish(entry.word))) continue;
      const candidates = kind === 'syllables' ? entry.syllables || [] : [entry.word];
      for (const text of candidates) {
        if (text && canDecodeWord(text, graphemes)) selected.push({ text, priority });
      }
    }
  }
  selected.sort((a, b) => b.priority - a.priority);
  return [...new Set(selected.map(v => v.text))].slice(0, limit);
}
function activity(mode, title, config, color = 'sky') {
  return { mode, title, emoji: '', color, live_scope: 'both', access_scope: 'both',
    completion: { type: 'view', target: 1 }, config: { ...config, generatedCurriculum: true } };
}
export function generatePathwayDays(number, waypointSnapshot = {}, books = []) {
  if (number > 36) return PATH_DAYS.map(day => ({ day, active: true, title: '', steps: [] }));
  return PATH_DAYS.map((day, index) => {
    const position = pathwayPosition(number, index), key = positionKey(position);
    const curriculumPosition = { module_number: position.moduleNumber, curriculum_lesson_number: position.lessonNumber };
    const newlyIntroduced = getNewGraphemesAt(position);
    const letters = [...new Set(newlyIntroduced.map(g => g.split('-')[0]))];
    const steps = [];
    if (newlyIntroduced.length) {
      steps.push(activity('soundwall', 'Muro de sonidos', { curriculumKey: key, cards: newlyIntroduced.map(sound => ({ sound, label: sound })) }));
      steps.push(activity('letter_formation', 'Formación de letras', { letters, waypointSnapshot }, 'purple'));
    }
    // The only-o lesson deliberately has no letter fluency grid.
    const known = getIntroducedGraphemesThrough(position);
    if (!(known.length === 1 && known[0] === 'o'))
      steps.push(activity('fluency', 'Fluidez: letras', { curriculumContentType: 'letters', curriculumPosition }));
    if (knownSightWordsAt(position).length)
      steps.push(activity('fluency', 'Fluidez: palabras frecuentes', { curriculumContentType: 'sight_words_all', curriculumPosition }, 'green'));
    for (const kind of ['syllables', 'words'])
      steps.push(activity('fluency', kind === 'words' ? 'Lectura de palabras' : 'Lectura de sílabas',
        { curriculumPosition, bookVocabulary: kind }, 'teal'));
    if (introductionBooks(books, position).length)
      steps.push(activity('book_reading', 'Lectura DF', { curriculumPosition, autoDfBooks: true, bookCompletion: 'view' }, 'orange'));
    return { day, active: true, title: key, module_number: position.moduleNumber,
      curriculum_lesson_number: position.lessonNumber, curriculum_lesson_end: null, steps };
  });
}
