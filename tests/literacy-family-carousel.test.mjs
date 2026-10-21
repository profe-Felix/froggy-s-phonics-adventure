import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildFamilyActivityPlan, familyActivitySignature, familyCompletedIndexes,
  familyLevelTitle, isFamilyPath, saveFamilyCompletion } from '../src/lib/literacy/familyActivityPlan.mjs';

const fluency = (lesson, type = 'letters') => ({ mode: 'fluency', title: 'Chart',
  config: { curriculumContentType: type,
    curriculumPosition: { module_number: 1, curriculum_lesson_number: lesson } } });
const book = page => ({ mode: 'book_reading', config: { bookId: 'reader', page } });
const week = daily_lessons => ({ id: 'week', language: 'es', lesson_number: 1, daily_lessons });

test('family levels keep all 67 numbers while teachers retain their original weekly identities', async () => {
  for (let n = 1; n <= 67; n++) assert.equal(familyLevelTitle({ lesson_number: n }), `Level ${n}`);
  assert.ok(isFamilyPath(week([])));
  assert.ok(!isFamilyPath({ language: 'en' }));
  assert.ok(!isFamilyPath({ language: 'es', assignment_type: 'guided' }));
  const teacher = await readFile(new URL('../src/components/teacher/TeacherLevelPath.jsx', import.meta.url), 'utf8');
  assert.match(teacher, /pathwayLabel/);
  assert.match(teacher, /pathwayRangeLabel/);
});

test('activities flatten in weekday order and repeated charts collapse without mutating daily lessons', () => {
  const lesson = week([
    { day: 'wednesday', steps: [fluency(3), book(2)] },
    { day: 'monday', steps: [fluency(1), book(1)] },
    { day: 'tuesday', steps: [fluency(2), book(1)] },
  ]);
  const before = JSON.stringify(lesson);
  const plan = buildFamilyActivityPlan(lesson);
  assert.equal(plan.slots.length, 4);
  assert.deepEqual(plan.slots[0].sources.map(s => s.lessonId), ['week:monday', 'week:tuesday']);
  assert.deepEqual(plan.slots[1].sources.map(s => s.index), [1, 1]);
  assert.equal(plan.slots[2].sources[0].lessonId, 'week:wednesday');
  assert.equal(JSON.stringify(lesson), before);
});

test('same HFW chart merges across days, but newly introduced material and changed settings do not', () => {
  assert.equal(familyActivitySignature(fluency(1, 'sight_words_all')),
    familyActivitySignature(fluency(2, 'sight_words_all')));
  assert.notEqual(familyActivitySignature(fluency(1)), familyActivitySignature(fluency(3)));
  assert.notEqual(familyActivitySignature(book(1)), familyActivitySignature(book(2)));
  assert.notEqual(familyActivitySignature({ ...fluency(1), completion: { target: 1 } }),
    familyActivitySignature({ ...fluency(1), completion: { target: 3 } }));
  assert.equal(familyActivitySignature({ ...fluency(1), title: 'Monday' }),
    familyActivitySignature({ ...fluency(1), title: 'Tuesday' }));
});

test('home and school filtering happens before dedup; inactive days and live-only activities never leak', () => {
  const lesson = week([
    { day: 'monday', steps: [book(1), { ...book(2), access_scope: 'school_only' }, { ...book(3), live_scope: 'live_only' }] },
    { day: 'tuesday', active: false, steps: [book(4)] },
  ]);
  assert.equal(buildFamilyActivityPlan(lesson, 'home').slots.length, 1);
  assert.equal(buildFamilyActivityPlan(lesson, 'school').slots.length, 2);
  assert.deepEqual(buildFamilyActivityPlan(lesson, 'home').days[0].required, [0]);
});

function store(plan, initial = []) {
  const rows = [{ id: 'week', lesson_id: 'week', completed_steps: [], completed: false }, ...initial];
  const read = () => rows;
  const ensure = async id => {
    let row = rows.find(r => r.lesson_id === id);
    if (!row) { row = { id, lesson_id: id, completed_steps: [], completed: false }; rows.push(row); }
    return row;
  };
  const write = async (row, data) => Object.assign(row, data);
  return { rows, run: index => saveFamilyCompletion({ plan, index, weekId: 'week', read, ensure, write }),
    read, ensure, write };
}

test('completion credits each duplicate original index, keeps unfinished days locked, and survives reload', async () => {
  const plan = buildFamilyActivityPlan(week([
    { day: 'monday', steps: [fluency(1), book(1)] },
    { day: 'tuesday', steps: [fluency(2), book(2)] },
  ]));
  const state = store(plan);
  await state.run(0);
  assert.deepEqual(state.rows.find(r => r.lesson_id === 'week:monday').completed_steps, [0]);
  assert.deepEqual(state.rows.find(r => r.lesson_id === 'week:tuesday').completed_steps, [0]);
  assert.equal(state.rows[0].completed, false);
  await state.run(1);
  assert.deepEqual(state.rows[0].completed_steps, [0]);
  await state.run(2);
  assert.equal(state.rows[0].completed, true);
  const reloaded = JSON.parse(JSON.stringify(state.rows));
  assert.deepEqual(familyCompletedIndexes(plan, reloaded, reloaded[0]), [0, 1, 2]);
  const before = JSON.stringify(state.rows);
  await state.run(2);
  assert.equal(JSON.stringify(state.rows), before);
});

test('existing daily completion counts and propagates to repeated days without resetting progress or state', async () => {
  const plan = buildFamilyActivityPlan(week([
    { day: 'monday', steps: [fluency(1)] },
    { day: 'tuesday', steps: [fluency(2), book(1)] },
  ]));
  const state = store(plan, [{ id: 'mon', lesson_id: 'week:monday', completed_steps: [0],
    completed: true, activity_state: '{"0":{"preserved":true}}' }]);
  assert.deepEqual(familyCompletedIndexes(plan, state.rows, state.rows[0]), [0]);
  await state.run(1);
  assert.equal(state.rows[0].completed, true);
  assert.equal(state.rows.find(r => r.id === 'mon').activity_state, '{"0":{"preserved":true}}');
  assert.deepEqual(state.rows.find(r => r.lesson_id === 'week:tuesday').completed_steps.sort(), [0, 1]);
});

test('a failed source save never completes the week and is safe to retry after a partial save', async () => {
  const plan = buildFamilyActivityPlan(week([
    { day: 'monday', steps: [book(1)] }, { day: 'tuesday', steps: [book(1)] },
  ]));
  const state = store(plan);
  await assert.rejects(saveFamilyCompletion({ plan, index: 0, weekId: 'week',
    ...state, write: async (row, data) => {
      if (row.lesson_id === 'week:tuesday') throw new Error('offline');
      await state.write(row, data);
    } }), /offline/);
  assert.equal(state.rows[0].completed, false);
  await state.run(0);
  assert.equal(state.rows[0].completed, true);
});

test('flat bonus lessons dedup without changing their original indexes', async () => {
  const plan = buildFamilyActivityPlan({ id: 'week', steps: [book(1), book(1), book(2)] });
  assert.equal(plan.days.length, 0);
  assert.equal(plan.slots.length, 2);
  const state = store(plan);
  await state.run(0);
  assert.deepEqual(state.rows[0].completed_steps, [0, 1]);
  assert.equal(state.rows[0].completed, false);
  await state.run(1);
  assert.equal(state.rows[0].completed, true);
});
