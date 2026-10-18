import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
const entry = new URL("../base44/functions/externalNotebookBootstrap/entry.ts", import.meta.url);
const sdk = "data:text/javascript," + encodeURIComponent("export const createClientFromRequest = () => globalThis.__bootstrapSDK();");
const source = stripTypeScriptTypes(await readFile(entry, "utf8"))
  .replace('"npm:@base44/sdk@0.8.54"', JSON.stringify(sdk))
  .replace('"../../shared/externalNotebookMapping.mjs"', JSON.stringify(new URL("../base44/shared/externalNotebookMapping.mjs", import.meta.url).href))
  .replace('"../../shared/externalNotebookNativePolicy.mjs"', JSON.stringify(new URL("../base44/shared/externalNotebookNativePolicy.mjs", import.meta.url).href))
  .replace('"../../shared/externalNotebookLessonPolicy.mjs"', JSON.stringify(new URL("../base44/shared/externalNotebookLessonPolicy.mjs", import.meta.url).href));
const { default: handler } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
function fixture(t) {
  const previous = { sdk: globalThis.__bootstrapSDK, deno: globalThis.Deno, fetch: globalThis.fetch };
  const h = {
    config: { appId: "app", className: "Class", schoolYear: "26-27", assignmentId: "assignment" },
    user: { id: "admin", role: "admin" }, reads: [], requests: [], patch: {}, dictations: [],
    student: { id: "student", class_name: "Class", school_year: "26-27", student_number: 4 },
    assignment: { id: "assignment", class_name: "Class", status: "active", pdf_page_count: 206 },
    assessment: { id: "assessment", assignment_id: "assignment", class_name: "Class", school_year: "26-27",
      active: true, paused: false, release_mode: "follow", current_page: 9,
      created_date: "2026-10-18T10:00:00.000Z", updated_date: "2026-10-18T10:00:01.000Z" },
    lessonSession: { id: "live", lesson_id: "lesson", lesson_source: "lesson", class_name: "Class",
      school_year: "26-27", active: true, phase: "try", release_mode: "stay", current_step: 0,
      created_date: "2026-10-18T10:00:00.000Z", updated_date: "2026-10-18T10:00:01.000Z" },
    lesson: { id: "lesson", steps: [{ mode: "digital_notebook",
      config: { assignmentId: "assignment", pageSelection: "range", pageStart: 9, pageEnd: 10 } }] },
  };
  globalThis.Deno = { env: { get: key =>
    key === "NOTEBOOK_NATIVE_ENABLED" ? "true" :
    key === "NOTEBOOK_BRIDGE_CONFIG" ? JSON.stringify(h.config) :
    key === "NOTEBOOK_BRIDGE_KEY" ? "nbb_" + "a".repeat(64) : undefined } };
  globalThis.__bootstrapSDK = () => ({
    auth: { me: async () => { h.reads.push("auth"); return h.user; } },
    asServiceRole: { entities: Object.fromEntries([
      ["Student", "student"], ["DigitalNotebookAssignment", "assignment"],
      ["LiveNotebookAssessment", "assessment"], ["LiveLessonSession", "lessonSession"],
      ["Lesson", "lesson"], ["SmallGroupLesson", "lesson"],
      ["LiveDictationSession", "dictations"],
    ].map(([entity, key]) => [entity, {
      get: async () => { h.reads.push(entity); return structuredClone(h[key]); },
      filter: async () => key === "dictations" ? h.dictations : [],
    }])) },
  });
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body); h.requests.push({ url, body });
    if (url.endsWith("native-controls")) return Response.json({
      contractVersion: 1, applied: true, sourceId: body.sourceId, controlRevision: 1,
    });
    return Response.json({
      contractVersion: 1, role: body.role, kind: body.kind, sourceId: body.sourceId,
      ...(body.stepId ? { stepId: body.stepId } : {}),
      ...(body.studentNumber ? { studentNumber: body.studentNumber } : {}),
      classId: "privateclass", workbookId: "workbook", accessToken: "test-opaque-value",
      expiresAtMs: Date.now() + 9 * 60 * 1000, canWrite: body.canWrite,
      allowedPages: body.allowedPages,
      classroom: { id: "privateclass", workbookId: "workbook", status: "live" },
      workbook: { id: "workbook", pageCount: 206 }, ...h.patch,
    });
  };
  h.call = body => handler(new Request("https://base44.example/function", {
    method: "POST", headers: { Origin: "https://edu-aventura.base44.app", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
  t.after(() => { globalThis.__bootstrapSDK = previous.sdk; globalThis.Deno = previous.deno; globalThis.fetch = previous.fetch; });
  return h;
}
test("teacher assessment authenticates, synchronizes once, then receives a read-only teacher grant", async t => {
  const h = fixture(t), response = await h.call({ kind: "assessment", sourceId: "assessment" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.role, "teacher"); assert.equal(body.canWrite, false);
  assert.equal(h.reads[0], "auth");
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].body.currentPage, 9);
  assert.equal(h.requests[1].body.role, "teacher");
});
test("unauthorized teacher is rejected before loading records", async t => {
  const h = fixture(t); h.user = { id: "other", role: "user" };
  assert.equal((await h.call({ kind: "assessment", sourceId: "assessment" })).status, 403);
  assert.deepEqual(h.reads, ["auth"]); assert.equal(h.requests.length, 0);
});
test("approved open teacher receives assessment and lesson grants without account authentication", async t => {
  const h = fixture(t);
  Object.assign(h.config, {
    appId: "6972eada24fac6b62ccbab8e", className: "Felix", schoolYear: "26-27",
    assignmentId: "69d650c08c922889cd55c561",
  });
  Object.assign(h.assignment, { id: h.config.assignmentId, class_name: "Felix" });
  Object.assign(h.assessment, { class_name: "Felix", assignment_id: h.config.assignmentId });
  h.lessonSession.class_name = "Felix";
  h.lesson.steps[0].config.assignmentId = h.config.assignmentId;
  h.user = null;
  for (const request of [
    { kind: "assessment", sourceId: "assessment" },
    { kind: "lesson", sourceId: "live", stepId: "0" },
  ]) {
    const response = await h.call(request);
    assert.equal(response.status, 200);
    const grant = await response.json();
    assert.equal(grant.role, "teacher");
    assert.equal(grant.canWrite, false);
    assert.equal(grant.sourceId, request.sourceId);
    if (request.kind === "lesson") assert.deepEqual(grant.allowedPages, [9, 10]);
  }
  assert.equal(h.reads.includes("auth"), false);
});
test("lesson student grant contains trusted identity, exact step, and only its saved pages", async t => {
  const h = fixture(t);
  const response = await h.call({ kind: "lesson", sourceId: "live", stepId: "0", studentId: "student" });
  assert.equal(response.status, 200);
  const grant = await response.json();
  assert.equal(grant.stepId, "0"); assert.equal(grant.studentNumber, 4);
  assert.equal(grant.canWrite, true); assert.deepEqual(grant.allowedPages, [9, 10]);
  assert.equal(h.requests.length, 1); assert.equal(h.reads.includes("auth"), false);
});
test("teacher lesson control synchronizes server step floor without a student identity", async t => {
  const h = fixture(t);
  const response = await h.call({ kind: "lesson", sourceId: "live", stepId: "0" });
  assert.equal(response.status, 200);
  assert.equal(h.requests[0].body.kind, "lesson");
  assert.equal(h.requests[0].body.lessonStepIndex, 0);
  assert.equal(h.requests[0].body.lessonSelfPaced, false);
  assert.equal(h.requests[1].body.studentId, undefined);
});
test("active competing dictation forces save-only recovery instead of writable lesson access", async t => {
  const h = fixture(t);
  h.dictations = [{ active: true, class_name: "Class", school_year: "26-27" }];
  const response = await h.call({ kind: "lesson", sourceId: "live", stepId: "0", studentId: "student" });
  assert.equal(response.status, 200);
  assert.equal(h.requests[0].body.recoveryOnly, true);
  assert.equal(h.requests[0].body.canWrite, false);
});
test("missing step, injected roles and upstream step swaps cannot authorize a lesson", async t => {
  const h = fixture(t);
  assert.equal((await h.call({ kind: "lesson", sourceId: "live", studentId: "student" })).status, 400);
  assert.equal((await h.call({ kind: "assessment", sourceId: "assessment", role: "teacher" })).status, 400);
  assert.equal(h.requests.length, 0);
  h.patch = { stepId: "1" };
  assert.equal((await h.call({ kind: "lesson", sourceId: "live", stepId: "0", studentId: "student" })).status, 503);
});
