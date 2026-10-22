import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TOTAL, REQUIRED, makeQuestions, answerCorrect, summarize, validateConfig,
  grandfathered, validateScope } from '../base44/functions/buildingPractice/model.js';
import { catalogFor } from '../base44/functions/buildingPractice/catalog.js';
import { buildFamilyActivityPlan, familyCompletedIndexes, saveFamilyCompletion } from '../src/lib/literacy/familyActivityPlan.mjs';
import { syllabifyEs } from '../src/lib/lettersort/phonics.js';
import * as bundled from '../base44/functions/buildingPractice/curriculum.generated.js';
import * as canonical from '../src/lib/literacy/buildingCurriculumSource.mjs';
const questions = () => makeQuestions([{ text: 'el' }, { text: 'la' }], 'sight_words', syllabifyEs, () => .4);
const right = q => {
  const pieces = [...q.text]; const used = new Set();
  return pieces.map(value => { const tile = q.tiles.find(t => t.value === value && !used.has(t.id)); used.add(tile.id); return tile.id; });
};
const event = (index, ids, sequence, extra = {}) => ({ id: `id${String(sequence).padStart(4, '0')}`,
  created_date: `2026-10-23T12:00:${String(sequence).padStart(2, '0')}.000Z`, request_id: `req-${sequence}`,
  item_index: index, event_type: 'answer', answer_data: JSON.stringify(ids), ...extra });
test('exact mastery rule is 18 first-try answers out of 20, never an 18-item shortcut', () => {
  assert.equal(TOTAL, 20); assert.equal(REQUIRED, 18);
  const qs = questions(), events = [];
  qs.forEach((q, i) => {
    if (i < 2) events.push(event(i, [], i * 2));
    events.push(event(i, right(q), i * 2 + 1));
  });
  const state = summarize(qs, events);
  assert.equal(state.correctFirst, 18); assert.equal(state.answered, 20); assert.equal(state.passed, true);
  assert.equal(summarize(qs, events.filter(e => e.item_index !== 19)).passed, false);
});
test('the Base44-local bundle matches canonical introductions and phonics for every curriculum lesson', () => {
  for (let moduleNumber = 1; moduleNumber <= 9; moduleNumber++) for (let lessonNumber = 1; lessonNumber <= 20; lessonNumber++) {
    const p = { moduleNumber, lessonNumber };
    assert.deepEqual(bundled.knownSightWordsAt(p), canonical.knownSightWordsAt(p));
    assert.deepEqual(bundled.getIntroducedGraphemesThrough(p), canonical.getIntroducedGraphemesThrough(p));
    assert.equal(bundled.hasIntroducedConsonant(p), canonical.hasIntroducedConsonant(p));
  }
  for (const text of ['silbato', 'oso', 'hormiga', 'mesa', 'está'])
    assert.deepEqual(bundled.syllabifyEs(text), canonical.syllabifyEs(text));
});
test('wrong first submissions, hints, duplicate retries and concurrent answer ordering cannot inflate accuracy', () => {
  const qs = questions(), events = [event(0, [], 0), event(0, right(qs[0]), 1),
    event(1, [], 2, { event_type: 'hint' }), event(1, right(qs[1]), 3)];
  for (let i = 2; i < 20; i++) events.push(event(i, right(qs[i]), i + 2));
  const state = summarize(qs, [...events].reverse().concat(events));
  assert.equal(state.correctFirst, 18); assert.equal(state.passed, true);
  assert.equal(state.states[0].tries, 2); assert.equal(state.states[1].hinted, true);
  events.push(event(2, [], 30, { event_type: 'hint' }));
  assert.equal(summarize(qs, events).correctFirst, 18, 'late review hints do not revoke solved first tries');
});
test('17/20 requires another round even after every mistake was corrected', () => {
  const qs = questions(), events = [];
  qs.forEach((q, i) => {
    if (i < 3) events.push(event(i, [], i * 2));
    events.push(event(i, right(q), i * 2 + 1));
  });
  assert.equal(summarize(qs, events).needsPractice, true);
  assert.equal(summarize(qs, events).passed, false);
  assert.throws(() => answerCorrect(qs[0], ['p0', 'p0']));
  assert.throws(() => answerCorrect(qs[0], ['invented-tile']));
});
test('rounds are balanced, shuffled and use letter, syllable and word units without dropping accents', () => {
  const qs = questions(); assert.equal(qs.length, 20);
  assert.equal(qs.filter(q => q.text === 'el').length, 10);
  const word = makeQuestions([{ text: 'silbato' }], 'words', syllabifyEs)[0];
  assert.equal(word.unit, 'syllable'); assert.deepEqual(word.tiles.filter(t => t.id.startsWith('p')).map(t => t.value).sort(), ['ba','sil','to'].sort());
  const phrase = makeQuestions([{ text: 'está en la mesa', imageUrl: 'https://example.org/mesa.jpg' }], 'phrases', syllabifyEs)[0];
  assert.equal(phrase.unit, 'word');
  const ids = ['está', 'en', 'la', 'mesa'].map(value => phrase.tiles.find(t => t.value === value).id);
  assert.equal(answerCorrect(phrase, ids), true); assert.equal(answerCorrect(phrase, [...ids].reverse()), false);
});
test('curriculum excludes early syllables and future HFW; phrase images and Spanish text are validated', () => {
  const early = catalogFor({ lesson_number: 1 });
  assert.deepEqual(early.requiredKinds, ['sight_words']);
  assert.ok(early.pools.sight_words.some(r => r.text === 'el'));
  assert.equal(early.pools.syllables.length, 0);
  const configured = catalogFor({ lesson_number: 1, building_practice_data: JSON.stringify({
    sight_words: ['el', 'está'], phrases: [{ text: 'la hormiga', imageUrl: 'https://example.org/ant.jpg' }] }) });
  assert.deepEqual(configured.pools.sight_words.map(r => r.text), ['el']);
  assert.equal(configured.pools.phrases.length, 0);
  assert.throws(() => validateConfig({ phrases: [{ text: 'el oso' }] }));
  assert.throws(() => validateConfig({ phrases: [{ text: 'el oso', imageUrl: 'javascript:alert(1)' }] }));
  assert.throws(() => validateConfig({ words: ['two words'] }));
});
test('earned levels stay earned and student/class/year scope cannot cross classes', () => {
  assert.equal(grandfathered([{ lesson_id: 'week', completed: true, updated_date: '2026-10-21T00:00:00Z' }], 'week'), true);
  assert.equal(grandfathered([{ lesson_id: 'week', completed: true, updated_date: '2026-10-23T00:00:00Z' }], 'week'), false);
  const student = { id: 'existing', student_number: 29, class_name: 'Felix', school_year: '26-27' };
  assert.equal(validateScope(student, { id: 'level', language: 'es', class_name: 'Felix' }).student_id, 'existing');
  assert.throws(() => validateScope(student, { id: 'level', language: 'es', class_name: 'Valero' }));
});
test('weekly sight-word preparation and building precede all readers, preserving original daily indexes', async () => {
  const lesson = { id: 'level', language: 'es', daily_lessons: [
    { day: 'monday', steps: [{ mode: 'book_reading', title: 'A', config: { bookId: 'bookA' } }] },
    { day: 'tuesday', steps: [{ mode: 'fluency', config: { curriculumContentType: 'sight_words_all' } },
      { mode: 'book_reading', title: 'B', config: { bookId: 'bookB' } }] }] };
  const before = JSON.stringify(lesson);
  const plan = buildFamilyActivityPlan(lesson, 'school', { requiredKinds: ['sight_words'], passedKinds: [] });
  assert.deepEqual(plan.slots.map(s => s.step.mode), ['fluency', 'word_builder', 'book_reading', 'book_reading']);
  assert.equal(plan.slots[2].sources[0].lessonId, 'level:monday');
  assert.equal(plan.slots[2].sources[0].index, 0);
  assert.equal(plan.slots[0].sources[0].index, 0);
  assert.equal(JSON.stringify(lesson), before);
  const week = { id: 'w', lesson_id: 'level', completed_steps: [0,1], completed: false };
  assert.ok(!familyCompletedIndexes(plan, [week], week).includes(1), 'daily completion cannot impersonate building mastery');
  const rows = [week];
  await saveFamilyCompletion({ plan, index: 0, weekId: 'level', read: () => rows,
    ensure: async id => { let row = rows.find(r => r.lesson_id === id); if (!row) { row = {id, lesson_id:id,completed_steps:[]}; rows.push(row); } return row; },
    write: async (row, patch) => Object.assign(row, patch) });
  assert.equal(week.completed, false);
  const passed = { ...plan, passedKinds: ['sight_words'] };
  assert.ok(!familyCompletedIndexes(passed, rows, week).includes(1),
    'a passed round must not prematurely skip Continue and leave the weekly record incomplete');
  await saveFamilyCompletion({ plan: passed, index: 1, weekId: 'level', read: () => rows,
    ensure: async id => { let row = rows.find(r => r.lesson_id === id); if (!row) { row = {id, lesson_id:id,completed_steps:[]}; rows.push(row); } return row; },
    write: async (row, patch) => Object.assign(row, patch) });
  assert.ok(familyCompletedIndexes(passed, rows, week).includes(1));
  assert.equal(week.completed, true, 'Continue persists the weekly completion used by the level map');
  assert.ok(!familyCompletedIndexes(plan, rows, week).includes(1), 'saved UI bits alone never grant mastery');
});
test('only the function writes private mastery; teacher edits retain caller permissions and old notebook files are untouched', async () => {
  const src = await readFile(new URL('../base44/functions/buildingPractice/entry.ts', import.meta.url), 'utf8');
  assert.match(src, /caller\.entities\.Lesson\.update/);
  assert.doesNotMatch(src, /Student\.(create|update)/);
  assert.doesNotMatch(src, /LessonProgress\.(create|update)/);
  assert.match(src, /body\.itemIndex !== state\.cursor/);
  assert.match(src, /previous\.answer_data !== json/);
  assert.match(src, /\[0\] \|\| created/);
  assert.match(src, /events\.push\(createdEvent\)/);
  assert.match(src, /event\.run_id !== runId/);
  assert.match(src, /responseLedger\(Responses, run.id, body.receiptIds\)/);
  assert.match(src, /Saving requires your existing Lesson Editor teacher access/);
  const editor = await readFile(new URL('../src/pages/BuildingPracticeSetup.jsx', import.meta.url), 'utf8');
  assert.match(editor, /if \(!savedSuccessfully\) return/);
  assert.match(editor, /error && !lesson/);
  const router = await readFile(new URL('../src/components/lesson/LessonModeRouter.jsx', import.meta.url), 'utf8');
  assert.match(router, /type: 'server_mastery'/);
  assert.match(router, /!ownsServerMastery && step\?\.mode/);
  for (const entity of ['BuildingPracticeRun', 'BuildingPracticeResponse']) {
    const schema = JSON.parse(await readFile(new URL(`../base44/entities/${entity}.jsonc`, import.meta.url), 'utf8'));
    assert.equal(schema.rls.create.user_condition.role, 'admin');
    assert.equal(schema.rls.update.user_condition.role, 'admin');
  }
});
