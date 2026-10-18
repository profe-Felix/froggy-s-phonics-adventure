// Verified teacher lifecycle, renewal, transport and pending-work save guards.
// ExternalNotebookSlot owns this readiness check and the rollout switches.
export const NOTEBOOK_ENGINE_READY = true;

// Reserve a container before asynchronous startup, not after it completes.
// A failed save/close must not permit another engine to overwrite its screen.
const owners = new WeakMap();

export async function mountNotebook(options = {}) {
  const { element, role, context, session } = options || {};
  if (!["student", "teacher"].includes(role)) {
    throw new Error("A valid student or teacher notebook role is required.");
  }
  if (context?.role !== role || session?.role !== role) {
    throw new Error("The notebook context and signed session must both belong to this student role.");
  }
  if (!element || typeof element !== "object") {
    throw new Error("A notebook mount element is required.");
  }
  if (owners.has(element)) {
    throw new Error("This notebook screen is still open. Finish saving and closing it before opening another.");
  }
  const owner = {};
  owners.set(element, owner);
  let runtime;
  try {
    if (role === "teacher") {
      const { mountNotebookTeacher } = await import("./teacher-runtime");
      runtime = await mountNotebookTeacher(options);
    } else {
      const { mountNotebookStudent } = await import("./student-runtime");
      runtime = await mountNotebookStudent(options);
    }
    if (!runtime || ["flush", "updateContext", "close"].some(name => typeof runtime[name] !== "function")) {
      throw new Error("The student notebook did not provide its required save and lifecycle methods.");
    }
  } catch (error) {
    if (owners.get(element) === owner) owners.delete(element);
    throw error;
  }

  let closed = false, closing = null;
  return {
    async flush() {
      if (closed) return false;
      return await runtime.flush() === true;
    },
    async prepareRecovery(next, { isCurrent = () => true } = {}) {
      if (closed || closing) throw new Error("This notebook engine is closed or closing.");
      if (role !== "student" || next?.role !== role || !["assessment", "lesson"].includes(next.kind)) {
        throw new Error("Recovery must keep the student assessment role.");
      }
      if (typeof isCurrent !== "function") throw new Error("A notebook recovery guard is required.");
      if (typeof runtime.prepareRecovery !== "function") {
        throw new Error("The mounted notebook does not support recovery preparation. Keep it open and update the student runtime.");
      }
      const current = () => !closed && !closing && owners.get(element) === owner && isCurrent() === true;
      if (!current()) return false;
      const prepared = await runtime.prepareRecovery(next, { isCurrent: current });
      return prepared === true && current();
    },
    async renewSession(next, { isCurrent = () => true } = {}) {
      if (closed || closing) throw new Error("This notebook engine is closed or closing.");
      if (next?.role !== role) {
        throw new Error("The notebook role changed. Keep the existing notebook open until its work is saved.");
      }
      if (typeof isCurrent !== "function") throw new Error("A notebook renewal guard is required.");
      if (typeof runtime.renewSession !== "function") {
        throw new Error("The mounted notebook does not support session renewal. Keep it open and update the student runtime.");
      }
      const current = () => !closed && !closing && owners.get(element) === owner && isCurrent() === true;
      if (!current()) return false;
      const renewed = await runtime.renewSession(next, { isCurrent: current });
      return renewed === true && current();
    },
    async updateContext(next) {
      if (closed) throw new Error("This notebook engine has closed.");
      if (next?.role !== role) {
        throw new Error("The notebook role changed. Keep the existing notebook open until its work is saved.");
      }
      await runtime.updateContext(next);
    },
    close(settings = { keepOutbox: true }) {
      if (closed) return Promise.resolve(true);
      if (closing) return closing;
      closing = Promise.resolve().then(() => runtime.close(settings)).then(result => {
        if (result !== true) return false;
        closed = true;
        if (owners.get(element) === owner) owners.delete(element);
        return true;
      }).finally(() => { if (!closed) closing = null; });
      return closing;
    },
  };
}