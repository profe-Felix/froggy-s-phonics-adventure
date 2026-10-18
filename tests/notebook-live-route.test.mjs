import test from "node:test";
import assert from "node:assert/strict";
import { decideLiveNotebook, slotContextAfterMount } from "../src/lib/external-notebook/live-notebook-route.js";

const config = { schoolYear: "26-27", assignmentId: "A" };
const student = { id: "s4", student_number: 4, class_name: "Felix", school_year: "26-27" };
const steps = [{ mode: "digital_notebook", config: { assignmentId: "A", pageStart: 2, assignmentPageCount: 5 } }, { mode: "video" }];
const lessonSrc = over => ({ id: "L", active: true, class_name: "Felix", school_year: "26-27", lesson_id: "x", current_step: 0, ...over });
const base = over => ({
  link: { kind: "lesson", sourceId: "L", stepIndex: 0 }, className: "Felix", number: 4, config, activeYear: "26-27",
  source: { data: lessonSrc() }, students: { data: [student] }, lesson: { data: {} }, getSteps: () => steps, ...over,
});

test("watch phase is paused, try in stay is writable, page from config", () => {
  const w = decideLiveNotebook(base());
  assert.equal(w.screen, "slot");
  assert.equal(w.context.phase, "watch"); assert.equal(w.context.paused, true); assert.equal(w.context.page, 2);
  const t = decideLiveNotebook(base({ source: { data: lessonSrc({ phase: "try" }) } }));
  assert.equal(t.context.paused, false);
});

test("numberless link shows chooser", () => {
  assert.equal(decideLiveNotebook(base({ number: null })).screen, "chooser");
});

test("step advance, end, assessment mismatch give notices", () => {
  assert.equal(decideLiveNotebook(base({ source: { data: lessonSrc({ current_step: 1 }) } })).screen, "notice");
  assert.equal(decideLiveNotebook(base({ source: { data: lessonSrc({ active: false }) } })).screen, "notice");
  const a = decideLiveNotebook(base({ link: { kind: "assessment", sourceId: "S" },
    source: { data: { id: "S", active: true, class_name: "Felix", school_year: "26-27", assignment_id: "B" } } }));
  assert.equal(a.screen, "notice");
});

test("after mount, notices keep the Slot with the last context inactive", () => {
  const mounted = decideLiveNotebook(base()).context;
  const ended = decideLiveNotebook(base({ source: { data: lessonSrc({ active: false }) } }));
  const ctx = slotContextAfterMount(ended, mounted);
  assert.equal(ctx.active, false); assert.equal(ctx.sourceId, "L"); assert.equal(ctx.stepId, "0");
  assert.equal(slotContextAfterMount(ended, null), null);
  assert.equal(slotContextAfterMount({ screen: "chooser" }, mounted).active, false);
});
