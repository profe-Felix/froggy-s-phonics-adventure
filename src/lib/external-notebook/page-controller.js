import { createNotebookPageState } from "./page-state";

// One instance per authorized notebook/page.
// The reconciliation adapter owns the fixed
// class/student/workbook scope.
//
// This controller never deletes IndexedDB records.
//
// Freeze input and await the canvas finishRef
// BEFORE load() or any transition.

export function createNotebookPageController({
  page,
  reconciliation,
  onState,
} = {}) {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    [
      "loadPage",
      "liveEntries",
      "getAcknowledgedReceipts",
    ].some(
      name =>
        typeof reconciliation?.[name] !== "function"
    ) ||
    (
      onState !== undefined &&
      typeof onState !== "function"
    )
  ) {
    throw new Error(
      "A fixed page and reconciliation adapter are required."
    );
  }

  const copy = value =>
    JSON.parse(JSON.stringify(value));

  const model = createNotebookPageState({ page });
  const pending = new Map();

  let generation = 0;
  let closed = false;
  let error = "";

  function state() {
    const value = model.getState();

    return {
      ...value,
      closed,
      error,
      ready: value.ready && !closed && !error,
    };
  }

  function publish() {
    if (!closed) {
      onState?.(state());
    }
  }

  function open() {
    if (closed) {
      throw new Error(
        "This notebook page controller is closed."
      );
    }
  }

  function update(action) {
    open();

    try {
      action();
    } catch (reason) {
      error =
        reason instanceof Error
          ? reason.message
          : String(reason);

      publish();
      throw reason;
    }

    publish();
  }

  return {
    getState: state,

    addLocal(record) {
      update(() => {
        model.addLocal(record);

        pending.set(
          record.operationId,
          copy(record)
        );
      });
    },

    async load({
      pending: restored = [...pending.values()],
      isCurrent = () => true,
    } = {}) {
      open();

      if (typeof isCurrent !== "function") {
        throw new Error(
          "A connection-generation guard is required."
        );
      }

      if (!isCurrent()) {
        return null;
      }

      const attempt = ++generation;
      const ticket = model.beginLoad();

      const current = () =>
        !closed &&
        attempt === generation &&
        isCurrent();

      error = "";

      try {
        if (!Array.isArray(restored)) {
          throw new Error(
            "Pending queue records are required."
          );
        }

        // beginLoad comes first so restored old records
        // cannot become new optimistic ink before their
        // saved positions have been checked.
        for (const record of restored) {
          if (record?.operation?.page !== page) {
            continue;
          }

          model.addLocal(record);

          pending.set(
            record.operationId,
            copy(record)
          );
        }

        publish();

        const result =
          await reconciliation.loadPage({
            page,
            pending: [...pending.values()].map(copy),
          });

        if (!current()) {
          if (
            !closed &&
            attempt === generation
          ) {
            model.failLoad(ticket);
            publish();
          }

          return null;
        }

        if (
          !model.finishLoad(
            ticket,
            result.snapshot,
            result
          )
        ) {
          return null;
        }

        error = "";
        publish();

        return copy(result.snapshot);
      } catch (reason) {
        if (
          closed ||
          attempt !== generation
        ) {
          return null;
        }

        model.failLoad(ticket);

        error =
          reason instanceof Error
            ? reason.message
            : String(reason);

        publish();

        if (!isCurrent()) {
          return null;
        }

        throw reason;
      }
    },

    receive(message) {
      let changed = false;

      update(() => {
        const entries =
          reconciliation.liveEntries(
            message,
            page
          );

        changed = entries.length > 0;

        if (changed) {
          model.receive(entries);
        }
      });

      return changed;
    },

    acknowledge({
      operationIds,
      operations,
    } = {}) {
      open();

      update(() => {
        if (
          !Array.isArray(operationIds) ||
          !operationIds.length ||
          !Array.isArray(operations) ||
          operations.length !== operationIds.length
        ) {
          throw new Error(
            "An explicit save acknowledgement and its operations are required."
          );
        }

        const ids = new Set(operationIds);
        const byId = new Map();

        for (const operation of operations) {
          if (
            !ids.has(operation?.id) ||
            byId.has(operation.id)
          ) {
            throw new Error(
              "The acknowledged operations did not match their IDs."
            );
          }

          byId.set(
            operation.id,
            operation
          );
        }

        if (
          ids.size !== operationIds.length
        ) {
          throw new Error(
            "Acknowledged operation IDs must be unique."
          );
        }

        const receipts =
          reconciliation.getAcknowledgedReceipts(
            operationIds
          );

        const scoped = operations.filter(
          operation => operation.page === page
        );

        const positions = new Map(
          receipts.map(value => [
            value.id,
            value,
          ])
        );

        model.receive(
          scoped.map(operation => {
            const saved =
              positions.get(operation.id);

            if (
              !saved ||
              saved.page !== page
            ) {
              throw new Error(
                "The save receipt belongs to another page."
              );
            }

            return {
              revision: saved.revision,
              operation,
            };
          })
        );

        // A shared-browser queue can save another tab's
        // records. Those are committed live entries,
        // not invented local pending records.
        const localIds = scoped
          .map(operation => operation.id)
          .filter(id => pending.has(id));

        if (localIds.length) {
          model.acknowledge({
            operationIds: localIds,
            receipts: localIds.map(
              id => positions.get(id)
            ),
          });

          for (const id of localIds) {
            pending.delete(id);
          }
        }
      });
    },

    close() {
      closed = true;
      generation++;

      // Do not flush, acknowledge, delete work,
      // close storage, or navigate here.
    },
  };
}
