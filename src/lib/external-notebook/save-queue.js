// sendBatch must correlate its response to THIS request and use the authorized
// transport. Only the returned server ACK may remove IDs from IndexedDB.
// No automatic sending until resume() or an explicit flush().
// Before a transition, the parent must stop drawing, finish local gestures,
// then await flush(). Closing alone is NOT saving.

export async function createNotebookSaveQueue({
  persistence, sendBatch, onState, onAcknowledged,
  batchSize = 30, batchDelayMs = 220, ackTimeoutMs = 15000,
} = {}) {
  if (!persistence || ["enqueue", "listPending", "acknowledge"].some(
    name => typeof persistence[name] !== "function"
  ) || typeof sendBatch !== "function") {
    throw new Error("Durable notebook storage and an authorized batch sender are required.");
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 30 ||
      !Number.isFinite(batchDelayMs) || batchDelayMs < 0 || batchDelayMs > 5000 ||
      !Number.isFinite(ackTimeoutMs) || ackTimeoutMs < 1 || ackTimeoutMs > 60000 ||
      !globalThis.crypto?.randomUUID || typeof TextEncoder === "undefined") {
    throw new Error("Invalid save settings or unavailable secure browser APIs.");
  }
  const copy = value => JSON.parse(JSON.stringify(value));
  const encoder = new TextEncoder();
  const seen = new Map();
  let records = new Map();
  let localTail = Promise.resolve();
  let running = null, timer = null, aborter = null;
  let closed = false, started = false, blocked = false, failures = 0, error = null;

  function problem(message) {
    return Object.assign(new Error(message), { code: "NOTEBOOK_QUEUE_PROTOCOL" });
  }

  function operationCopy(value) {
    let operation;
    try { operation = copy(value); }
    catch { throw problem("A queued mark could not be read. Existing work was not removed."); }

    if (!operation || typeof operation.id !== "string" || !operation.id.trim() ||
        operation.id.length > 80 || !Number.isInteger(operation.page) || operation.page < 1 ||
        !["stroke", "erase", "pixelErase", "undo", "redo"].includes(operation.kind)) {
      throw problem("Invalid queued operation. Existing work was not removed.");
    }

    const serialized = JSON.stringify(operation);
    if (seen.has(operation.id) && seen.get(operation.id) !== serialized) {
      throw problem("An operation ID was reused for different work.");
    }
    seen.set(operation.id, serialized);
    return operation;
  }

  function local(action) {
    const result = localTail.then(action);
    localTail = result.catch(() => {});
    return result;
  }

  function state() {
    return {
      pendingCount: records.size,
      saving: !!running,
      blocked,
      started,
      closed,
      error: error?.message || "",
    };
  }

  function notify() {
    onState?.(state());
  }

  function cancelTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function schedule(delay) {
    if (closed || !started || blocked || timer !== null || !records.size) return;
    timer = setTimeout(() => {
      timer = null;
      void pump();
    }, delay);
  }

  async function reload() {
    const values = await persistence.listPending();
    if (!Array.isArray(values)) {
      throw problem("The local save queue could not be read.");
    }

    const next = new Map();
    for (const value of values) {
      const operation = operationCopy(value.operation);
      if (!Number.isSafeInteger(value.sequence) || value.sequence < 1 ||
          value.operationId !== operation.id || next.has(operation.id)) {
        throw problem("The local save queue contains an invalid record.");
      }
      next.set(operation.id, {
        sequence: value.sequence,
        operationId: operation.id,
        operation,
      });
    }
    records = next;
  }

  function batch() {
    const selected = [];
    let bytes = 1024;

    for (const entry of [...records.values()].sort((a, b) => a.sequence - b.sequence)) {
      const size = encoder.encode(JSON.stringify(entry.operation)).length + 1;
      if (bytes + size > 450000) {
        if (!selected.length) {
          throw problem("A queued mark exceeds the save limit. Keep this notebook open.");
        }
        break;
      }
      selected.push(entry);
      bytes += size;
      if (selected.length >= batchSize) break;
    }
    return selected;
  }

  async function send(request) {
    const controller = new AbortController();
    aborter = controller;
    let timeout, rejectWait;

    const stopped = new Promise((_, reject) => {
      rejectWait = reject;
    });

    const abort = () => rejectWait(
      new Error("Notebook save interrupted; queued work is retained.")
    );

    controller.signal.addEventListener("abort", abort, { once: true });

    timeout = setTimeout(() => {
      rejectWait(new Error("Notebook save timed out; queued work is retained."));
      controller.abort();
    }, ackTimeoutMs);

    try {
      return await Promise.race([
        Promise.resolve().then(() =>
          sendBatch(copy(request), { signal: controller.signal })
        ),
        stopped,
      ]);
    } finally {
      clearTimeout(timeout);
      controller.signal.removeEventListener("abort", abort);
      if (aborter === controller) aborter = null;
    }
  }

  function failed(reason) {
    error = reason instanceof Error ? reason : new Error(String(reason));
    const status = Number(error.status);
    blocked = error.code === "NOTEBOOK_QUEUE_PROTOCOL" ||
      (status >= 400 && status < 500 && status !== 408 && status !== 429);
    failures++;
  }

  function pump() {
    if (running) return running;
    if (closed || !started || blocked) return Promise.resolve(false);

    cancelTimer();

    running = Promise.resolve().then(async () => {
      await local(reload);
      const selected = batch();
      if (!selected.length || closed) return !closed;

      const requestId = globalThis.crypto.randomUUID();
      const result = await send({
        requestId,
        operations: selected.map(entry => entry.operation),
      });

      if (closed) return false;

      const sent = new Map(
        selected.map(entry => [entry.operationId, entry.operation])
      );

      if (!result || !Number.isSafeInteger(result.revision) || result.revision < 0 ||
          !Array.isArray(result.acknowledged) || !result.acknowledged.length ||
          (result.requestId !== undefined && result.requestId !== requestId) ||
          result.acknowledged.some(id => typeof id !== "string" || !sent.has(id))) {
        throw problem("The server receipt did not match this save. Local work was retained.");
      }

      const ids = [...new Set(result.acknowledged)];

      const applied = await local(async () => {
        if (closed) return false;

        try {
          await persistence.acknowledge({
            operationIds: ids,
            revision: result.revision,
          });
        } catch {
          throw problem(
            "The server saved this batch, but local receipts could not be stored. Retry without closing."
          );
        }

        for (const id of ids) records.delete(id);
        return true;
      });

      if (!applied) return false;

      await onAcknowledged?.({
        operationIds: ids,
        revision: result.revision,
        operations: ids.map(id => copy(sent.get(id))),
      });

      failures = 0;
      error = null;
      blocked = false;
      return true;
    }).catch(reason => {
      if (!closed) failed(reason);
      return false;
    }).finally(() => {
      running = null;
      if (!closed) {
        notify();

        const retry = failures
          ? Math.min(15000, 500 * 2 ** Math.min(failures - 1, 5)) + Math.random() * 250
          : batchDelayMs;

        schedule(retry);
      }
    });

    notify();
    return running;
  }

  await local(reload);
  notify();

  return {
    async enqueue(value) {
      if (closed) throw new Error("The notebook save queue is closed.");

      const operation = operationCopy(value);

      const sequence = await local(async () => {
        const saved = await persistence.enqueue(copy(operation));

        if (!Number.isSafeInteger(saved) || saved < 1) {
          throw problem("Local storage did not confirm this mark.");
        }

        records.set(operation.id, {
          sequence: saved,
          operationId: operation.id,
          operation,
        });

        return saved;
      });

      notify();
      schedule(batchDelayMs);
      return sequence;
    },

    resume() {
      if (closed) throw new Error("The notebook save queue is closed.");

      started = true;
      blocked = false;
      failures = 0;
      error = null;

      cancelTimer();
      notify();

      // Re-read even if this tab's cache is empty: another tab may have queued work.
      timer = setTimeout(() => {
        timer = null;
        void pump();
      }, 0);
    },

    async flush() {
      if (closed) return false;

      started = true;
      blocked = false;
      failures = 0;
      error = null;

      cancelTimer();
      const deadline = Date.now() + 20000;

      try {
        while (!closed && Date.now() < deadline) {
          if (!(await pump())) return false;

          await localTail;

          if (!records.size) {
            await local(reload);
            if (!records.size) return true;
          }
        }

        return false;
      } catch (reason) {
        failed(reason);
        notify();
        return false;
      }
    },

    getPending() {
      return copy(
        [...records.values()].sort((a, b) => a.sequence - b.sequence)
      );
    },

    getState: state,

    async close() {
      closed = true;
      cancelTimer();
      aborter?.abort();

      await running;
      await localTail;

      // Persistence and unacknowledged records belong to the host, not close().
    },
  };
}
