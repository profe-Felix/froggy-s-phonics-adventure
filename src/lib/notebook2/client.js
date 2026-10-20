import { notebookBase44 } from "@/api/base44Client";
import { nativeScope } from "./model.mjs";

// One connection per mounted owner; the SDK owns socket reconnects.
export function openNativeNotebook(scope, role, listener, initialPage = 1) {
  const key = nativeScope(scope), pending = new Map();
  const prefix = `nb2-pending:${key}:`;
  let closed = false, connected = false, page = initialPage, lastMessage = Date.now();
  let room, sub, retryTimer, watchdog, attempt = 0;
  const emit = data => { if (!closed) listener(data); };
  const send = data => { if (!closed && room) room.send(data); };
  if (scope.channel === "ink" && role === "student") {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith(prefix)) {
          const op = JSON.parse(localStorage.getItem(k));
          if (op?.operation?.id) pending.set(op.operation.id, op);
        }
      }
    } catch { emit({ type: "error", message: "Device recovery storage cannot be read. Do not draw until storage is available." }); }
  }
  const pendingState = () => emit({ type: "pending", count: pending.size, operations: [...pending.values()] });
  function connect() {
    if (closed) return;
    room = notebookBase44.actors.NativeNotebook2(key).connect({ id: crypto.randomUUID() });
    sub = room.subscribe(msg => {
      lastMessage = Date.now();
      if (msg.type === "ready") {
        connected = false; emit({ type: "connection", connected: false });
        send({ type: "join", scope, role, page });
      }
      if (msg.type === "joined") {
        connected = true; attempt = 0; clearTimeout(retryTimer); emit({ type: "connection", connected: true });
        for (const op of pending.values()) send(op);
      }
      if (msg.type === "ack" && pending.has(msg.id)) {
        // Delete only a confirmed operation. Never clear the page queue on a snapshot.
        try { localStorage.removeItem(`${prefix}${msg.id}`); } catch {}
        pending.delete(msg.id); pendingState();
      }
      emit(msg);
    });
  }
  const retry = () => {
    if (closed) return;
    clearTimeout(retryTimer);
    if (connected) {
      send({ type: "sync", page });
      for (const op of pending.values()) send(op);
    } else {
      sub?.unsubscribe(); room?.close(); connect();
    }
    if (!connected) retryTimer = setTimeout(retry, Math.min(30000, 5000 * 2 ** Math.min(attempt++, 3)) + Math.random() * 1000);
  };
  connect(); pendingState();
  // Health is based on actor responses, not merely on an open socket.
  watchdog = setInterval(() => {
    if (Date.now() - lastMessage > 25000) {
      connected = false; emit({ type: "connection", connected: false });
      retry();
    } else if (connected) {
      send({ type: "ping" });
      if (pending.size) for (const op of pending.values()) send(op);
    }
  }, 10000);
  const online = () => retry();
  window.addEventListener("online", online);
  return {
    send,
    retry,
    choosePage(next) { page = next; if (connected) send({ type: "sync", page }); },
    queue(operation, targetPage) {
      if (role !== "student" || scope.channel !== "ink") throw new Error("Read-only notebook.");
      const msg = { type: "operation", page: targetPage, operation };
      localStorage.setItem(`${prefix}${operation.id}`, JSON.stringify(msg));
      pending.set(operation.id, msg); pendingState();
      if (connected) send(msg);
      return true;
    },
    async flush() {
      for (const op of pending.values()) send(op);
      const until = Date.now() + 12000;
      while (pending.size && Date.now() < until && !closed) await new Promise(r => setTimeout(r, 100));
      return pending.size === 0;
    },
    close() {
      closed = true; clearTimeout(retryTimer); clearInterval(watchdog);
      window.removeEventListener("online", online); sub?.unsubscribe(); room?.close();
    },
  };
}
