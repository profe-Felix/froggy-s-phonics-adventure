// Save-only sender for an ALREADY FROZEN outbox. No drawing, token renewal,
// queue deletion, Base44 entities, or permission changes belong in this helper.
export function createNotebookRecoverySender({
  transport, classId, studentNumber, workbookId, isFrozen, isCurrent,
} = {}) {
  const positive = value => Number.isSafeInteger(value) && value > 0;
  const fail = message => Object.assign(new Error(message), { status: 409 });

  if (typeof transport?.request !== "function" ||
      typeof classId !== "string" || !classId ||
      typeof workbookId !== "string" || !workbookId ||
      !positive(studentNumber) || studentNumber > 100 ||
      typeof isFrozen !== "function" || typeof isCurrent !== "function") {
    throw fail("A fixed student notebook and frozen-owner guards are required.");
  }

  let active = null;

  const check = () => {
    if (isFrozen() !== true || isCurrent() !== true) {
      throw fail("Recovery requires the same frozen notebook. Pending work was retained.");
    }
  };

  return function recover(operations) {
    try {
      check();

      if (!Array.isArray(operations) || !operations.length || operations.length > 30) {
        throw fail("A pending batch of 1 to 30 operations is required.");
      }

      const snapshot = JSON.parse(JSON.stringify(operations));
      const expected = new Map();

      for (const operation of snapshot) {
        if (typeof operation?.id !== "string" || !operation.id ||
            !positive(operation.page) || expected.has(operation.id)) {
          throw fail("Pending operations require unique original IDs and valid pages.");
        }

        expected.set(operation.id, operation.page);
      }

      const key = JSON.stringify(snapshot);

      if (active) {
        if (active.key !== key) {
          throw fail("Another recovery batch is still saving.");
        }

        return active.promise;
      }

      const entry = { key };

      entry.promise = Promise.resolve().then(async () => {
        check();

        const receipt = await transport.request(
          `/classes/${encodeURIComponent(classId)}/students/${studentNumber}/recover-operations`,
          { workbookId, operations: snapshot },
        );

        check();

        if (!positive(receipt?.revision) ||
            !Array.isArray(receipt.acknowledged) ||
            receipt.acknowledged.length !== expected.size ||
            new Set(receipt.acknowledged).size !== expected.size ||
            receipt.acknowledged.some(id => !expected.has(id)) ||
            !Array.isArray(receipt.receipts) ||
            receipt.receipts.length !== expected.size) {
          throw fail("Recovery was not fully acknowledged. Pending work was retained.");
        }

        const seen = new Set();

        for (const position of receipt.receipts) {
          if (!expected.has(position?.id) || seen.has(position.id) ||
              position.page !== expected.get(position.id) ||
              !positive(position.revision) ||
              position.revision > receipt.revision) {
            throw fail("Recovery positions did not match the pending work.");
          }

          seen.add(position.id);
        }

        return receipt;
      }).finally(() => {
        if (active === entry) active = null;
      });

      active = entry;
      return entry.promise;
    } catch (error) {
      return Promise.reject(error);
    }
  };
}
