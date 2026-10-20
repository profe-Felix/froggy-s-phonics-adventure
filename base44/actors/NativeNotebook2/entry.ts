import { Actor } from "base44:runtime/actors";
import { nativeScope, checkedPage, validateNativeOperation, normalizeLiveControl } from "./model.js";

// Exclusive V2 namespace. No NotebookSession, old actor, live entity, or Replit API writes.
export default class NativeNotebook2 extends Actor {
  users = new Map(); pages = new Map(); scope = null; live = null;
  chain = Promise.resolve();
  async handleStart() {
    this.scope = await this.storage.get("scope") || null;
    this.live = await this.storage.get("live") || null;
    this.users = new Map(await this.storage.get("users") || []);
    this.pages = new Map();
  }
  async handleConnect(conn) { conn.send({ type: "ready" }); }
  async handleTick() {}
  async handleClose(conn) {
    this.users.delete(conn.id);
    await this.storage.put("users", [...this.users]);
  }
  async writeBlob(key, value) {
    const json = JSON.stringify(value);
    if (json.length < 50000) return this.storage.put(key, value);
    // Each large immutable batch gets a fresh generation before its pointer is committed.
    const generation = `${key}:g:${crypto.randomUUID()}`;
    const chunks = Math.ceil(json.length / 50000);
    for (let i = 0; i < chunks; i++) await this.storage.put(`${generation}:c:${i}`, json.slice(i * 50000, (i + 1) * 50000));
    await this.storage.put(key, { generation, chunks });
  }
  async readBatch(key) {
    const value = await this.storage.get(key);
    if (!value?.chunks) return value || [];
    const chunks = [];
    for (let i = 0; i < value.chunks; i++) chunks.push(await this.storage.get(`${value.generation}:c:${i}`));
    return JSON.parse(chunks.join(""));
  }
  async loadPage(page) {
    checkedPage(page, this.scope.pageCount);
    if (this.pages.has(page)) return this.pages.get(page);
    const last = await this.storage.get(`head:${page}`) ?? 0;
    const batches = [];
    for (let i = 0; i <= last; i++) batches.push(await this.readBatch(`page:${page}:${i}`));
    const state = { last, batches, ops: batches.flat() };
    this.pages.set(page, state); return state;
  }
  async sendPage(conn, page) {
    const state = await this.loadPage(page);
    // Bounded messages, not a full-class/full-document blob.
    conn.send({ type: "page-start", page });
    let chunk = [], size = 0;
    for (const op of state.ops) {
      const bytes = JSON.stringify(op).length;
      if (size + bytes > 250000 && chunk.length) { conn.send({ type: "page-chunk", page, operations: chunk }); chunk = []; size = 0; }
      chunk.push(op); size += bytes;
    }
    if (chunk.length) conn.send({ type: "page-chunk", page, operations: chunk });
    conn.send({ type: "page-end", page });
  }
  async handleMessage(conn, msg) {
    this.chain = this.chain.catch(() => {}).then(async () => {
      let stage = "request";
      try {
        if (msg?.type === "join") {
          stage = "scope";
          const key = nativeScope(msg.scope);
          if (key !== this.instanceId) throw new Error("The test notebook scope does not match.");
          stage = "assignment-read";
          const assignment = await this.client.asServiceRole.entities.DigitalNotebookAssignment.get(msg.scope.assignmentId);
          stage = "assignment-access";
          // Hidden means absent from student pickers, not forbidden by an explicit link.
          if (!assignment || !["active", "draft", "closed"].includes(assignment.status)
            || (assignment.class_name !== msg.scope.className && assignment.shared_across_classes !== true)) {
            throw new Error("This assignment is not available to this class.");
          }
          const next = { ...msg.scope, pageCount: assignment.pdf_page_count };
          if (this.scope && nativeScope(this.scope) !== key) throw new Error("Notebook mismatch.");
          if (!["student", "teacher"].includes(msg.role)) throw new Error("Invalid role.");
          // Explicit existing product policy: teacher pages are open, no account login.
          // Teacher connections to ink rooms are read-only; only live-room teachers control V2.
          stage = "scope-store";
          this.scope = next; await this.storage.put("scope", next);
          this.users.set(conn.id, { role: msg.role, page: checkedPage(msg.page || 1, next.pageCount) });
          stage = "subscriber-store";
          await this.storage.put("users", [...this.users]);
          conn.send({ type: "joined", scope: next, live: this.live });
          if (next.channel === "ink") await this.sendPage(conn, msg.page || 1);
          return;
        }
        const user = this.users.get(conn.id);
        if (!user || !this.scope) throw new Error("Wait for the test notebook connection.");
        if (msg.type === "ping") {
          conn.send({ type: "pong" });
        } else if (msg.type === "sync") {
          if (this.scope.channel === "live") conn.send({ type: "live", live: this.live });
          else {
            user.page = checkedPage(msg.page, this.scope.pageCount);
            await this.storage.put("users", [...this.users]);
            await this.sendPage(conn, user.page);
          }
        } else if (msg.type === "operation") {
          if (this.scope.channel !== "ink" || user.role !== "student") throw new Error("This viewer is read-only.");
          const page = checkedPage(msg.page, this.scope.pageCount), op = validateNativeOperation(msg.operation);
          const state = await this.loadPage(page);
          if (!state.ops.some(o => o.id === op.id)) {
            if (state.ops.length >= 20000) throw new Error("This page reached the test history limit. Pending work stays on this device.");
            let index = state.last;
            let batch = state.batches[index] || [];
            if (batch.length && JSON.stringify(batch).length + JSON.stringify(op).length > 48000) { index++; batch = []; }
            const nextBatch = [...batch, op];
            await this.writeBlob(`page:${page}:${index}`, nextBatch);
            if (index !== state.last) await this.storage.put(`head:${page}`, index);
            // Publish only after durable storage. If an uncertain write failed, catch reloads the page.
            state.batches[index] = nextBatch; state.last = index; state.ops.push(op);
            for (const peer of this.getConnections()) {
              const viewer = this.users.get(peer.id);
              if (viewer?.page === page) peer.send({ type: "operation", page, operation: op });
            }
          }
          conn.send({ type: "ack", page, id: op.id });
        } else if (msg.type === "control") {
          if (this.scope.channel !== "live" || user.role !== "teacher") throw new Error("Only the V2 teacher can change test controls.");
          if (await this.storage.get(`ended:${msg.control.id}`)) throw new Error("This session has already ended.");
          const current = this.live?.id === msg.control.id ? this.live : null;
          if (!current && this.live?.active && msg.control.id !== this.live.id) throw new Error("End the current V2 session before starting another.");
          if (typeof msg.control.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(msg.control.id)) throw new Error("Invalid test session.");
          const next = normalizeLiveControl(msg.control, this.scope.pageCount, current);
          await this.storage.put("live", next);
          if (next.ended) await this.storage.put(`ended:${next.id}`, true);
          this.live = next;
          this.broadcast({ type: "live", live: this.live });
        }
      } catch {
        if (msg?.page) this.pages.delete(msg.page);
        conn.send({ type: "error", code: stage, id: msg?.operation?.id, message: `The Base44-only notebook could not complete this request (${stage}). Pending work remains on this device; retry without closing the page.` });
      }
    });
    await this.chain;
  }
}
