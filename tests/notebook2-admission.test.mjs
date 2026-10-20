import test from "node:test";
import assert from "node:assert/strict";
import { chooseNativeLaunch, matchesNativeLaunch, mergeNativeLaunch } from "../src/lib/notebook2/admissionModel.mjs";
import { nativeScope, normalizeLiveControl } from "../src/lib/notebook2/model.mjs";

const identity = { className: "Felix", schoolYear: "26-27", number: 4 };
const row = { id: "r1", session_id: "session1", assignment_id: "assignment1",
  class_name: "Felix", school_year: "26-27", variant: 2, active: true, students: [4, 8], started_at: 100 };
test("explicit native announcements admit only selected class, year and students", () => {
  assert.equal(matchesNativeLaunch(row, identity), true);
  for (const change of [{ number: 5 }, { className: "Valero" }, { schoolYear: "98-99" }]) {
    assert.equal(matchesNativeLaunch(row, { ...identity, ...change }), false);
  }
  assert.equal(matchesNativeLaunch({ ...row, active: false }, identity), false);
  assert.equal(matchesNativeLaunch({ ...row, variant: 1 }, identity), false);
  assert.equal(chooseNativeLaunch([row], identity)?.id, row.id); // A late entrant gets the active lesson.
});
test("ended native sessions do not re-enter; newer explicit targeted starts win", () => {
  const next = { ...row, id: "r2", session_id: "session2", variant: 3, started_at: 200 };
  assert.equal(chooseNativeLaunch([row, next], identity)?.id, "r2");
  assert.equal(chooseNativeLaunch([row], identity, new Set(["2:session1"])), null);
  const ended = mergeNativeLaunch([row], { id: "r1", data: { active: false } });
  assert.equal(chooseNativeLaunch(ended, identity), null);
  assert.deepEqual(mergeNativeLaunch([row], { id: "r1", type: "delete" }), []);
});
test("V3 ink is isolated from V2 and stable namespaces; follow and writing are independent", () => {
  const scope = { className: "Felix", assignmentId: "a", schoolYear: "26-27", number: 4 };
  assert.match(nativeScope(scope), /^nb2:/);
  assert.match(nativeScope({ ...scope, variant: 3 }), /^nb3:/);
  assert.notEqual(nativeScope(scope), nativeScope({ ...scope, variant: 3 }));
  assert.throws(() => nativeScope({ ...scope, variant: 1 }));
  const control = { id: "test", page: 2, students: [4], engine: "native", follow: false, canWrite: false, pageCommand: "send-once" };
  const state = normalizeLiveControl(control, 4, null);
  assert.equal(state.follow, false); assert.equal(state.canWrite, false); assert.equal(state.pageCommand, "send-once");
});
