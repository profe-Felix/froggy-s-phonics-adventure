import { resolveNotebookAssessmentAccess } from "./externalNotebookNativePolicy.mjs";
import { resolveNotebookAssessmentControls, allowsOpenNotebookTeacher } from "./externalNotebookControlPolicy.mjs";

const fail = () => { throw new Error("The saved notebook lesson could not be verified."); };
const positive = value => Number.isSafeInteger(value) && value > 0;

// Same selection order as the installed lesson host. A saved explicit day wins;
// otherwise its active daily lesson for today, then the first active daily row.
export function savedLessonSteps(lesson, selectedDay = "", now = new Date()) {
  if (!lesson || typeof lesson !== "object") fail();
  if (!Array.isArray(lesson.daily_lessons)) {
    if (!Array.isArray(lesson.steps)) fail();
    return lesson.steps;
  }
  const usable = lesson.daily_lessons.filter(day =>
    day && day.active !== false && Array.isArray(day.steps) && day.steps.length);
  const today = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][now.getDay()];
  return (usable.find(day => day.day === selectedDay) ||
    usable.find(day => day.day === today) || usable[0])?.steps || [];
}

export function lessonNotebookPolicy({ config, lessonSession: s, lesson, assignment, stepId, student } = {}) {
  if (!s || s.class_name !== config?.className || s.school_year !== config?.schoolYear ||
      typeof s.active !== "boolean" || !Number.isSafeInteger(s.current_step) || s.current_step < 0 ||
      !["stay", "lesson"].includes(s.release_mode || "stay") ||
      !["watch", "try"].includes(s.phase || "watch") ||
      !["lesson", "small_group"].includes(s.lesson_source || "lesson") ||
      lesson?.id !== s.lesson_id || typeof stepId !== "string" || !/^(0|[1-9]\d{0,3})$/.test(stepId)) fail();
  const steps = savedLessonSteps(lesson, s.lesson_day || "");
  const index = Number(stepId), step = steps[index], c = step?.config;
  if (step?.mode !== "digital_notebook" || c?.assignmentId !== config.assignmentId ||
      !positive(assignment?.pdf_page_count) || assignment.pdf_page_count > 1000) fail();
  const count = assignment.pdf_page_count;
  const start = Number(c.pageStart || 1), end = Number(c.pageEnd || start);
  const selection = c.pageSelection || "single";
  let pages;
  if (selection === "all") pages = Array.from({ length: count }, (_, i) => i + 1);
  else if (selection === "single" && positive(start) && start <= count) pages = [start];
  else if (selection === "range" && positive(start) && positive(end) && end >= start && end <= count) {
    pages = Array.from({ length: end - start + 1 }, (_, i) => i + start);
  } else if (selection === "custom") {
    const selected = new Set();
    for (const part of String(c.customPages || "").split(",")) {
      if (!/^\s*\d+\s*(?:-\s*\d+\s*)?$/.test(part)) fail();
      const values = part.split("-").map(Number);
      const first = Math.min(...values), last = Math.max(...values);
      if (!positive(first) || last > count) fail();
      for (let page = first; page <= last; page++) selected.add(page);
    }
    pages = [...selected].sort((a, b) => a - b);
  } else fail();
  if (assignment.limit_pages === true) {
    if (!positive(assignment.page_range_start) || !positive(assignment.page_range_end)) fail();
    pages = pages.filter(page => page >= assignment.page_range_start && page <= assignment.page_range_end);
  }
  if (!pages?.length) fail();
  const selfPaced = s.release_mode === "lesson";
  const eligibleStep = selfPaced ? index >= s.current_step : index === s.current_step;
  const projection = {
    id: s.id, class_name: s.class_name, school_year: s.school_year,
    assignment_id: config.assignmentId, active: s.active && eligibleStep,
    paused: !selfPaced && s.phase !== "try", release_mode: "free",
    current_page: pages[0], total_pages: count, target_students: s.target_students,
    finished_students: [], created_date: s.created_date, updated_date: s.updated_date,
  };
  const controls = resolveNotebookAssessmentControls({ config, assessment: projection, assignment });
  controls.kind = "lesson";
  controls.lessonStepIndex = s.current_step;
  controls.lessonSelfPaced = selfPaced;
  // Students in self-paced mode may be on different notebook steps; never
  // force the teacher's page onto another step's restricted page range.
  controls.followTeacher = false;
  if (!student) return { controls, pageCount: count, pages };
  const access = resolveNotebookAssessmentAccess({
    config, student, assignment, assessment: projection, blocked: false,
  });
  access.request.kind = "lesson";
  access.request.stepId = stepId;
  access.request.allowedPages = pages;
  return { ...access, controls, pages };
}

// Called only by the server function with its configured bridge credential.
export async function bootstrapNotebookExtension({
  client, body, config, credential, notebookOrigin, headers, sharedRead,
  browserOrigin = "https://edu-aventura.base44.app",
  onStage = () => {},
}) {
  const teacher = !body.studentId;
  if (teacher && !allowsOpenNotebookTeacher(config)) {
    onStage("teacher-auth");
    let user;
    try { user = await client.auth.me(); } catch { return Response.json({ error: "Teacher sign-in is required." }, { status: 401, headers }); }
    if (!user?.id || (user.role !== "admin" && !config.teacherUserIds?.includes(user.id))) {
      return Response.json({ error: "This account cannot access the mapped class." }, { status: 403, headers });
    }
    if (body.recoveryOnly) fail();
  }
  if (teacher && body.recoveryOnly) fail();
  const svc = client.asServiceRole;
  const key = JSON.stringify([config.appId, config.className, config.schoolYear, config.assignmentId]);
  const read = (suffix, action) => sharedRead(`${key}:${suffix}`, action);
  onStage("assignment-read");
  const assignment = await read("assignment", () => svc.entities.DigitalNotebookAssignment.get(config.assignmentId));
  let request, count, controls;
  if (body.kind === "assignment") {
    if (teacher || body.sourceId !== config.assignmentId ||
      assignment?.id !== config.assignmentId ||
      (assignment.class_name !== config.className && assignment.shared_across_classes !== true) ||
      !["active", "draft"].includes(assignment.status) ||
      !Number.isSafeInteger(assignment.pdf_page_count) || assignment.pdf_page_count < 1) fail();
    const student = await svc.entities.Student.get(body.studentId);
    if (student?.id !== body.studentId || student.class_name !== config.className ||
        student.school_year !== config.schoolYear || !Number.isSafeInteger(student.student_number) ||
        student.student_number < 1 || student.student_number > 100) fail();
    count = assignment.pdf_page_count;
    request = { role: "student", kind: "assignment", sourceId: assignment.id,
      studentId: student.id, studentNumber: student.student_number,
      canWrite: body.recoveryOnly !== true, recoveryOnly: body.recoveryOnly === true, allowedPages: null };
  } else if (body.kind === "assessment") {
    onStage("assessment-read");
    const assessment = await read(`assessment:${body.sourceId}`, () => svc.entities.LiveNotebookAssessment.get(body.sourceId));
    if (assessment?.id !== body.sourceId) fail();
    onStage("assessment-policy");
    controls = resolveNotebookAssessmentControls({ config, assessment, assignment });
    count = assignment.pdf_page_count;
    request = { role: "teacher", kind: "assessment", sourceId: assessment.id, allowedPages: null };
  } else {
    onStage("lesson-read");
    const s = await read(`lesson-session:${body.sourceId}`, () => svc.entities.LiveLessonSession.get(body.sourceId));
    if (s?.id !== body.sourceId || !["lesson", "small_group"].includes(s.lesson_source || "lesson")) fail();
    const entity = s.lesson_source === "small_group" ? svc.entities.SmallGroupLesson : svc.entities.Lesson;
    const lesson = await read(`lesson:${s.lesson_id}`, () => entity.get(s.lesson_id));
    const student = teacher ? undefined : await svc.entities.Student.get(body.studentId);
    if (!teacher && student?.id !== body.studentId) fail();
    const decision = lessonNotebookPolicy({ config, lessonSession: s, lesson, assignment, stepId: body.stepId, student });
    count = decision.pageCount;
    controls = decision.controls;
    request = teacher
      ? { role: "teacher", kind: "lesson", sourceId: s.id, stepId: body.stepId, allowedPages: decision.pages }
      : { ...decision.request, recoveryOnly: decision.recoveryOnly || body.recoveryOnly === true };
  }
  if (!teacher) {
    const result = await read("dictations", () => svc.entities.LiveDictationSession.filter({
      class_name: config.className, school_year: config.schoolYear, active: true,
    }, "-updated_date", 100));
    const rows = Array.isArray(result) ? result : result?.items;
    if (!Array.isArray(rows) || rows.length >= 100 ||
        (!Array.isArray(result) && (result.has_more || result.hasMore ||
          (result.total !== undefined && result.total !== rows.length))) ||
        rows.some(row => row?.active !== true || row.class_name !== config.className || row.school_year !== config.schoolYear)) fail();
    if (rows.length) request = { ...request, canWrite: false, recoveryOnly: true };
  }
  // Opening a teacher screen reconciles an already-running Base44 activity
  // once, not once per student. Record-version idempotency makes retries safe.
  if (teacher && controls.status !== "ended") {
    onStage("controls-sync");
    const synced = await fetch(`${notebookOrigin}/api/notebook/base44/native-controls`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${credential}` },
      // Workers supports manual/follow, not the browser's redirect:error.
      // Manual still fails closed on every redirect and never forwards secrets.
      body: JSON.stringify(controls), redirect: "manual", signal: AbortSignal.timeout(12000),
    });
    if (!synced.ok) fail();
    const ack = await synced.json();
    if (ack?.contractVersion !== 1 || ack.applied !== true || ack.sourceId !== body.sourceId ||
        !positive(ack.controlRevision)) fail();
  }
  const recoveryOnly = request.recoveryOnly === true;
  onStage("native-session");
  const response = await fetch(`${notebookOrigin}/api/notebook/base44/native-session`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${credential}` },
    body: JSON.stringify({
      appId: config.appId, className: config.className, schoolYear: config.schoolYear,
      assignmentId: config.assignmentId, origin: browserOrigin,
      canWrite: false, ...request, ...(recoveryOnly ? { canWrite: false } : {}),
    }),
    redirect: "manual", signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) return Response.json({ error: "Notebook access was not confirmed. Saved and pending work was retained." },
    { status: [401, 403, 409, 429].includes(response.status) ? response.status : 503, headers });
  onStage("session-contract");
  const session = await response.json(), pages = session.allowedPages;
  if (session.contractVersion !== 1 || session.role !== request.role || session.kind !== request.kind ||
      session.sourceId !== body.sourceId || (request.stepId && session.stepId !== request.stepId) ||
      (!teacher && session.studentNumber !== request.studentNumber) ||
      typeof session.accessToken !== "string" || !session.accessToken ||
      !Number.isSafeInteger(session.expiresAtMs) || session.expiresAtMs <= Date.now() ||
      session.expiresAtMs > Date.now() + 11 * 60 * 1000 ||
      typeof session.classId !== "string" || !session.classId || typeof session.workbookId !== "string" || !session.workbookId ||
      session.classroom?.id !== session.classId || session.classroom?.workbookId !== session.workbookId ||
      session.workbook?.id !== session.workbookId || session.workbook?.pageCount !== count ||
      typeof session.canWrite !== "boolean" || (session.canWrite && (teacher || recoveryOnly || !request.canWrite)) ||
      (pages !== null && (!Array.isArray(pages) || !pages.length || new Set(pages).size !== pages.length ||
        pages.some(page => !positive(page) || page > count))) ||
      (request.allowedPages !== null && (pages === null || pages.some(page => !request.allowedPages.includes(page))))) fail();
  return Response.json({
    contractVersion: 1, role: request.role, kind: request.kind, sourceId: body.sourceId,
    ...(request.stepId ? { stepId: request.stepId } : {}),
    ...(!teacher ? { studentNumber: request.studentNumber } : {}),
    backendOrigin: notebookOrigin, accessToken: session.accessToken, expiresAtMs: session.expiresAtMs,
    classId: session.classId, workbookId: session.workbookId, canWrite: session.canWrite,
    allowedPages: pages, classroom: session.classroom, workbook: session.workbook,
  }, { headers });
}

export function savedLessonNotebookControls({ config, lessonSession, lesson, assignment }) {
  const steps = savedLessonSteps(lesson, lessonSession.lesson_day || "");
  const current = lessonSession.current_step;
  const matching = steps.map((step, index) =>
    step?.mode === "digital_notebook" && step.config?.assignmentId === config.assignmentId ? index : -1
  ).filter(index => index >= 0);
  const index = matching.includes(current) ? current :
    (lessonSession.release_mode === "lesson" ? matching.find(index => index >= current) : undefined) ??
    matching[0];
  if (index === undefined) fail();
  return lessonNotebookPolicy({
    config, lessonSession, lesson, assignment, stepId: String(index),
  }).controls;
}
