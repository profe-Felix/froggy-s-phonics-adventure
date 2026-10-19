import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mergeLiveSession, markLiveSessionEnded, lessonNotebookTargets } from '../src/lib/liveLessonLifecycle.mjs';
import { savedLessonNotebookControls } from '../base44/shared/externalNotebookLessonPolicy.mjs';

const steps = [
  { mode: 'letter_tracing', config: { targets: ['t'] } },
  { mode: 'digital_notebook', config: { assignmentId: 'A', pageStart: 2 } },
  { mode: 'letter_sort', config: {} },
  { mode: 'digital_notebook', config: { assignmentId: 'B', pageStart: 1 } },
];
const session = { id: 'S', class_name: 'Class', school_year: '26-27', active: true,
  lesson_id: 'L', lesson_day: 'monday', current_step: 0, phase: 'watch', release_mode: 'stay',
  created_date: '2026-10-19T10:00:00.000Z', updated_date: '2026-10-19T10:00:01.000Z' };

test('non-notebook activity does not prepare future notebook assignments', () => {
  assert.deepEqual(lessonNotebookTargets(session, steps), []);
  assert.deepEqual(lessonNotebookTargets({ ...session, active: false }, steps), []);
});
test('notebook controls target the actual notebook index, and close previous notebooks when leaving', () => {
  assert.deepEqual(lessonNotebookTargets({ ...session, current_step: 1 }, steps).map(t => t.index), [1]);
  assert.deepEqual(lessonNotebookTargets({ ...session, current_step: 2 }, steps).map(t => t.index), [1]);
  assert.deepEqual(lessonNotebookTargets(session, steps, new Set([3])).map(t => t.index), [3]);
  assert.deepEqual(lessonNotebookTargets({ ...session, release_mode: 'lesson' }, steps).map(t => t.index), [1, 3]);
});
test('a repeated assignment uses one control request, without affecting unrelated activities', () => {
  const repeated = [...steps, { ...steps[1] }];
  assert.equal(lessonNotebookTargets({ ...session, current_step: 4 }, repeated).length, 2);
});
test('End is terminal despite delayed active heartbeats or partial broadcast events', () => {
  let state = mergeLiveSession(session, { active: false });
  state = mergeLiveSession(state, { ...session, active: true, broadcast_state: { line: 1 } });
  assert.equal(state.active, false);
  assert.equal(mergeLiveSession(state, { current_step: 1 }).active, false);
  assert.equal(mergeLiveSession(session, { phase: 'try' }).active, true);
});
test('exit patches the stale parent cache without altering any other class session', () => {
  const other = { ...session, id: 'OTHER', class_name: 'Other' };
  const records = [session, other];
  const updated = markLiveSessionEnded(records, 'S');
  assert.equal(updated[0].active, false);
  assert.equal(updated[1], other);
  assert.equal(records[0].active, true);
  assert.equal(markLiveSessionEnded(undefined, 'S'), undefined);
});
test('saved server policy deactivates notebooks while teacher works on another activity or ends', () => {
  const args = {
    config: { appId: 'app', className: 'Class', schoolYear: '26-27', assignmentId: 'A' },
    lesson: { id: 'L', daily_lessons: [{ day: 'monday', steps }] },
    assignment: { id: 'A', class_name: 'Class', status: 'active', pdf_page_count: 5 },
    lessonSession: { ...session, current_step: 2 },
  };
  assert.equal(savedLessonNotebookControls(args).status, 'ended');
  assert.equal(savedLessonNotebookControls({ ...args, lessonSession: { ...session, current_step: 1, phase: 'try' } }).status, 'live');
  assert.equal(savedLessonNotebookControls({ ...args, lessonSession: { ...session, current_step: 1, active: false } }).status, 'ended');
});
test('host heartbeat cannot reactivate an ended lesson; confirmed End leaves the deep link', () => {
  const host = fs.readFileSync(new URL('../src/pages/LiveLesson.jsx', import.meta.url), 'utf8');
  const heartbeat = host.slice(host.indexOf('const heartbeat = async'), host.indexOf('// Send one immediately'));
  assert.match(heartbeat, /teacher_heartbeat_at/);
  assert.doesNotMatch(heartbeat, /active:\s*true/);
  assert.match(host, /confirmed\?\.active !== false/);
  assert.match(host, /params\.delete\('session'\)/);
  assert.match(host, /Retry notebook cleanup/);
});
test('student exits atomically without stale-cache re-entry and broadcasts cancel queued writes', () => {
  const parent = fs.readFileSync(new URL('../src/pages/LetterGame.jsx', import.meta.url), 'utf8');
  assert.match(parent, /endedLiveSessions\.has\(s\.id\)/);
  assert.match(parent, /onExit=\{handleLiveSessionExit\}/);
  assert.match(parent, /setQueriesData[\s\S]*markLiveSessionEnded/);
  const broadcast = fs.readFileSync(new URL('../src/hooks/useLiveBroadcast.js', import.meta.url), 'utf8');
  assert.match(broadcast, /return \(\) => \{[\s\S]*clearTimeout\(flushTimerRef\.current\)/);
});
test('server mapping honors the saved day and only accepts an actual notebook step', () => {
  const mapping = fs.readFileSync(new URL('../base44/shared/externalNotebookMapping.mjs', import.meta.url), 'utf8');
  assert.match(mapping, /savedLessonSteps\(lesson, source\?\.lesson_day/);
  assert.match(mapping, /step\?\.mode === "digital_notebook"/);
  const client = fs.readFileSync(new URL('../src/lib/external-notebook/client.js', import.meta.url), 'utf8');
  assert.match(client, /context\.kind === "lesson" \? \{ stepId: context\.stepId \}/);
});
