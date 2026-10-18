// SERVER ONLY. Inputs must be records loaded by the Base44 function, not
// browser-supplied objects. This helper handles student assessments only.
// Recovery still requires the notebook server's prior-write history check.
export function resolveNotebookAssessmentAccess({
  config, student, assessment, assignment, blocked,
} = {}) {
  const fail = message => { throw new Error(message); };
  const text = value => typeof value === "string" &&
    value.length > 0 && value.length <= 100 && value.trim() === value;
  const positive = value => Number.isSafeInteger(value) && value > 0;
  const keys = ["appId", "className", "schoolYear", "assignmentId"];

  if (!config || keys.some(key => !text(config[key])) ||
      !/^\d{2}-\d{2}$/.test(config.schoolYear)) {
    fail("The notebook class and assignment mapping is not configured.");
  }

  if (typeof blocked !== "boolean") {
    fail("Other live activities must be checked before notebook access.");
  }

  if (!student || !text(student.id) || !positive(student.student_number) ||
      student.student_number > 100 || student.class_name !== config.className ||
      student.school_year !== config.schoolYear) {
    fail("This student does not match the notebook class and school year.");
  }

  if (!assessment || !text(assessment.id) ||
      assessment.assignment_id !== config.assignmentId ||
      assessment.class_name !== config.className ||
      assessment.school_year !== config.schoolYear ||
      typeof assessment.active !== "boolean" ||
      (assessment.paused !== undefined && typeof assessment.paused !== "boolean") ||
      !["follow", "free"].includes(assessment.release_mode)) {
    fail("The notebook assessment does not match the configured assignment.");
  }

  if (!assignment || assignment.id !== config.assignmentId ||
      (assignment.class_name !== config.className &&
        assignment.shared_across_classes !== true) ||
      !["draft", "active", "closed"].includes(assignment.status) ||
      !positive(assignment.pdf_page_count) || assignment.pdf_page_count > 1000) {
    fail("The notebook assignment or its page count is not valid.");
  }

  const pageCount = assignment.pdf_page_count;

  if (!positive(assessment.current_page) || assessment.current_page > pageCount ||
      (assessment.total_pages !== undefined && assessment.total_pages !== pageCount)) {
    fail("The assessment page information no longer matches the assignment.");
  }

  function seats(value) {
    // Missing optional lists use the entity schema's whole-class/none defaults.
    if (value === undefined) return [];

    if (!Array.isArray(value) || value.length > 1000 || value.some(entry =>
      !entry || !text(entry.class_name) || !positive(entry.student_number) ||
      entry.student_number > 100
    )) {
      fail("The assessment student group could not be verified.");
    }

    return value;
  }

  const targets = seats(assessment.target_students);
  const finished = seats(assessment.finished_students);

  const sameSeat = entry => entry.class_name === student.class_name &&
    entry.student_number === student.student_number;

  const inGroup = targets.length === 0 || targets.some(sameSeat);
  const released = finished.some(sameSeat);

  if (assignment.limit_pages !== undefined && typeof assignment.limit_pages !== "boolean") {
    fail("The notebook page restrictions could not be verified.");
  }

  let allowedPages = null;

  if (assignment.limit_pages === true) {
    const start = assignment.page_range_start;
    const end = assignment.page_range_end;

    if (!positive(start) || !positive(end) || start > end || end > pageCount) {
      fail("The notebook page range is not valid.");
    }

    allowedPages = Array.from(
      { length: end - start + 1 },
      (_, index) => start + index
    );
  }

  const currentPageAllowed = allowedPages === null ||
    allowedPages.includes(assessment.current_page);

  const eligible = assessment.active === true && inGroup && !released &&
    assignment.status === "active" && !blocked &&
    (assessment.release_mode === "free" || currentPageAllowed);

  // A paused, otherwise eligible student may still open a readonly view.
  // Inactive/released/blocked students require prior writable authority.
  const recoveryOnly = !eligible;

  return {
    recoveryOnly,
    pageCount,
    request: {
      appId: config.appId,
      className: config.className,
      schoolYear: config.schoolYear,
      assignmentId: config.assignmentId,
      role: "student",
      kind: "assessment",
      sourceId: assessment.id,
      studentId: student.id,
      studentNumber: student.student_number,
      origin: "https://edu-aventura.base44.app",
      canWrite: eligible && assessment.paused !== true,
      allowedPages,
    },
  };
}
