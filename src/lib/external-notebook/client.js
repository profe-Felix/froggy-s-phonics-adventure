import { base44 } from "@/api/base44Client";
import { EXTERNAL_NOTEBOOK_CONFIG } from "./config";
import { isExternalNotebookActive, isExternalNotebookControlEnabled } from "./runtime";
import { requireNotebookTeacherSession, isTeacherSignInRequired, teacherAuthenticationError, notebookTeacherReturnUrl } from "./teacher-auth";

export function signInNotebookTeacher(context) {
  const returnUrl = notebookTeacherReturnUrl(window.location.origin, context);
  // An old one-shot logout flag must not erase the new login on return.
  // This is a non-secret flag; the SDK continues to own all credentials.
  try { window.localStorage.removeItem("base44_clear_access_token"); } catch {}
  return base44.auth.redirectToLogin(returnUrl);
}

export function verifyNotebookTeacherSignIn() {
  return requireNotebookTeacherSession(base44.auth);
}

export async function authorizeNotebookTeacherStart(context) {
  const data = unwrap(await invokeNotebookFunction("externalNotebookControl", {
    kind: context.kind, action: "verifyTeacher",
    assignmentId: context.assignmentId, className: context.className, schoolYear: context.schoolYear,
  }, context));
  if (data.contractVersion !== 1 || data.authorized !== true ||
      (EXTERNAL_NOTEBOOK_CONFIG.teacherAccessMode === "open" && data.teacherAccessMode !== "open") ||
      data.className !== context.className || data.schoolYear !== context.schoolYear ||
      data.assignmentId !== context.assignmentId) {
    throw new Error("This account has not been authorized to start this class notebook.");
  }
}

async function invokeNotebookFunction(name, body, context) {
  const accountRequired = context?.role === "teacher" && EXTERNAL_NOTEBOOK_CONFIG.teacherAccessMode !== "open";
  if (accountRequired) await verifyNotebookTeacherSignIn();
  const started = Date.now();
  let transientFailures = 0;
  for (let attempt = 0; ; attempt++) {
    try { return await base44.functions.invoke(name, body); }
    catch (error) {
      if (accountRequired && isTeacherSignInRequired(error)) throw teacherAuthenticationError();
      const status = error?.response?.status ?? error?.status;
      const retryable = context?.role === "student" && name === "externalNotebookBootstrap" &&
        [429, 502, 503, 504].includes(status);
      const preparing = retryable && error?.response?.data?.code === "notebook_images_preparing";
      if (!retryable || (preparing ? Date.now() - started > 180000 : transientFailures++ >= 5)) throw error;
      // Spread a classroom joining together; never retry teacher mutations.
      const delay = (preparing ? Math.min(10000, 2000 + attempt * 1000) :
        Math.min(4000, 500 * 2 ** Math.min(attempt, 4))) + Math.random() * 750;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

function unwrap(response) {
  const data = response?.data;
  if (!data || data.error) throw new Error(data?.error || "The notebook connection did not return a response.");
  return data;
}

export async function bootstrapExternalNotebook(context) {
  // Capture this request's identity before awaiting the server. Host generation
  // guards still decide whether an in-flight response belongs to its owner.
  const captured = context ? JSON.parse(JSON.stringify(context)) : null;
  const active = isExternalNotebookActive(captured);

  // This is only a fixed-scope/readiness check, NOT restored eligibility.
  // The server must find prior write authority before issuing save-only access.
  const recoveryOnly = !active && captured?.role === "student" &&
    ["assessment", "lesson", "assignment"].includes(captured.kind) && isExternalNotebookActive({
      ...captured,
      active: true,
      blocked: false,
      targetStudents: [],
      finishedStudents: [],
    });

  const id = value => typeof value === "string" && value.length > 0 &&
    value.length <= 100 && value.trim() === value;

  if ((!active && !recoveryOnly) || !id(captured?.sourceId) ||
      (captured.role === "student" && !id(captured.student?.id))) {
    throw new Error("The external notebook is disabled, out of scope or not ready.");
  }

  // recoveryOnly can remove permission, never grant it. Send no browser role,
  // destination, page policy, or canWrite value.
  const data = unwrap(await invokeNotebookFunction("externalNotebookBootstrap", {
    kind: captured.kind,
    sourceId: captured.sourceId,
    studentId: captured.role === "student" ? captured.student.id : undefined,
    stepId: captured.kind === "lesson" ? captured.stepId : undefined,
    recoveryOnly: recoveryOnly === true,
  }, captured));

  const now = Date.now();
  const pages = data.allowedPages;
  const count = data.workbook?.pageCount;

  if (
    data.contractVersion !== 1 ||
    typeof data.accessToken !== "string" ||
    !data.accessToken ||
    !Number.isSafeInteger(data.expiresAtMs) ||
    data.expiresAtMs <= now + 5000 ||
    data.expiresAtMs > now + 11 * 60 * 1000 ||
    data.role !== captured.role ||
    data.kind !== captured.kind ||
    data.sourceId !== captured.sourceId ||
    (captured.kind === "lesson" && data.stepId !== captured.stepId) ||
    data.backendOrigin !== EXTERNAL_NOTEBOOK_CONFIG.notebookOrigin ||
    !id(data.classId) ||
    !id(data.workbookId) ||
    data.classroom?.id !== data.classId ||
    data.classroom?.workbookId !== data.workbookId ||
    data.workbook?.id !== data.workbookId ||
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > 2000 ||
    typeof data.canWrite !== "boolean" ||
    (recoveryOnly && data.canWrite) ||
    (captured.role === "student" &&
      data.studentNumber !== captured.student.number) ||
    (pages !== null && (
      !Array.isArray(pages) ||
      !pages.length ||
      pages.length > 2000 ||
      new Set(pages).size !== pages.length ||
      pages.some(page =>
        !Number.isSafeInteger(page) ||
        page < 1 ||
        page > count
      )
    ))
  ) {
    throw new Error("The notebook bootstrap contract did not match the configured connection.");
  }

  if (captured.kind === "assignment" && Array.isArray(captured.allowedPages)) {
    const requested = captured.allowedPages.filter(page => Number.isSafeInteger(page) && page >= 1 &&
      page <= count && (pages === null || pages.includes(page)));
    if (!requested.length) throw new Error("The requested notebook pages are not available.");
    return { ...data, allowedPages: [...new Set(requested)].sort((a, b) => a - b) };
  }
  return data;
}

export async function syncExternalNotebookControls(context) {
  if (!isExternalNotebookControlEnabled(context)) return { skipped: true };
  // Invoke ONCE after an acknowledged teacher-side entity mutation, never from
  // every student or from a general render/useEffect/subscription callback.
  const data = unwrap(await invokeNotebookFunction("externalNotebookControl", {
    kind: context.kind, sourceId: context.sourceId,
    requestId: crypto.randomUUID(),
  }, context));
  if (data.contractVersion !== 1 || data.applied !== true ||
      !Number.isInteger(data.controlRevision) || data.controlRevision < 0) {
    throw new Error("Notebook controls have not been acknowledged. Keep the sync error visible and retry.");
  }
  return data;
}