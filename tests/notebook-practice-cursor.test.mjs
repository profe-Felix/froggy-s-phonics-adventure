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
