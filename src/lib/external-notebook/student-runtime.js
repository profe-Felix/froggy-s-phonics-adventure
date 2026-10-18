import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { NotebookStudentView } from "./NotebookStudentView";
import { createNotebookStudentController } from "./student-controller";

// Student mount only. The engine dispatcher and rollout flags stay unchanged.
// The host still owns transport/persistence and must honor false flush/close.
export async function mountNotebookStudent({
  element, role, context, session, transport, persistence,
} = {}) {
  if (role !== "student" || session?.role !== "student") {
    throw new Error("This runtime requires a student session.");
  }
  if (element?.nodeType !== 1 || !element.ownerDocument ||
      typeof element.addEventListener !== "function" || !element.style ||
      element.childNodes.length !== 0) {
    throw new Error("An empty student notebook mount element is required.");
  }
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("Secure writing-device IDs are unavailable.");
  }
  const root = createRoot(element);
  const document = element.ownerDocument, window = document.defaultView;
  const finishRef = { current: null };
  let controller = null, latest = null, renderingEnabled = false, booted = false;
  let disposed = false, queued = false, everEditable = false, closeTask = null;
  let openingError = "", renderError = "", localError = "", pointerStyle = null;
  const message = error => error instanceof Error ? error.message : String(error);

  function lockInput(locked) {
    if (locked && !pointerStyle) {
      pointerStyle = {
        value: element.style.getPropertyValue("pointer-events"),
        priority: element.style.getPropertyPriority("pointer-events"),
      };
      element.style.setProperty("pointer-events", "none", "important");
    } else if (!locked && pointerStyle) {
      const previous = pointerStyle;
      pointerStyle = null;
      if (previous.value) element.style.setProperty("pointer-events", previous.value, previous.priority);
      else element.style.removeProperty("pointer-events");
    }
  }
  function blockNewPointer(event) {
    if (pointerStyle) { event.preventDefault(); event.stopImmediatePropagation(); }
  }
  async function finishGesture() {
    if (typeof finishRef.current === "function") return await finishRef.current() === true;
    // Before the first editable render, no Canvas input was possible.
    // Afterward a missing finisher is unsafe, not an implicit successful save.
    return !everEditable;
  }
  function failedRender(error) {
    renderError = message(error);
    lockInput(true);
    console.error("Student notebook screen failed:", error);
  }
  class ScreenBoundary extends React.Component {
    constructor(props) { super(props); this.state = { failed: false }; }
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch(error) { failedRender(error); }
    render() {
      if (this.state.failed) return React.createElement("div", {
        role: "alert", style: { padding: "20px", color: "#8b2020", background: "#fff4f2" },
      }, "The notebook screen encountered an error. Previously saved work was not deleted. Keep this page open if any work was still saving.");
      return this.props.children;
    }
  }
  const retry = async () => {
    if (disposed || renderError) throw new Error("The notebook screen needs attention before it can reconnect.");
    const saved = await controller.retry();
    if (saved === true) { openingError = ""; localError = ""; requestRender(); }
    return saved;
  };
  function StudentScreen({ frame }) {
    useEffect(() => {
      if (typeof finishRef.current !== "function") {
        failedRender(new Error("The student Canvas did not register its local save finisher."));
        return;
      }
      booted = true;
      requestRender();
    }, []);
    return React.createElement(ScreenBoundary, null,
      React.createElement(NotebookStudentView, {
        ...frame,
        busy: frame.busy || !booted,
        error: renderError || frame.error || openingError,
        finishRef,
        onUndo: () => controller.undo(),
        onRedo: () => controller.redo(),
        onClear: () => controller.clear(),
        onChoosePage: page => controller.choosePage(page),
        onRetry: retry,
        onError: error => { localError = message(error); },
      })
    );
  }
  function requestRender() {
    if (disposed || !renderingEnabled || queued || renderError) return;
    queued = true;
    // Always leave React's current event/effect before flushing another root.
    queueMicrotask(() => {
      queued = false;
      if (disposed || renderError || !latest) return;
      const frame = latest;
      lockInput(!booted || frame.busy);
      if (booted && frame.ready && frame.controls?.canDraw && !frame.busy &&
          !frame.error && !openingError) everEditable = true;
      try {
        // Same component types, no page/fit/status keys: the Canvas stays mounted.
        flushSync(() => root.render(React.createElement(StudentScreen, { frame })));
      } catch (error) { failedRender(error); }
    });
  }
  function acceptState(frame) {
    if (disposed) return;
    latest = frame;
    if (frame.ready && frame.syncState?.connection.connected) openingError = "";
    if (frame.busy) lockInput(true);
    requestRender();
  }
  // Browser exit/background saving is best-effort. This does not replace the
  // awaited Base44 route/source guard, and cannot promise storage after a kill.
  function finishInBackground() {
    void finishGesture().catch(error => { localError = message(error); });
  }
  function beforeUnload(event) {
    finishInBackground();
    const state = controller?.getState().syncState;
    if (state?.renewing === true || state?.save.pendingCount > 0 || state?.failedLocalCount > 0 || localError ||
        (renderError && everEditable)) {
      event.preventDefault();
      event.returnValue = "";
    }
  }
  function visibilityChanged() { if (document.visibilityState === "hidden") finishInBackground(); }
  element.addEventListener("pointerdown", blockNewPointer, true);
  window?.addEventListener("beforeunload", beforeUnload);
  window?.addEventListener("pagehide", finishInBackground);
  document.addEventListener("visibilitychange", visibilityChanged);
  lockInput(true);
  try {
    controller = await createNotebookStudentController({
      session, context, transport, persistence,
      clientId: globalThis.crypto.randomUUID(), finishGesture, onState: acceptState,
    });
  } catch (error) {
    element.removeEventListener("pointerdown", blockNewPointer, true);
    window?.removeEventListener("beforeunload", beforeUnload);
    window?.removeEventListener("pagehide", finishInBackground);
    document.removeEventListener("visibilitychange", visibilityChanged);
    root.unmount(); lockInput(false);
    throw error;
  }
  try { await controller.connect(); }
  catch (error) { openingError = message(error); }
  latest = controller.getState();
  renderingEnabled = true;
  requestRender();

  return {
    async flush() {
      if (disposed) return false;
      const saved = await controller.flush();
      if (saved === true) localError = "";
      return saved === true;
    },
    async renewSession(next, { isCurrent = () => true } = {}) {
      if (disposed || closeTask) throw new Error("This student notebook is closed or closing.");
      if (renderError) throw new Error("The notebook screen encountered an error. Existing work remains protected.");
      if (typeof isCurrent !== "function") throw new Error("A notebook renewal guard is required.");
      const current = () => !disposed && !closeTask && !renderError && isCurrent() === true;
      if (!current()) return false;
      const renewed = await controller.renewSession(next, { isCurrent: current });
      if (!current()) return false;
      if (renewed !== true) throw new Error("The renewed notebook connection is not ready. Existing work remains protected.");
      openingError = "";
      // Readiness is not a save acknowledgement. Keep localError until flush.
      latest = controller.getState();
      requestRender();
      return true;
    },
    async updateContext(next) {
      if (disposed) throw new Error("This student notebook has closed.");
      if (renderError) throw new Error("The notebook screen encountered an error. Existing work remains protected.");
      const updated = await controller.updateContext(next);
      if (updated !== true) throw new Error("The notebook context could not change safely.");
    },
    close({ keepOutbox = true } = {}) {
      if (keepOutbox !== true) return Promise.reject(new Error("Discarding notebook work is not supported."));
      if (disposed) return Promise.resolve(true);
      if (closeTask) return closeTask;
      closeTask = (async () => {
        if (await controller.close() !== true) return false;
        disposed = true;
        element.removeEventListener("pointerdown", blockNewPointer, true);
        window?.removeEventListener("beforeunload", beforeUnload);
        window?.removeEventListener("pagehide", finishInBackground);
        document.removeEventListener("visibilitychange", visibilityChanged);
        root.unmount();
        lockInput(false);
        return true;
      })().finally(() => { if (!disposed) closeTask = null; });
      return closeTask;
    },
  };
}
