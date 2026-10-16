import { notebookBase44 as base44 } from '@/api/base44Client';
import { projectPage, recoverLegacy } from '@/components/notebook-test/notebookOperations';

// Test-only shared notebook client — connects to test actors and uses
// isolated localStorage/sessionStorage namespaces so test data never
// collides with production notebook state.
const clients = new Map();
const opPrefix = 'notebook-test-operation-';

class SharedNotebookClientTest {
  constructor(context, teacher) {
    this.context = context; this.teacher = teacher; this.listeners = new Set(); this.serverPages = new Map(); this.pending = new Map(); this.waiters = new Map(); this.writer = 0; this.connected = false;
    this.state = { session: null, pages: {}, status: 'Connecting to test notebook…', error: '', ready: false, writer: 0 };
    let id = sessionStorage.getItem('notebook-test-connection-id');
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('notebook-test-connection-id', id); }
    this.clientId = `${id}-${teacher ? 'teacher' : 'student'}-${crypto.randomUUID().slice(0, 8)}`;
    this.recoveryConnections = new Map();
    this.lastOpen = 0; this.lastJoin = 0; this.lastPageRequest = 0;
    this.retryAttempt = 0; this.retryAt = 0; this.pagePending = true;
    this.openPayload = { type: 'open', ...context };
    // Stagger initial connection to avoid 429 storms.
    this.registryTimer = setTimeout(() => this.connectRegistry(), ((context.student_number - 1) % 30) * 120 + Math.floor(Math.random() * 800));
    this.scheduleRetry();
    this.online = () => this.retry(); window.addEventListener('online', this.online);
  }
  connectRegistry() {
    const id = sessionStorage.getItem('notebook-test-connection-id') || crypto.randomUUID();
    this.registry = base44.actors.NotebookClassRegistryLoadTest(`notebook-test-${this.context.assignment_id}-${this.context.student_number}-${this.context.school_year}`).connect({ id });
    this.registryReady = false;
    this.registrySub = this.registry.subscribe(msg => {
      if (msg.type === 'registry_ready') { this.registryReady = true; this.lastOpen = Date.now(); this.registry.send(this.openPayload); }
      if (msg.type === 'document' && !this.room) this.open(msg);
      if (msg.type === 'error') this.retryError(msg);
    });
  }
  scheduleRetry(delay = 10000) {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.timer = setTimeout(() => { this.timer = null; this.retry(); }, delay + Math.floor(Math.random() * 1000));
  }
  retryError(msg) {
    const delay = Math.max(Number(msg.retry_after_ms) || 0, Math.min(60000, 1500 * 2 ** Math.min(this.retryAttempt++, 6))) + Math.floor(Math.random() * 8000);
    this.retryAt = Date.now() + delay;
    if (msg.stage === 'page') { this.pagePending = true; this.lastPageRequest = 0; }
    this.fail(msg.message);
    this.scheduleRetry(delay);
  }
  requestPage() {
    if (!this.connected || Date.now() - this.lastPageRequest < 10000) return;
    this.lastPageRequest = Date.now();
    this.room.send({ type: 'page', page: this.page || 1 });
  }
  fail(message) { this.state = { ...this.state, error: message }; this.notify(); }
  open(msg) {
    this.session = msg.session; this.roomId = msg.room_id;
    const prefix = `${opPrefix}${this.roomId}-`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        const operation = JSON.parse(localStorage.getItem(key));
        if (operation?.op_id && operation.teacher === this.teacher) this.pending.set(operation.op_id, operation);
      }
    }
    this.room = base44.actors.NotebookRoomLoadTest(this.roomId).connect({ id: this.clientId });
    this.roomReady = false;
    this.sub = this.room.subscribe(message => this.receive(message));
    this.registrySub.unsubscribe(); this.registry.close();
  }
  join() {
    if (!this.roomReady || Date.now() - this.lastJoin < 10000) return;
    this.lastJoin = Date.now();
    this.room.send({ type: 'join', room_id: this.roomId, session_id: this.session.id, page: this.page || 1, teacher: this.teacher });
  }
  receive(msg) {
    if (msg.type === 'ready') { this.connected = false; this.pagePending = true; this.roomReady = true; this.lastJoin = 0; this.join(); }
    if (msg.type === 'joined') { this.writer = msg.seat; this.connected = true; this.lastPageRequest = Date.now(); this.state = { ...this.state, session: msg.session, writer: this.writer }; this.retry(); }
    if (msg.type === 'page') {
      const old = this.serverPages.get(msg.page);
      if (old && old.sharedRevision > msg.data.sharedRevision) return;
      this.serverPages.set(msg.page, msg.data);
      if (msg.page === (this.page || 1)) { this.pagePending = false; this.retryAttempt = 0; this.retryAt = 0; this.state = { ...this.state, error: '' }; }
      this.recover(msg.page, msg.data);
    }
    if (msg.type === 'ack') { this.pending.delete(msg.op_id); localStorage.removeItem(`${opPrefix}${this.roomId}-${msg.op_id}`); }
    if (msg.type === 'flushed') { this.waiters.get(msg.request_id)?.(true); this.waiters.delete(msg.request_id); }
    if (msg.type === 'error') { this.retryError(msg); if (msg.request_id) { this.waiters.get(msg.request_id)?.(false); this.waiters.delete(msg.request_id); } }
    this.notify();
  }
  recover(page, data) {
    const key = `notebook-test-draft-${this.session.id}-${page}`;
    const saved = localStorage.getItem(key); if (!saved) return;
    if (this.recovered?.has(key)) return;
    const changes = recoverLegacy(data, saved);
    this.recovered ||= new Set();
    const durable = changes.map(change => this.enqueue(page, change)).every(Boolean);
    if (durable) { this.recovered.add(key); localStorage.removeItem(key); }
  }
  notify() {
    const pages = {}; const strokes = { ...(this.state.session?.strokes_by_page || {}) };
    for (const [page, data] of this.serverPages) {
      pages[page] = projectPage(data, [...this.pending.values()].filter(op => op.page === page), this.writer, this.teacher);
      strokes[page] = JSON.stringify(pages[page]);
    }
    const ready = this.connected && !this.pagePending && this.serverPages.has(this.page || 1);
    const status = this.pending.size ? 'Saving changes…' : ready ? 'Saved to test notebook' : this.connected ? 'Loading notebook page…' : 'Connecting to test notebook…';
    this.state = { ...this.state, pages, ready, session: this.state.session ? { ...this.state.session, strokes_by_page: strokes } : null, status };
    for (const listener of this.listeners) listener(this.state);
  }
  enqueue(page, change) {
    if (!this.roomId) throw new Error('Wait for your notebook to connect before drawing');
    const operation = { type: 'operation', op_id: crypto.randomUUID(), page, change, client_id: this.clientId, teacher: this.teacher };
    let durable = true;
    try { localStorage.setItem(`${opPrefix}${this.roomId}-${operation.op_id}`, JSON.stringify(operation)); }
    catch { durable = false; this.fail('Device recovery storage is unavailable. Keep this notebook open until saving is confirmed.'); }
    this.pending.set(operation.op_id, operation); this.notify();
    if (this.connected) this.room.send(operation);
    return durable;
  }
  pageChanged(page) { if (this.page === page) return; this.page = page; this.pagePending = true; this.lastPageRequest = 0; if (this.connected) this.requestPage(); this.notify(); }
  retry() {
    if (Date.now() < this.retryAt) { this.scheduleRetry(this.retryAt - Date.now()); return; }
    if (!this.room) {
      if (this.registryReady && Date.now() - this.lastOpen >= 10000) { this.lastOpen = Date.now(); this.registry.send(this.openPayload); }
      this.scheduleRetry(); return;
    }
    if (!this.connected) { this.join(); this.scheduleRetry(); return; }
    if (this.pagePending || !this.serverPages.has(this.page || 1)) this.requestPage();
    for (const op of this.pending.values()) {
      if (op.client_id === this.clientId) { this.room.send(op); continue; }
      let recovery = this.recoveryConnections.get(op.client_id);
      if (!recovery) {
        recovery = { connection: base44.actors.NotebookRoomLoadTest(this.roomId).connect({ id: op.client_id }), ready: false };
        this.recoveryConnections.set(op.client_id, recovery);
        const join = () => recovery.connection.send({ type: 'join', room_id: this.roomId, session_id: this.session.id, page: op.page, teacher: this.teacher });
        recovery.subscription = recovery.connection.subscribe(msg => {
          if (msg.type === 'ready') join();
          else if (msg.type === 'joined') { recovery.ready = true; this.retry(); }
          else this.receive(msg);
        });
      }
      if (recovery.ready) recovery.connection.send(op);
    }
    this.scheduleRetry();
  }
  flush() {
    if (!this.flushPromise) this.flushPromise = this.confirmFlush().finally(() => { this.flushPromise = null; });
    return this.flushPromise;
  }
  async confirmFlush() {
    const deadline = Date.now() + 15000;
    this.retry();
    while ((this.pending.size || !this.connected) && Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 100)); }
    if (this.pending.size || !this.connected) { this.fail('Changes are kept on this device but not confirmed saved yet. Keep the notebook open and retry.'); return false; }
    const request_id = crypto.randomUUID();
    return await new Promise(resolve => {
      const timer = setTimeout(() => { this.waiters.delete(request_id); resolve(false); }, 12000);
      this.waiters.set(request_id, ok => { clearTimeout(timer); resolve(ok); }); this.room.send({ type: 'flush', request_id });
    });
  }
  release(listener) {
    this.listeners.delete(listener);
    setTimeout(() => {
      if (this.listeners.size || this.pending.size || this.waiters.size) return;
      for (const recovery of this.recoveryConnections.values()) { recovery.subscription?.unsubscribe(); recovery.connection.close(); }
      this.sub?.unsubscribe(); this.room?.close(); this.registrySub?.unsubscribe(); this.registry?.close();
      if (this.timer) clearTimeout(this.timer);
      window.removeEventListener('online', this.online);
    }, 5000);
  }
}

export function getSharedNotebookTest(context, teacher = false) {
  const key = `${context.assignment_id}-${context.class_name}-${context.student_number}-${context.school_year}-${teacher}`;
  let connection = clients.get(key);
  if (!connection) { connection = new SharedNotebookClientTest(context, teacher); clients.set(key, connection); }
  return connection;
}