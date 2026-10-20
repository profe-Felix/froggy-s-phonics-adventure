import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessmentDisplayKey, checkedDisplay } from '../base44/actors/AssessmentDisplay/model.js';
import { mergeAssessment } from '../src/lib/classroomSync.js';

const source = readFileSync(new URL('../base44/actors/AssessmentDisplay/entry.ts', import.meta.url), 'utf8');
const item = (seq = 1, letter = 'a') => ({
  sync_seq: seq, show_item: true, current_item: letter,
  class_name: 'AssessmentCheck', student_number: 1, student_id: 'test-student',
  item_index: seq - 1, total_items: 20, assessment_type: 'lower_names',
});
function fixture() {
  const packets = [], messages = [], storage = new Map();
  let reads = 0;
  class FakeActor {
    instanceId = 'assessment:test-session';
    storage = {
      get: async key => storage.get(key),
      put: async (key, value) => { storage.set(key, structuredClone(value)); },
    };
    client = { asServiceRole: { entities: { SmallGroupAssessment: {
      get: async () => { reads++; return { status: 'active', broadcast_state: {} }; },
    } } } };
    broadcast(data) { packets.push(data); }
  }
  const ActorClass = new Function('Actor', 'assessmentDisplayKey', 'checkedDisplay',
    source.replace(/^import .*;$/gm, '').replace('export default', 'return')
  )(FakeActor, assessmentDisplayKey, checkedDisplay);
  const actor = new ActorClass();
  const connection = id => ({ id, send: data => messages.push({ id, ...data }) });
  return { actor, packets, messages, storage, connection, reads: () => reads };
}

test('fast display payloads contain no scores/roster and reject invalid or oversized commands', () => {
  const checked = checkedDisplay({ ...item(), results: { private: 'not forwarded' } });
  assert.equal(checked.results, undefined);
  assert.equal(checked.current_item, 'a');
  assert.throws(() => checkedDisplay({ ...item(), current_item: 'x'.repeat(129) }));
  assert.throws(() => checkedDisplay({ ...item(), show_item: true, class_name: '' }));
  assert.throws(() => checkedDisplay({ ...item(), item_index: 30 }));
  assert.throws(() => assessmentDisplayKey('../another-session'));
  assert.equal(assessmentDisplayKey('test-session'), 'assessment:test-session');
});

test('connected students receive the next letter without any per-letter entity read/write', async () => {
  const f = fixture();
  await f.actor.handleStart();
  const teacher = f.connection('teacher'), student = f.connection('student');
  await f.actor.handleMessage(teacher, { type: 'join', role: 'teacher', sessionId: 'test-session' });
  await f.actor.handleMessage(student, { type: 'join', role: 'student', sessionId: 'test-session' });
  for (const [seq, letter] of [[1, 'a'], [2, 'b'], [3, 'c']]) {
    await f.actor.handleMessage(teacher, { type: 'display', broadcast_state: item(seq, letter) });
  }
  assert.equal(f.reads(), 1);
  assert.deepEqual(f.packets.map(p => p.broadcast_state.current_item), ['a', 'b', 'c']);
});

test('stale/repeated packets never regress the letter and late joiners get the latest snapshot', async () => {
  const f = fixture(), teacher = f.connection('teacher');
  await f.actor.handleStart();
  await f.actor.handleMessage(teacher, { type: 'join', role: 'teacher', sessionId: 'test-session' });
  await f.actor.handleMessage(teacher, { type: 'display', broadcast_state: item(3, 'c') });
  await f.actor.handleMessage(teacher, { type: 'display', broadcast_state: item(2, 'b') });
  await f.actor.handleMessage(f.connection('late'), { type: 'join', role: 'student', sessionId: 'test-session' });
  assert.equal(f.packets.length, 1);
  assert.equal(f.messages.at(-1).broadcast_state.current_item, 'c');
});

test('students and other assessment scopes cannot change the live letter', async () => {
  const f = fixture(), student = f.connection('student');
  await f.actor.handleStart();
  await f.actor.handleMessage(student, { type: 'join', role: 'student', sessionId: 'test-session' });
  await f.actor.handleMessage(student, { type: 'display', broadcast_state: item() });
  await f.actor.handleMessage(f.connection('wrong'), { type: 'join', role: 'teacher', sessionId: 'different' });
  assert.equal(f.packets.length, 0);
  assert.equal(f.messages.at(-1).type, 'error');
});

test('hibernation preserves display state and subscriber roles without persisting assessment results', async () => {
  const f = fixture(), teacher = f.connection('teacher');
  await f.actor.handleStart();
  await f.actor.handleMessage(teacher, { type: 'join', role: 'teacher', sessionId: 'test-session' });
  await f.actor.handleMessage(teacher, { type: 'display', broadcast_state: item(2, 'b') });
  const restarted = new f.actor.constructor();
  await restarted.handleStart();
  await restarted.handleMessage(f.connection('late'), { type: 'join', role: 'student', sessionId: 'test-session' });
  assert.equal(f.messages.at(-1).broadcast_state.current_item, 'b');
  await restarted.handleMessage(teacher, { type: 'display', broadcast_state: item(3, 'c') });
  assert.equal(f.packets.at(-1).broadcast_state.current_item, 'c');
  assert.deepEqual([...f.storage.keys()].sort(), ['display', 'roles']);
});

test('older entity recovery cannot override a fast item or revive a completed session', () => {
  const current = { id: 's', status: 'active', broadcast_state: item(3, 'c') };
  assert.equal(mergeAssessment(current, { id: 's', broadcast_state: item(2, 'b') }).broadcast_state.current_item, 'c');
  const ended = mergeAssessment(current, { id: 's', status: 'completed', broadcast_state: {} });
  assert.equal(mergeAssessment(ended, current).status, 'completed');
});
