import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathwayLabel, pathwayPosition, generatePathwayDays, introductionBooks,
  decodableBookPool, indexVocabulary, sourceSignature } from '../src/lib/literacy/pathwayCurriculum.mjs';

test('67 stable numeric positions receive 36 module-week labels and 31 bonuses', () => {
  assert.equal(pathwayLabel(1), 'M1.W1');
  assert.equal(pathwayLabel(4), 'M1.W4');
  assert.equal(pathwayLabel(5), 'M2.W1');
  assert.equal(pathwayLabel(36), 'M9.W4');
  assert.equal(pathwayLabel(37), 'B1');
  assert.equal(pathwayLabel(67), 'B31');
  const positions = [];
  for (let level = 1; level <= 36; level++) for (let day = 0; day < 5; day++) {
    const p = pathwayPosition(level, day);
    positions.push((p.moduleNumber - 1) * 20 + p.lessonNumber);
  }
  assert.deepEqual(positions, Array.from({ length: 180 }, (_, i) => i + 1));
  assert.equal(pathwayPosition(37, 0), null);
});
test('sound wall and both-case formation appear only on exact introduction days', () => {
  const days = generatePathwayDays(1);
  assert.ok(days[0].steps.some(s => s.mode === 'soundwall'));
  assert.ok(days[0].steps.some(s => s.mode === 'letter_formation'));
  assert.ok(!days[1].steps.some(s => s.mode === 'soundwall'));
  assert.ok(!days[0].steps.some(s => s.config.curriculumContentType === 'letters'));
  assert.ok(days[2].steps.some(s => s.config.curriculumContentType === 'letters'));
  assert.equal(generatePathwayDays(37).flatMap(d => d.steps).length, 0);
});
test('DF reading uses first tagged lesson, never all LV books or an untagged guess', () => {
  const books = [
    { id: 'df', subject: 'df', module: 'M3', lessons: ['L9', 'L7'] },
    { id: 'lv', subject: 'lv', module: 'M3', lesson: 'L7' },
    { id: 'untagged', subject: 'df', module: 'M3' },
  ];
  assert.deepEqual(introductionBooks(books, { moduleNumber: 3, lessonNumber: 7 }).map(b => b.id), ['df']);
  assert.deepEqual(introductionBooks(books, { moduleNumber: 3, lessonNumber: 9 }), []);
  assert.ok(generatePathwayDays(10, {}, books)[1].steps.some(s => s.config.autoDfBooks));
});
test('syllables qualify independently of the whole word; closed sil comes from silbato', () => {
  const books = [{ id: 'lv', subject: 'lv', language: 'es' }, { id: 'future', subject: 'df', module: 'M9', lesson: 'L1' }];
  const rows = [{ book_id: 'lv', entries: indexVocabulary(['silbato', 'pata', 'el', 'la', 'las']) },
    { book_id: 'future', entries: indexVocabulary(['pata']) }];
  const p = { moduleNumber: 2, lessonNumber: 11 };
  const words = decodableBookPool(rows, p, { books });
  const syllables = decodableBookPool(rows, p, { books, kind: 'syllables' });
  assert.ok(!words.includes('silbato'));
  assert.ok(!words.includes('pata'));
  assert.ok(!words.includes('el'));
  assert.ok(!words.includes('las'));
  assert.ok(syllables.includes('sil'));
  assert.ok(!syllables.includes('ba'));
  assert.deepEqual(indexVocabulary(['silbato'])[0].syllables, ['sil', 'ba', 'to']);
});
test('index invalidates when book text or tags change', () => {
  const book = { id: 'a', subject: 'df', module: 'M3', lesson: 'L2', pages: [{ text: 'pata' }] };
  assert.notEqual(sourceSignature(book), sourceSignature({ ...book, lesson: 'L7' }));
  assert.notEqual(sourceSignature(book), sourceSignature({ ...book, pages: [{ text: 'tapa' }] }));
});
test('formation, bank reading and teacher/student synchronized fluency are connected', async () => {
  const root = new URL('../src/', import.meta.url);
  const [router, configured, table, pair, editor] = await Promise.all([
    'components/lesson/LessonModeRouter.jsx', 'components/lesson/LessonConfiguredActivity.jsx',
    'components/live/FluencyLessonTable.jsx', 'components/lesson/modes/LetterFormationStep.jsx', 'pages/LessonEditor.jsx'
  ].map(path => readFile(new URL(path, root), 'utf8')));
  assert.match(router, /'letter_formation'/);
  assert.match(configured, /BookVocabularyStep/);
  assert.match(configured, /AutoDfReadingStep/);
  assert.match(table, /useBookVocabulary\(config\)/);
  assert.match(pair, /mergeTeacherWaypoints\(waypointSnapshot\)/);
  assert.match(pair, /LetterHelpReplay/);
  assert.match(editor, /vocabularyOverride/);
});
