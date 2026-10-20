import { prepareNotebookRequest } from "./externalNotebookMapping.mjs";
import { allowsOpenNotebookTeacher } from "./externalNotebookControlPolicy.mjs";

const classes = ["Felix", "Valero", "Campos", "Gutierrez"];
const id = v => typeof v === "string" && v.length > 0 && v.length <= 100 && v.trim() === v;
export async function bootstrapDashboardPreview({
  client, body, config: root, credential: rootKey, notebookOrigin, browserOrigin, headers,
  prepare = prepareNotebookRequest, request = fetch,
}) {
  const reply = (error, status) => Response.json({ error }, { status, headers });
  if (!body || Array.isArray(body) || typeof body !== "object" ||
      Object.keys(body).some(k => !["className", "schoolYear", "assignmentId"].includes(k)) ||
      !id(body.assignmentId) || !classes.includes(body.className) ||
      body.schoolYear !== root.schoolYear || !id(root.appId) || !rootKey) {
    return reply("Choose a supported class and saved notebook assignment.", 400);
  }
  if (!allowsOpenNotebookTeacher(root)) {
    let teacher;
    try { teacher = await client.auth.me(); } catch { return reply("Teacher sign-in is required.", 401); }
    if (!teacher?.id || (teacher.role !== "admin" && !root.teacherUserIds?.includes(teacher.id))) {
      return reply("This teacher cannot view that class.", 403);
    }
  }
  // Resolves the existing assignment/class mapping. It never starts an activity
  // or calls native-controls; only image preparation/mapping may be initialized.
  const { client: scoped, config, credential } = await prepare(client,
    { ...body, action: "verifyTeacher" }, root, rootKey, notebookOrigin);
  const assignment = await scoped.asServiceRole.entities.DigitalNotebookAssignment.get(body.assignmentId);
  if (assignment?.id !== config.assignmentId || config.assignmentId !== body.assignmentId ||
      config.className !== body.className || config.schoolYear !== body.schoolYear ||
      (assignment.class_name !== config.className && assignment.shared_across_classes !== true) ||
      !["draft", "active", "closed"].includes(assignment.status) ||
      !Number.isSafeInteger(assignment.pdf_page_count) || assignment.pdf_page_count < 1) {
    return reply("This saved assignment is not available for that class.", 403);
  }
  const response = await request(`${notebookOrigin}/api/notebook/base44/dashboard-session`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${credential}` },
    body: JSON.stringify({ appId: config.appId, className: config.className,
      schoolYear: config.schoolYear, assignmentId: config.assignmentId, origin: browserOrigin,
      role: "teacher", kind: "assignment", sourceId: assignment.id, canWrite: false, allowedPages: null }),
    redirect: "manual", signal: AbortSignal.timeout(15000),
  });
  if (response.status === 404) return reply("The notebook API dashboard update must be published in Replit before this preview can connect. The original dashboard is unchanged.", 503);
  if (!response.ok) return reply("The view-only notebook connection is unavailable. No student work was changed.",
    [401, 403, 409, 429].includes(response.status) ? response.status : 503);
  const session = await response.json();
  if (session.contractVersion !== 1 || session.role !== "teacher" || session.kind !== "assignment" ||
      session.sourceId !== assignment.id || session.canWrite !== false || session.allowedPages !== null ||
      typeof session.accessToken !== "string" || !session.accessToken ||
      !Number.isSafeInteger(session.expiresAtMs) || session.expiresAtMs <= Date.now() ||
      session.expiresAtMs > Date.now() + 11 * 60 * 1000 ||
      session.classroom?.id !== session.classId || session.classroom?.name !== config.className ||
      session.classroom?.workbookId !== session.workbookId || session.workbook?.id !== session.workbookId ||
      session.workbook?.pageCount !== assignment.pdf_page_count) {
    return reply("The view-only notebook response could not be verified.", 503);
  }
  // PDF image sets are deduplicated. Their original import title may belong to
  // a test assignment; display the selected assignment without rebinding ink.
  return Response.json({ ...session, workbook: { ...session.workbook, title: assignment.title || "Notebook" },
    backendOrigin: notebookOrigin }, { headers });
}
