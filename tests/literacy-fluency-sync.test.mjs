import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fluencyScope, matchingFluency, latestFluencyWriter } from '../src/lib/literacy/fluencySync.mjs';

const step = { mode: 'fluency', config: { preset: 'letters' } };
const preset = { id: 'letters', rows: 5, cols: 6, content: ['a', 'e', 'i'] };
const tick = () => new Promise(resolve => setImmediate(resolve));
const source = path => readFile(new URL('../src/' + path, import.meta.url), 'utf8');

test('students accept the actual teacher preset and seed only for their current lesson step', () => {
  const state = { type: 'fluency', scope: fluencyScope(step, 1), seed: 42, preset };
  assert.equal(matchingFluency(state, step, 1), true);
  assert.equal(matchingFluency(state, step, 2), false);
  assert.equal(matchingFluency(state, { mode: 'fluency', config: { preset: 'other' } }, 1), false);
  assert.equal(matchingFluency({ ...state, type: 'counting' }, step, 1), false);
  assert.equal(matchingFluency({ ...state, preset: { ...preset, content: [] } }, step, 1), false);
  assert.equal(matchingFluency({ ...state, preset: { ...preset, cols: 0 } }, step, 1), false);
});

test('rapid teacher clicks serialize writes and preserve the final selected box', async () => {
  const requests = [], releases = [];
  const writer = latestFluencyWriter(value => new Promise(resolve => {
    requests.push(value); releases.push(resolve);
  }));
  writer.enqueue({ active_cell: 1 });
  writer.enqueue({ active_cell: 2 });
  writer.enqueue({ active_cell: 7 });
  assert.deepEqual(requests, [{ active_cell: 1 }]);
  assert.equal(writer.isPending(), true);
  releases.shift()(); await tick();
  assert.deepEqual(requests, [{ active_cell: 1 }, { active_cell: 7 }]);
  releases.shift()(); await tick();
  assert.equal(writer.isPending(), false);
});

test('sync failures surface and a subsequent retry can persist the newest selection', async () => {
  const errors = [], saved = [];
  let failed = true;
  const writer = latestFluencyWriter(async value => {
    if (failed) { failed = false; throw new Error('offline'); }
    saved.push(value);
  }, error => errors.push(error?.message || null));
  writer.enqueue(3); await tick();
  assert.deepEqual(errors, ['offline']);
  writer.enqueue(7); await tick();
  assert.deepEqual(saved, [7]);
  assert.deepEqual(errors, ['offline', null]);
});

test('the original randomized grid has controlled box selection and read-only student mirroring', async () => {
  const grid = await source('components/workstations/FluencyGrid.jsx');
  assert.match(grid, /seededShuffle\(content, s\+\+\)/);
  assert.match(grid, /onSelectCell\(index\)/);
  assert.match(grid, /if \(!interactive\) return/);
  assert.match(grid, /sweepStartAt \? sweepIdx : selected/);
  const model = await source('components/live/FluencyLessonTable.jsx');
  assert.match(model, /broadcast_state: state/);
  assert.match(model, /interactive=\{false\}/);
  assert.match(model, /matchingFluency\(state, step, stepIndex\)/);
  assert.match(model, /useLiveBroadcast\(liveSession.id/);
});

test('both watch and released lesson steps mirror fluency while solo recordings are preserved', async () => {
  const teacher = await source('components/live/TeacherModelPanel.jsx');
  const mirror = await source('components/live/StudentMirrorPanel.jsx');
  const configured = await source('components/lesson/LessonConfiguredActivity.jsx');
  assert.match(teacher, /step\?\.mode === 'fluency'/);
  assert.match(teacher, /sessionId=\{liveSessionId\}/);
  assert.match(mirror, /FluencyLessonMirror/);
  assert.match(configured, /stepIndex === \(liveSession.current_step \?\? 0\)/);
  assert.match(configured, /FluencyLessonStudent/);
  assert.match(configured, /FluencyPracticeStep onComplete/);
  const table = await source('pages/workstations/FluencyTable.jsx');
  assert.match(table, /activeCell=\{session.active_cell \?\? 0\}/);
  assert.match(table, /interactive=\{isTeacher\}/);
  assert.match(table, /active_cell: index, sweep_start_at: ''/);
  assert.match(table, /preset_data: next/);
});

test('daily content uses the original table page and widget, not a separate replacement chart', async () => {
  const page = await source('pages/DailyFluency.jsx');
  assert.match(page, /Navigate replace to=\{`\/FluencyTable/);
  assert.match(page, /<FluencyGrid/);
  assert.doesNotMatch(page, /Elemento actual/);
  assert.match(page, /setSeed\(Date.now\(\)\)/);
  const stations = await source('pages/Workstations.jsx');
  assert.doesNotMatch(stations, /id: 'dailyfluency'/);
});
