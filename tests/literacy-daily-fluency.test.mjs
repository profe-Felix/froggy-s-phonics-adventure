import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { boardWords, bookBodyText, buildDailyPools, cleanPracticeWords, dailyPosition, matchingDfBooks, parseLessonRange } from '../src/lib/literacy/dailyFluency.mjs';
import { knownSightWordsAt } from '../src/lib/literacy/sightWordProgression.mjs';

test('daily ranges preserve a complete 7-8; incomplete and reversed drafts are not coerced', () => {
  assert.deepEqual(parseLessonRange('7-8'), { curriculum_lesson_number: 7, curriculum_lesson_end: 8 });
  assert.deepEqual(parseLessonRange('7'), { curriculum_lesson_number: 7, curriculum_lesson_end: null });
  assert.deepEqual(parseLessonRange('7 – 8'), parseLessonRange('7-8'));
  for (const value of ['7-', '', '8-7', '0', 'a', '7-8-9', '101']) assert.equal(parseLessonRange(value), null);
});
test('each day uses its own module and includes the end of a doubled-up lesson', () => {
  const monday = { active: true, module_number: 2, curriculum_lesson_number: 20 };
  const tuesday = { active: true, module_number: 3, curriculum_lesson_number: 1, curriculum_lesson_end: 6 };
  const builders = { letters: p => [`M${p.moduleNumber}`, 'a', 'a'], syllables: p => [`L${p.lessonNumber}`], hfw: knownSightWordsAt };
  assert.equal(dailyPosition(monday).label, 'M2.L20');
  const pool = buildDailyPools(tuesday, builders);
  assert.deepEqual(pool.letters, ['M3', 'a']);
  assert.deepEqual(pool.syllables, ['L6']);
  assert.ok(pool.hfw.includes('agua'));
  assert.ok(!pool.hfw.includes('dado'));
  assert.ok(!buildDailyPools({ ...tuesday, curriculum_lesson_end: 5 }, builders).hfw.includes('agua'));
  assert.deepEqual(buildDailyPools({ ...monday, active: false }, builders), { letters: [], syllables: [], hfw: [] });
});
test('DF words come only from books tagged within the chosen daily lesson range', () => {
  const daily = { module_number: 3, curriculum_lesson_number: 7, curriculum_lesson_end: 8 };
  const books = [
    { id: 'a', subject: 'df', module: 'M3', lessons: ['L2', 'L7'] },
    { id: 'b', subject: 'df', module: 'M3', lesson: 'L8' },
    { id: 'lv', subject: 'lv', module: 'M3', lesson: 'L7' },
    { id: 'other', subject: 'df', module: 'M2', lesson: 'L7' },
    { id: 'untagged', subject: 'df', module: 'M3' },
    { id: 'future', subject: 'df', module: 'M3', lesson: 'L9' },
  ];
  assert.deepEqual(matchingDfBooks(books, daily).map(b => b.id), ['a', 'b']);
});
test('word candidates exclude the cover/credits and retain accents without invented tokens', () => {
  const text = bookBodyText({ pages: [
    { page_number: 1, text: 'Un libro por NombreAutor' },
    { page_number: 2, words: [{ text: 'El' }, { text: 'niño' }, { text: 'tomó' }, { text: 'agua.' }] },
    { page_number: 3, kind: 'credits', text: 'NombreEditor' },
    { page_number: 4, text: 'Copyright ISBN NombreAutor' },
  ] });
  assert.deepEqual(cleanPracticeWords(text), ['el', 'niño', 'tomó', 'agua']);
});
test('edited lists, including intentionally empty lists, survive new book extraction', () => {
  const row = { words_overridden: true, words: ['tato', 'mamá'], generated_words: ['autor'] };
  assert.deepEqual(boardWords(row, ['autor', 'editor']), ['tato', 'mamá']);
  assert.deepEqual(boardWords({ ...row, words: [] }, ['autor']), []);
  assert.deepEqual(boardWords({ ...row, words_overridden: false }, ['pata']), ['pata']);
});
test('range input retains drafts and daily board is navigable and shareable without a live session', async () => {
  const range = await readFile(new URL('../src/components/lesson/LessonRangeInput.jsx', import.meta.url), 'utf8');
  assert.match(range, /setDraft\(event.target.value\)/);
  assert.doesNotMatch(range, /parseInt\(/);
  const page = await readFile(new URL('../src/pages/DailyFluency.jsx', import.meta.url), 'utf8');
  assert.match(page, /ArrowRight/);
  assert.match(page, /FluencyGrid/);
  assert.match(page, /Shuffle/);
  assert.match(page, /saveWords/);
  assert.match(page, /shareUrl/);
});
