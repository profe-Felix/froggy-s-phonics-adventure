import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { resolveNotebookAssessmentControls } from "../base44/shared/externalNotebookControlPolicy.mjs";

// Node >=22.13; real handler and policy, controlled SDK/HTTP only. No live data.
const entry = new URL("../base44/functions/externalNotebookControl/entry.ts", import.meta.url);
const policy = new URL("../base44/shared/externalNotebookControlPolicy.mjs", import.meta.url);
const sdk = "data:text/javascript," + encodeURIComponent(
  "export const createClientFromRequest = request => globalThis.__notebookControlSDK(request);",
);
const source = stripTypeScriptTypes(await readFile(entry, "utf8"))
  .replace('"npm:@base44/sdk@0.8.54"', JSON.stringify(sdk))
  .replace('"../../shared/externalNotebookControlPolicy.mjs"', JSON.stringify(policy.href))
  .replace('"../../shared/externalNotebookLessonPolicy.mjs"', JSON.stringify(new URL("../base44/shared/externalNotebookLessonPolicy.mjs", import.meta.url).href));
const { default: handler } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
function fixture(t) {
  const previous = { Deno: globalThis.Deno, fetch: globalThis.fetch, sdk: globalThis.__notebookControlSDK };
  const h = {
    env: { NOTEBOOK_NATIVE_ENABLED: "true", NOTEBOOK_BRIDGE_KEY: "nbb_" + "a".repeat(64) },
    config: { appId: "app", className: "Class", schoolYear: "26-27", assignmentId: "assignment" },
    user: { id: "teacher", role: "admin" }, reads: [], requests: [], authError: false, sdkError: false,
    assessment: { id: "assessment", class_name: "Class", school_year: "26-27",
      assignment_id: "assignment", active: true, paused: false, release_mode: "follow",
      current_page: 9, total_pages: 206, target_students: [], finished_students: [],
      created_date: "2026-10-18T10:00:00.000Z", updated_date: "2026-10-18T10:00:01.000Z" },
    assignment: { id: "assignment", class_name: "Class", status: "active", pdf_page_count: 206 },
    upstreamStatus: 200, upstream: { contractVersion: 1, applied: true, controlRevision: 2, sourceId: "assessment" },
  };
  globalThis.Deno = { env: { get: key => key === "NOTEBOOK_BRIDGE_CONFIG" ? JSON.stringify(h.config) : h.env[key] } };
  globalThis.__notebookControlSDK = () => {
    if (h.sdkError) throw new Error("private SDK setup detail");
    return {
      auth: { me: async () => { if (h.authError) throw new Error("private auth detail"); return h.user; } },
      asServiceRole: { entities: {
        LiveNotebookAssessment: { get: async id => { h.reads.push(["assessment", id]); return h.assessment; } },
        DigitalNotebookAssignment: { get: async id => { h.reads.push(["assignment", id]); return h.assignment; } },
      } },
    };
  };
  globalThis.fetch = async (url, init) => {
    h.requests.push({ url, init, body: JSON.parse(init.body) });
    return Response.json(h.upstream, { status: h.upstreamStatus });
  };
  h.call = (patch = {}, options = {}) => handler(new Request("https://base44.example/function", {
    method: "POST", headers: { Origin: "https://edu-aventura.base44.app", "Content-Type": "application/json", ...options.headers },
    body: JSON.stringify({ kind: "assessment", sourceId: "assessment", requestId: "00000000-0000-4000-8000-000000000001", ...patch }),
  }));
  t.after(() => {
    globalThis.Deno = previous.Deno; globalThis.fetch = previous.fetch;
    globalThis.__notebookControlSDK = previous.sdk;
  });
  return h;
}
test("disabled gate and foreign origins cannot read entities or send controls", async t => {
  const h = fixture(t); h.env.NOTEBOOK_NATIVE_ENABLED = "false";
  assert.equal((await h.call()).status, 503);
  h.env.NOTEBOOK_NATIVE_ENABLED = "true";
  assert.equal((await h.call({}, { headers: { Origin: "https://other.example" } })).status, 403);
  assert.equal(h.reads.length, 0); assert.equal(h.requests.length, 0);
});
test("teacher authentication and explicit per-class authorization precede service-role reads", async t => {
  const h = fixture(t);
  h.authError = true; assert.equal((await h.call()).status, 401);
  h.authError = false; h.sdkError = true; assert.equal((await h.call()).status, 401);
  h.sdkError = false; h.user = { id: "student", role: "user" };
  assert.equal((await h.call()).status, 403); assert.equal(h.reads.length, 0);
  h.config.teacherUserIds = ["student"];
  assert.equal((await h.call()).status, 200);
});
test("browser-supplied policy, roles, timestamps and forged mappings are rejected", async t => {
  const h = fixture(t);
  for (const patch of [{ currentPage: 3 }, { role: "admin" }, { className: "Other" }, { sourceUpdatedAtMs: 123 }, { requestId: "invalid" }]) {
    assert.equal((await h.call(patch)).status, 400);
  }
  assert.equal(h.reads.length, 0); assert.equal(h.requests.length, 0);
});
test("fresh trusted records determine the exact fixed-origin request and matching acknowledgment", async t => {
  const h = fixture(t);
  h.assessment.paused = true;
  h.assessment.target_students = [{ class_name: "Class", student_number: 4 }];
  const result = await h.call();
  assert.equal(result.status, 200);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, "https://live-classroom-annotation-notebook.replit.app/api/notebook/base44/native-controls");
  assert.equal(h.requests[0].init.redirect, "manual");
  assert.deepEqual(h.requests[0].body, resolveNotebookAssessmentControls(h));
  assert.equal(h.requests[0].body.status, "paused");
  assert.deepEqual(await result.json(), h.upstream);
  assert.equal(result.headers.get("cache-control"), "no-store");
});
test("changed records, stale upstream state and malformed acknowledgments never claim success", async t => {
  const h = fixture(t);
  h.assessment.id = "other"; assert.equal((await h.call()).status, 403);
  h.assessment.id = "assessment"; h.upstreamStatus = 409;
  assert.equal((await h.call()).status, 409);
  // A redirect never succeeds and must not forward the bridge credential.
  h.upstreamStatus = 302;
  assert.equal((await h.call()).status, 503);
  assert.equal(h.requests.at(-1).init.redirect, "manual");
  h.upstreamStatus = 200;
  for (const patch of [{ applied: false }, { sourceId: "other" }, { controlRevision: 0 }, { controlRevision: 1.5 }]) {
    const old = h.upstream; h.upstream = { ...old, ...patch };
    assert.equal((await h.call()).status, 503); h.upstream = old;
  }
});
