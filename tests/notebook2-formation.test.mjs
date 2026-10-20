import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildFormationTimeline } from "../src/lib/notebook2/formationReplay.js";
import { replayFrame, materializeDrawing } from "../src/lib/external-notebook/ink-model.js";

const stroke = (id, times = [0, 20, 40]) => ({
  id, page: 1, kind: "stroke",
  stroke: { id, color: "#0000ff", tool: "pen", width: 0.005,
    points: times.map((t, i) => ({ x: i * 0.4, y: i * 0.3, ...(t == null ? {} : { t }) })) },
  recording: { recordedAt: 100, action: "stroke", writerId: "test-device" },
});
const events = ops => ops.map((operation, i) => ({ revision: i + 1, operation }));

test("short strokes draw continuously on the inspection clock rather than appearing whole", () => {
  const timeline = buildFormationTimeline(events([stroke("a")]));
  const entry = timeline[0];
  assert.equal(entry.end - entry.start, 900);
  const early = replayFrame(timeline, entry.start + 225).strokes[0];
  const half = replayFrame(timeline, entry.start + 450).strokes[0];
  const late = replayFrame(timeline, entry.start + 675).strokes[0];
  assert.equal(early.points.at(-1).x, 0.2);
  assert.equal(half.points.at(-1).x, 0.4);
  assert.ok(Math.abs(late.points.at(-1).x - 0.6) < 1e-8);
});

test("one-stroke slider positions remain inspectable even with a long page history", () => {
  const timeline = buildFormationTimeline(events(Array.from({ length: 300 }, (_, i) => stroke(`s${i}`))));
  const entry = timeline[150], time = entry.start + 450;
  const frame = replayFrame(timeline, time);
  assert.equal(frame.strokes.length, 151);
  assert.equal(frame.strokes.at(-1).points.at(-1).x, 0.4);
  assert.equal(entry.end - entry.start, 900);
});

test("older untimed and zero-clock strokes are interpolated and input history is never mutated", () => {
  for (const times of [[null, null, null], [0, 0, 0]]) {
    const source = events([stroke("old", times)]), before = JSON.stringify(source);
    const timeline = buildFormationTimeline(source);
    const frame = replayFrame(timeline, timeline[0].start + 450);
    assert.equal(frame.strokes[0].points.at(-1).x, 0.4);
    assert.equal(JSON.stringify(source), before);
    if (times[0] == null) assert.equal(timeline[0].approximate, true);
  }
});

test("measured long gestures retain relative timing while idle pauses are shortened", () => {
  const a = stroke("a", [0, 1000, 3000]), b = stroke("b");
  b.recording.recordedAt = 50000;
  const timeline = buildFormationTimeline(events([a, b]));
  assert.equal(timeline[0].end - timeline[0].start, 3000);
  assert.ok(timeline[1].start - timeline[0].end <= 120);
  assert.equal(timeline[0].operation.stroke.points[1].t, 1000);
});

test("erasures, clears and undo/redo retain their original final result and color", () => {
  const operations = [
    stroke("a"), stroke("b"),
    { id: "erase", page: 1, kind: "erase", targetId: "a" },
    { id: "undo", page: 1, kind: "undo", targetIds: ["erase"] },
    { id: "redo", page: 1, kind: "redo", targetIds: ["erase"] },
    { id: "cut", page: 1, kind: "pixelErase",
      erasePath: { id: "cut", width: 0.03, targetIds: ["b"],
        points: [{ x: 0, y: 0, t: 0 }, { x: 0.4, y: 0.3, t: 50 }] } },
  ];
  const timeline = buildFormationTimeline(events(operations));
  const final = replayFrame(timeline, timeline.at(-1).end).strokes;
  const expected = materializeDrawing(operations);
  const untimed = data => JSON.parse(JSON.stringify(data), (key, value) => key === "t" ? undefined : value);
  assert.deepEqual(untimed(final), untimed(expected));
  assert.equal(final[0].color, "#0000ff");
});

test("formation changes are opt-in for the new dashboard, and V2 palette stays inside its overlay", () => {
  const read = file => fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  assert.match(read("lib/external-notebook/dashboard-preview-runtime.jsx"), /NotebookTeacherView[^>]*formation/);
  assert.match(read("lib/external-notebook/NotebookTeacherView.jsx"), /formation = false/);
  assert.match(read("lib/external-notebook/NotebookToolbar.jsx"), /closest\("\[data-notebook-palette-root\]"\) \|\| document.body/);
  assert.match(read("components/notebook2/NativeStudentSurface.jsx"), /data-notebook-palette-root/);
  const native = read("components/notebook2/NativeThumbnail.jsx");
  assert.doesNotMatch(native, /setInterval/);
  assert.match(native, /requestAnimationFrame/);
  assert.match(native, /FormationControls timeline=/);
});
