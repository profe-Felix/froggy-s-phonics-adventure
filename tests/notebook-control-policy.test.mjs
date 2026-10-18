import assert from "node:assert/strict";
import test from "node:test";
import { resolveNotebookAssessmentControls as resolve } from "../base44/shared/externalNotebookControlPolicy.mjs";

export function records() {
  return {
    config: { appId: "app", className: "Class", schoolYear: "26-27", assignmentId: "assignment" },
    assessment: {
      id: "assessment", class_name: "Class", school_year: "26-27", assignment_id: "assignment",
      active: true, paused: false, release_mode: "follow", current_page: 9, total_pages: 206,
      target_students: [], finished_students: [],
      created_date: "2026-10-18T10:00:00.000Z", updated_date: "2026-10-18T10:00:01.000Z",
    },
    assignment: { id: "assignment", class_name: "Class", status: "active", pdf_page_count: 206 },
  };
}
test("whole class is explicit null, with server record versions and follow controls", () => {
  const r = records(), out = resolve(r);
  assert.equal(out.targetStudentNumbers, null); assert.equal(out.status, "live");
  assert.equal(out.currentPage, 9); assert.equal(out.followTeacher, true);
  assert.equal(out.sourceUpdatedAtMs, Date.parse(r.assessment.updated_date));
  assert.equal("teacherUserIds" in out, false);
});
test("small groups, releases and other classes are never broadened to whole class", () => {
  const r = records();
  r.assessment.target_students = [
    { class_name: "Other", student_number: 1 }, { class_name: "Class", student_number: 4 },
    { class_name: "Class", student_number: 2 },
  ];
  r.assessment.finished_students = [{ class_name: "Class", student_number: 4 }];
  assert.deepEqual(resolve(r).targetStudentNumbers, [2, 4]);
  assert.deepEqual(resolve(r).releasedStudentNumbers, [4]);
  r.assessment.target_students = [{ class_name: "Other", student_number: 1 }];
  assert.deepEqual(resolve(r).targetStudentNumbers, []);
});
test("pause, end, closed assignments and free navigation only derive from saved records", () => {
  const r = records(); r.assessment.paused = true;
  assert.equal(resolve(r).status, "paused");
  r.assessment.active = false; assert.equal(resolve(r).status, "ended");
  r.assessment.active = true; r.assessment.paused = false;
  r.assignment.status = "closed"; assert.equal(resolve(r).status, "ended");
  r.assignment.status = "active"; r.assessment.release_mode = "free";
  assert.equal(resolve(r).followTeacher, false);
});
test("wrong scopes, malformed versions, invalid pages and duplicate targets fail closed", () => {
  const changes = [
    r => { r.config.schoolYear = "bad"; }, r => { r.assessment.assignment_id = "other"; },
    r => { r.assessment.class_name = "Other"; }, r => { r.assessment.active = "true"; },
    r => { r.assessment.updated_date = "not a date"; },
    r => { r.assessment.updated_date = "2026-10-17T10:00:00Z"; },
    r => { r.assignment.pdf_page_count = 205; }, r => { r.assessment.current_page = 207; },
    r => { r.assignment.limit_pages = true; r.assignment.page_range_start = 10; r.assignment.page_range_end = 9; },
    r => { r.assessment.target_students = [{ class_name: "Class", student_number: 0 }]; },
    r => { r.assessment.target_students = Array(2).fill({ class_name: "Class", student_number: 4 }); },
  ];
  for (const change of changes) { const r = records(); change(r); assert.throws(() => resolve(r)); }
});
