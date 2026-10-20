// Canonical V2 wire contract. Actor deployment uploads this folder only.
export const NATIVE_CLASSES = ["Felix", "Valero", "Campos", "Gutierrez"];
export function nativeScope({ className, assignmentId, schoolYear, number = 0, channel = "ink", variant = 2 }) {
  if (!NATIVE_CLASSES.includes(className) || !/^[a-zA-Z0-9_-]{1,80}$/.test(assignmentId || "")
    || !/^\d{2}-\d{2}$/.test(schoolYear || "") || !["ink", "live"].includes(channel)
    || ![2, 3].includes(variant) || !Number.isInteger(number) || (channel === "ink" ? number < 1 || number > 30 : number !== 0)) {
    throw new Error("Choose an enabled class, assignment, and student number from 1 to 30.");
  }
  return `nb${variant}:${className}:${assignmentId}:${schoolYear}:${channel}:${number}`;
}
export function sourceKey(assignment) {
  return /^sha256:[a-f0-9]{64}$/i.test(assignment.library_key || "")
    ? assignment.library_key.toLowerCase() : `assignment:${assignment.id}`;
}
export function checkedPage(value, count) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > count) throw new Error(`Choose a page from 1 to ${count}.`);
  return n;
}
export function validateNativeOperation(op) {
  if (!op || !/^[a-zA-Z0-9_-]{1,120}$/.test(op.id || "")
    || !["stroke", "erase", "pixelErase", "undo", "redo"].includes(op.kind)
    || JSON.stringify(op).length > 250000) throw new Error("The drawing change is invalid or too large. Keep this page open.");
  const ids = a => Array.isArray(a) && a.length <= 5000 && a.every(s => typeof s === "string" && s.length <= 120);
  const path = p => Array.isArray(p) && p.length > 0 && p.length <= 10000
    && p.every(v => Number.isFinite(v.x) && Number.isFinite(v.y) && v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1
      && (v.t === undefined || (Number.isFinite(v.t) && v.t >= 0 && v.t <= 3600000)));
  const width = w => Number.isFinite(w) && w > 0 && w <= 0.2;
  if (op.kind === "stroke" && (!op.stroke || typeof op.stroke.id !== "string"
    || op.stroke.id.length > 120 || !/^#[a-f0-9]{6}$/i.test(op.stroke.color || "")
    || !["pen", "highlighter"].includes(op.stroke.tool) || !width(op.stroke.width)
    || !path(op.stroke.points) || op.stroke.erasures?.length)) throw new Error("Invalid stroke.");
  if (op.kind === "erase" && (typeof op.targetId !== "string" || op.targetId.length > 120)) throw new Error("Invalid eraser target.");
  if (op.kind === "pixelErase" && (!op.erasePath || typeof op.erasePath.id !== "string"
    || op.erasePath.id.length > 120 || !path(op.erasePath.points) || !width(op.erasePath.width)
    || !ids(op.erasePath.targetIds))) throw new Error("Invalid pixel eraser.");
  if (["undo", "redo"].includes(op.kind) && !ids(op.targetIds)) throw new Error("Invalid undo.");
  return op;
}
export function normalizeLiveControl(input, pageCount, previous) {
  if (previous?.ended) throw new Error("This test session ended. Start a new session.");
  const selected = [...new Set(input.students || [])];
  if (!selected.length || selected.some(n => !Number.isInteger(n) || n < 1 || n > 30)) throw new Error("Select students 1–30.");
  if (!["native", "current"].includes(input.engine)) throw new Error("Invalid notebook step.");
  return {
    id: previous?.id || input.id,
    active: input.ended !== true, ended: input.ended === true,
    page: checkedPage(input.page, pageCount), follow: input.follow !== false, canWrite: input.canWrite !== false,
    students: selected, engine: input.engine, updatedAt: Date.now(),
    pageCommand: typeof input.pageCommand === "string" ? input.pageCommand.slice(0, 100) : previous?.pageCommand || "",
  };
}
