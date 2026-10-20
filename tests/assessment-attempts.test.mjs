import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createAttemptStore, attemptPayload, compareAttempts, mergeStudentHistory, readAll } from '../src/lib/assessmentAttempts.mjs';

const session = { id: 'session', school_year: 'test', teacher_name: 'Test', block: 'A', color_group: 'red', started_at: '2026-01-01T00:00:00Z' };
const result = (id, extras = {}) => ({
  _attempt_id: id, _started_at: '2026-01-02T00:00:00Z', _language: 'es',
  item_order: ['a', 'b', 'c'], correct: ['a'], incorrect: ['b'], completed: true,
  ...extras,
});
function setup(sharedStorage) {
  const values = sharedStorage || new Map(), rows = new Map(), writes = [], statuses = [];
  const storage = { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const entity = {
    filter: async q => [...rows.values()].filter(r => r.attempt_key === q.attempt_key),
    create: async payload => { const row = { ...structuredClone(payload), id: `row${rows.size}` }; rows.set(row.id, row); writes.push(row); return row; },
    update: async (id, payload) => { const row = { ...structuredClone(payload), id }; rows.set(id, row); writes.push(row); return row; },
  };
  const store = createAttemptStore({ entity, storage, scope: 'test', onStatus: s => statuses.push(s) });
  return { store, entity, storage, values, rows, writes, statuses };
}

test('one changed student attempt per write, not whole session; unchanged students skipped', async () => {
  const f = setup();
  f.store.stage(session, { one: { lower_names: result('one') }, two: { lower_names: result('two') } });
  assert.equal(await f.store.flush(), true);
  f.store.stage(session, { one: { lower_names: result('one', { correct: ['a', 'c'] }) }, two: { lower_names: result('two') } });
  await f.store.flush();
  assert.equal(f.writes.length, 3);
  assert.equal(f.writes[2].student_id, 'one');
  assert.equal(f.writes[2].results, undefined);
  assert.equal(f.values.size, 0);
});

test('same-session reassessment keeps both attempts, notes, recording metadata and language', async () => {
  const f = setup();
  const old = result('first', { notes: { 0: 'note' }, recording_url: 'private-reference', recording_timeline: [{ item: 'a', marked_at: 1 }] });
  f.store.stage(session, { one: { sight_words: old } });
  f.store.stage(session, { one: { sight_words: result('second') } });
  await f.store.flush();
  assert.equal(f.rows.size, 2);
  assert.deepEqual(f.writes[0].result, old);
  assert.equal(f.writes[0].language, 'es');
  const history = mergeStudentHistory('one', [], [...f.rows.values()]);
  assert.equal(history.length, 2);
  assert.equal(history.find(r => r.id === 'first').recording_url, 'private-reference');
});

test('snapshot is immutable and late marks during a slow save are not lost', async () => {
  const f = setup();
  let release;
  const originalCreate = f.entity.create;
  f.entity.create = async p => { await new Promise(r => { release = r; }); return originalCreate(p); };
  const first = result('first', { correct: ['a'] });
  f.store.stage(session, { one: { lower_names: first } });
  const saving = f.store.flush();
  await new Promise(r => setImmediate(r));
  first.correct.push('SHOULD NOT APPEAR');
  f.store.stage(session, { one: { lower_names: result('first', { correct: ['a', 'c'] }) } });
  release();
  assert.equal(await saving, true);
  assert.equal(f.writes.length, 2);
  assert.deepEqual(f.writes[0].result.correct, ['a']);
  assert.deepEqual(f.writes[1].result.correct, ['a', 'c']);
});

test('failed save is visible, survives reload, retries ambiguously created row without duplication', async () => {
  const f = setup(), create = f.entity.create;
  f.entity.create = async p => { await create(p); throw new Error('response lost'); };
  f.store.stage(session, { one: { lower_names: result('first') } });
  assert.equal(await f.store.flush(), false);
  assert.ok(f.statuses.at(-1).error);
  assert.ok(f.values.size);
  f.store.dispose();
  const recovered = createAttemptStore({ entity: f.entity, storage: f.storage, scope: 'test' });
  assert.equal(recovered.snapshots('session').length, 1);
  assert.equal(await recovered.flush(), true);
  assert.equal(f.rows.size, 1);
  assert.equal(f.values.size, 0);
  // Empty flush must not leave a settled promise blocking future work.
  await recovered.flush();
  recovered.stage(session, { one: { lower_names: result('second') } });
  f.entity.create = create;
  assert.equal(await recovered.flush(), true);
  assert.equal(f.rows.size, 2);
});

test('read-only legacy merge deduplicates imported attempts and retains cross-group attempts', () => {
  const legacyResult = result(undefined);
  const old = { ...session, results: { one: { lower_names: legacyResult } } };
  const copy = structuredClone(old);
  const imported = attemptPayload(session, 'one', 'lower_names', legacyResult);
  const moved = attemptPayload({ ...session, id: 'other', color_group: 'blue' }, 'one', 'lower_names', result('new'));
  const history = mergeStudentHistory('one', [old], [imported, moved, moved]);
  assert.equal(history.length, 2);
  assert.deepEqual(old, copy);
  assert.equal(history.find(r => r.id === 'new').color_group, 'blue');
});

test('compare shared scored items; untested is not wrong; types and languages never mix', () => {
  const a = { ...result('a'), type: 'lower_names', correct: ['a'], incorrect: ['b'] };
  const b = { ...result('b'), type: 'lower_names', correct: ['b'], incorrect: ['a'] };
  const c = compareAttempts(a, b);
  assert.equal(c.shared, 2);
  assert.deepEqual(c.improved.map(i => i.item), ['b']);
  assert.deepEqual(c.regressed.map(i => i.item), ['a']);
  assert.deepEqual(c.notTested.map(i => i.item), ['c']);
  assert.equal(c.beforeAccuracy, 50);
  assert.equal(compareAttempts(a, { ...b, type: 'lower_sounds' }).incompatible, true);
  assert.equal(compareAttempts({ ...a, language: 'es' }, { ...b, language: 'en' }).incompatible, true);
});

test('decoding compares level+item, not equal percentages from different difficulty', () => {
  const a = { type: 'decoding', levels: { CV: { item_order: ['ta', 'te'], correct: ['ta'], incorrect: ['te'] } } };
  const b = { type: 'decoding', levels: { CV: { correct: ['ta', 'te'] }, CVC: { incorrect: ['ta'] } } };
  const c = compareAttempts(a, b);
  assert.equal(c.shared, 2);
  assert.equal(c.improved[0].level, 'CV');
  assert.equal(c.notTested[0].level, 'CVC');
  assert.equal(c.beforeAccuracy, 50);
  assert.equal(c.afterAccuracy, 100);
});

test('history pagination reaches old records beyond 50 and 200', async () => {
  const data = Array.from({ length: 451 }, (_, id) => ({ id }));
  const calls = [];
  const rows = await readAll({ filter: async (q, sort, limit, skip) => { calls.push(skip); return data.slice(skip, skip + limit); } }, {});
  assert.equal(rows.length, 451);
  assert.deepEqual(calls, [0, 200, 400]);
});

test('primary scores no longer rewrite session result maps; session end waits for saved attempts', async () => {
  const source = await fs.readFile(new URL('../src/pages/SmallGroupAssessment.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /SmallGroupAssessment\.update\(session\.id, \{ results:/);
  assert.match(source, /if \(!await flushResults\(\)\) return;/);
  assert.match(source, /_attempt_id: crypto\.randomUUID\(\)/);
  assert.match(source, /history=\{fullHistory/);
  assert.match(source, /readAll\(base44\.entities\.SmallGroupAssessment, \{ school_year: ACTIVE_SCHOOL_YEAR \}\)/);
});
