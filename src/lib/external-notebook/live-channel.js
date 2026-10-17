// One fixed class/workbook/seat per channel. Tokens stay in transport.
// Reconnecting is NOT rehydration: the ready-event handler must refresh
// authoritative state before resolving.
// This module never deletes or acknowledges local work.
// After an async read, handlers must check context.isCurrent()
// before changing UI.

export function createNotebookLiveChannel({
  transport, classId, workbookId, studentNumber, clientId, role, expiresAtMs,
  onEvent, onState, handshakeTimeoutMs = 12000, reconnectDelayMs = 400,
} = {}) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (typeof transport?.openSocket !== "function" || typeof onEvent !== "function" ||
      typeof classId !== "string" || !classId ||
      typeof workbookId !== "string" || !workbookId ||
      !uuid.test(clientId || "") || !["student", "teacher"].includes(role) ||
      (studentNumber !== undefined &&
        (!Number.isInteger(studentNumber) || studentNumber < 1 || studentNumber > 100)) ||
      (role === "student" && studentNumber === undefined) ||
      !Number.isSafeInteger(expiresAtMs) ||
      !Number.isFinite(handshakeTimeoutMs) ||
      handshakeTimeoutMs < 1 || handshakeTimeoutMs > 60000 ||
      !Number.isFinite(reconnectDelayMs) ||
      reconnectDelayMs < 1 || reconnectDelayMs > 8000) {
    throw new Error(
      "A valid fixed notebook scope, session expiry and event handler are required."
    );
  }

  let generation = 0, socket = null, hello = null, connected = false;
  let started = false, closed = false, blocked = false, attempts = 0, error = null;
  let retryTimer = null, expiryTimer = null;
  let events = Promise.resolve();

  const waiting = new Map();

  const makeError = (message, status = 503) =>
    Object.assign(new Error(message), { status });

  const state = () => ({
    connected,
    connecting: !!hello,
    blocked,
    closed,
    error: error?.message || "",
    status: error?.status || 0,
  });

  const notify = () => onState?.(state());

  function clearRetry() {
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  function expired() {
    return Date.now() >= expiresAtMs;
  }

  function settle(id, reason, value) {
    const entry = waiting.get(id);
    if (!entry) return;

    waiting.delete(id);
    entry.cleanup();

    if (reason) entry.reject(reason);
    else entry.resolve(value);
  }

  function fail(epoch, reason) {
    if (epoch !== generation || closed) return;

    clearRetry();
    generation++;
    connected = false;

    error = expired()
      ? makeError(
          "Notebook access expired. Reconnect through Base44; local work is retained.",
          401
        )
      : reason instanceof Error
        ? reason
        : makeError(String(reason));

    const status = Number(error.status);
    blocked = status >= 400 && status < 500 &&
      status !== 408 && status !== 429;

    const old = socket;
    socket = null;

    if (hello) {
      const pending = hello;
      hello = null;
      clearTimeout(pending.timer);
      pending.reject(error);
    }

    for (const id of [...waiting.keys()]) settle(id, error);

    old?.close();
    notify();

    if (started && !blocked) {
      clearRetry();

      const delay = Math.min(
        8000,
        reconnectDelayMs * 2 ** Math.min(attempts++, 5)
      ) + Math.random() * 200;

      retryTimer = setTimeout(() => {
        retryTimer = null;
        void connect().catch(() => {});
      }, delay);
    }
  }

  function receive(epoch, message) {
    if (closed || epoch !== generation) return;

    if (message.type === "ack" || message.type === "error") {
      if (typeof message.requestId !== "string" ||
          !waiting.has(message.requestId)) return;

      if (message.type === "error") {
        const status = Number(message.status);

        settle(
          message.requestId,
          makeError(
            typeof message.error === "string"
              ? message.error
              : "This save was rejected; local work is retained.",
            Number.isInteger(status) && status >= 400 && status <= 599
              ? status
              : 503
          )
        );
      } else {
        settle(message.requestId, null, message);
      }

      return;
    }

    events = events.then(async () => {
      if (closed || epoch !== generation) return;

      if (message.classId !== undefined && message.classId !== classId) {
        throw makeError("A live event did not match this class.", 400);
      }

      if (message.type === "ready") {
        if (!hello || message.classroom?.id !== classId) {
          throw makeError(
            "The live connection did not confirm the expected class.",
            400
          );
        }

        // The parent hydrates here. Saves wait until it succeeds.
        await onEvent(message, {
          isCurrent: () => !closed && epoch === generation,
        });

        if (closed || epoch !== generation) return;

        const pending = hello;
        if (!pending) return;

        clearTimeout(pending.timer);
        hello = null;
        connected = true;
        blocked = false;
        error = null;
        attempts = 0;

        pending.resolve();
        notify();
        return;
      }

      if (message.type === "operations" || message.type === "changed") {
        if (message.workbookId !== workbookId) return;

        if (studentNumber !== undefined &&
            message.studentNumber !== studentNumber) return;
      }

      await onEvent(message, {
        isCurrent: () => !closed && epoch === generation,
      });
    }).catch(reason => {
      fail(epoch, reason);
    });

    return events;
  }

  function connect() {
    if (closed) {
      return Promise.reject(
        makeError("The notebook live channel is closed.", 409)
      );
    }

    if (expired()) {
      fail(
        generation,
        makeError("Notebook access expired. Reconnect through Base44.", 401)
      );
      return Promise.reject(error);
    }

    if (blocked) return Promise.reject(error);
    if (connected && socket?.readyState === 1) return Promise.resolve();
    if (hello) return hello.promise;

    started = true;
    clearRetry();

    const epoch = ++generation;

    for (const id of [...waiting.keys()]) {
      settle(
        id,
        makeError("The live connection was replaced; local work is retained.")
      );
    }

    const old = socket;
    socket = null;
    connected = false;
    old?.close();

    events = Promise.resolve();

    let resolve, reject;
    const promise = new Promise((a, b) => {
      resolve = a;
      reject = b;
    });

    hello = { promise, resolve, reject, timer: null };

    hello.timer = setTimeout(
      () => fail(
        epoch,
        makeError("The notebook connection timed out; local work is retained.")
      ),
      handshakeTimeoutMs
    );

    clearTimeout(expiryTimer);

    expiryTimer = setTimeout(
      () => fail(
        generation,
        makeError("Notebook access expired. Reconnect through Base44.", 401)
      ),
      Math.min(2147483647, Math.max(1, expiresAtMs - Date.now()))
    );

    Promise.resolve().then(() => transport.openSocket({
      classId,
      studentNumber,
      clientId,

      onMessage: message => receive(epoch, message),

      onError: reason => fail(epoch, reason),

      onClose: event => fail(
        epoch,
        makeError(
          event?.code === 1008
            ? "Notebook access expired or changed. Reconnect through Base44; local work is retained."
            : "The live connection closed; local work is retained.",
          event?.code === 1008
            ? 401
            : event?.code === 1009
              ? 413
              : 503
        )
      ),
    })).then(candidate => {
      if (closed || epoch !== generation) {
        candidate.close();
        return;
      }

      socket = candidate;
    }).catch(reason => {
      fail(epoch, reason);
    });

    notify();
    return promise;
  }

  async function waitUntilConnected(signal) {
    if (signal?.aborted) {
      throw makeError("This save was cancelled; local work is retained.", 408);
    }

    const pending = connect();
    if (!signal) return pending;

    let abort;

    try {
      await Promise.race([
        pending,
        new Promise((_, reject) => {
          abort = () => reject(
            makeError("This save was cancelled; local work is retained.", 408)
          );

          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) abort();
        }),
      ]);
    } finally {
      if (abort) signal.removeEventListener("abort", abort);
    }
  }

  return {
    connect,

    getState: state,

    async sendBatch(request, { signal } = {}) {
      if (role !== "student") {
        throw makeError("Teacher live channels are read-only for now.", 403);
      }

      if (!request ||
          typeof request.requestId !== "string" ||
          !uuid.test(request.requestId) ||
          !Array.isArray(request.operations) ||
          !request.operations.length ||
          request.operations.length > 30) {
        throw makeError("Invalid notebook save request.", 400);
      }

      await waitUntilConnected(signal);

      if (signal?.aborted) {
        throw makeError("This save was cancelled; local work is retained.", 408);
      }

      if (waiting.size) {
        throw makeError(
          "Another notebook save is already waiting for a receipt.",
          429
        );
      }

      if (!connected || socket?.readyState !== 1) {
        const reason = makeError(
          "The live connection is not ready; local work is retained."
        );

        fail(generation, reason);
        throw reason;
      }

      const frame = JSON.stringify({
        type: "operations",
        requestId: request.requestId,
        workbookId,
        operations: request.operations,
      });

      if (new TextEncoder().encode(frame).length > 550000) {
        throw makeError("This save exceeds the live-message limit.", 413);
      }

      return new Promise((resolve, reject) => {
        const abort = () => settle(
          request.requestId,
          makeError("This save was cancelled; local work is retained.", 408)
        );

        waiting.set(request.requestId, {
          resolve,
          reject,
          cleanup: () => signal?.removeEventListener("abort", abort),
        });

        signal?.addEventListener("abort", abort, { once: true });

        try {
          socket.send(frame);
        } catch (reason) {
          fail(generation, reason);
        }
      });
    },

    close() {
      if (closed) return;

      closed = true;
      connected = false;
      generation++;

      clearRetry();
      clearTimeout(expiryTimer);

      const reason = makeError(
        "The notebook live channel closed; local work is retained.",
        408
      );

      if (hello) {
        clearTimeout(hello.timer);
        hello.reject(reason);
        hello = null;
      }

      for (const id of [...waiting.keys()]) settle(id, reason);

      const old = socket;
      socket = null;
      old?.close();

      notify();

      // The host owns transport and IndexedDB.
      // Neither is cleared or closed here.
    },
  };
}
