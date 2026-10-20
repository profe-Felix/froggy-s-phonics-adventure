import { buildReplayTimeline } from "../external-notebook/ink-model.js";

// Display-only inspection clock. Never modify the stored ink or its timestamps.
export function buildFormationTimeline(events) {
  let cursor = 0, previousEnd = 0;
  return buildReplayTimeline(events).map(entry => {
    const originalDuration = entry.end - entry.start;
    cursor += Math.min(120, Math.max(0, entry.start - previousEnd));
    previousEnd = entry.end;
    const op = entry.operation;
    const key = op.stroke ? "stroke" : op.erasePath ? "erasePath" : null;
    const duration = key ? Math.max(900, originalDuration) : 80;
    let operation = op;
    if (key) {
      const path = op[key];
      const timed = !entry.approximate && path.points.at(-1)?.t > 0;
      operation = { ...op, [key]: { ...path, points: path.points.map((p, i) => ({
        ...p,
        t: timed ? (p.t / Math.max(1, originalDuration)) * duration
          : duration * i / Math.max(1, path.points.length - 1),
      })) } };
    }
    const result = { ...entry, operation, start: cursor, end: cursor + duration };
    cursor = result.end;
    return result;
  });
}
