import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { requireNotebookTeacherSession, isTeacherSignInRequired, notebookTeacherReturnUrl } from "../src/lib/external-notebook/teacher-auth.js";

test("missing or expired teacher sign-in returns a safe actionable error", async () => {
  for (const auth of [
    { me: async () => { throw { response: { status: 401 }, secret: "never-echo-this" }; } },
    { me: async () => ({}) },
  ]) {
    await assert.rejects(requireNotebookTeacherSession(auth), error =>
      isTeacherSignInRequired(error) && !error.message.includes("never-echo-this"));
  }
});
test("network failure and a forbidden account are not mislabeled as an expired login", async () => {
  for (const status of [403, 429, 503]) {
    await assert.rejects(requireNotebookTeacherSession({ me: async () => { throw { status }; } }),
      error => !isTeacherSignInRequired(error));
  }
});
test("teacher interface verifies the account but leaves authorization to the server", async () => {
  const user = { id: "teacher-account", role: "user" };
  assert.equal(await requireNotebookTeacherSession({ me: async () => user }), user);
});
test("assessment sign-in returns to the same source without putting credentials in a URL", () => {
  const url = new URL(notebookTeacherReturnUrl("https://school.example", {
    role: "teacher", kind: "assessment", sourceId: "existing-id", className: "Felix",
    assignmentId: "assignment-id", accessToken: "never-put-this-in-url",
  }));
  assert.equal(url.pathname, "/LiveLesson");
  assert.equal(url.searchParams.get("notebook_assessment"), "existing-id");
  assert.equal(url.searchParams.get("class"), "Felix");
  assert.ok(!url.href.includes("never-put-this-in-url"));
});
test("lesson sign-in restores the existing session and setup does not invent a source", () => {
  const lesson = new URL(notebookTeacherReturnUrl("https://school.example", { role: "teacher", kind: "lesson", sourceId: "lesson-session" }));
  assert.equal(lesson.searchParams.get("session"), "lesson-session");
  const setup = new URL(notebookTeacherReturnUrl("https://school.example", { role: "teacher", kind: "assessment" }));
  assert.equal(setup.searchParams.get("notebook_setup"), "1");
  assert.equal(setup.searchParams.has("notebook_assessment"), false);
  assert.throws(() => notebookTeacherReturnUrl("https://school.example", { role: "student", kind: "assessment" }), /not a student login/);
});
test("native assessment authenticates before ending or creating assessment records", async () => {
  const text = await readFile(new URL("../src/components/live/LiveNotebookAssessmentPanel.jsx", import.meta.url), "utf8");
  const start = text.slice(text.indexOf("const startSession = async"));
  assert.ok(start.indexOf("await authorizeNotebookTeacherStart(") < start.indexOf("LiveNotebookAssessment.filter"));
  assert.ok(start.indexOf("await authorizeNotebookTeacherStart(") < start.indexOf("LiveNotebookAssessment.create"));
});
