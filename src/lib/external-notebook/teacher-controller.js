// Teacher monitoring controller. Read-only: never mutates the class.
// One teacher socket, one coalesced overview request at a time, and history
// only on explicit interaction. No React, no Base44 entity reads, no logging
// of credentials. Pure helpers are exported for Node unit tests.
import { createNotebookPageImages } from "./page-images.js";

const positive = value => Number.isSafeInteger(value) && value > 0;
const message = error => error instanceof Error ? error.message : String(error);

export function overviewPath(classId, workbookId, page) {
  const q = new URLSearchParams({ workbookId, page: String(page) });
  return `/classes/${encodeURIComponent(classId)}/overview-pages?${q}`;
}

export function historyPath(classId, studentNumber, workbookId, page, after = 0, through) {
  const q = new URLSearchParams({ workbookId, page: String(page) });
  if (after > 0) q.set("after", String(after));
  if (through !== undefined) q.set("throughRevision", String(through));
  return `/classes/${encodeURIComponent(classId)}/students/${studentNumber}/history?${q}`;
}

export function parseOverview(data, { classId, workbookId, page }) {
  if (!data || data.classId !== classId || data.workbookId !== workbookId ||
      data.page !== page || !Array.isArray(data.notebooks) ||
      typeof data.generatedAt !== "string") {
    throw new Error("The class overview did not match this page.");
  }
  return {
    generatedAt: data.generatedAt,
    notebooks: data.notebooks.map(n => {
      if (!positive(n?.studentNumber) || typeof n.revision !== "number" || !Array.isArray(n.strokes)) {
        throw new Error("The class overview contained an invalid notebook.");
      }
      return { studentNumber: n.studentNumber, revision: n.revision, strokes: n.strokes };
    }),
  };
}

// Follows nextAfter pages, pinned to the first response's throughRevision.
export async function loadFullHistory(request, { classId, studentNumber, workbookId, page },
  { isCurrent = () => true, maxBatches = 60 } = {}) {
  const events = [];
  let after = 0, through;
  for (let batch = 0; batch < maxBatches; batch++) {
    const data = await request(historyPath(classId, studentNumber, workbookId, page, after, through));
    if (!isCurrent()) return null;
    if (!Array.isArray(data?.events) || typeof data.throughRevision !== "number") {
      throw new Error("Invalid notebook history response.");
    }
    through = data.throughRevision;
    for (const event of data.events) {
      if (typeof event?.revision !== "number" || !event.operation || event.operation.page !== page) {
        throw new Error("Invalid notebook history event.");
      }
      events.push(event);
    }
    if (data.nextAfter === null || data.nextAfter === undefined) return { events, throughRevision: through };
    if (!(data.nextAfter > after)) throw new Error("Notebook history paging did not advance.");
    after = data.nextAfter;
  }
  throw new Error("This handwriting history is too long to replay here. Saved work is intact.");
}

// Coalesces bursts into at most one run per gap and one in-flight run.
export function createRefreshScheduler({ run, minGapMs = 1500, setTimer = setTimeout,
  clearTimer = clearTimeout, now = () => Date.now() }) {
  let timer = null, running = false, dirty = false, last = -Infinity, stopped = false;
  function request() {
    if (stopped) return;
    if (running) { dirty = true; return; }
    if (timer) return;
    timer = setTimer(fire, Math.max(0, last + minGapMs - now()));
  }
  async function fire() {
    timer = null;
    if (stopped) return;
    running = true; dirty = false; last = now();
    try { await run(); } catch { /* run reports its own errors */ }
    running = false;
    if (dirty) request();
  }
  function cancel() { if (timer) clearTimer(timer); timer = null; dirty = false; }
  function stop() { cancel(); stopped = true; }
  return { request, cancel, stop, get pending() { return !!timer || running; } };
}

function pageList(session) {
  if (Array.isArray(session.allowedPages)) return [...session.allowedPages].sort((a, b) => a - b);
  return Array.from({ length: session.workbook.pageCount }, (_, i) => i + 1);
}

function contextPage(context) {
  const value = Number(context?.page ?? context?.stepPage ?? context?.currentPage);
  return positive(value) ? value : null;
}

export async function createNotebookTeacherController({
  session, context, transport, clientId, onState, timers = globalThis,
} = {}) {
  if (session?.role !== "teacher") throw new Error("This view requires a teacher session.");
  if (!transport || typeof transport.request !== "function" ||
      typeof transport.openSocket !== "function" || typeof transport.loadImage !== "function") {
    throw new Error("An authorized notebook transport is required.");
  }
  let current = JSON.parse(JSON.stringify(session));
  const classId = current.classId, workbookId = current.workbookId;
  const workbook = Object.freeze(JSON.parse(JSON.stringify(current.workbook)));
  const pages = pageList(current);
  const images = createNotebookPageImages({ transport, maxEntries: 2 });
  const histories = new Map();

  let closed = false, generation = 0, socketGen = 0, socket = null, reconnectTimer = null;
  let reconnectDelay = 1000, fallbackTimer = null, imageLease = null, imageGen = 0;
  const pick = p => pages.includes(p) ? p : null;
  const state = {
    workbook, pages, classroom: current.classroom || null,
    page: pick(contextPage(context)) ?? pick(current.classroom?.currentPage) ?? pages[0],
    connection: "connecting", connectionError: "",
    overview: { loading: true, error: "", generatedAt: "", notebooks: null, page: null },
    presence: {}, activity: {},
    image: { url: "", loading: true, error: "" },
  };
  const emit = () => { if (!closed) onState?.(snapshot()); };
  function snapshot() {
    return {
      ...state, overview: { ...state.overview }, presence: { ...state.presence },
      activity: { ...state.activity }, image: { ...state.image },
      expiresAtMs: current.expiresAtMs,
    };
  }

  // ---- overview ----
  async function runOverview() {
    if (closed) return;
    const gen = generation, page = state.page;
    if (Date.now() >= current.expiresAtMs) {
      state.overview = { ...state.overview, loading: false, error: "Notebook authorization expired. Waiting for a renewed session." };
      emit(); return;
    }
    state.overview = { ...state.overview, loading: true };
    emit();
    try {
      const parsed = parseOverview(await transport.request(overviewPath(classId, workbookId, page)),
        { classId, workbookId, page });
      if (closed || gen !== generation || page !== state.page) return;
      state.overview = { loading: false, error: "", generatedAt: parsed.generatedAt, notebooks: parsed.notebooks, page };
    } catch (error) {
      if (closed || gen !== generation || page !== state.page) return;
      state.overview = { ...state.overview, loading: false, error: message(error) };
    }
    emit();
  }
  const scheduler = createRefreshScheduler({
    run: runOverview, minGapMs: 1500,
    setTimer: (f, ms) => timers.setTimeout(f, ms), clearTimer: id => timers.clearTimeout(id),
  });

  function setFallback(on) {
    // Only while the live socket is down: one bounded class-wide refresh, no per-student polling.
    if (on && !fallbackTimer && !closed) fallbackTimer = timers.setInterval(() => scheduler.request(), 20000);
    if (!on && fallbackTimer) { timers.clearInterval(fallbackTimer); fallbackTimer = null; }
  }

  // ---- page image ----
  async function loadImage() {
    const gen = ++imageGen, page = state.page;
    state.image = { url: "", loading: true, error: "" };
    emit();
    imageLease?.release(); imageLease = null;
    try {
      const lease = await images.acquire(workbook, page);
      if (closed || gen !== imageGen) { lease.release(); return; }
      imageLease = lease;
      state.image = { url: lease.url, loading: false, error: "" };
    } catch (error) {
      if (closed || gen !== imageGen) return;
      state.image = { url: "", loading: false, error: message(error) };
    }
    emit();
  }

  // ---- socket ----
  function dropSocket() {
    socketGen++;
    if (reconnectTimer) { timers.clearTimeout(reconnectTimer); reconnectTimer = null; }
    const old = socket; socket = null;
    try { old?.close(); } catch { /* already closed */ }
  }
  function scheduleReconnect() {
    if (closed || reconnectTimer) return;
    if (Date.now() >= current.expiresAtMs) {
      state.connection = "expired";
      state.connectionError = "Notebook authorization expired. Waiting for a renewed session.";
      emit(); return;
    }
    const delay = reconnectDelay;
    reconnectDelay = Math.min(30000, reconnectDelay * 2);
    reconnectTimer = timers.setTimeout(() => { reconnectTimer = null; void connect(); }, delay);
  }
  function onMessage(gen, msg) {
    if (closed || gen !== socketGen) return;
    if (msg.type === "ready") {
      if (msg.classroom?.id === classId) state.classroom = msg.classroom;
      state.connection = "live"; state.connectionError = ""; reconnectDelay = 1000;
      setFallback(false); scheduler.request();
    } else if (msg.type === "presence" && Array.isArray(msg.students)) {
      state.presence = Object.fromEntries(msg.students
        .filter(s => positive(s?.studentNumber)).map(s => [s.studentNumber, Number(s.connections) || 0]));
    } else if (msg.type === "activity" && positive(msg.studentNumber)) {
      state.activity = { ...state.activity, [msg.studentNumber]: Date.now() };
      // Activity events do not carry a page; one coalesced overview covers all.
      scheduler.request();
    } else if (msg.type === "classroom") {
      if (msg.classroom?.id === classId) state.classroom = msg.classroom;
      scheduler.request();
    } else return;
    emit();
  }
  async function connect() {
    if (closed) return;
    dropSocket();
    const gen = socketGen;
    state.connection = state.connection === "live" ? "reconnecting" : "connecting";
    emit();
    try {
      const opened = await transport.openSocket({
        // Ticket schema requires studentNumber >= 1 or omitted; teachers omit it.
        classId, studentNumber: undefined, clientId,
        onMessage: msg => onMessage(gen, msg),
        onError: error => {
          if (closed || gen !== socketGen) return;
          state.connectionError = message(error); emit();
        },
        onClose: () => {
          if (closed || gen !== socketGen) return;
          socket = null; state.connection = "offline"; setFallback(true); emit();
          scheduleReconnect();
        },
      });
      if (closed || gen !== socketGen) { try { opened.close(); } catch { /* stale */ } return; }
      socket = opened;
    } catch (error) {
      if (closed || gen !== socketGen) return;
      state.connection = "offline"; state.connectionError = message(error);
      setFallback(true); emit(); scheduleReconnect();
    }
  }

  // ---- history (on demand, bounded cache) ----
  function loadHistory(studentNumber) {
    if (closed) return Promise.reject(new Error("The teacher view has closed."));
    const page = state.page, gen = generation;
    const revision = state.overview.notebooks?.find(n => n.studentNumber === studentNumber)?.revision ?? 0;
    const key = `${page}:${studentNumber}`;
    const hit = histories.get(key);
    if (hit && hit.gen === gen && hit.revision >= revision) return hit.promise;
    const promise = loadFullHistory(transport.request, { classId, studentNumber, workbookId, page },
      { isCurrent: () => !closed && gen === generation })
      .then(result => {
        if (!result) throw new Error("The view changed before history finished loading.");
        return result.events;
      });
    const entry = { gen, revision, promise };
    histories.delete(key); histories.set(key, entry);
    promise.catch(() => { if (histories.get(key) === entry) histories.delete(key); });
    while (histories.size > 12) histories.delete(histories.keys().next().value);
    return promise;
  }

  // ---- public ----
  function setPage(page) {
    if (closed || !pages.includes(page) || page === state.page) return false;
    generation++; histories.clear();
    state.page = page;
    state.overview = { loading: true, error: "", generatedAt: "", notebooks: null, page: null };
    scheduler.cancel(); scheduler.request();
    void loadImage();
    return true;
  }

  void loadImage();
  scheduler.request();

  return {
    getState: snapshot,
    connect,
    setPage,
    loadHistory,
    refresh() { scheduler.request(); },
    retryImage() { void loadImage(); },
    retryConnection() { reconnectDelay = 1000; void connect(); },
    async updateContext(next) {
      if (closed) return false;
      const p = pick(contextPage(next));
      if (p) setPage(p);
      return true;
    },
    // Mirrors student-controller: prepare -> invalidate old socket/reads ->
    // guarded commit -> reconnect and rehydrate. Commit is not a ready ACK.
    async renewSession(next, { isCurrent = () => true } = {}) {
      if (closed) return false;
      if (typeof isCurrent !== "function" || typeof transport.prepareSession !== "function") {
        throw new Error("A guarded renewable notebook transport is required.");
      }
      if (next?.role !== "teacher" || next.classId !== classId || next.workbookId !== workbookId) {
        throw new Error("Renewal cannot change the monitored class.");
      }
      const ok = () => !closed && isCurrent() === true;
      if (!ok()) return false;
      const candidate = JSON.parse(JSON.stringify(next));
      const prepared = transport.prepareSession(candidate, { isCurrent: ok });
      try {
        generation++; histories.clear(); scheduler.cancel();
        dropSocket();
        state.connection = "reconnecting"; emit();
        if (!ok() || prepared.commit() !== true) {
          throw new Error("Notebook renewal was cancelled or expired. Monitoring will retry.");
        }
        current = candidate;
        reconnectDelay = 1000;
        await connect();
        if (!ok()) return false;
        if (!socket) throw new Error(state.connectionError || "The renewed live connection is not ready.");
        scheduler.request();
        if (state.image.error) void loadImage();
        return true;
      } catch (error) {
        if (!closed) { state.connectionError = message(error); scheduleReconnect(); emit(); }
        throw error;
      } finally { prepared.cancel(); }
    },
    close() {
      if (closed) return true;
      closed = true; generation++; imageGen++;
      scheduler.stop(); setFallback(false); dropSocket();
      imageLease?.release(); imageLease = null;
      images.close(); histories.clear();
      return true;
    },
  };
}
