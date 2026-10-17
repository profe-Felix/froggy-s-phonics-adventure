import { materializeDrawing } from "./ink-model";

// One instance per workbook/student/page. The parent owns that scope.
// Load the page snapshot FIRST, then query receipts for pending IDs.
// checkedOperationIds includes both found and not-yet-committed queried IDs.
// Incoming entries need EACH operation's real saved revision, not batch max.
// This module does not fetch, authorize, acknowledge IndexedDB, or activate UI.

const copy = value => JSON.parse(JSON.stringify(value));

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

const signature = value => JSON.stringify(value, (_, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(
        Object.entries(item).sort(([a], [b]) => a.localeCompare(b))
      )
    : item
);

function id(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 80) {
    throw new Error("A valid saved operation ID is required.");
  }
  return value;
}

function revision(value, allowZero = false) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error("A valid authoritative operation revision is required.");
  }
  return value;
}

export function createNotebookPageState({ page } = {}) {
  if (!Number.isInteger(page) || page < 1) {
    throw new Error("A fixed page is required.");
  }

  let baseline = [];
  let baselineRevision = 0;
  let loaded = false;
  let loading = false;
  let loadFailed = false;
  let activeLoad = null;

  const pending = new Map();
  const journal = new Map();
  const confirmed = new Map();
  const revisionIds = new Map();

  const history = operation =>
    operation.kind === "undo" || operation.kind === "redo";

  function operation(value) {
    const result = copy(value);

    if (!result || result.page !== page ||
        !["stroke", "erase", "pixelErase", "undo", "redo"].includes(result.kind)) {
      throw new Error("This operation does not belong to this page.");
    }

    id(result.id);

    if (result.kind === "stroke" &&
        (!result.stroke ||
          result.stroke.id !== result.id ||
          !Array.isArray(result.stroke.points))) {
      throw new Error("The saved stroke is invalid.");
    }

    if (result.kind === "pixelErase" &&
        (!result.erasePath ||
          result.erasePath.id !== result.id ||
          !Array.isArray(result.erasePath.points) ||
          !Array.isArray(result.erasePath.targetIds))) {
      throw new Error("The saved pixel erasure is invalid.");
    }

    if (result.kind === "erase") id(result.targetId);

    if (history(result)) {
      if (!Array.isArray(result.targetIds) || !result.targetIds.length) {
        throw new Error("The saved history action has no targets.");
      }
      result.targetIds.forEach(id);
    }

    return freeze(result);
  }

  function positions(values) {
    if (!Array.isArray(values)) {
      throw new Error("Authoritative operation positions are required.");
    }

    const result = new Map();
    const owners = new Map();

    for (const value of values) {
      const key = id(value.id);
      const at = revision(value.revision);

      if (value.page !== page ||
          (result.has(key) && result.get(key) !== at) ||
          (confirmed.has(key) && confirmed.get(key).revision !== at) ||
          (owners.has(at) && owners.get(at) !== key) ||
          (revisionIds.has(at) && revisionIds.get(at) !== key)) {
        throw new Error(
          "A saved operation position changed or belongs to another page."
        );
      }

      result.set(key, at);
      owners.set(at, key);
    }

    return result;
  }

  function prepare(entries) {
    if (!Array.isArray(entries)) {
      throw new Error("Saved operation entries are required.");
    }

    const result = [];
    const incoming = new Map();
    const owners = new Map();

    for (const entry of entries) {
      const op = operation(entry.operation);
      const at = revision(entry.revision);
      const content = signature(op);
      const previous = incoming.get(op.id) || confirmed.get(op.id);

      if ((owners.has(at) && owners.get(at) !== op.id) ||
          (revisionIds.has(at) && revisionIds.get(at) !== op.id)) {
        throw new Error(
          "A saved revision was assigned to two different operations."
        );
      }

      if (previous &&
          (previous.revision !== at ||
            (previous.signature !== undefined &&
              previous.signature !== content))) {
        throw new Error("A saved operation was changed instead of retried.");
      }

      const local = pending.get(op.id);

      if (local && local.signature !== content) {
        throw new Error(
          "Saved ink did not match this device's queued action."
        );
      }

      const record = {
        revision: at,
        operation: op,
        signature: content,
      };

      incoming.set(op.id, record);
      owners.set(at, op.id);
      result.push(record);
    }

    return result;
  }

  function apply(entries) {
    for (const entry of entries) {
      confirmed.set(entry.operation.id, {
        revision: entry.revision,
        signature: entry.signature,
      });

      revisionIds.set(entry.revision, entry.operation.id);

      if (entry.revision > baselineRevision) {
        journal.set(entry.operation.id, entry);
      }
    }
  }

  return {
    addLocal(record) {
      if (!Number.isSafeInteger(record?.sequence) || record.sequence < 1) {
        throw new Error("A committed local queue sequence is required.");
      }

      const op = operation(record.operation);

      if (record.operationId !== op.id) {
        throw new Error("The local queue ID does not match.");
      }

      const content = signature(op);
      const previous = pending.get(op.id);
      const saved = confirmed.get(op.id);

      if ((previous && previous.signature !== content) ||
          (saved?.signature !== undefined && saved.signature !== content)) {
        throw new Error("A queued ID was reused for different ink.");
      }

      pending.set(op.id, {
        sequence: record.sequence,
        operation: op,
        signature: content,
        safeOverlay:
          previous?.safeOverlay ?? (loaded && !loading && !loadFailed),
      });

      if (saved && saved.revision > baselineRevision) {
        journal.set(op.id, {
          revision: saved.revision,
          operation: op,
          signature: content,
        });
      }
    },

    beginLoad() {
      loading = true;
      activeLoad = Object.freeze({});
      return activeLoad;
    },

    failLoad(ticket) {
      if (!activeLoad || ticket !== activeLoad) return false;

      activeLoad = null;
      loading = false;
      loadFailed = true;
      return true;
    },

    finishLoad(
      ticket,
      snapshot,
      { checkedOperationIds = [], receipts = [] } = {}
    ) {
      if (ticket !== activeLoad || !activeLoad) return false;

      if (snapshot?.page !== page || !Array.isArray(snapshot.strokes)) {
        throw new Error("The snapshot does not match this page.");
      }

      const at = revision(snapshot.revision, true);

      if (loaded && at < baselineRevision) {
        throw new Error("The page snapshot moved backwards.");
      }

      const strokes = copy(snapshot.strokes);
      const strokeIds = new Set();

      for (const stroke of strokes) {
        const key = id(stroke.id);

        if (strokeIds.has(key) || !Array.isArray(stroke.points)) {
          throw new Error(
            "The snapshot contains an invalid or repeated stroke."
          );
        }

        strokeIds.add(key);
      }

      if (!Array.isArray(checkedOperationIds)) {
        throw new Error("Receipt coverage is required.");
      }

      const checked = new Set(checkedOperationIds.map(id));
      const found = positions(receipts);

      for (const key of found.keys()) {
        if (!checked.has(key)) {
          throw new Error(
            "A receipt was not part of this page's lookup."
          );
        }
      }

      for (const key of pending.keys()) {
        if (!confirmed.has(key) && !checked.has(key)) {
          throw new Error(
            "Pending receipt lookup is incomplete. Do not replace the visible work."
          );
        }
      }

      // Validate everything before replacing the current visible baseline.
      for (const [key, savedAt] of found) {
        confirmed.set(key, {
          ...confirmed.get(key),
          revision: savedAt,
        });
        revisionIds.set(savedAt, key);
      }

      baseline = freeze(strokes);
      baselineRevision = at;

      for (const [key, entry] of journal) {
        if (entry.revision <= at) journal.delete(key);
      }

      for (const [key, entry] of pending) {
        const saved = confirmed.get(key);

        if (!saved) {
          entry.safeOverlay = true;
        } else if (saved.revision > at) {
          journal.set(key, {
            revision: saved.revision,
            operation: entry.operation,
            signature: entry.signature,
          });
        }
      }

      loaded = true;
      loading = false;
      loadFailed = false;
      activeLoad = null;
      return true;
    },

    receive(entries) {
      apply(prepare(entries));
    },

    acknowledge({ operationIds, receipts } = {}) {
      if (!Array.isArray(operationIds) || !operationIds.length) {
        throw new Error("Explicit acknowledged IDs are required.");
      }

      const ids = [...new Set(operationIds.map(id))];
      const found = positions(receipts);

      if (found.size !== ids.length ||
          ids.some(key => !found.has(key) || !pending.has(key))) {
        throw new Error(
          "The receipt does not match this page's queued actions."
        );
      }

      const entries = prepare(ids.map(key => ({
        revision: found.get(key),
        operation: pending.get(key).operation,
      })));

      apply(entries);

      for (const key of ids) pending.delete(key);
    },

    getState() {
      const ordered = [...journal.values()].sort(
        (a, b) => a.revision - b.revision
      );

      const firstHistory = ordered.findIndex(
        entry => history(entry.operation)
      );

      const visible = firstHistory < 0
        ? ordered
        : ordered.slice(0, firstHistory);

      const locals = [...pending.entries()].sort(
        (a, b) => a[1].sequence - b[1].sequence
      );

      let unresolvedPending = 0;
      let waitingForHistory = false;
      const overlays = [];

      for (const [key, entry] of locals) {
        if (confirmed.has(key)) continue;

        if (!entry.safeOverlay) {
          unresolvedPending++;
          continue;
        }

        if (history(entry.operation)) {
          waitingForHistory = true;
        } else {
          overlays.push(entry.operation);
        }
      }

      const needsReload = firstHistory >= 0;

      return {
        page,
        loaded,
        loading,
        loadFailed,
        snapshotRevision: baselineRevision,
        pendingCount: pending.size,
        unresolvedPending,
        waitingForHistory,
        needsReload,

        ready:
          loaded &&
          !loading &&
          !loadFailed &&
          !needsReload &&
          !unresolvedPending &&
          !waitingForHistory,

        strokes: loaded
          ? materializeDrawing(
              [
                ...visible.map(entry => entry.operation),
                ...overlays,
              ],
              baseline
            )
          : [],
      };
    },
  };
}
