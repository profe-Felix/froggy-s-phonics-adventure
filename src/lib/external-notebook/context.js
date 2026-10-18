// Pure UI routing helpers, NOT server authorization. No entity reads or writes.
export function assessmentContext({ student, assessment, blocked = false }) {
  if (!student || !assessment) return null;
  return {
    kind: "assessment", role: "student", blocked,
    sourceId: assessment.id, active: assessment.active === true,
    assignmentId: assessment.assignment_id,
    className: assessment.class_name, schoolYear: assessment.school_year,
    student: {
      id: student.id, number: student.student_number,
      className: student.class_name, schoolYear: student.school_year,
    },
    targetStudents: assessment.target_students,
    finishedStudents: assessment.finished_students,
    page: assessment.current_page || 1,
  };
}

export function matchesExternalNotebook(context, config) {
  if (!config?.enabled || !context || context.blocked || context.active !== true) return false;
  if (!["assessment", "lesson", "assignment"].includes(context.kind) || !["student", "teacher"].includes(context.role)) return false;
  if (context.kind === "assessment" && !config.assessmentsEnabled) return false;
  if (context.kind === "lesson" && !config.lessonStepsEnabled) return false;
  if (!config.appId || !config.assignmentId || !config.className || !config.schoolYear) return false;
  const mapped = context.assignmentId === config.assignmentId && context.className === config.className;
  const catalog = config.catalogEnabled === true && typeof context.assignmentId === "string" &&
    config.catalogClasses?.includes(context.className);
  if (!context.sourceId || (!mapped && !catalog) || context.schoolYear !== config.schoolYear) return false;
  if (context.kind === "lesson" && !context.stepId) return false;
  if (context.role === "teacher") return !!config.teacherViewEnabled;
  const s = context.student;
  if (!s?.id || !Number.isInteger(s.number) || s.number < 1 || s.number > 100 ||
      s.className !== context.className || s.schoolYear !== context.schoolYear) return false;
  const targets = context.targetStudents ?? [];
  const finished = context.finishedStudents ?? [];
  if (!Array.isArray(targets) || !Array.isArray(finished)) return false;
  const sameSeat = entry => entry?.class_name === s.className && Number(entry.student_number) === s.number;
  return !finished.some(sameSeat) && (!targets.length || targets.some(sameSeat));
}

export function persistentWorkKey(context, appId) {
  if (!appId || !context?.assignmentId || !context.className || !context.schoolYear || !context.student?.id) {
    throw new Error("A complete, stable notebook work identity is required.");
  }
  // Session/step/page changes must NOT create blank replacement notebooks.
  return JSON.stringify([appId, context.schoolYear, context.className, context.assignmentId, context.student.id]);
}

export function matchesExternalNotebookControls(context, config) {
  if (context?.role !== "teacher") return false;
  // End/release updates still need forwarding after the source becomes inactive.
  // This is a routing gate only; server-side teacher authorization is mandatory.
  return matchesExternalNotebook(
    { ...context, active: true, blocked: false },
    { ...config, teacherViewEnabled: true },
  );
}