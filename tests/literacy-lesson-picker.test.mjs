import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sortLessonChoices, lessonCoverage } from '../src/lib/literacy/pathwayCurriculum.mjs';

test('lesson choices retain their IDs and sort in curriculum order regardless of creation date', () => {
  const values = [36, 2, 11, 1, 10, 67, 37].map(n => ({ id: `id${n}`, lesson_number: n, title: `Week ${n}` }));
  const sorted = sortLessonChoices(values);
  assert.deepEqual(sorted.map(l => l.lesson_number), [1, 2, 10, 11, 36, 37, 67]);
  assert.equal(values[0].lesson_number, 36);
  assert.equal(sorted[0].id, 'id1');
  assert.equal(sortLessonChoices([{ assignment_type: 'guided', lesson_number: 1 }, ...values])[0].id, 'id1');
});
test('each week has an explicit lesson range, with authored ranges taking precedence', () => {
  assert.equal(lessonCoverage({ lesson_number: 1 }), 'M1.L1–L5');
  assert.equal(lessonCoverage({ lesson_number: 2 }), 'M1.L6–L10');
  assert.equal(lessonCoverage({ lesson_number: 36 }), 'M9.L16–L20');
  assert.equal(lessonCoverage({ lesson_number: 37 }), '');
  const day = (module, first, last) => ({ module_number: module, curriculum_lesson_number: first,
    curriculum_lesson_end: last, steps: [{ mode: 'fluency' }] });
  assert.equal(lessonCoverage({ daily_lessons: [day(3, 7, 8), day(3, 9, 10)] }), 'M3.L7–L10');
  assert.equal(lessonCoverage({ daily_lessons: [day(3, 20), day(4, 1, 2)] }), 'M3.L20 · M4.L1–L2');
  assert.equal(lessonCoverage({ daily_lessons: [day(3, 1), day(3, 5)] }), 'M3.L1 · M3.L5');
});
test('formation and alphabet pairs start paused, without changing notebook defaults', async () => {
  const source = path => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const pair = await source('components/lesson/modes/LetterFormationStep.jsx');
  const replay = await source('components/notebook/LetterHelpReplay.jsx');
  const chart = await source('pages/AlphabetChart.jsx');
  const live = await source('pages/LiveLesson.jsx');
  assert.match(pair, /autoPlay=\{false\}/);
  assert.match(chart, /LetterFormationPair/);
  assert.match(replay, /autoPlay = true/);
  assert.match(replay, /useState\(autoPlay\)/);
  assert.match(replay, /seek\(0\); setPlaying\(autoPlay\)/);
  assert.match(live, /select: sortLessonChoices/);
  assert.match(live, /lessonCoverage\(lesson\)/);
});
