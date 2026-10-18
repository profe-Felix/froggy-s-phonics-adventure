import { createNotebookSessionRenewal } from "./session-renewal";

// Own one signed session and its resources. Never use close as a save shortcut.
// The host/router must await flush BEFORE changing the source or unmounting.
export function createNotebookHostSession({
  element, context, workKey, bootstrap, openPersistence, createTransport, mount,
  createRenewal = createNotebookSessionRenewal, onRenewalState,
}) {
  if (!element || !context || !workKey ||
      [bootstrap, openPersistence, createTransport, mount, createRenewal].some(fn => typeof fn !== "function") ||
      (onRenewalState !== undefined && typeof onRenewalState !== "function")) {
    throw new Error("The notebook host requires an element, context, work key and all connection methods.");
  }
  let runtime = null, transport = null, persistence = null, controller = null;
  let opening = null, closing = null, closed = false, started = false;
  let renewal = null, updating = null, sealing = false, applyingContext = false;
  let recovering = null, recoveryKey = null;
  let generation = 0, contextEpoch = 0;
  const copy = value => JSON.parse(JSON.stringify(value));
  const scope = value => JSON.stringify([
    value?.role, value?.kind, value?.sourceId, value?.stepId ?? null,
    value?.assignmentId, value?.className, value?.schoolYear,
    value?.student?.id, value?.student?.number,
    value?.student?.className, value?.student?.schoolYear,
  ]);
  context = copy(context);
  const binding = scope(context);

  async function readyForAction() {
    const state = renewal?.getState();
    if (state && (state.renewing || state.expired)) {
      if (await renewal.renew() !== true) {
        throw new Error("The notebook connection could not renew. Keep existing work open.");
      }
    }
  }

  async function releaseResources() {
    if (renewal && typeof renewal.close === "function") renewal.close();
    renewal = null;
    generation++;
    controller?.abort();
    try {
      if (transport) {
        await transport.close();
        transport = null;
      }
    } finally {
      if (persistence) {
        await persistence.close({ keepOutbox: true });
        persistence = null;
      }
    }
  }

  function start() {
    if (closed || closing) return Promise.reject(new Error("This notebook host is closing or closed."));
    if (started) return Promise.resolve(true);
    if (opening) return opening;
    // A runtime retained after a failed initialization must never be replaced.
    if (runtime) return Promise.reject(new Error("Keep the existing notebook open; its initialization needs attention."));
    opening = (async () => {
      // Finish a previous failed startup's cleanup before creating anything new.
      if (transport || persistence) await releaseResources();
      controller = new AbortController();
      const owner = ++generation;
      try {
        const session = await bootstrap(context);
        persistence = await openPersistence({ workKey });
        transport = await createTransport({ session, signal: controller.signal });
        const active = () => owner === generation && !closed && !sealing && !applyingContext;
        renewal = createRenewal({
          session, context,
          bootstrap: async nextContext => {
            if (!active()) throw new Error("Notebook renewal is waiting for the current change.");
            const revision = contextEpoch;
            const candidate = await bootstrap(nextContext);
            if (!active() || revision !== contextEpoch) {
              throw new Error("Notebook context changed while requesting renewal.");
            }
            return candidate;
          },
          install: async (candidate, { isCurrent }) => {
            const target = runtime, revision = contextEpoch;
            const current = () => active() && runtime === target &&
              revision === contextEpoch && isCurrent();
            if (!target || !current()) return false;
            if (typeof transport?.prepareSession !== "function" ||
                typeof target.renewSession !== "function") {
              throw new Error("The mounted notebook needs its renewable transport and engine. Existing work remains open.");
            }
            const installed = await target.renewSession(candidate, { isCurrent: current });
            return installed === true && current();
          },
          onState: state => {
            if (owner === generation && !closed) onRenewalState?.(state);
          },
        });
        if (!renewal || ["start", "renew", "updateContext", "getState", "close"].some(name => typeof renewal[name] !== "function")) {
          throw new Error("The notebook renewal coordinator is incomplete.");
        }
        runtime = await mount({
          element, role: context.role, context, session, transport, persistence,
        });
        if (!runtime || ["flush", "updateContext", "close"].some(name => typeof runtime[name] !== "function")) {
          throw new Error("The notebook engine does not implement the save and close contract.");
        }
        renewal.start();
        started = true;
        return true;
      } catch (error) {
        // Once an engine exists, it may hold unsaved local gesture tasks.
        // Do not destroy it, abort its connection, or replace it on retry.
        if (!runtime) await releaseResources();
        throw error;
      }
    })().finally(() => { opening = null; });
    return opening;
  }

  async function flush() {
    if (closed || closing) return false;
    if (opening) {
      try { await opening; } catch { return false; }
    }
    try {
      if (updating) await updating;
      await readyForAction();
    } catch { return false; }
    if (closed || closing) return false;
    return !!runtime && (await runtime.flush()) === true;
  }

  async function updateContext(next) {
    if (closed || closing) throw new Error("This notebook host is closing or closed.");
    if (opening) await opening;
    if (closed || closing) throw new Error("This notebook host is closing or closed.");
    if (!runtime) throw new Error("The notebook has not opened.");
    if (updating) throw new Error("Another notebook context update is still finishing.");
    const candidate = copy(next);
    if (scope(candidate) !== binding) {
      throw new Error("Changing student, assignment or lesson step requires a separate safe handoff.");
    }
    updating = Promise.resolve().then(async () => {
      await readyForAction();
      if (closed || closing) throw new Error("This notebook host is closing or closed.");
      applyingContext = true;
      contextEpoch++;
      try {
        // Only accepted runtime changes become future bootstrap context.
        await runtime.updateContext(candidate);
        renewal.updateContext(candidate);
        context = candidate;
      } finally { applyingContext = false; }
    }).finally(() => { updating = null; });
    return updating;
  }

  function recover(next = context) {
    if (closed || closing || !started || !runtime || !renewal) {
      return Promise.reject(
        new Error("This notebook host is not ready for recovery.")
      );
    }

    const staged = { ...copy(next), blocked: true };

    if (
      staged.role !== "student" ||
      !["assessment", "lesson", "assignment"].includes(staged.kind) ||
      scope(staged) !== binding
    ) {
      return Promise.reject(
        new Error("Recovery must keep the same student assessment identity.")
      );
    }

    const key = JSON.stringify(staged);

    if (recovering) {
      if (key !== recoveryKey) {
        return Promise.reject(
          new Error("Another notebook recovery is still finishing.")
        );
      }
      return recovering;
    }

    if (updating) {
      return Promise.reject(
        new Error("A notebook context update is still finishing.")
      );
    }

    const target = runtime;
    const owner = generation;

    if (
      typeof target.prepareRecovery !== "function" ||
      typeof target.renewSession !== "function" ||
      typeof transport?.prepareSession !== "function"
    ) {
      return Promise.reject(
        new Error(
          "The mounted notebook needs its recovery update. Existing work remains open."
        )
      );
    }

    const current = () =>
      !closed &&
      !sealing &&
      generation === owner &&
      runtime === target;

    recoveryKey = key;

    recovering = Promise.resolve().then(async () => {
      applyingContext = true;
      contextEpoch++;

      // Invalidate any old renewal before preparing. Its cancellation must not
      // become an unhandled rejection while local gesture work is finishing.
      const previous = renewal.getState().renewing
        ? renewal.renew().then(() => true, () => false)
        : null;

      try {
        const prepare = async () => {
          if (
            !current() ||
            await target.prepareRecovery(staged, {
              isCurrent: current,
            }) !== true ||
            !current()
          ) {
            throw new Error(
              "The notebook could not freeze safely. Existing work remains open."
            );
          }
        };

        try {
          await prepare();
        } catch (reason) {
          if (!previous) throw reason;

          // An existing install may own the controller's input lock. Let that
          // invalidated install settle, then make ONE local preparation retry.
          await previous;
          await prepare();
        }

        if (previous) await previous;

        if (!current()) {
          throw new Error(
            "Notebook recovery lost its owner. Existing work remains open."
          );
        }

        // Only successfully frozen context becomes future bootstrap context.
        renewal.updateContext(staged);
        context = staged;
        applyingContext = false;

        if (await renewal.renew() !== true || !current()) {
          throw new Error(
            "The recovery connection could not renew. Existing work remains open."
          );
        }

        if (await target.flush() !== true || !current()) {
          throw new Error(
            "Recovery is not yet confirmed saved. Keep this notebook open."
          );
        }

        // Stay locally blocked. A separate accepted context update is required
        // before future normal renewal may request writing again.
        return true;
      } finally {
        applyingContext = false;
      }
    }).finally(() => {
      recovering = null;
      recoveryKey = null;
      updating = null;
    });

    updating = recovering;
    return recovering;
  }

  function renew() {
    if (closed || closing || !started || !renewal) {
      return Promise.reject(new Error("This notebook host is not ready to renew."));
    }
    if (updating) return Promise.reject(new Error("A notebook context update is still finishing."));
    return renewal.renew();
  }

  function close() {
    if (closed) return Promise.resolve(true);
    if (closing) return closing;
    closing = Promise.resolve().then(async () => {
      if (opening) {
        // Startup can fail before resources exist, or after an engine exists.
        // In either case still run the appropriate close/cleanup path.
        try { await opening; } catch { /* Cleanup below owns any retained resources. */ }
      }
      if (updating) {
        try { await updating; } catch { /* Runtime close still owns pending work. */ }
      }
      try { await readyForAction(); } catch { return false; }
      // Do not stop renewal until the engine confirms safe close. In-flight
      // renewal may need to recover an expired credential before it can save.
      sealing = true;
      if (runtime) {
        if (typeof runtime.close !== "function" ||
            (await runtime.close({ keepOutbox: true })) !== true) return false;
        runtime = null;
      }
      await releaseResources();
      closed = true;
      started = false;
      return true;
    }).finally(() => { sealing = false; closing = null; });
    return closing;
  }

  return {
    start, flush, updateContext, recover, renew, close,
    getRenewalState: () => renewal?.getState() ?? null,
  };
}
