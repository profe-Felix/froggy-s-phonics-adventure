// The owner explicitly chose open teacher access for this one existing pilot.
// This is server-owned scope, never a browser role or permission override.
export function allowsOpenNotebookTeacher(config) {
  if (config?.appId === "6972eada24fac6b62ccbab8e" && config.schoolYear === "26-27" &&
      config.globalAssignmentVerified === true) return true;
  return config?.appId === "6972eada24fac6b62ccbab8e" &&
    config.className === "Felix" && config.schoolYear === "26-27" &&
    config.assignmentId === "69d650c08c922889cd55c561";
}

// Server-only: records must be freshly loaded after checking teacher access.
// Never pass browser control values, timestamps, student arrays or destinations.
export function resolveNotebookAssessmentControls({ config, assessment, assignment } = {}) {
  const fail = () => { throw new Error("The assessment records or notebook mapping could not be verified."); };
  const text = value => typeof value === "string" && value.length > 0 &&
    value.length <= 100 && value.trim() === value;
  const positive = value => Number.isSafeInteger(value) && value > 0;
  if (!config || ["appId", "className", "schoolYear", "assignmentId"].some(key => !text(config[key])) ||
      !/^\d{2}-\d{2}$/.test(config.schoolYear)) fail();
  if (!assessment || !text(assessment.id) ||
      assessment.class_name !== config.className || assessment.school_year !== config.schoolYear ||
      assessment.assignment_id !== config.assignmentId || typeof assessment.active !== "boolean" ||
      (assessment.paused !== undefined && typeof assessment.paused !== "boolean") ||
      !["follow", "free"].includes(assessment.release_mode)) fail();
  if (!assignment || assignment.id !== config.assignmentId ||
      (assignment.class_name !== config.className && assignment.shared_across_classes !== true) ||
      !["draft", "active", "closed"].includes(assignment.status) ||
      !positive(assignment.pdf_page_count) || assignment.pdf_page_count > 1000 ||
      !positive(assessment.current_page) || assessment.current_page > assignment.pdf_page_count ||
      (assessment.total_pages !== undefined && assessment.total_pages !== assignment.pdf_page_count)) fail();
  const version = value => {
    if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT/.test(value)) fail();
    const ms = Date.parse(value);
    if (!positive(ms)) fail();
    return ms;
  };
  const sourceCreatedAtMs = version(assessment.created_date);
  const sourceUpdatedAtMs = version(assessment.updated_date);
  if (sourceUpdatedAtMs < sourceCreatedAtMs) fail();
  function seats(value) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 1000) fail();
    const keys = new Set(), selected = [];
    for (const entry of value) {
      if (!entry || !text(entry.class_name) || !positive(entry.student_number) || entry.student_number > 100) fail();
      const key = JSON.stringify([entry.class_name, entry.student_number]);
      if (keys.has(key)) fail();
      keys.add(key);
      if (entry.class_name === config.className) selected.push(entry.student_number);
    }
    return selected.sort((a, b) => a - b);
  }
  const targetStudentNumbers = seats(assessment.target_students);
  const releasedStudentNumbers = seats(assessment.finished_students);
  if (assignment.limit_pages !== undefined && typeof assignment.limit_pages !== "boolean") fail();
  if (assignment.limit_pages === true) {
    const start = assignment.page_range_start, end = assignment.page_range_end;
    if (!positive(start) || !positive(end) || start > end || end > assignment.pdf_page_count ||
        assessment.current_page < start || assessment.current_page > end) fail();
  }
  return {
    appId: config.appId, className: config.className, schoolYear: config.schoolYear,
    assignmentId: config.assignmentId, kind: "assessment", sourceId: assessment.id,
    sourceCreatedAtMs, sourceUpdatedAtMs, pageCount: assignment.pdf_page_count,
    status: !assessment.active || assignment.status !== "active" ? "ended" : assessment.paused === true ? "paused" : "live",
    currentPage: assessment.current_page, followTeacher: assessment.release_mode === "follow",
    // null = whole class. [] = nobody in this class, not an implicit broadcast.
    targetStudentNumbers: !assessment.target_students?.length ? null : targetStudentNumbers,
    releasedStudentNumbers,
  };
}
