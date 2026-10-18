import assert from "node:assert/strict";
import test from "node:test";
import { lessonNotebookPolicy, savedLessonNotebookControls, bootstrapNotebookExtension } from "../base44/shared/externalNotebookLessonPolicy.mjs";
const config = { appId: "app", className: "Class", schoolYear: "26-27", assignmentId: "assignment" };
const student = { id: "student", class_name: "Class", school_year: "26-27", student_number: 4 };
const assignment = { id: "assignment", class_name: "Class", status: "active", pdf_page_count: 206 };
const session = {
  id: "live", lesson_id: "lesson", lesson_source: "lesson", class_name: "Class",
  school_year: "26-27", current_step: 1, active: true, phase: "try", release_mode: "stay",
  target_students: [], created_date: "2026-10-18T10:00:00.000Z", updated_date: "2026-10-18T10:00:01.000Z",
};
const lesson = { id: "lesson", steps: [
  { mode: "video" },
  { mode: "digital_notebook", config: { assignmentId: "assignment", pageSelection: "custom", customPages: "9,11-12" } },
  { mode: "digital_notebook", config: { assignmentId: "assignment", pageSelection: "single", pageStart: 20 } },
  { mode: "video" },
] };
const policy = changes => lessonNotebookPolicy({ config, lessonSession: session, lesson, assignment, stepId: "1", student, ...changes });
test("lesson grants derive exact pages and student identity from saved records", () => {
  const result = policy();
  assert.equal(result.request.kind, "lesson");
  assert.equal(result.request.stepId, "1");
  assert.equal(result.request.studentId, student.id);
  assert.equal(result.request.canWrite, true);
  assert.deepEqual(result.request.allowedPages, [9, 11, 12]);
  assert.equal(result.controls.lessonStepIndex, 1);
  assert.equal(result.controls.followTeacher, false);
});
test("watch pauses the classroom without revoking eligibility; untargeted or inactive students get recovery only", () => {
  const paused = policy({ lessonSession: { ...session, phase: "watch" } });
  assert.equal(paused.request.canWrite, true);
  assert.equal(paused.controls.status, "paused");
  assert.equal(policy({ lessonSession: { ...session, active: false } }).recoveryOnly, true);
  assert.equal(policy({ lessonSession: { ...session, target_students: [{ class_name: "Class", student_number: 5 }] } }).recoveryOnly, true);
});
test("teacher step floor applies while self-paced students can work ahead", () => {
  assert.equal(policy({ stepId: "2" }).recoveryOnly, true);
  const result = policy({ stepId: "2", lessonSession: { ...session, release_mode: "lesson" } });
  assert.equal(result.recoveryOnly, false);
  assert.deepEqual(result.request.allowedPages, [20]);
  assert.equal(policy({ lessonSession: { ...session, release_mode: "lesson", current_step: 2 } }).recoveryOnly, true);
});
test("leaving a notebook stops it; self-paced release keeps future notebook steps open", () => {
  const controls = savedLessonNotebookControls({ config, lessonSession: { ...session, current_step: 0 }, lesson, assignment });
  assert.equal(controls.status, "ended");
  assert.equal(savedLessonNotebookControls({
    config, lessonSession: { ...session, current_step: 0, release_mode: "lesson" }, lesson, assignment,
  }).status, "live");
  assert.equal(savedLessonNotebookControls({
    config, lessonSession: { ...session, current_step: 3, release_mode: "lesson" }, lesson, assignment,
  }).status, "ended");
});
test("foreign scope, non-notebook steps and malformed page selections fail closed", () => {
  for (const changes of [
    { stepId: "0" }, { stepId: "01" }, { stepId: "9999" },
    { student: { ...student, class_name: "Other" } },
    { lesson: { ...lesson, id: "foreign" } },
    { lessonSession: { ...session, class_name: "Other" } },
    { assignment: { ...assignment, pdf_page_count: 10 } },
  ]) assert.throws(() => policy(changes));
});
test("teacher authorization happens before service-role reads", async () => {
  let touched = false;
  const client = { auth: { me: async () => ({ id: "unapproved", role: "user" }) },
    get asServiceRole() { touched = true; throw new Error("must not read"); } };
  const response = await bootstrapNotebookExtension({ client, body: { kind: "assessment", sourceId: "live" }, config, headers: {} });
  assert.equal(response.status, 403);
  assert.equal(touched, false);
});
