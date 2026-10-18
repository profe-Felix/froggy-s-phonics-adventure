import { createNotebookRecoverySender } from "./recovery";

// Bind to exactly one authorized class/student/workbook.
// Freeze input and finish local gestures before loadPage().
// Reading receipts is NOT acknowledging or deleting the local outbox.

const copy = value => JSON.parse(JSON.stringify(value));

const validId = value =>
  typeof value === "string" &&
  !!value.trim() &&
  value.length <= 80;

const positive = value =>
  Number.isSafeInteger(value) && value > 0;

const problem = message =>
  Object.assign(new Error(message), { status: 409 });

export function createNotebookReconciliation({
  transport,
  sendBatch,
  classId,
  studentNumber,
  workbookId,
} = {}) {
  if (
    typeof transport?.request !== "function" ||
    typeof sendBatch !== "function" ||
    typeof classId !== "string" ||
    !classId ||
    typeof workbookId !== "string" ||
    !workbookId ||
    !Number.isInteger(studentNumber) ||
    studentNumber < 1 ||
    studentNumber > 100
  ) {
    throw new Error(
      "A fixed notebook scope, transport and live sender are required."
    );
  }

  const root =
    `/classes/${encodeURIComponent(classId)}` +
    `/students/${studentNumber}`;

  const acknowledged = new Map();

  function operationPages(operations) {
    if (!Array.isArray(operations)) {
      throw problem("Notebook operations are missing.");
    }

    const result = new Map();

    for (const operation of operations) {
      if (
        !validId(operation?.id) ||
        !positive(operation.page) ||
        result.has(operation.id)
      ) {
        throw problem(
          "Notebook operation IDs or pages are invalid."
        );
      }

      result.set(operation.id, operation.page);
    }

    return result;
  }

  function positions(values, expected, requireAll) {
    if (!Array.isArray(values)) {
      throw problem(
        "Authoritative saved positions are missing."
      );
    }

    const result = new Map();
    const owners = new Map();

    for (const value of values) {
      if (
        !validId(value?.id) ||
        !positive(value.page) ||
        !positive(value.revision) ||
        !expected.has(value.id) ||
        expected.get(value.id) !== value.page ||
        result.has(value.id) ||
        (
          owners.has(value.revision) &&
          owners.get(value.revision) !== value.id
        )
      ) {
        throw problem(
          "Saved positions did not match this notebook's operations."
        );
      }

      const prior = acknowledged.get(value.id);

      if (
        prior &&
        (
          prior.page !== value.page ||
          prior.revision !== value.revision
        )
      ) {
        throw problem(
          "A previously saved operation changed position."
        );
      }

      const entry = {
        id: value.id,
        page: value.page,
        revision: value.revision,
      };

      result.set(entry.id, entry);
      owners.set(entry.revision, entry.id);
    }

    if (requireAll && result.size !== expected.size) {
      throw problem(
        "The server returned incomplete saved positions."
      );
    }

    return result;
  }

  function matchingIds(values, expected) {
    if (
      !Array.isArray(values) ||
      values.length !== expected.size ||
      new Set(values).size !== expected.size ||
      values.some(value => !expected.has(value))
    ) {
      throw problem(
        "The receipt lookup did not cover the requested actions."
      );
    }
  }

  return {
    assertReady(message) {
      if (
        message?.type !== "ready" ||
        message.classroom?.id !== classId ||
        message.classroom.workbookId !== workbookId ||
        message.capabilities?.operationPositions !== 1 ||
        message.capabilities?.receiptLookup !== 1
      ) {
        throw problem(
          "The notebook server needs the current reconciliation protocol. " +
          "Keep this connection disabled."
        );
      }
    },

    async loadPage({ page, pending = [] } = {}) {
      if (!positive(page) || !Array.isArray(pending)) {
        throw problem(
          "A page and its pending records are required."
        );
      }

      const current = pending.filter(
        record => record.operation?.page === page
      );

      const expected = operationPages(
        current.map(record => record.operation)
      );

      for (const record of current) {
        if (record.operationId !== record.operation.id) {
          throw problem(
            "A local queue record has mismatched IDs."
          );
        }
      }

      // Order matters: receipt reads must happen AFTER
      // this snapshot read.
      const snapshot = await transport.request(
        `${root}/pages/${page}`
      );

      if (
        snapshot?.page !== page ||
        snapshot.classroom?.id !== classId ||
        snapshot.workbook?.id !== workbookId ||
        !Array.isArray(snapshot.strokes) ||
        !Number.isSafeInteger(snapshot.revision) ||
        snapshot.revision < 0
      ) {
        throw problem(
          "The loaded page did not match the assigned notebook."
        );
      }

      const checkedOperationIds = [];
      const receipts = [];
      const ids = [...expected.keys()];

      for (
        let offset = 0;
        offset < ids.length;
        offset += 1000
      ) {
        const batch = ids.slice(offset, offset + 1000);

        const batchPages = new Map(
          batch.map(key => [key, page])
        );

        const response = await transport.request(
          `${root}/receipts`,
          {
            workbookId,
            operationIds: batch,
          }
        );

        matchingIds(
          response?.checkedOperationIds,
          batchPages
        );

        const found = positions(
          response.receipts,
          batchPages,
          false
        );

        checkedOperationIds.push(...batch);
        receipts.push(...found.values());
      }

      return {
        snapshot: copy(snapshot),
        checkedOperationIds,
        receipts,
      };
    },

    liveEntries(message, page) {
      if (message?.type !== "operations") return [];

      if (
        message.classId !== classId ||
        message.workbookId !== workbookId ||
        message.studentNumber !== studentNumber ||
        !positive(page)
      ) {
        throw problem(
          "A live operation came from another notebook scope."
        );
      }

      const expected = operationPages(
        message.operations
      );

      const found = positions(
        message.positions,
        expected,
        true
      );

      if (
        !Number.isSafeInteger(message.revision) ||
        message.revision < 0 ||
        [...found.values()].some(
          value => value.revision > message.revision
        )
      ) {
        throw problem(
          "A live operation's saved revision was invalid."
        );
      }

      return message.operations
        .filter(operation => operation.page === page)
        .map(operation => ({
          operation: copy(operation),
          revision: found.get(operation.id).revision,
        }))
        .sort((a, b) => a.revision - b.revision);
    },

    async sendBatch(request, options) {
      const captured = copy(request);

      const expected = operationPages(
        captured.operations
      );

      // Recovery is explicit and save-only. Never silently switch a failed
      // ordinary write into recovery or loosen its authorization.
      const recovery = options?.recovery;
      const response = recovery === undefined
        ? await sendBatch(captured, options)
        : await createNotebookRecoverySender({
          transport, classId, workbookId, studentNumber,
          isFrozen: recovery?.isFrozen, isCurrent: recovery?.isCurrent,
        })(captured.operations);

      if (
        !response ||
        !positive(response.revision) ||
        (
          response.requestId !== undefined &&
          response.requestId !== captured.requestId
        ) ||
        !Array.isArray(response.acknowledged) ||
        !response.acknowledged.length
      ) {
        throw problem(
          "The live save receipt was invalid. Queued work is retained."
        );
      }

      const ids = [
        ...new Set(response.acknowledged),
      ];

      if (ids.some(key => !expected.has(key))) {
        throw problem(
          "The save acknowledged an action that was not sent."
        );
      }

      const accepted = new Map(
        ids.map(key => [key, expected.get(key)])
      );

      const found = positions(
        response.receipts,
        accepted,
        true
      );

      if (
        [...found.values()].some(
          value => value.revision > response.revision
        )
      ) {
        throw problem(
          "The save receipt contained an invalid operation revision."
        );
      }

      for (const [key, value] of found) {
        acknowledged.set(key, value);
      }

      return response;
    },

    getAcknowledgedReceipts(operationIds) {
      if (
        !Array.isArray(operationIds) ||
        !operationIds.length ||
        operationIds.some(
          key => !acknowledged.has(key)
        )
      ) {
        throw problem(
          "A verified save receipt is required before updating pending work."
        );
      }

      return operationIds.map(
        key => copy(acknowledged.get(key))
      );
    },
  };
}
