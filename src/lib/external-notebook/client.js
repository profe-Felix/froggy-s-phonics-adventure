import { base44 } from "@/api/base44Client";
import { EXTERNAL_NOTEBOOK_CONFIG } from "./config";
import { isExternalNotebookActive, isExternalNotebookControlEnabled } from "./runtime";

function unwrap(response) {
  const data = response?.data;
  if (!data || data.error) throw new Error(data?.error || "The notebook connection did not return a response.");
  return data;
}

export async function bootstrapExternalNotebook(context) {
  if (!isExternalNotebookActive(context)) throw new Error("The external notebook is disabled or not ready.");
  // Send IDs, not a browser-chosen role/permission/page policy.
  const data = unwrap(await base44.functions.invoke("externalNotebookBootstrap", {
    kind: context.kind, sourceId: context.sourceId,
    studentId: context.role === "student" ? context.student.id : undefined,
    stepId: context.kind === "lesson" ? context.stepId : undefined,
  }));
  if (data.contractVersion !== 1 || typeof data.accessToken !== "string" || !data.accessToken ||
      !Number.isFinite(data.expiresAtMs) || data.expiresAtMs <= Date.now() ||
      data.role !== context.role || data.backendOrigin !== EXTERNAL_NOTEBOOK_CONFIG.notebookOrigin) {
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