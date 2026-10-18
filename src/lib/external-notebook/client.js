import { base44 } from "@/api/base44Client";
import { EXTERNAL_NOTEBOOK_CONFIG } from "./config";
import { isExternalNotebookActive, isExternalNotebookControlEnabled } from "./runtime";

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
    captured.kind === "assessment" && isExternalNotebookActive({
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
  const data = unwrap(await base44.functions.invoke("externalNotebookBootstrap", {
    kind: captured.kind,
    sourceId: captured.sourceId,
    studentId: captured.role === "student" ? captured.student.id : undefined,
    stepId: captured.kind === "lesson" ? captured.stepId : undefined,
    recoveryOnly: recoveryOnly === true,
  }));

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

  return data;
}

export async function syncExternalNotebookControls(context) {
  if (!isExternalNotebookControlEnabled(context)) return { skipped: true };
  // Invoke ONCE after an acknowledged teacher-side entity mutation, never from
  // every student or from a general render/useEffect/subscription callback.
  const data = unwrap(await base44.functions.invoke("externalNotebookControl", {
    kind: context.kind, sourceId: context.sourceId,
    requestId: crypto.randomUUID(),
  }));
  if (data.contractVersion !== 1 || data.applied !== true ||
      !Number.isInteger(data.controlRevision) || data.controlRevision < 0) {
    throw new Error("Notebook controls have not been acknowledged. Keep the sync error visible and retry.");
  }
  return data;
}