export const MAX_RECORDING_MS = 180000;
export function recordingScope(scope, page) {
  if (!scope || ![2, 3].includes(scope.variant) || scope.channel !== "ink"
    || !/^[A-Za-z][A-Za-z _-]{0,50}$/.test(scope.className || "")
    || !/^[a-zA-Z0-9_-]{1,80}$/.test(scope.assignmentId || "")
    || !/^\d{2}-\d{2}$/.test(scope.schoolYear || "")
    || !Number.isInteger(scope.number) || scope.number < 1 || scope.number > 30
    || !Number.isInteger(page) || page < 1) throw Error("Choose a valid V2 or V3 notebook page and student.");
  return `nb${scope.variant}:${scope.className}:${scope.assignmentId}:${scope.schoolYear}:ink:${scope.number}`;
}
export function recordingPin(pin) {
  if (!pin || !/^[a-zA-Z0-9_-]{16,120}$/.test(pin.pin_id || "")
    || ![pin.x_pct, pin.y_pct].every(n => Number.isFinite(n) && n >= 0 && n <= 1))
    throw Error("The microphone position is invalid.");
  return { pin_id: pin.pin_id, x_pct: pin.x_pct, y_pct: pin.y_pct };
}
export function recordingTimeline(value, scopeKey, page) {
  if (!value || value.scope_key !== scopeKey || value.page !== page || value.version !== 1
    || !Number.isFinite(value.duration_ms) || value.duration_ms <= 0 || value.duration_ms > MAX_RECORDING_MS + 5000
    || !Array.isArray(value.baseOperations) || !Array.isArray(value.events) || !Array.isArray(value.pointer)
    || JSON.stringify(value).length > 6000000) throw Error("The synchronized recording data is invalid or too large.");
  if (value.events.some(e => !Number.isFinite(e.at) || e.at < 0 || e.at > value.duration_ms + 1000 || !e.operation?.id)
    || value.pointer.some(p => !Number.isFinite(p.t) || p.t < 0 || p.t > value.duration_ms + 1000
      || ![p.x, p.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1)))
    throw Error("The recording timing or pointer coordinates are invalid.");
  return value;
}
