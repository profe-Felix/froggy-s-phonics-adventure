import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { nativeScope, checkedPage, sourceKey, validateNativeOperation, normalizeLiveControl } from "../src/lib/notebook2/model.mjs";
import { materializeDrawing } from "../src/lib/external-notebook/ink-model.js";

const scope = { className: "Felix", assignmentId: "abc", schoolYear: "26-27", channel: "ink", number: 1 };
const stroke = id => ({ id, kind: "stroke", page: 1, stroke: { id, color: "#123456", width: 0.004, tool: "pen", points: [{ x: .2, y: .2, t: 0 }, { x: .3, y: .4, t: 200 }] } });
const control = { id: "test-session", page: 1, students: [1, 2], engine: "native", follow: true };

test("V2 scope separates class, seat, year, assignment and live channel; caps classes at 30 seats", () => {
  const original = nativeScope(scope);
  for (const patch of [{ className: "Valero" }, { number: 2 }, { schoolYear: "27-28" }, { assignmentId: "def" }, { channel: "live", number: 0 }]) {
    assert.notEqual(nativeScope({ ...scope, ...patch }), original);
  }
  for (const patch of [{ number: 31 }, { number: 0 }, { className: "unknown" }, { assignmentId: "../escape" }, { schoolYear: "2026" }]) {
    assert.throws(() => nativeScope({ ...scope, ...patch }));
  }
});
test("page/source identity does not merge ink or silently clamp invalid page links", () => {
  assert.equal(sourceKey({ id: "a" }), "assignment:a");
  assert.equal(sourceKey({ id: "b", library_key: `sha256:${"a".repeat(64)}` }), `sha256:${"a".repeat(64)}`);
  assert.equal(checkedPage("61", 206), 61);
  for (const p of [0, 207, 2.5, NaN]) assert.throws(() => checkedPage(p, 206));
});
test("native validation retains additive pixel cuts, undo and redo without replacing old strokes", () => {
  const ink = validateNativeOperation(stroke("s1"));
  const cut = validateNativeOperation({ id: "cut1", kind: "pixelErase", erasePath: { id: "cut1", points: [{ x: .25, y: .25 }], width: .03, targetIds: ["s1"] } });
  const undo = validateNativeOperation({ id: "undo1", kind: "undo", targetIds: ["cut1"] });
  const redo = validateNativeOperation({ id: "redo1", kind: "redo", targetIds: ["cut1"] });
  assert.equal(materializeDrawing([ink, cut])[0].erasures.length, 1);
  assert.equal(materializeDrawing([ink, cut, undo])[0].erasures, undefined);
  assert.equal(materializeDrawing([ink, cut, undo, redo])[0].erasures.length, 1);
  assert.throws(() => validateNativeOperation({ ...ink, kind: "clear" }));
  assert.throws(() => validateNativeOperation({ ...ink, stroke: { ...ink.stroke, points: [{ x: 2, y: .1 }] } }));
});
test("native live sessions support selected students, engine comparisons and terminal End", () => {
  const state = normalizeLiveControl(control, 206, null);
  assert.deepEqual(state.students, [1, 2]);
  assert.equal(normalizeLiveControl({ ...control, engine: "current", page: 61 }, 206, state).page, 61);
  const ended = normalizeLiveControl({ ...control, ended: true }, 206, state);
  assert.equal(ended.active, false);
  assert.throws(() => normalizeLiveControl(control, 206, ended));
  assert.throws(() => normalizeLiveControl({ ...control, students: [31] }, 206, null));
});

async function fixture(customScope = scope, saved = new Map()) {
  const source = await fs.readFile(new URL("../base44/actors/NativeNotebook2/entry.ts", import.meta.url), "utf8");
  const modelUrl = pathToFileURL(new URL("../base44/actors/NativeNotebook2/model.js", import.meta.url).pathname).href;
  const module = source.replace('import { Actor } from "base44:runtime/actors";', "class Actor {}")
    .replace('"./model.js"', JSON.stringify(modelUrl));
  const { default: Room } = await import(`data:text/javascript;base64,${Buffer.from(module).toString("base64")}`);
  const room = new Room(), events = [], teacherEvents = [], writes = [];
  room.instanceId = nativeScope(customScope);
  room.storage = {
    get: async key => structuredClone(saved.get(key)),
    put: async (key, value) => { writes.push(key); saved.set(key, structuredClone(value)); },
  };
  room.client = { asServiceRole: { entities: { DigitalNotebookAssignment: {
    get: async () => ({ id: customScope.assignmentId, class_name: customScope.className, status: "active", hidden: true, pdf_page_count: 206 }),
  } } } };
  const student = { id: "student", send: msg => events.push(msg) }, teacher = { id: "teacher", send: msg => teacherEvents.push(msg) };
  room.getConnections = () => [student, teacher];
  room.broadcast = msg => { student.send(msg); teacher.send(msg); };
  await room.handleStart();
  const join = async (conn, role) => room.handleMessage(conn, { type: "join", scope: customScope, role, page: 1 });
  return { room, events, teacherEvents, writes, student, teacher, saved, join };
}
test("ink acknowledgements are durable and idempotent across reload/hibernation", async () => {
  const f = await fixture();
  await f.join(f.student, "student");
  const op = stroke("s1");
  await f.room.handleMessage(f.student, { type: "operation", page: 1, operation: op });
  assert.ok(f.events.find(e => e.type === "ack" && e.id === "s1"));
  assert.ok(f.writes.some(k => k.startsWith("page:")));
  const next = await fixture(scope, f.saved);
  await next.join(next.student, "student");
  await next.room.handleMessage(next.student, { type: "operation", page: 1, operation: op });
  assert.equal((await next.room.loadPage(1)).ops.length, 1);
  assert.equal(next.writes.filter(k => k.startsWith("page:")).length, 0);
});
test("teacher thumbnail connections cannot write and students cannot control live rooms", async () => {
  const f = await fixture();
  await f.join(f.teacher, "teacher");
  await f.room.handleMessage(f.teacher, { type: "operation", page: 1, operation: stroke("bad") });
  assert.ok(f.teacherEvents.some(e => e.type === "error"));
  assert.equal((await f.room.loadPage(1)).ops.length, 0);
  const live = await fixture({ ...scope, channel: "live", number: 0 });
  await live.join(live.student, "student");
  await live.room.handleMessage(live.student, { type: "control", control });
  assert.equal(live.room.live, null);
});
test("live End stays terminal after a new session and actor hibernation", async () => {
  const liveScope = { ...scope, channel: "live", number: 0 }, f = await fixture(liveScope);
  await f.join(f.teacher, "teacher");
  await f.room.handleMessage(f.teacher, { type: "control", control });
  await f.room.handleMessage(f.teacher, { type: "control", control: { ...control, ended: true } });
  await f.room.handleMessage(f.teacher, { type: "control", control: { ...control, id: "second" } });
  await f.room.handleMessage(f.teacher, { type: "control", control: { ...control, id: "second", ended: true } });
  const next = await fixture(liveScope, f.saved);
  await next.join(next.teacher, "teacher");
  await next.room.handleMessage(next.teacher, { type: "control", control });
  assert.equal(next.room.live.id, "second");
  assert.equal(next.room.live.ended, true);
});
test("uncertain storage failure never acknowledges unsaved ink and retry remains safe", async () => {
  const f = await fixture(); await f.join(f.student, "student");
  const original = f.room.storage.put;
  f.room.storage.put = async (key, value) => { if (key.startsWith("page:")) throw new Error("storage down"); return original(key, value); };
  await f.room.handleMessage(f.student, { type: "operation", page: 1, operation: stroke("s1") });
  assert.equal(f.events.some(e => e.type === "ack"), false);
  f.room.storage.put = original;
  await f.room.handleMessage(f.student, { type: "operation", page: 1, operation: stroke("s1") });
  assert.equal((await f.room.loadPage(1)).ops.length, 1);
  assert.ok(f.events.some(e => e.type === "ack"));
});
test("native runtime contains no external notebook requests or old entity mutations", async () => {
  const actor = await fs.readFile(new URL("../base44/actors/NativeNotebook2/entry.ts", import.meta.url), "utf8");
  assert.doesNotMatch(actor, /entities\.(NotebookSession|LiveLessonSession|LiveNotebookAssessment)\./);
  assert.doesNotMatch(actor, /fetch\(|externalNotebook|replit\.app/);
  const assets = await fs.readFile(new URL("../src/lib/notebook2/assets.js", import.meta.url), "utf8");
  assert.match(assets, /Core\.UploadFile/);
  assert.doesNotMatch(assets, /replit\.app|externalNotebookBootstrap/);
});
test("large page operations survive chunked storage and preserve page subscriptions through hibernation", async () => {
  const f = await fixture(); await f.join(f.student, "student"); await f.join(f.teacher, "teacher");
  const op = stroke("long");
  op.stroke.points = Array.from({ length: 1500 }, (_, i) => ({ x: .123456789, y: i / 1500, t: i }));
  await f.room.handleMessage(f.student, { type: "operation", page: 1, operation: op });
  await f.room.handleMessage(f.teacher, { type: "sync", page: 2 });
  const next = await fixture(scope, f.saved);
  assert.equal((await next.room.loadPage(1)).ops[0].stroke.points.length, 1500);
  assert.equal(next.room.users.get("teacher").page, 2);
  assert.ok(f.writes.some(k => k.includes(":g:")));
});
test("browser queue is durable before send, survives snapshots/reopen, and removes only acknowledged IDs", async () => {
  const source = await fs.readFile(new URL("../src/lib/notebook2/client.js", import.meta.url), "utf8");
  const modelUrl = new URL("../src/lib/notebook2/model.mjs", import.meta.url).href;
  const sockets = [], stored = new Map();
  const previous = { window: globalThis.window, localStorage: globalThis.localStorage };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.localStorage = {
    get length() { return stored.size; }, key: i => [...stored.keys()][i],
    getItem: k => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, v), removeItem: k => stored.delete(k),
  };
  globalThis.__nativeFixture = { actors: { NativeNotebook2: () => ({ connect: () => {
    const socket = { messages: [], send(msg) {
      if (msg.type === "operation") assert.ok([...stored.values()].some(v => JSON.parse(v).operation.id === msg.operation.id));
      this.messages.push(msg);
    }, subscribe(fn) { this.receive = fn; return { unsubscribe() {} }; }, close() {} };
    sockets.push(socket); return socket;
  } }) } };
  const code = source.replace('import { notebookBase44 } from "@/api/base44Client";', "const notebookBase44 = globalThis.__nativeFixture;")
    .replace('"./model.mjs"', JSON.stringify(modelUrl));
  let first, next;
  try {
    const { openNativeNotebook } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
    first = openNativeNotebook(scope, "student", () => {});
    sockets[0].receive({ type: "ready" }); sockets[0].receive({ type: "joined" });
    first.queue(stroke("s1"), 1); first.queue(stroke("s2"), 2);
    sockets[0].receive({ type: "page-start", page: 1 }); sockets[0].receive({ type: "page-end", page: 1 });
    assert.equal(stored.size, 2);
    sockets[0].receive({ type: "ack", id: "s1" }); assert.equal(stored.size, 1);
    first.close();
    next = openNativeNotebook(scope, "student", () => {});
    sockets[1].receive({ type: "joined" });
    assert.equal(sockets[1].messages.filter(m => m.type === "operation").length, 1);
    assert.equal(sockets[1].messages.find(m => m.type === "operation").page, 2);
    sockets[1].receive({ type: "ack", id: "s2" }); assert.equal(await next.flush(), true);
    assert.equal(stored.size, 0);
  } finally {
    first?.close(); next?.close(); globalThis.window = previous.window; globalThis.localStorage = previous.localStorage;
    delete globalThis.__nativeFixture;
  }
});
