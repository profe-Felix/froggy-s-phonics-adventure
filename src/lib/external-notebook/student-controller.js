import { createNotebookStudentSync } from "./student-sync";
import { createNotebookStudentControls } from "./student-controls";
import { createNotebookPageImages } from "./page-images";
import { createNotebookPageActions } from "./page-actions";

// One fixed work identity. Verified sessions may renew; no React or Base44 calls.
// finishGesture must await LOCAL Canvas tasks only, never this controller.flush().
// The host must keep the Canvas mounted until flush() and close() both succeed.
export async function createNotebookStudentController({
  session, context, transport, persistence, clientId, finishGesture, onState,
} = {}) {
  if (typeof finishGesture !== "function" ||
      (onState !== undefined && typeof onState !== "function")) {
    throw new Error("A local gesture finisher and valid state observer are required.");
  }
  const policy = createNotebookStudentControls({ session, context });
  const images = createNotebookPageImages({ transport, maxEntries: 4 });
  const copy = value => JSON.parse(JSON.stringify(value));
  const book = Object.freeze(copy(session.workbook));
  const actions = new Map(), histories = new Map(), watched = new Set();
  if (typeof globalThis.crypto?.randomUUID !== "function") throw new Error("Secure action IDs are unavailable.");
  const uuid = () => globalThis.crypto.randomUUID();
  const initial = policy.getState({ context });
  let displayed = initial.page ?? initial.allowedPages?.[0] ?? session.classroom.currentPage;
  let lease = null, sync = null, busy = false, handshake = false, closed = false, closing = false;
  let closingPromise = null;
  let policyGeneration = 0;
  let epoch = 0, scheduled = false, autoBlocked = false, error = "", pending = null;

  function history(page) {
    if (!histories.has(page)) histories.set(page, { undo: [], redo: [], known: new Set() });
    return histories.get(page);
  }
  function remember(operation) {
    if (["undo", "redo"].includes(operation.kind)) return;
    const h = history(operation.page);
    if (h.known.has(operation.id)) return;
    h.known.add(operation.id);
    const key = operation.recording.groupId || operation.id;
    let group = h.undo.find(item => item.key === key);
    if (!group) {
      group = { key, at: operation.recording.recordedAt, ids: [] };
      h.undo.push(group);
    }
    group.at = Math.min(group.at, operation.recording.recordedAt);
    group.ids.push(operation.id);
    h.undo.sort((a, b) => a.at - b.at);
    if (h.undo.length > 200) h.undo.splice(0, h.undo.length - 200);
    h.redo = [];
  }
  function pageActions(page) {
    if (!actions.has(page)) actions.set(page, createNotebookPageActions({
      page, writerId: clientId,
      enqueue: async operation => {
        if (closed) throw new Error("This notebook is closed.");
        const sequence = await sync.enqueue(operation);
        remember(operation);
        emit();
        return sequence;
      },
    }));
    return actions.get(page);
  }
  // Validate writer/crypto before opening a synchronization session.
  pageActions(displayed);

  function state() {
    const pageState = sync?.getPageState(displayed) || null;
    const syncState = sync?.getState() || null;
    const locked = busy || handshake || closed || closing || syncState?.renewing === true;
    const controls = policy.getState({ context, pageState, busy: locked });
    const ready = !closed && !handshake && !!lease && pageState?.ready === true;
    const historyReady = ready && controls.canDraw && !error &&
      syncState?.connection.connected === true && syncState.save.pendingCount === 0 &&
      syncState.failedLocalCount === 0;
    const h = history(displayed);
    const bound = pageActions(displayed);
    return {
      workbook: book, page: displayed, imageUrl: lease?.url || "",
      strokes: pageState?.strokes || [], ready, controls, syncState,
      busy: locked, error,
      canUndo: !!historyReady && h.undo.length > 0,
      canRedo: !!historyReady && h.redo.length > 0,
      canClear: ready && controls.canDraw && !error && (pageState?.strokes.length || 0) > 0,
      onStroke: bound.onStroke, onErase: bound.onErase, onPixelErase: bound.onPixelErase,
    };
  }
  function emit() { if (!closed) onState?.(state()); }
  function open() { if (closed) throw new Error("This notebook controller is closed."); }
  function fail(reason) {
    error = reason instanceof Error ? reason.message : String(reason);
    autoBlocked = true;
    emit();
  }
  function room(page) {
    if (watched.has(page)) return;
    if (watched.size >= 4) {
      const unused = [...watched].find(value => value !== displayed && sync.releasePage(value));
      if (unused === undefined) throw new Error("Finish saving the current pages before opening another.");
      watched.delete(unused); actions.delete(unused); histories.delete(unused);
    }
    watched.add(page);
  }
  async function prepare(page, load, isCurrent) {
    room(page);
    const snapshot = await load(page);
    if (!snapshot || !isCurrent()) return false;
    const replacement = page === displayed && lease ? null : await images.acquire(book, page);
    if (!isCurrent()) { replacement?.release(); return false; }
    const previous = lease;
    displayed = page;
    if (replacement) lease = replacement;
    emit();
    if (replacement) previous?.release();
    return true;
  }
  async function refresh() {
    const generation = epoch;
    return prepare(displayed, page => sync.loadPage(page, {
      isCurrent: () => !closed && generation === epoch,
    }), () => !closed && generation === epoch);
  }
  async function finishPending() {
    if (!pending) return;
    const action = pending;
    await action.run();
    if (!await sync.flush()) throw new Error("This action is not confirmed yet. Keep the notebook open.");
    if (!await refresh()) throw new Error("The saved page needs refreshing. Keep the notebook open.");
    if (action.kind === "undo" || action.kind === "redo") {
      const h = history(action.page);
      const from = action.kind === "undo" ? h.undo : h.redo;
      const to = action.kind === "undo" ? h.redo : h.undo;
      const index = from.indexOf(action.group);
      if (index >= 0) { from.splice(index, 1); to.push(action.group); }
    }
    pending = null;
  }
  async function drain() {
    if (await finishGesture() !== true) throw new Error("Some marks are not safely stored yet. Keep this page open.");
    await finishPending();
    if (!await sync.flush()) throw new Error("Still waiting for saved-work confirmation. Keep this page open.");
  }
  async function exclusive(work, allowClosing = false, allowHandshake = false) {
    open();
    if (busy || (handshake && !allowHandshake) || (closing && !allowClosing)) throw new Error("Another notebook change is still finishing.");
    busy = true; emit();
    try { return await work(); }
    catch (reason) { fail(reason); throw reason; }
    finally { busy = false; emit(); schedule(); }
  }
  function schedule() {
    if (closed || closing || busy || handshake || scheduled || autoBlocked || !sync) return;
    const current = state(), target = current.controls.page;
    if (!current.syncState.connection.connected || target === null ||
        current.controls.releaseRequested || current.controls.needsNewSession ||
        (target === displayed && !sync.getPageState(displayed)?.needsReload && !error && !pending)) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (closed || closing || busy || handshake || autoBlocked) return;
      void exclusive(async () => {
        await drain();
        const desired = policy.getState({ context }).page, generation = epoch;
        if (desired === null) return false;
        const current = () => !closed && generation === epoch &&
          policy.getState({ context }).page === desired;
        const changed = await prepare(desired, page => sync.loadPage(page, { isCurrent: current }), current);
        if (changed) error = "";
        return changed;
      }).catch(() => { /* fail() already exposes the error; no retry flood. */ });
    });
  }
  try {
    sync = await createNotebookStudentSync({
      transport, persistence, clientId, finishGesture,
      classId: session.classId, workbookId: session.workbookId,
      studentNumber: session.studentNumber, expiresAtMs: session.expiresAtMs,
      onReady: async (message, guard) => {
        const controlGeneration = policyGeneration;
        const generation = ++epoch;
        handshake = true; emit();
        try {
          if (!guard.isCurrent() || closed || controlGeneration !== policyGeneration) return;
          if (!policy.receive(message, { sessionGeneration: controlGeneration })) {
            throw new Error("The notebook controls did not match this connection.");
          }
          // Recover the displayed page first, including lost-ACK receipts.
          // NEVER await drain()/network flush inside the ready handler.
          const current = () => !closed && generation === epoch && guard.isCurrent();
          if (!await prepare(displayed, guard.loadPage, current) && current()) {
            throw new Error("The notebook page could not be restored.");
          }
          if (current()) { error = ""; autoBlocked = false; }
        } finally {
          if (generation === epoch) handshake = false;
          emit();
        }
      },
      onEvent: (message, guard) => {
        const controlGeneration = policyGeneration;
        if (!guard.isCurrent() || closed) return;
        try {
          if (policy.receive(message, { sessionGeneration: controlGeneration })) {
            autoBlocked = false;
            if (policy.getState({ context }).canSend) sync.resume();
          }
          emit();
          // Do not hold the socket's event queue while a page drains.
          schedule();
        } catch (reason) { fail(reason); }
      },
      onState: value => {
        if (value.type === "connection" && value.connected) autoBlocked = false;
        emit(); schedule();
      },
    });
  } catch (reason) { images.close(); throw reason; }

  async function historyAction(kind) {
    return exclusive(async () => {
      await drain();
      if (!policy.getState({ context, pageState: sync.getPageState(displayed) }).canDraw) {
        throw new Error("This history action is not available yet.");
      }
      const h = history(displayed), group = (kind === "undo" ? h.undo : h.redo).at(-1);
      if (!group) return true;
      const actionId = uuid(), page = displayed, bound = pageActions(page);
      pending = { kind, page, group, run: () => bound[kind]([...group.ids], actionId) };
      await finishPending();
      error = "";
      return true;
    });
  }
  return {
    getState: state,
    connect() { open(); return sync.connect(); },
    renewSession(next, { isCurrent = () => true } = {}) {
      return exclusive(async () => {
        if (typeof isCurrent !== "function" || typeof transport.prepareSession !== "function") {
          throw new Error("A guarded renewable notebook transport is required.");
        }
        const candidate = copy(next);
        // Validate scope without changing the active UI policy.
        const check = createNotebookStudentControls({ session, context });
        check.replaceSession(candidate, { context });
        const current = () => !closed && !closing && isCurrent();
        if (!current()) throw new Error("Notebook renewal was cancelled. Existing work remains open.");
        const prepared = transport.prepareSession(candidate, { isCurrent: current });
        let committed = false, suspending = false;
        try {
          // Invalidate old page reads, including an obsolete ready hydration.
          epoch++;
          handshake = false;
          suspending = true;
          if (await sync.suspendForRenewal() !== true) {
            throw new Error("Some local marks are not safely queued. Keep this notebook open.");
          }
          // A failed undo/redo/clear must keep its ORIGINAL local operation IDs.
          // Do not call finishPending()/drain() over the expiring credential.
          if (pending) await pending.run();
          const allowed = page => candidate.allowedPages === null || candidate.allowedPages.includes(page);
          if (!allowed(displayed) || sync.getPending().some(record => !allowed(record.operation.page))) {
            throw new Error("Renewal removed a page still needed by this notebook. Keep it open and ask the teacher to restore its page access.");
          }
          if (!current() || prepared.commit() !== true) {
            throw new Error("Notebook renewal was cancelled or expired. Existing work remains open.");
          }
          committed = true;
          policyGeneration = policy.replaceSession(candidate, { context });
          session = copy(candidate);
          if (await sync.resumeAfterRenewal({ expiresAtMs: candidate.expiresAtMs }) !== true) {
            throw new Error("The renewed notebook connection is not ready. Existing work remains open.");
          }
          if (!current()) throw new Error("Notebook renewal finished after cancellation. Existing work remains open.");
          error = "";
          autoBlocked = false;
          return true;
        } catch (reason) {
          prepared.cancel();
          if (!committed && suspending && !closed && sync.getState().connection.suspended) {
            try {
              if (await sync.resumeAfterRenewal() !== true) throw new Error("Previous connection is not ready.");
            } catch {
              throw new Error("Notebook renewal could not finish and the previous connection is unavailable. Local work was retained; keep this notebook open and retry renewal.");
            }
          }
          throw reason;
        } finally { prepared.cancel(); }
      }, false, true);
    },
    undo() { return historyAction("undo"); },
    redo() { return historyAction("redo"); },
    clear() {
      return exclusive(async () => {
        if (!policy.getState({ context }).canSend) throw new Error("Writing is not currently authorized.");
        await drain();
        if (!policy.getState({ context }).canSend) throw new Error("Writing authorization changed. Keep this page open.");
        const page = displayed, strokes = copy(sync.getPageState(page)?.strokes || []);
        const groupId = uuid(), bound = pageActions(page);
        pending = { kind: "clear", page, run: () => bound.clear(strokes, groupId) };
        await finishPending(); error = ""; return true;
      });
    },
    choosePage(page) {
      return exclusive(async () => {
        if (!policy.getState({ context, pageState: sync.getPageState(displayed) }).canNavigate) {
          throw new Error("Your teacher is controlling page changes right now.");
        }
        await drain();
        if (!policy.getState({ context, pageState: sync.getPageState(displayed) }).canNavigate) {
          throw new Error("Page controls changed while saving. Keep this page open.");
        }
        policy.choosePage(page);
        const generation = epoch;
        const current = () => !closed && generation === epoch && policy.getState({ context }).page === page;
        const changed = await prepare(page, number => sync.loadPage(number, { isCurrent: current }), current);
        if (changed) error = "";
        return changed;
      });
    },
    retry() {
      return exclusive(async () => {
        autoBlocked = false;
        await sync.connect();
        await drain();
        if (!await refresh()) throw new Error("The page still needs to reconnect.");
        error = ""; return true;
      });
    },
    async flush() {
      try { return await exclusive(async () => { await drain(); error = ""; return true; }); }
      catch { return false; }
    },
    updateContext(next) {
      return exclusive(async () => {
        await drain();
        const check = policy.getState({ context: next });
        if (check.needsNewSession) throw new Error("A new scoped session is needed. Existing work remains open.");
        context = next; error = ""; return true;
      });
    },
    close() {
      if (closed) return Promise.resolve(true);
      if (closingPromise) return closingPromise;
      closing = true; emit();
      closingPromise = exclusive(async () => {
        await drain();
        closed = true; epoch++;
        try { await sync.close(); }
        finally { lease?.release(); images.close(); }
        return true;
      }, true).catch(() => false).finally(() => {
        if (!closed) { closing = false; closingPromise = null; emit(); }
      });
      return closingPromise;
    },
  };
}
