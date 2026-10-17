import { createNotebookStudentControls } from "./student-controls";

// Preparation for renewal, NOT permission to replace a Canvas or clear an outbox.
// bootstrap must be the verified Base44 bootstrap, never a locally edited token.
// install must keep the existing view/local tasks until a safe, atomic handoff,
// honor isCurrent(), and return true only after accepting the verified session.
export function createNotebookSessionRenewal({
  session, context, bootstrap, install, onState,
  now = Date.now, random = Math.random,
  setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  if ([bootstrap, install, now, random, setTimer, clearTimer].some(fn => typeof fn !== "function") ||
      (onState !== undefined && typeof onState !== "function")) {
    throw new Error("Verified bootstrap and safe session installation methods are required.");
  }
  const copy = value => JSON.parse(JSON.stringify(value));
  const scope = value => JSON.stringify([
    value?.role, value?.kind, value?.sourceId, value?.stepId ?? null,
    value?.assignmentId, value?.className, value?.schoolYear,
    value?.student?.id, value?.student?.number,
    value?.student?.className, value?.student?.schoolYear,
  ]);
  let current = copy(session), latestContext = copy(context);
  createNotebookStudentControls({ session: current, context: latestContext });
  if (typeof current.backendOrigin !== "string" || !current.backendOrigin ||
      typeof current.accessToken !== "string" || !current.accessToken) {
    throw new Error("A verified notebook connection is required before renewal.");
  }
  const binding = scope(latestContext);
  let started = false, closed = false, renewing = null, timer = null;
  let generation = 0, failures = 0, error = "";
  const state = () => Object.freeze({
    started, closed, renewing: !!renewing, expiresAtMs: current.expiresAtMs,
    expired: now() >= current.expiresAtMs, error,
  });
  const emit = () => { onState?.(state()); };
  const stopTimer = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  function spread() {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error("A valid renewal scheduling random value is required.");
    }
    return value;
  }
  function normalDelay() {
    const remaining = current.expiresAtMs - now();
    if (remaining <= 0) return 0;
    // Long sessions renew 90–120 seconds early; short leases never spin.
    const lead = Math.min(90000 + spread() * 30000, remaining * 0.2);
    return Math.max(1, Math.floor(remaining - lead));
  }
  function schedule() {
    stopTimer();
    if (!started || closed) return;
    const backoff = [2000, 5000, 10000, 30000, 60000];
    const delay = failures
      ? Math.floor(backoff[Math.min(failures - 1, backoff.length - 1)] * (1 + spread() * 0.25))
      : normalDelay();
    timer = setTimer(() => {
      timer = null;
      void renew().catch(() => { /* The failed renewal is visible in state. */ });
    }, Math.min(delay, 2147483647));
  }
  function validate(candidate) {
    createNotebookStudentControls({ session: candidate, context: latestContext });
    for (const name of ["backendOrigin", "role", "classId", "workbookId", "studentNumber", "kind", "sourceId"]) {
      if (candidate[name] !== current[name]) {
        throw new Error("Renewal cannot change the notebook identity or destination.");
      }
    }
    if (candidate.workbook.pageCount !== current.workbook.pageCount ||
        typeof candidate.accessToken !== "string" || !candidate.accessToken ||
        candidate.accessToken === current.accessToken ||
        candidate.expiresAtMs <= current.expiresAtMs ||
        candidate.expiresAtMs <= now() + 5000) {
      throw new Error("Renewal requires a fresh verified session with a usable lifetime.");
    }
  }
  function renew() {
    if (closed) return Promise.reject(new Error("Notebook session renewal has closed."));
    if (renewing) return renewing;
    stopTimer();
    const ticket = generation;
    const isCurrent = () => !closed && ticket === generation;
    renewing = Promise.resolve().then(async () => {
      const candidate = copy(await bootstrap(copy(latestContext)));
      if (!isCurrent()) return false;
      validate(candidate);
      if (await install(copy(candidate), { context: copy(latestContext), isCurrent }) !== true) {
        throw new Error("The notebook could not safely accept the renewed connection.");
      }
      if (!isCurrent()) return false;
      if (candidate.expiresAtMs <= now()) {
        throw new Error("The renewed session expired before installation finished.");
      }
      current = candidate;
      failures = 0;
      error = "";
      return true;
    }).catch(reason => {
      if (!closed) {
        failures++;
        error = "The notebook connection could not renew. Keep this activity open; existing local work was not discarded.";
      }
      throw reason;
    }).finally(() => {
      renewing = null;
      schedule();
      emit();
    });
    emit();
    return renewing;
  }
  return {
    start() {
      if (closed) throw new Error("Notebook session renewal has closed.");
      if (!started) { started = true; schedule(); emit(); }
    },
    renew,
    updateContext(next) {
      if (closed || scope(next) !== binding) {
        throw new Error("Changing student, assignment or lesson step requires a separate safe handoff.");
      }
      createNotebookStudentControls({ session: current, context: next });
      latestContext = copy(next);
    },
    getState: state,
    close() {
      if (closed) return;
      closed = true;
      started = false;
      generation++;
      stopTimer();
      emit();
    },
  };
}
