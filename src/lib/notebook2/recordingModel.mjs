import { materializeDrawing } from "../external-notebook/ink-model.js";
export { recordingScope, MAX_RECORDING_MS } from "../../../base44/functions/nativeNotebookRecording/model.js";

// Audio milliseconds are authoritative; never use the idle-compressed handwriting review clock.
export function recordingFrame(timeline, milliseconds) {
  const time = Math.max(0, Number(milliseconds) || 0);
  const operations = [...(timeline?.baseOperations || [])];
  for (const event of timeline?.events || []) {
    const op = event.operation;
    if (op.kind !== "stroke") { if (event.at <= time) operations.push(op); continue; }
    const start = Number.isFinite(event.start) ? event.start : event.at;
    if (start > time) continue;
    if (event.at <= time) { operations.push(op); continue; }
    const points = (op.stroke?.points || []).filter(p => (Number(p.t) || 0) <= time - start);
    if (points.length) operations.push({ ...op, stroke: { ...op.stroke, points } });
  }
  const pointer = (timeline?.pointer || []).findLast(p => p.t <= time);
  return { strokes: materializeDrawing(operations),
    laser: pointer && pointer.down && time - pointer.t < 700 ? { x: pointer.x, y: pointer.y } : null };
}
