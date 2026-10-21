import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { recordingScope, recordingPin, recordingTimeline } from "../base44/functions/nativeNotebookRecording/model.js";
import { recordingFrame } from "../src/lib/notebook2/recordingModel.mjs";

const scope = { className: "Felix", assignmentId: "assignment", schoolYear: "25-26", channel: "ink", number: 3, variant: 2 };
const key = recordingScope(scope, 1);
const stroke = { id: "stroke", color: "#123456", width: 0.004, startedAt: 10000,
  points: [{ x: 0.1, y: 0.2, t: 0 }, { x: 0.3, y: 0.4, t: 100 }, { x: 0.6, y: 0.8, t: 300 }] };
const operation = { id: "op", kind: "stroke", stroke };
const timeline = () => ({ version: 1, scope_key: key, page: 1, duration_ms: 10000,
  baseOperations: [], events: [{ at: 8300, start: 8000, operation }],
  pointer: [{ x: 0.1, y: 0.2, t: 8010, down: true }, { x: 0.8, y: 0.7, t: 8300, down: false }] });

test("native recordings keep version, class, assignment, year, student and page scopes separate", () => {
  for (const patch of [{ variant: 3 }, { className: "Valero" }, { assignmentId: "another" }, { schoolYear: "24-25" }, { number: 4 }])
    assert.notEqual(recordingScope({ ...scope, ...patch }, 1), key);
  for (const patch of [{ variant: 1 }, { number: 31 }, { number: 0 }, { channel: "live" }, { schoolYear: "../" }, { assignmentId: "../" }])
    assert.throws(() => recordingScope({ ...scope, ...patch }, 1));
  assert.throws(() => recordingScope(scope, 0));
  assert.throws(() => recordingTimeline(timeline(), key, 2));
});

test("microphone anchors use finite proportional coordinates, not percentages or off-page values", () => {
  const pin = { pin_id: "0123456789abcdef", x_pct: 0, y_pct: 1 };
  assert.deepEqual(recordingPin(pin), pin);
  for (const patch of [{ x_pct: 50 }, { y_pct: -0.1 }, { x_pct: NaN }, { pin_id: "../" }])
    assert.throws(() => recordingPin({ ...pin, ...patch }));
});

test("replay follows the audio clock including long pauses and partial measured strokes", () => {
  const data = timeline();
  assert.equal(recordingFrame(data, 7999).strokes.length, 0);
  assert.equal(recordingFrame(data, 8000).strokes[0].points.length, 1);
  assert.equal(recordingFrame(data, 8100).strokes[0].points.length, 2);
  assert.equal(recordingFrame(data, 8300).strokes[0].points.length, 3);
  assert.deepEqual(recordingFrame(data, 8100).laser, { x: 0.1, y: 0.2 });
  assert.equal(recordingFrame(data, 8350).laser, null);
});

test("erasures replay at their measured time and never mutate the live ink or stored timeline", () => {
  const data = timeline();
  data.baseOperations = [operation]; data.events = [{ at: 4000, operation: { id: "erase", kind: "erase", targetId: "stroke" } }];
  const before = JSON.stringify(data);
  assert.equal(recordingFrame(data, 3999).strokes.length, 1);
  assert.equal(recordingFrame(data, 4000).strokes.length, 0);
  assert.equal(JSON.stringify(data), before);
});

test("invalid timing and wrong-page timelines fail closed before upload", () => {
  assert.equal(recordingTimeline(timeline(), key, 1).page, 1);
  for (const patch of [{ scope_key: "another" }, { duration_ms: Infinity }, { duration_ms: 0 }, { version: 2 },
    { pointer: [{ x: 0, y: 0, t: -1 }] }, { events: [{ at: -1, operation }] }])
    assert.throws(() => recordingTimeline({ ...timeline(), ...patch }, key, 1));
});

test("V2/V3 share recording controls and teacher replay without changing the stable student view", async () => {
  const read = path => fs.readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const [student, teacher, hook, endpoint, entity] = await Promise.all([
    read("src/components/notebook2/NativeStudentSurface.jsx"), read("src/components/notebook2/NativeThumbnail.jsx"),
    read("src/lib/notebook2/useNativeRecording.js"), read("base44/functions/nativeNotebookRecording/entry.ts"),
    read("base44/entities/NativeNotebookRecording.jsonc"),
  ]);
  assert.match(student, /NativeRecordingTools/); assert.match(teacher, /NativeRecordingTools/);
  assert.match(student, /voiceRef\.current\?\.finish/);
  assert.match(hook, /draftStorage\("put"/); assert.match(hook, /await requestMicrophone\(\)/);
  assert.match(hook, /mounted\.current && latest\.current\.key === key/);
  assert.doesNotMatch(hook, /getDisplayMedia|video:\s*true/);
  assert.match(endpoint, /UploadPrivateFile/); assert.match(endpoint, /CreateFileSignedUrl/);
  assert.doesNotMatch(endpoint, /entities\.NotebookSession|invoke\(["']externalNotebook/);
  assert.equal(JSON.parse(entity).rls.read.user_condition.role, "admin");
});
