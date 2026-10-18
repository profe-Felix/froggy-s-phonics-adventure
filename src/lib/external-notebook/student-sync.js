import { createNotebookLiveChannel } from "./live-channel";
import { createNotebookSaveQueue } from "./save-queue";
import { createNotebookReconciliation } from "./reconciliation";
import { createNotebookPageController } from "./page-controller";

// One fixed authorized student/workbook scope.
// No UI or Base44 calls belong here.
//
// finishGesture must finish LOCAL canvas/action tasks.
// It must NEVER call this session's flush().
//
// Before changing pages or sources, the host must:
// 1. Freeze input.
// 2. Finish gestures and successfully flush.
// 3. Only then release the view or close.
//
// close() alone is not a save or navigation permission.

export async function createNotebookStudentSync({
  transport,
  persistence,
  classId,
  workbookId,
  studentNumber,
  clientId,
  expiresAtMs,
  finishGesture,
  onReady,
  onEvent = async () => {},
  onState,
  maxPages = 4,
} = {}) {
  if (
    typeof finishGesture !== "function" ||
    typeof onReady !== "function" ||
    typeof onEvent !== "function" ||
    (
      onState !== undefined &&
      typeof onState !== "function"
    ) ||
    !Number.isInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > 8
  ) {
    throw new Error(
      "Local gesture finishing and authoritative ready handlers are required."
    );
  }

  const copy = value =>
    JSON.parse(JSON.stringify(value));

  const pages = new Map();
  const writes = new Set();
  const failedLocal = new Map();

  let queue;
  let channel;
  let closed = false;
  let closing = null;
  let renewing = null, resuming = null, resumingExpiry;
  let recovering = null;
  let renewalEpoch = 0;
  const idleWaiters = new Set();

  const problem = (message, status = 409) =>
    Object.assign(
      new Error(message),
      { status }
    );

  const emit = (type, value) => {
    if (!closed) {
      onState?.({ type, ...value });
    }
  };

  function open() {
    if (closed) {
      throw problem(
        "This notebook synchronization session is closed."
      );
    }
  }

  const reconciliation =
    createNotebookReconciliation({
      transport,
      classId,
      workbookId,
      studentNumber,
      sendBatch: (request, options) =>
        channel.sendBatch(request, options),
    });

  function pageFor(page) {
    if (
      !Number.isSafeInteger(page) ||
      page < 1
    ) {
      throw problem(
        "A valid notebook page is required.",
        400
      );
    }

    if (!pages.has(page)) {
      if (pages.size >= maxPages) {
        throw problem(
          "Release a saved, unused page before loading another notebook page."
        );
      }

      pages.set(
        page,
        createNotebookPageController({
          page,
          reconciliation,
          onState: value =>
            emit("page", value),
        })
      );
    }

    return pages.get(page);
  }

  async function hydrate(page, isCurrent) {
    open();

    if (typeof isCurrent !== "function") {
      throw problem(
        "A connection-generation guard is required."
      );
    }

    if (!isCurrent()) {
      return null;
    }

    return pageFor(page).load({
      pending: queue.getPending(),
      isCurrent: () =>
        !closed && isCurrent(),
    });
  }

  function enqueue(value) {
    open();

    const operation = copy(value);
    const target = pages.get(operation?.page);

    if (!target) {
      throw problem(
        "Load this notebook page before adding ink.",
        400
      );
    }

    const task = Promise.resolve().then(
      async () => {
        try {
          const sequence =
            await queue.enqueue(operation);

          target.addLocal({
            sequence,
            operationId: operation.id,
            operation,
          });

          failedLocal.delete(operation.id);

          return sequence;
        } catch (reason) {
          failedLocal.set(
            operation.id,
            operation
          );

          emit("local", {
            failedCount: failedLocal.size,
          });

          throw reason;
        }
      }
    );

    writes.add(task);

    void task.then(
      () => {
        writes.delete(task);

        emit("local", {
          failedCount: failedLocal.size,
        });
      },
      () => {
        writes.delete(task);
      }
    );

    return task;
  }

  async function finishLocal() {
    if (closed) {
      return false;
    }

    try {
      if (
        (await finishGesture()) !== true
      ) {
        return false;
      }

      await Promise.allSettled(
        [...writes]
      );

      for (
        const operation of
        [...failedLocal.values()]
      ) {
        await enqueue(operation);
      }

      return (
        !closed &&
        !writes.size &&
        !failedLocal.size
      );
    } catch {
      return false;
    }
  }

  function inRenewal() {
    return !!renewing || !!resuming || channel.getState().suspended;
  }

  async function waitForSaveIdle() {
    while (!closed && queue.getState().saving) {
      await new Promise(resolve => idleWaiters.add(resolve));
    }
    return !closed;
  }

  function suspendForRenewal() {
    open();
    if (recovering) return Promise.resolve(false);
    if (renewing) return renewing;
    if (resuming) return Promise.resolve(false);
    renewing = Promise.resolve().then(async () => {
      if (closed || channel.suspendForRenewal() !== true) return false;
      renewalEpoch++;
      if (!await finishLocal()) return false;
      if (!await waitForSaveIdle()) return false;
      return !closed && !writes.size && !failedLocal.size && channel.getState().suspended;
    }).finally(() => {
      renewing = null;
      emit("renewal", { active: inRenewal() });
    });
    emit("renewal", { active: true });
    return renewing;
  }

  function resumeAfterRenewal({ expiresAtMs: nextExpiry } = {}) {
    open();
    if (recovering) {
      return Promise.reject(problem("Finish pending-work recovery before reconnecting."));
    }
    if (resuming) {
      if (nextExpiry !== resumingExpiry) {
        return Promise.reject(problem("Another connection renewal is still finishing."));
      }
      return resuming;
    }
    resumingExpiry = nextExpiry;
    resuming = Promise.resolve().then(async () => {
      if (renewing && await renewing !== true) return false;
      if (closed) return false;
      if (!channel.getState().suspended) throw problem("Suspend the connection before renewing it.");
      if (!await finishLocal()) return false;
      if (!await waitForSaveIdle()) return false;
      await channel.resumeAfterRenewal(
        nextExpiry === undefined ? {} : { expiresAtMs: nextExpiry }
      );
      return !closed && channel.getState().connected;
    }).finally(() => {
      resuming = null;
      resumingExpiry = undefined;
      emit("renewal", { active: inRenewal() });
    });
    emit("renewal", { active: true });
    return resuming;
  }

  function recoverPending({ isFrozen, isCurrent } = {}) {
    open();
    if (typeof isFrozen !== "function" || typeof isCurrent !== "function") {
      return Promise.reject(problem("Frozen-input and current-owner guards are required."));
    }
    if (recovering || renewing || resuming || !channel.getState().suspended) {
      return Promise.reject(problem("Suspend the live connection before recovering pending work."));
    }
    const epoch = renewalEpoch;
    const frozen = () => !closed && channel.getState().suspended === true &&
      isFrozen() === true;
    const current = () => !closed && epoch === renewalEpoch && isCurrent() === true;
    const valid = () => frozen() && current();
    try {
      if (!valid()) throw problem("Recovery requires the same frozen notebook owner.");
    } catch (reason) { return Promise.reject(reason); }
    recovering = Promise.resolve().then(async () => {
      // The controller owns the input lock and fresh signed authorization.
      // Retain the same Canvas, outbox, operation IDs and page controllers.
      if (!valid() || !await finishLocal() || !valid()) return false;
      const saved = await queue.recover({ isFrozen: frozen, isCurrent: current });
      return saved === true && valid() && !writes.size && !failedLocal.size &&
        queue.getState().pendingCount === 0;
    }).finally(() => {
      recovering = null;
      emit("recovery", { active: false });
      // Leave the channel suspended. Recovery is not permission to draw.
    });
    emit("recovery", { active: true });
    return recovering;
  }
  channel = createNotebookLiveChannel({
    transport,
    classId,
    workbookId,
    studentNumber,
    clientId,
    expiresAtMs,
    role: "student",

    onState: value => {
      emit("connection", value);

      // Drawing may remain locked for pending undo/redo.
      // Sending those actions must not wait for their
      // own authoritative redraw.
      if (
        !closed &&
        value.connected &&
        queue
      ) {
        queue.resume();
      }
    },

    onEvent: async (message, context) => {
      if (
        closed ||
        !context.isCurrent()
      ) {
        return;
      }

      if (message.type === "ready") {
        reconciliation.assertReady(message);

        if (!(await finishLocal())) {
          throw problem(
            "Finish saving local marks before reconnecting."
          );
        }

        if (
          !context.isCurrent() ||
          closed
        ) {
          return;
        }

        let hydrated = false;

        await onReady(message, {
          isCurrent: context.isCurrent,

          loadPage: async page => {
            const result = await hydrate(
              page,
              context.isCurrent
            );

            if (
              result &&
              !closed &&
              context.isCurrent()
            ) {
              hydrated = true;
            }

            return result;
          },
        });

        if (
          !closed &&
          context.isCurrent() &&
          !hydrated
        ) {
          throw problem(
            "The ready handler must await an authoritative page load."
          );
        }

        return;
      }

      if (
        message.type === "operations"
      ) {
        for (
          const target of pages.values()
        ) {
          target.receive(message);
        }
      }

      if (
        !closed &&
        context.isCurrent()
      ) {
        await onEvent(message, context);
      }
    },
  });

  try {
    queue = await createNotebookSaveQueue({
      persistence,
      sendBatch: reconciliation.sendBatch,

      onState: value => {
        emit("save", value);
        if (!value.saving) {
          for (const resolve of idleWaiters) resolve();
          idleWaiters.clear();
        }
      },

      onAcknowledged: acknowledgement => {
        const affected = new Set(
          acknowledgement.operations.map(
            operation => operation.page
          )
        );

        for (const page of affected) {
          pages
            .get(page)
            ?.acknowledge(acknowledgement);
        }
      },
    });
  } catch (reason) {
    closed = true;
    channel.close();

    throw reason;
  }

  return {
    connect() {
      open();
      if (inRenewal()) {
        return Promise.reject(problem("The notebook connection is renewing.", 408));
      }
      return channel.connect();
    },

    suspendForRenewal,
    resumeAfterRenewal,
    recoverPending,

    enqueue,

    async loadPage(
      page,
      { isCurrent = () => true } = {}
    ) {
      open();

      if (inRenewal()) {
        throw problem("Keep this page open while the connection renews.");
      }
      const epoch = renewalEpoch;

      if (!(await finishLocal())) {
        throw problem(
          "Local marks are not yet safely queued."
        );
      }

      if (inRenewal() || epoch !== renewalEpoch) {
        throw problem("Keep this page open while the connection renews.");
      }
      return hydrate(page, () => epoch === renewalEpoch && isCurrent());
    },

    getPageState(page) {
      return (
        pages.get(page)?.getState() ||
        null
      );
    },

    getPending() {
      return queue.getPending();
    },

    getState() {
      return {
        closed,
        renewing: inRenewal(),
        connection: channel.getState(),
        save: queue.getState(),
        failedLocalCount: failedLocal.size,
      };
    },

    resume() {
      open();
      if (inRenewal()) return false;
      queue.resume();
    },

    async flush() {
      const epoch = renewalEpoch;
      if (!(await finishLocal())) {
        return false;
      }

      if (inRenewal() || epoch !== renewalEpoch) return false;
      const saved = await queue.flush();

      return (
        saved &&
        !closed &&
        !inRenewal() &&
        epoch === renewalEpoch &&
        !writes.size &&
        !failedLocal.size &&
        !queue.getState().pendingCount
      );
    },

    releasePage(page) {
      open();
      if (inRenewal()) return false;

      const target = pages.get(page);

      if (!target) {
        return true;
      }

      if (
        writes.size ||
        target.getState().loading ||
        [...failedLocal.values()].some(
          operation =>
            operation.page === page
        ) ||
        queue.getPending().some(
          record =>
            record.operation.page === page
        )
      ) {
        return false;
      }

      target.close();
      pages.delete(page);

      return true;
    },

    close() {
      if (closing) {
        return closing;
      }

      closed = true;
      channel.close();
      for (const resolve of idleWaiters) resolve();
      idleWaiters.clear();

      closing = (async () => {
        await queue.close();

        await Promise.allSettled(
          [...writes]
        );

        for (
          const target of pages.values()
        ) {
          target.close();
        }

        // The host still owns transport and persistence.
        // Never delete the outbox here.
      })();

      return closing;
    },
  };
}
