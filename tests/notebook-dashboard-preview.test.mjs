import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { buildPreviewCatalog, previewNotebookContext, validatePreviewSession } from "../src/lib/external-notebook/dashboard-preview-model.js";
import { bootstrapDashboardPreview } from "../base44/shared/notebookDashboardPreview.mjs";

const book = { id: "a", title: "Letters", class_name: "Felix", status: "active",
  shared_across_classes: true, pdf_url: "https://files.example/book.pdf", pdf_page_count: 200 };
const config = { appId: "6972eada24fac6b62ccbab8e", className: "Felix",
  schoolYear: "26-27", assignmentId: "69d650c08c922889cd55c561" };
const body = { className: "Felix", schoolYear: "26-27", assignmentId: "a" };
const now = Date.now();
const session = { contractVersion: 1, role: "teacher", kind: "assignment", sourceId: "a",
  canWrite: false, allowedPages: null, accessToken: "fixture-not-a-real-capability", expiresAtMs: now + 600000,
  classId: "c", workbookId: "w", classroom: { id: "c", name: "Felix", workbookId: "w", status: "ended" },
  workbook: { id: "w", pageCount: 200 }, backendOrigin: "https://notebook.example" };
function fixture(extra = {}) {
  const calls = [];
  return { calls, options: { client: {}, body, config, credential: "server-only-fixture",
    notebookOrigin: session.backendOrigin, browserOrigin: "https://edu-aventura.base44.app", headers: {},
    prepare: async () => ({ client: { asServiceRole: { entities: {
      DigitalNotebookAssignment: { get: async () => book },
    } } }, config: { ...config, assignmentId: "a" }, credential: "scoped-fixture" }),
    request: async (url, options) => { calls.push({ url, options }); return Response.json(session); },
    ...extra } };
}

test("preview groups exact PDFs without merging assignment identities or different PDFs with the same title", () => {
  const rows = buildPreviewCatalog([book, { ...book, id: "b", class_name: "Valero" },
    { ...book, id: "c", pdf_url: "https://files.example/other.pdf" }], "Felix");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.find(a => a.id === "a").aliases, ["a", "b"]);
  assert.equal(buildPreviewCatalog([{ ...book, shared_across_classes: false, class_name: "Valero" }], "Felix").length, 0);
});

test("preview page context is teacher assignment scope and never live controls", () => {
  const context = previewNotebookContext({ assignment: book, className: "Felix", schoolYear: "26-27", page: 201 });
  assert.equal(context.page, 200);
  assert.equal(context.kind, "assignment");
  assert.equal(context.role, "teacher");
  assert.equal(context.sourceId, book.id);
  assert.equal(context.student, undefined);
  assert.equal(context.phase, undefined);
});

test("preview accepts ended classroom monitoring but rejects write authority, wrong class or wrong source", () => {
  const context = { assignmentId: "a", className: "Felix" };
  assert.equal(validatePreviewSession(session, context, session.backendOrigin, now), session);
  for (const patch of [{ canWrite: true }, { sourceId: "other" },
    { classroom: { ...session.classroom, name: "Valero" } }, { allowedPages: [1] }, { expiresAtMs: now }]) {
    assert.throws(() => validatePreviewSession({ ...session, ...patch }, context, session.backendOrigin, now));
  }
});

test("standalone bootstrap mints only a read-only assignment capability; it never calls controls or loads a live source", async () => {
  const { calls, options } = fixture();
  const response = await bootstrapDashboardPreview(options);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/base44/dashboard-session"));
  const request = JSON.parse(calls[0].options.body);
  assert.equal(request.canWrite, false);
  assert.equal(request.role, "teacher");
  assert.equal(request.kind, "assignment");
  assert.equal(request.sourceId, "a");
  assert.equal(request.studentId, undefined);
  assert.equal(calls[0].options.redirect, "manual");
});

test("browser cannot provide permissions, student identity, unapproved class, or wrong year", async () => {
  for (const patch of [{ canWrite: true }, { studentId: "s" }, { className: "Other" }, { schoolYear: "25-26" }]) {
    const f = fixture({ body: { ...body, ...patch } });
    assert.equal((await bootstrapDashboardPreview(f.options)).status, 400);
    assert.equal(f.calls.length, 0);
  }
});

test("bootstrap rejects unexpected upstream capabilities and reports an unpublished backend explicitly", async () => {
  let f = fixture({ request: async () => Response.json({ ...session, canWrite: true }) });
  assert.equal((await bootstrapDashboardPreview(f.options)).status, 503);
  f = fixture({ request: async () => new Response("", { status: 404 }) });
  const res = await bootstrapDashboardPreview(f.options);
  assert.match((await res.json()).error, /must be published/);
});

test("new preview UI stays isolated from old dashboards and invokes no entity mutations", async () => {
  const page = await fs.readFile(new URL("../src/pages/NotebookDashboardPreview.jsx", import.meta.url), "utf8");
  const monitor = await fs.readFile(new URL("../src/components/external-notebook/NotebookDashboardMonitor.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /entities\.\w+\.(create|update|delete)\(/);
  assert.doesNotMatch(monitor, /externalNotebookControl|bootstrapExternalNotebook|\.open\(\)/);
  assert.match(monitor, /host\.start\(\)/);
});
