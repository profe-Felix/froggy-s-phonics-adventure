import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MEETING_STATUS_KEYS, nextMeetingStatus } from '../src/lib/conferenceMeetingStatus.mjs';

const source = readFileSync(new URL('../base44/functions/manageConferenceSlot/entry.ts', import.meta.url), 'utf8');
const schema = JSON.parse(readFileSync(new URL('../base44/entities/ConferenceSlot.jsonc', import.meta.url), 'utf8'));

function fixture() {
  const updates = [];
  const slot = {
    id: 'test-slot', status: 'booked', meeting_status: 'rescheduled',
    parent_name: 'Test parent', student_name: 'Test student',
    date: '2099-01-01', start_minutes: 840,
  };
  const svc = { entities: { ConferenceSlot: {
    get: async () => slot,
    update: async (id, data) => { updates.push({ id, data }); },
  } } };
  const fn = new Function('createClientFromRequest', 'waitUntil', 'syncSlotToSheet',
    source.replace(/^import .*;$/gm, '').replace('export default', 'return')
  )(() => ({ asServiceRole: svc }), () => {}, async () => {});
  return {
    updates,
    invoke: body => fn(new Request('https://example.test/manageConferenceSlot', {
      method: 'POST', body: JSON.stringify({ slot_id: slot.id, ...body }),
    })),
  };
}

test('status button cycles through rescheduled and back to scheduled', () => {
  assert.deepEqual(MEETING_STATUS_KEYS.map(nextMeetingStatus), ['completed', 'missed', 'rescheduled', 'scheduled']);
  assert.equal(nextMeetingStatus(), 'completed');
  assert.equal(nextMeetingStatus('unknown'), 'scheduled');
  assert.deepEqual(schema.properties.meeting_status.enum, MEETING_STATUS_KEYS);
});

test('backend accepts each status while preserving booking, names, date and time', async () => {
  for (const status of MEETING_STATUS_KEYS) {
    const f = fixture();
    const response = await f.invoke({ action: 'set_meeting_status', meeting_status: status });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.deepEqual(f.updates, [{ id: 'test-slot', data: { meeting_status: status } }]);
  }
});

test('invalid status is rejected without writing to the appointment', async () => {
  const f = fixture();
  assert.equal((await f.invoke({ action: 'set_meeting_status', meeting_status: 'invalid' })).status, 400);
  assert.deepEqual(f.updates, []);
});

test('reopening a booking clears the old outcome so the next family starts scheduled', async () => {
  const f = fixture();
  assert.equal((await f.invoke({ action: 'cancel' })).status, 200);
  assert.equal(f.updates[0].data.status, 'open');
  assert.equal(f.updates[0].data.meeting_status, 'scheduled');
});
