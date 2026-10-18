import test from "node:test";
import assert from "node:assert/strict";
import { createNotebookSessionRenewal } from "../src/lib/external-notebook/session-renewal.js";

const context = {
  role: "teacher", kind: "assessment", sourceId: "assessment-one",
  assignmentId: "assignment-one", className: "Felix", schoolYear: "26-27",
};
function session() {
  return {
    contractVersion: 1, role: "teacher", kind: "assessment",
    sourceId: context.sourceId, classId: "class-one", workbookId: "book-one",
    classroom: { id: "class-one", workbookId: "book-one" },
    workbook: { id: "book-one", pageCount: 206 },
    backendOrigin: "https://notebook.test", accessToken: "initial-test-grant",
    expiresAtMs: Date.now() + 600000, canWrite: false, allowedPages: null,
  };
}
test("default renewal accepts teacher without a student seat and installs a fresh grant", async () => {
  const initial = session();
  let installed = false;
  const renewal = createNotebookSessionRenewal({
    session: initial, context,
    bootstrap: async () => ({ ...initial, accessToken: "renewed-test-grant", expiresAtMs: initial.expiresAtMs + 60000 }),
    install: async (candidate, lease) => {
      installed = candidate.role === "teacher" && lease.isCurrent();
      return true;
    },
  });
  assert.equal(await renewal.renew(), true);
  assert.equal(installed, true);
  renewal.updateContext({ ...context, paused: true });
  renewal.close();
});
test("teacher renewal rejects writable grants and injected student seats", () => {
  for (const patch of [{ canWrite: true }, { studentNumber: 4 }, { role: "student" }]) {
    assert.throws(() => createNotebookSessionRenewal({
      session: { ...session(), ...patch }, context,
      bootstrap: async () => session(), install: async () => true,
    }), /teacher notebook session/);
  }
});
test("teacher renewal cannot silently switch class or lesson step", async () => {
  const initial = session();
  const renewal = createNotebookSessionRenewal({
    session: initial, context,
    bootstrap: async () => ({
      ...initial, classId: "other-class",
      classroom: { id: "other-class", workbookId: initial.workbookId },
      accessToken: "different-test-grant", expiresAtMs: initial.expiresAtMs + 60000,
    }),
    install: async () => { throw new Error("Must not install"); },
  });
  await assert.rejects(renewal.renew(), /identity or destination/);
  renewal.close();
  const lesson = { ...context, kind: "lesson", stepId: "2" };
  assert.throws(() => createNotebookSessionRenewal({
    session: { ...session(), kind: "lesson", stepId: "3" }, context: lesson,
    bootstrap: async () => session(), install: async () => true,
  }), /teacher notebook session/);
});
