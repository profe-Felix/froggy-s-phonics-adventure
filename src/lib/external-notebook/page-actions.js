// Bind once to a page and a writing-device UUID, not to a mutable current page.
// enqueue(operation) must resolve to its positive IndexedDB sequence ONLY
// after the local transaction commits. These callbacks do not confirm server ACKs.
// writerId labels a writing device; it is not verified student identity.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clone = value => JSON.parse(JSON.stringify(value));

function checkedId(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 80) {
    throw new Error("A valid notebook operation or stroke ID is required.");
  }
  return value;
}

function checkedUuid(value) {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new Error("A valid writing-device or action-group UUID is required.");
  }
  return value;
}

function checkedTime(value) {
  if (!Number.isFinite(value) || value < 0 || value > 9999999999999) {
    throw new Error("The drawing timestamp is invalid.");
  }
  return value;
}

function checkedTargets(values) {
  if (!Array.isArray(values) || !values.length || values.length > 1000) {
    throw new Error("An action must target between 1 and 1000 IDs.");
  }
  return [...new Set(values.map(checkedId))].sort();
}

function checkedPath(value, minimumWidth) {
  if (!value || !Number.isFinite(value.width) ||
      value.width < minimumWidth || value.width > 0.1 ||
      !Array.isArray(value.points) || !value.points.length ||
      value.points.length > 3000) {
    throw new Error("The drawing path or width is invalid.");
  }
  let previous;
  const points = value.points.map(point => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
        point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
      throw new Error("Drawing points must stay within the page.");
    }
    const result = { x: point.x, y: point.y };
    if (point.t !== undefined) {
      if (!Number.isFinite(point.t) || point.t < 0 || point.t > 3600000 ||
          (previous !== undefined && point.t < previous)) {
        throw new Error("Drawing timing must not run backwards.");
      }
      result.t = point.t;
    }
    previous = point.t;
    return result;
  });
  return {
    id: checkedId(value.id), width: value.width, points,
    ...(value.startedAt === undefined ? {} : { startedAt: checkedTime(value.startedAt) }),
  };
}

export function createNotebookPageActions({ page, writerId, enqueue } = {}) {
  if (!Number.isInteger(page) || page < 1 || typeof enqueue !== "function") {
    throw new Error("A fixed page and durable local enqueue function are required.");
  }
  checkedUuid(writerId);
  if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined") {
    throw new Error("Secure operation-ID generation is unavailable.");
  }
  const memo = new Map();
  const operationIds = new Map();
  const clearGroups = new Map();
  const recording = (action, at, groupId) => ({
    action, recordedAt: checkedTime(at), writerId,
    ...(groupId ? { groupId } : {}),
  });

  async function submit(key, input, build) {
    const serialized = JSON.stringify(input);
    let entry = memo.get(key);
    if (entry && entry.serialized !== serialized) {
      throw new Error("An action ID was reused for different work. Nothing was overwritten.");
    }
    if (!entry) {
      entry = { serialized, operation: null };
      memo.set(key, entry);
      entry.operation = Promise.resolve().then(() => build(Date.now())).then(operation => {
        const payload = JSON.stringify(operation);
        const previous = operationIds.get(operation.id);
        if (previous !== undefined && previous !== payload) {
          throw new Error("A notebook operation ID collided with different work.");
        }
        operationIds.set(operation.id, payload);
        return operation;
      }).catch(error => {
        if (memo.get(key) === entry) memo.delete(key);
        throw error;
      });
    }
    const operation = await entry.operation;
    const sequence = await enqueue(clone(operation));
    if (!Number.isSafeInteger(sequence) || sequence < 1) {
      throw new Error("Local storage did not confirm this mark. Keep the notebook open.");
    }
    return true;
  }

  async function erase(targetId, groupId, action = "erase") {
    checkedId(targetId);
    checkedUuid(groupId);
    const input = { targetId, groupId, action };
    return submit(JSON.stringify(input), input, async at => {
      const bytes = new TextEncoder().encode(JSON.stringify([writerId, page, action, groupId, targetId]));
      const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
      const id = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
      return { id, kind: "erase", page, targetId, recording: recording(action, at, groupId) };
    });
  }

  function historyAction(kind, targets, actionId) {
    checkedUuid(actionId);
    const targetIds = checkedTargets(targets);
    return submit(`${kind}:${actionId}`, targetIds, at => ({
      id: actionId, kind, page, targetIds,
      recording: recording(kind, at, actionId),
    }));
  }

  return {
    async onStroke(value) {
      const path = checkedPath(value, 0.0001);
      if (!["pen", "highlighter"].includes(value.tool) ||
          typeof value.color !== "string" || !/^#[0-9a-f]{6}$/i.test(value.color)) {
        throw new Error("The ink tool or color is invalid.");
      }
      const stroke = { ...path, tool: value.tool, color: value.color };
      return submit(`stroke:${stroke.id}`, stroke, at => ({
        id: stroke.id, kind: "stroke", page, stroke,
        recording: recording("stroke", stroke.startedAt ?? at),
      }));
    },
    onErase(targetId, groupId) {
      return erase(targetId, groupId);
    },
    async onPixelErase(value, targets) {
      const path = checkedPath(value, 0.005);
      const erasePath = { ...path, targetIds: checkedTargets(targets) };
      return submit(`pixelErase:${path.id}`, erasePath, at => ({
        id: path.id, kind: "pixelErase", page, erasePath,
        recording: recording("pixelErase", path.startedAt ?? at),
      }));
    },
    async clear(strokes, groupId) {
      checkedUuid(groupId);
      if (!Array.isArray(strokes)) throw new Error("The page's current strokes are required.");
      const ids = [...new Set(strokes.map(stroke => checkedId(stroke?.id)))].sort();
      const signature = JSON.stringify(ids);
      if (clearGroups.has(groupId) && clearGroups.get(groupId) !== signature) {
        throw new Error("A clear group was reused for a different set of marks.");
      }
      clearGroups.set(groupId, signature);
      // Clear is grouped erase events, NEVER an unsupported kind: "clear".
      // A partial failure is retryable with this same group and stroke list.
      for (const id of ids) await erase(id, groupId, "clear");
      return true;
    },
    undo(targetIds, actionId) {
      return historyAction("undo", targetIds, actionId);
    },
    redo(targetIds, actionId) {
      return historyAction("redo", targetIds, actionId);
    },
  };
}
