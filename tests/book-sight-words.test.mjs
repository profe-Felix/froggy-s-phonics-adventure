import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readerSightWordPosition, knownWordsForReader } from '../src/lib/book/knownSightWords.mjs';

const config = (module, lesson) => ({ active_spanish_module: module, active_spanish_lesson: lesson });

test('M2.L18 books use the current class DF position, not their reading placement', () => {
  assert.deepEqual(readerSightWordPosition('M2.L18', config(3, 6)), { moduleNumber: 3, lessonNumber: 6 });
  const words = knownWordsForReader('M2.L18', config(3, 6));
  for (const word of ['el', 'la', 'las', 'con', 'dice', 'tambien', 'tiene', 'agua', 'pero', 'su']) {
    assert.ok(words.has(word), `${word} must be known by M3.L6`);
  }
  for (const word of ['dado', 'nido', 'pedi', 'dudo', 'hacia', 'vamos']) {
    assert.ok(!words.has(word), `${word} must not be inferred from dictation or future HFW`);
  }
});

test('las enters at exactly M1.L11 and matches a full word independently of la', () => {
  assert.ok(!knownWordsForReader('M1.L10').has('las'));
  assert.ok(knownWordsForReader('M1.L11').has('las'));
  const words = knownWordsForReader('M2.L18');
  assert.deepEqual('Con mi amiga la mariposa aprendí a oler las flores.'
    .match(/[\p{L}\p{M}]+/gu).filter(word => words.has(word.toLowerCase())), ['Con', 'la', 'las']);
});

test('refreshing class progress changes words, with no leakage between classes', () => {
  const earlier = knownWordsForReader('M2.L18', config(1, 1));
  const current = knownWordsForReader('M2.L18', config(3, 4));
  const nextDay = knownWordsForReader('M2.L18', config(3, 6));
  assert.deepEqual([...earlier], ['el', 'la']);
  assert.ok(current.has('las'));
  assert.ok(!current.has('agua'));
  assert.ok(nextDay.has('agua'));
  assert.ok(!earlier.has('las'));
});

test('unscoped authoring falls back to its lesson, invalid positions add no guessed words', () => {
  assert.deepEqual(readerSightWordPosition('M2.L18', null), { moduleNumber: 2, lessonNumber: 18 });
  assert.deepEqual(readerSightWordPosition('M2.L18', config(0, 1)), { moduleNumber: 2, lessonNumber: 18 });
  assert.equal(knownWordsForReader(null).size, 0);
  assert.equal(knownWordsForReader('invalid').size, 0);
});

test('reader refreshes class position and uses the shared exact HFW authority', () => {
  const hook = fs.readFileSync(new URL('../src/hooks/useKnownSightWords.js', import.meta.url), 'utf8');
  assert.match(hook, /book-highlight-class-position/);
  assert.match(hook, /Array\.isArray\(response\)/);
  assert.match(hook, /refetchInterval: 60 \* 1000/);
  assert.match(hook, /refetchOnWindowFocus: true/);
  assert.doesNotMatch(hook, /fetchLessons|SIGHT_WORDS_EASY|TOTAL_CURRICULUM_LESSONS/);
  const reader = fs.readFileSync(new URL('../src/components/book/ComparisonReader.jsx', import.meta.url), 'utf8');
  assert.match(reader, /useKnownSightWords\(lessonKey, className\)/);
  const teacher = fs.readFileSync(new URL('../src/pages/TeacherView.jsx', import.meta.url), 'utf8');
  assert.match(teacher, /lessonKey=\{comparing\.lessonKey\}\s+className=\{activeClass\}/);
});
