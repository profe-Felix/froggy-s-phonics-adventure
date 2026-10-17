// Portable ink calculations. No network, storage, React, or activation flags.
// Work on ONE page at a time. Replaying undo/redo needs the page's complete
// operation history; a materialized snapshot cannot recover deleted history.

export function effectiveDrawingOperations(operations) {
  const enabled = new Map();
  for (const op of operations) {
    if (op.kind === "undo" || op.kind === "redo") {
      for (const id of op.targetIds || []) enabled.set(id, op.kind === "redo");
    }
  }
  return operations.filter(op =>
    op.kind !== "undo" && op.kind !== "redo" && enabled.get(op.id) !== false
  );
}

export function cutsFrom(strokes) {
  return new Map([...strokes]
    .filter(stroke => stroke.erasures?.length)
    .map(stroke => [stroke.id, new Map(stroke.erasures.map(cut => [cut.id, cut]))]));
}

// Incremental updates for stroke/erase/pixelErase only. For undo/redo, rebuild
// with materializeDrawing(fullPageHistory) or load a fresh server snapshot.
export function applyDrawingOperation(strokes, erased, cuts, op) {
  if (op.kind === "erase" && op.targetId) {
    erased.add(op.targetId);
    strokes.delete(op.targetId);
  } else if (op.kind === "pixelErase" && op.erasePath) {
    const { id, width, points, targetIds } = op.erasePath;
    const cut = { id, width, points };
    for (const target of targetIds) {
      const paths = new Map(cuts.get(target));
      paths.set(id, cut);
      cuts.set(target, paths);
      const stroke = strokes.get(target);
      if (stroke) {
        strokes.set(target, {
          ...stroke,
          erasures: [...paths.values()].sort((a, b) => a.id.localeCompare(b.id)),
        });
      }
    }
  } else if (op.kind === "stroke" && op.stroke && !erased.has(op.stroke.id)) {
    const paths = new Map(cuts.get(op.stroke.id));
    for (const cut of op.stroke.erasures || []) paths.set(cut.id, cut);
    cuts.set(op.stroke.id, paths);
    strokes.set(op.stroke.id, paths.size ? {
      ...op.stroke,
      erasures: [...paths.values()].sort((a, b) => a.id.localeCompare(b.id)),
    } : op.stroke);
  }
}

export function materializeDrawing(operations, baseline = []) {
  const strokes = new Map(baseline.map(stroke => [stroke.id, stroke]));
  const erased = new Set();
  const cuts = cutsFrom(baseline);
  for (const op of effectiveDrawingOperations(operations)) {
    applyDrawingOperation(strokes, erased, cuts, op);
  }
  return [...strokes.values()];
}

export function buildReplayTimeline(events) {
  let cursor = 0;
  let previousAt;
  let previousClear;
  return [...events].sort((a, b) => a.revision - b.revision).map(event => {
    const op = event.operation;
    const path = op.stroke || op.erasePath;
    const times = path?.points.map(point => point.t);
    const timed = !!times?.length && times.every((t, i) =>
      t !== undefined && t >= 0 && (i === 0 || t >= times[i - 1])
    );
    const duration = path ? (timed ? Math.max(1, times.at(-1)) : 600) : 0;
    const at = op.recording?.recordedAt;
    // Device clocks are not synchronized; saved revision defines the order.
    const gap = at !== undefined && previousAt !== undefined
      ? Math.max(0, Math.min(1000, at - previousAt)) : 0;
    const clearGroup = op.recording?.action === "clear"
      ? op.recording.groupId : undefined;
    cursor += clearGroup && clearGroup === previousClear ? 0 : Math.max(1, gap);
    const entry = {
      ...event, start: cursor, end: cursor + duration,
      approximate: !!path && !timed,
    };
    cursor = entry.end;
    previousAt = at === undefined ? undefined : at + duration;
    previousClear = clearGroup;
    return entry;
  });
}

export function replayPoints(points, elapsed, duration) {
  if (elapsed >= duration) return points;
  const timed = points.every((point, i) =>
    point.t !== undefined && (i === 0 || point.t >= points[i - 1].t)
  );
  const timeAt = i => timed
    ? points[i].t : duration * i / Math.max(1, points.length - 1);
  const visible = [];
  for (let i = 0; i < points.length; i++) {
    if (timeAt(i) <= elapsed) {
      visible.push(points[i]);
    } else {
      if (i && visible.length) {
        const a = points[i - 1], b = points[i];
        const ratio = Math.min(1, Math.max(0,
          (elapsed - timeAt(i - 1)) / (timeAt(i) - timeAt(i - 1) || 1)
        ));
        visible.push({
          x: a.x + (b.x - a.x) * ratio,
          y: a.y + (b.y - a.y) * ratio,
        });
      }
      break;
    }
  }
  return visible.length ? visible : points.slice(0, 1);
}

export function replayFrame(timeline, time) {
  const visible = [];
  let current;
  for (const entry of timeline) {
    if (entry.start > time) break;
    current = entry;
    const op = entry.operation;
    const elapsed = Math.max(0, time - entry.start);
    const duration = entry.end - entry.start;
    const partial = elapsed < duration;
    const operation = partial && op.stroke
      ? { ...op, stroke: {
          ...op.stroke, points: replayPoints(op.stroke.points, elapsed, duration),
        } }
      : partial && op.erasePath
        ? { ...op, erasePath: {
            ...op.erasePath, points: replayPoints(op.erasePath.points, elapsed, duration),
          } }
        : op;
    visible.push(operation);
    if (partial) break;
  }
  return { strokes: materializeDrawing(visible), current };
}

export function inkPath(points, height, smooth = true) {
  if (!points.length) return "";
  const p = points.map(point => [point.x * 1000, point.y * height]);
  if (p.length === 1) return `M${p[0][0]} ${p[0][1]} l0.01 0`;
  let d = `M${p[0][0]} ${p[0][1]}`;
  for (let i = 1; i < p.length - 1; i++) {
    d += smooth
      ? ` Q${p[i][0]} ${p[i][1]} ${(p[i][0] + p[i + 1][0]) / 2} ${(p[i][1] + p[i + 1][1]) / 2}`
      : ` L${p[i][0]} ${p[i][1]}`;
  }
  return `${d} L${p.at(-1)[0]} ${p.at(-1)[1]}`;
}

function pointDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1,
    ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)
  ));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsDistance(a, b, c, d) {
  const abC = cross(a, b, c), abD = cross(a, b, d);
  const cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) &&
      ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return 0;
  return Math.min(
    pointDistance(a, c, d), pointDistance(b, c, d),
    pointDistance(c, a, b), pointDistance(d, a, b)
  );
}

const flattened = new WeakMap();
function centerline(stroke, ratio) {
  const cached = flattened.get(stroke);
  if (cached?.ratio === ratio) return cached.points;
  const p = stroke.points.map(point => ({ x: point.x, y: point.y * ratio }));
  const out = [p[0]];
  let start = p[0];
  for (let i = 1; i < p.length - 1; i++) {
    const end = { x: (p[i].x + p[i + 1].x) / 2, y: (p[i].y + p[i + 1].y) / 2 };
    const count = Math.max(4, Math.ceil((
      Math.hypot(start.x - p[i].x, start.y - p[i].y) +
      Math.hypot(end.x - p[i].x, end.y - p[i].y)
    ) / 0.003));
    for (let j = 1; j <= count; j++) {
      const t = j / count, u = 1 - t;
      out.push({
        x: u * u * start.x + 2 * u * t * p[i].x + t * t * end.x,
        y: u * u * start.y + 2 * u * t * p[i].y + t * t * end.y,
      });
    }
    start = end;
  }
  if (p.length > 1) out.push(p.at(-1));
  flattened.set(stroke, { ratio, points: out });
  return out;
}

export function eraserCrosses(stroke, from, to, diameter, ratio) {
  if (!stroke.points.length) return false;
  const a = { x: from.x, y: from.y * ratio };
  const b = { x: to.x, y: to.y * ratio };
  const tolerance = (diameter + stroke.width) / 2;
  const p = centerline(stroke, ratio);
  if (p.length === 1) return pointDistance(p[0], a, b) <= tolerance;
  for (let i = 1; i < p.length; i++) {
    if (segmentsDistance(a, b, p[i - 1], p[i]) <= tolerance) return true;
  }
  return false;
}
