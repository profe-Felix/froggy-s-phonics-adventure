import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { nativeStepKey, stepLiveState } from '../src/lib/notebook2/lessonStep.mjs';
import { recoverNativeLive } from '../src/lib/notebook2/model.mjs';

const scope = { className: 'Felix', assignmentId: 'a', schoolYear: '26-27', variant: 3, pageCount: 206 };
const row = { class_name: 'Felix', assignment_id: 'a', school_year: '26-27', variant: 3,
  session_id: 'session', active: true, students: [14], page: 15, started_at: 1 };
test('V3 restores its existing announced room but never revives ended/other-class/other-version sessions', () => {
  const recovered = recoverNativeLive([row], scope);
  assert.equal(recovered.id, 'session');
  assert.equal(recovered.page, 15);
  assert.equal(recovered.canWrite, false); // old announcement has no confirmed writing lock
  assert.equal(recoverNativeLive([row], scope, ['session']), null);
  assert.equal(recoverNativeLive([row], { ...scope, variant: 2 }), null);
  assert.equal(recoverNativeLive([row], { ...scope, className: 'Valero' }), null);
  assert.equal(recoverNativeLive([{ ...row, active: false }], scope), null);
});
test('recovery retains acknowledged follow/write controls, not an unrelated snapshot', () => {
  const confirmed_control = { id: 'session', page: 65, follow: false, canWrite: true, students: [99] };
  const recovered = recoverNativeLive([{ ...row, confirmed_control }], scope);
  assert.equal(recovered.page, 65);
  assert.equal(recovered.follow, false);
  assert.equal(recovered.canWrite, true);
  assert.deepEqual(recovered.students, [14]);
  assert.equal(recoverNativeLive([{ ...row, confirmed_control: { ...confirmed_control, id: 'other' } }], scope).canWrite, false);
});
test('consecutive notebook steps with the same assignment initialize the configured worksheet', () => {
  const base = { variant: 2, className: 'Felix', id: 'a', number: 14, schoolYear: '26-27', config: { pageStart: 64 } };
  assert.notEqual(nativeStepKey(base), nativeStepKey({ ...base, config: { pageStart: 65 } }));
  assert.notEqual(nativeStepKey(base), nativeStepKey({ ...base, stepIndex: 2 }));
  assert.notEqual(nativeStepKey(base), nativeStepKey({ ...base, schoolYear: '98-99' }));
});
test('independent steps ignore ended rooms and parent live steps retain lock/release rules', () => {
  const selected = { page: 65, allowedPages: [65] };
  const ended = { id: 'old', active: false, ended: true };
  assert.equal(stepLiveState(ended, null, 14, selected), null);
  const parent = { id: 'lesson', active: true, phase: 'watch', target_students: [14] };
  assert.equal(stepLiveState(null, parent, 14, selected).canWrite, false);
  assert.equal(stepLiveState(null, { ...parent, phase: 'try' }, 14, selected).canWrite, true);
  assert.equal(stepLiveState(null, { ...parent, phase: 'try' }, 15, selected).active, false);
  assert.equal(stepLiveState(null, { ...parent, active: false }, 14, selected).canWrite, false);
});
test('missing live controls cannot indefinitely hide a prepared V3 worksheet', async () => {
  const source = await readFile(new URL('../src/components/notebook2/NativeAdmissionBridge.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /loading \|\| !live.live \?/);
  assert.match(source, /Retry live controls/);
  assert.match(source, /readOnly=\{!!exiting \|\| !live.live\}/);
});

test('V2/V3 teacher lesson steps render their dashboard directly, never in a blocked Base44 frame', async () => {
  const parent = await readFile(new URL('../src/pages/LiveLesson.jsx', import.meta.url), 'utf8');
  assert.match(parent, /<NotebookLessonTeacher step=\{currentStep\}/);
  assert.match(parent, /dashboard=\{showDashboard\}/);
  assert.doesNotMatch(parent, /<iframe title="Base44-only notebook teacher controls"/);
  const native = await readFile(new URL('../src/pages/LiveLesson2.jsx', import.meta.url), 'utf8');
  assert.match(native, /export function NotebookLessonTeacher/);
  assert.match(native, /targetStudents=\{session.target_students\}/);
  assert.match(native, /school_year: schoolYear/);
  assert.match(native, /dashboard \? "Student work" : "Worksheet"/);
  assert.match(native, /<NativeThumbnail/);
});
