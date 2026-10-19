import test from "node:test";
import assert from "node:assert/strict";
import { createNotebookStudentControls } from "../src/lib/external-notebook/student-controls.js";

function fixture(kind = "assignment", status = "waiting", page = 10) {
  const context = { role: "student", kind, sourceId: "book", assignmentId: "book",
    className: "Valero", schoolYear: "26-27", active: true, page: 1,
    student: { id: "student", number: 4, className: "Valero", schoolYear: "26-27" } };
  const session = { contractVersion: 1, role: "student", kind, sourceId: "book",
    classId: "class", workbookId: "workbook", workbook: { id: "workbook", pageCount: 1 },
    studentNumber: 4, expiresAtMs: Date.now() + 600000, canWrite: true, allowedPages: null,
    backendOrigin: "https://example.test", classroom: { id: "class", workbookId: "workbook",
      currentPage: page, status, followTeacher: true, capacity: 100, targetStudentNumbers: [] } };
  return { session, context };
}
test("one-page waiting practice tolerates only the known legacy page-ten default", () => {
  const input = fixture();
  assert.doesNotThrow(() => createNotebookStudentControls(input));
  assert.equal(input.session.classroom.currentPage, 10, "never mutate signed input or stored teacher state");
  assert.throws(() => createNotebookStudentControls(fixture("assignment", "waiting", 11)));
  assert.throws(() => createNotebookStudentControls(fixture("assignment", "live")));
  assert.throws(() => createNotebookStudentControls(fixture("assignment", "paused")));
  assert.throws(() => createNotebookStudentControls(fixture("assessment")));
  const foreign = fixture(); foreign.session.classroom.workbookId = "other";
  assert.throws(() => createNotebookStudentControls(foreign));
});

function pageFixture(page, count = 206, classroomPage = 60) {
  const input = fixture("assignment", "ended", classroomPage);
  input.session.workbook.pageCount = count;
  if (page === undefined) delete input.context.page;
  else input.context.page = page;
  return input;
}
test("explicit one-based page links beat the old class cursor for independent notebooks", () => {
  const input = pageFixture(62);
  const controls = createNotebookStudentControls(input);
  assert.equal(controls.getState().page, 62);
  controls.receive({ type: "ready", classroom: input.session.classroom });
  controls.receive({ type: "classroom", classId: "class", classroom: { ...input.session.classroom, currentPage: 61 } });
  assert.equal(controls.getState().page, 62);
  controls.choosePage(63);
  assert.equal(controls.getState().page, 63, "the initial link is not continuously reapplied");
  assert.equal(input.session.classroom.currentPage, 60, "never change the teacher cursor");
});
test("MiLibro-sized documents honor a link rather than their page-one cursor", () => {
  const controls = createNotebookStudentControls(pageFixture(42, 111, 1));
  assert.equal(controls.getState().page, 42);
});
test("missing or invalid page intent preserves existing fallback and cannot expand allowed pages", () => {
  for (const page of [undefined, 0, -1, 2.5, NaN, 207]) {
    assert.equal(createNotebookStudentControls(pageFixture(page)).getState().page, 60);
  }
  const limited = pageFixture(62);
  limited.session.allowedPages = [5, 6];
  assert.equal(createNotebookStudentControls(limited).getState().page, 5);
});
test("page links never override a live teacher's follow cursor", () => {
  const input = pageFixture(62);
  input.session.kind = input.context.kind = "assessment";
  input.session.classroom.status = "live";
  const controls = createNotebookStudentControls(input);
  assert.equal(controls.getState().page, 60);
  controls.receive({ type: "ready", classroom: { ...input.session.classroom, currentPage: 64 } });
  assert.equal(controls.getState().page, 64);
  assert.throws(() => controls.choosePage(62));
});
