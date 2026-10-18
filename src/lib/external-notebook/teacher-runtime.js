import React from "react";
import { createRoot } from "react-dom/client";
import { NotebookTeacherView } from "./NotebookTeacherView";
import { createNotebookTeacherController } from "./teacher-controller";

// Teacher monitoring mount. Read-only: no class mutations, no persistence writes.
// Lifecycle mirrors mountNotebookStudent: flush/updateContext/renewSession/close.
export async function mountNotebookTeacher({
  element, role, context, session, transport, persistence: _persistence,
} = {}) {
  if (role !== "teacher" || session?.role !== "teacher") {
    throw new Error("This runtime requires a teacher session.");
  }
  if (element?.nodeType !== 1 || element.childNodes.length !== 0) {
    throw new Error("An empty teacher notebook mount element is required.");
  }
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("Secure connection IDs are unavailable.");
  }
  const root = createRoot(element);
  let controller = null, disposed = false, renderError = "", queued = false, latest = null;

  class Boundary extends React.Component {
    constructor(props) { super(props); this.state = { failed: false }; }
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch(error) { renderError = error instanceof Error ? error.message : String(error); console.error("Teacher notebook view failed:", error); }
    render() {
      if (this.state.failed) return React.createElement("div", { role: "alert", style: { padding: "20px", color: "#8b2020", background: "#fff4f2" } },
        "The class monitor encountered an error. Student work is not affected. Reload this page to continue monitoring.");
      return this.props.children;
    }
  }
  function render() {
    if (disposed || queued || !latest) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (disposed || !controller) return;
      root.render(React.createElement(Boundary, null, React.createElement(NotebookTeacherView, {
        state: latest,
        onSetPage: page => controller.setPage(page),
        onRefresh: () => controller.refresh(),
        onRetryImage: () => controller.retryImage(),
        onRetryConnection: () => controller.retryConnection(),
        onLoadHistory: n => controller.loadHistory(n),
      })));
    });
  }
  try {
    controller = await createNotebookTeacherController({
      session, context, transport, clientId: globalThis.crypto.randomUUID(),
      onState: next => { latest = next; render(); },
    });
  } catch (error) { root.unmount(); throw error; }
  latest = controller.getState();
  render();
  void controller.connect();

  return {
    // Monitoring holds no unsaved work.
    async flush() { return !disposed; },
    async updateContext(next) {
      if (disposed) throw new Error("This teacher notebook has closed.");
      if (await controller.updateContext(next) !== true) throw new Error("The notebook context could not change safely.");
    },
    async renewSession(next, { isCurrent = () => true } = {}) {
      if (disposed) throw new Error("This teacher notebook is closed.");
      if (renderError) throw new Error("The class monitor needs a reload before renewing.");
      if (typeof isCurrent !== "function") throw new Error("A notebook renewal guard is required.");
      const current = () => !disposed && isCurrent() === true;
      if (!current()) return false;
      const renewed = await controller.renewSession(next, { isCurrent: current });
      if (!current()) return false;
      if (renewed !== true) throw new Error("The renewed class monitor connection is not ready.");
      return true;
    },
    async close() {
      if (disposed) return true;
      disposed = true;
      controller.close();
      root.unmount();
      return true;
    },
  };
}
