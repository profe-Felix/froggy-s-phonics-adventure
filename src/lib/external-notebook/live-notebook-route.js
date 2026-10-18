// Pure routing decision for /LiveNotebook. No React, network or storage.
// Returns { screen: "chooser" | "notice" | "slot", context?, notice? }.
// "notice" carries { title, body, retry } where retry is "source" | "students" | "lesson".
import { assessmentContext } from "./context.js";
import { lessonStepPages } from "./lesson-pages.js";

const notice = (title, body = "", retry = null) => ({ screen: "notice", notice: { title, body, retry } });

export function decideLiveNotebook({
  link, className, number, config, activeYear,
  source = {}, students = {}, lesson = {}, getSteps,
}) {
  if (!link?.kind || !link.sourceId) return notice("This notebook link is incomplete", "Ask your teacher for a new notebook link.");
  if (link.kind === "lesson" && !(Number.isInteger(link.stepIndex) && link.stepIndex >= 0)) {
    return notice("This lesson link has no valid step", "Ask your teacher for a new notebook link.");
  }
  if (!className) return notice("This notebook link has no class", "Ask your teacher for the link for your class.");
  if (!number) return { screen: "chooser" };
  const src = source.data;
  if (source.error && !src) return notice("Could not reach your class", "Your saved work is safe.", "source");
  if (students.error && !students.data) return notice("Could not load your class list", "", "students");
  if (source.loading || students.loading || (link.kind === "lesson" && src?.lesson_id && lesson.loading && !lesson.data)) {
    return notice("Opening your notebook", "Connecting to your class.");
  }
  if (!src) return notice("This notebook was not found", "The lesson or assessment may have been removed.");
  const student = (students.data || []).find(s => Number(s.student_number) === number &&
    s.class_name === className && s.school_year === activeYear);
  if (!student) return { ...notice(`No student ${number} in ${className}`, "Check your number with your teacher."), rechoose: true };
  if (src.active !== true) return notice("This notebook is not open right now", "Wait for your teacher to start it, then try again.");
  if (src.class_name !== className || src.school_year !== activeYear || activeYear !== config.schoolYear) {
    return notice("This link is for a different class", "Ask your teacher for the link for your class.");
  }
  if (link.kind === "assessment") {
    if (src.assignment_id !== config.assignmentId) return notice("This notebook cannot open", "This assessment uses a notebook that is not available here.");
    return { screen: "slot", context: { ...assessmentContext({ student, assessment: src }), assignmentId: config.assignmentId } };
  }
  if (lesson.error && !lesson.data) return notice("Could not load the lesson", "", "lesson");
  const step = (getSteps?.(lesson.data, src.lesson_day || "") || [])[link.stepIndex];
  const teacherStep = src.current_step ?? 0;
  const releaseMode = src.release_mode || "stay";
  const phase = src.phase || "watch";
  if (step?.mode !== "digital_notebook") return notice("This notebook cannot open", "This lesson step is not a notebook.");
  if (step.config?.assignmentId !== config.assignmentId) return notice("This notebook cannot open", "This lesson step uses a notebook that is not available here.");
  if (releaseMode === "lesson" ? link.stepIndex < teacherStep : link.stepIndex !== teacherStep) {
    return notice("Your teacher has moved to another step", "Your work on this step was saved.");
  }
  return { screen: "slot", context: {
    kind: "lesson", role: "student", blocked: false, active: true,
    sourceId: src.id, stepId: String(link.stepIndex),
    assignmentId: config.assignmentId,
    className, schoolYear: activeYear,
    student: { id: student.id, number, className, schoolYear: activeYear },
    targetStudents: src.target_students,
    // Saved phase only; watch is never writable. Server enforces status independently.
    phase, releaseMode,
    paused: releaseMode !== "lesson" && phase !== "try",
    ...lessonStepPages(step.config),
  } };
}

// Once a Slot has been shown, it must stay mounted: a later notice becomes the
// last context with active:false so the pinned owner can finish, save and close
// through the Slot lifecycle before the fallback appears.
export function slotContextAfterMount(decision, lastContext) {
  if (decision.screen === "slot") return decision.context;
  return lastContext ? { ...lastContext, active: false } : null;
}
