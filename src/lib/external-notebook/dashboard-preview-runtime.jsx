import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { NotebookTeacherView } from "./NotebookTeacherView";
import { createNotebookTeacherController } from "./teacher-controller";
import { parsePreviewPage } from "./dashboard-preview-model";

// Preview-only adapter. Original teacher mounts and dashboards stay unchanged.
function DashboardPageInput({ state, onSetPage }) {
  const [draft, setDraft] = useState(String(state.page));
  const [error, setError] = useState("");
  useEffect(() => { setDraft(String(state.page)); setError(""); }, [state.page]);
  const commit = () => {
    const page = parsePreviewPage(draft, state.pages);
    if (page === null) {
      setError(`Enter a whole page number from ${state.pages[0]} to ${state.pages.at(-1)}.`);
      return;
    }
    setError("");
    onSetPage(page);
  };
  return <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 14px" }}>
    <label>Go to page{" "}
      <input type="number" inputMode="numeric" aria-label="Go to page" min={state.pages[0]}
        max={state.pages.at(-1)} step="1" value={draft}
        onChange={e => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setDraft(String(state.page)); setError(""); }
        }}
        style={{ width: 76, border: "1px solid #94a3b8", borderRadius: 8, padding: "5px 8px" }} />
    </label>
    <span>of {state.pages.length}</span>
    <span style={{ fontSize: 12, color: "#64748b" }}>Type a number and press Enter, or use the Page dropdown below.</span>
    {error && <span role="alert" style={{ color: "#9f1239" }}>{error}</span>}
  </div>;
}

export async function mountNotebookDashboard({ element, role, context, session, transport, onPageChange } = {}) {
  if (role !== "teacher" || session?.role !== "teacher" || session.canWrite !== false ||
      element?.nodeType !== 1 || element.childNodes.length !== 0) {
    throw new Error("An empty, read-only teacher dashboard mount is required.");
  }
  const root = createRoot(element);
  let controller, latest, disposed = false, queued = false, failed = false;
  class Boundary extends React.Component {
    constructor(props) { super(props); this.state = { failed: false }; }
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch() { failed = true; }
    render() {
      return this.state.failed
        ? <div role="alert">The dashboard could not display this page. Reload to retry. Student work is unchanged.</div>
        : this.props.children;
    }
  }
  const setPage = page => {
    if (controller?.setPage(page)) onPageChange?.(page);
  };
  function render() {
    if (disposed || queued || !latest) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (disposed || !controller) return;
      root.render(<Boundary>
        <DashboardPageInput state={latest} onSetPage={setPage} />
        <NotebookTeacherView state={latest} onSetPage={setPage} formation
          onRefresh={() => controller.refresh()} onRetryImage={() => controller.retryImage()}
          onRetryConnection={() => controller.retryConnection()} onLoadHistory={n => controller.loadHistory(n)} />
      </Boundary>);
    });
  }
  try {
    controller = await createNotebookTeacherController({
      session, context, transport, clientId: globalThis.crypto.randomUUID(),
      onState: state => { latest = state; render(); },
    });
  } catch (error) { root.unmount(); throw error; }
  latest = controller.getState();
  render();
  void controller.connect();
  return {
    async flush() { return !disposed; },
    async updateContext(next) {
      if (disposed || await controller.updateContext(next) !== true) throw new Error("The dashboard page could not change.");
    },
    async renewSession(next, { isCurrent = () => true } = {}) {
      const current = () => !disposed && !failed && isCurrent() === true;
      if (!current()) return false;
      const result = await controller.renewSession(next, { isCurrent: current });
      return result === true && current();
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
