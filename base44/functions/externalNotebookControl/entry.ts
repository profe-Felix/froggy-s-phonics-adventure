import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { resolveNotebookAssessmentControls } from "../../shared/externalNotebookControlPolicy.mjs";

// Base44 executes this on Deno. This declaration is for non-Deno editors only.
declare const Deno: { env: { get(name: string): string | undefined } };
const NOTEBOOK_ORIGIN = "https://live-classroom-annotation-notebook.replit.app";
const BASE44_ORIGIN = "https://edu-aventura.base44.app";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const reply = (error: string, status: number) => Response.json({ error }, { status, headers });
const id = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 100 && value.trim() === value;

export default async function(req: Request) {
  if (req.method !== "POST") return reply("POST required.", 405);
  const origin = req.headers.get("Origin");
  if (origin && origin !== BASE44_ORIGIN) return reply("This notebook origin is not enabled.", 403);
  // Keep this OFF until the backend and native teacher/student screens are ready.
  if (Deno.env.get("NOTEBOOK_NATIVE_ENABLED") !== "true") return reply("Notebook controls are not activated.", 503);
  let body: any, config: any;
  try { body = await req.json(); } catch { return reply("Invalid request.", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some(key => !["kind", "sourceId", "requestId"].includes(key)) ||
      body.kind !== "assessment" || !id(body.sourceId) ||
      typeof body.requestId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId)) {
    return reply("A valid assessment control request is required.", 400);
  }
  try { config = JSON.parse(Deno.env.get("NOTEBOOK_BRIDGE_CONFIG") || "null"); }
  catch { return reply("The notebook mapping is not configured.", 503); }
  if (!config || ["appId", "className", "schoolYear", "assignmentId"].some(key => !id(config[key])) ||
      (config.teacherUserIds !== undefined && (!Array.isArray(config.teacherUserIds) ||
        config.teacherUserIds.length > 100 || config.teacherUserIds.some((value: unknown) => !id(value))))) {
    return reply("The notebook mapping is not configured.", 503);
  }
  const credential = Deno.env.get("NOTEBOOK_BRIDGE_KEY");
  if (!credential || !/^nbb_[a-f0-9]{64}$/.test(credential)) return reply("The notebook bridge is not configured.", 503);
  let client: any, user: any;
  try {
    client = createClientFromRequest(req);
    user = await client.auth.me();
  } catch { return reply("Teacher sign-in is required.", 401); }
  if (!id(user?.id) || (user.role !== "admin" && !config.teacherUserIds?.includes(user.id))) {
    return reply("This account is not authorized to control the mapped class.", 403);
  }
  try {
    const svc = client.asServiceRole;
    const [assessment, assignment] = await Promise.all([
      svc.entities.LiveNotebookAssessment.get(body.sourceId),
      svc.entities.DigitalNotebookAssignment.get(config.assignmentId),
    ]);
    if (assessment?.id !== body.sourceId) return reply("The assessment could not be verified.", 403);
    const controls = resolveNotebookAssessmentControls({ config, assessment, assignment });
    const response = await fetch(`${NOTEBOOK_ORIGIN}/api/notebook/base44/native-controls`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${credential}` },
      body: JSON.stringify(controls), signal: AbortSignal.timeout(12000), redirect: "error",
    });
    if (!response.ok) return reply("Notebook controls were not confirmed. Keep this screen open and retry.", response.status === 409 ? 409 : 503);
    const data = await response.json();
    if (data?.contractVersion !== 1 || data.applied !== true || data.sourceId !== body.sourceId ||
        !Number.isSafeInteger(data.controlRevision) || data.controlRevision < 1) {
      return reply("The notebook control acknowledgment did not match.", 503);
    }
    return Response.json({
      contractVersion: 1, applied: true, controlRevision: data.controlRevision, sourceId: body.sourceId,
    }, { headers });
  } catch {
    // No SDK errors, credentials, tokens, student records or upstream bodies.
    return reply("Notebook controls are unavailable or their records changed. Keep this screen open and retry.", 503);
  }
}
