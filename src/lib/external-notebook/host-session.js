// Own one signed session and its resources. Never use close as a save shortcut.
// The host/router must await flush BEFORE changing the source or unmounting.
export function createNotebookHostSession({
  element, context, workKey, bootstrap, openPersistence, createTransport, mount,
}) {
  if (!element || !context || !workKey ||
      [bootstrap, openPersistence, createTransport, mount].some(fn => typeof fn !== "function")) {
    throw new Error("The notebook host requires an element, context, work key and all connection methods.");
  }
  let runtime = null, transport = null, persistence = null, controller = null;
  let opening = null, closing = null, closed = false, started = false;

  async function releaseResources() {
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
      try {
        const session = await bootstrap(context);
        persistence = await openPersistence({ workKey });
        transport = await createTransport({ session, signal: controller.signal });
        runtime = await mount({
          element, role: context.role, context, session, transport, persistence,
        });
        if (!runtime || ["flush", "updateContext", "close"].some(name => typeof runtime[name] !== "function")) {
          throw new Error("The notebook engine does not implement the save and close contract.");
        }
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
    return !!runtime && (await runtime.flush()) === true;
  }

  async function updateContext(next) {
    if (closed || closing) throw new Error("This notebook host is closing or closed.");
    if (opening) await opening;
    if (!runtime) throw new Error("The notebook has not opened.");
    // The engine validates immutable identity/source and supported live updates.
    await runtime.updateContext(next);
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
      if (runtime) {
        if (typeof runtime.close !== "function" ||
            (await runtime.close({ keepOutbox: true })) !== true) return false;
        runtime = null;
      }
      await releaseResources();
      closed = true;
      started = false;
      return true;
    }).finally(() => { closing = null; });
    return closing;
  }

  return { start, flush, updateContext, close };
}
