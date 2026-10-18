import test from "node:test";
import assert from "node:assert/strict";
import { overviewPath, historyPath, parseOverview, loadFullHistory, createRefreshScheduler }
  from "../src/lib/external-notebook/teacher-controller.js";

test("paths match backend routes", () => {
  assert.equal(overviewPath("c1", "w1", 3), "/classes/c1/overview-pages?workbookId=w1&page=3");
  assert.equal(historyPath("c1", 4, "w1", 2, 10, 50),
    "/classes/c1/students/4/history?workbookId=w1&page=2&after=10&throughRevision=50");
});

test("parseOverview rejects mismatched page", () => {
  const ok = { classId: "c", workbookId: "w", page: 1, generatedAt: "x", notebooks: [{ studentNumber: 1, revision: 0, strokes: [] }] };
  assert.equal(parseOverview(ok, { classId: "c", workbookId: "w", page: 1 }).notebooks.length, 1);
  assert.throws(() => parseOverview({ ...ok, page: 2 }, { classId: "c", workbookId: "w", page: 1 }));
});

test("loadFullHistory follows nextAfter pinned to throughRevision", async () => {
  const calls = [];
  const ev = r => ({ revision: r, committedAt: "", operation: { id: `o${r}`, kind: "stroke", page: 1 } });
  const request = async path => {
    calls.push(path);
    return calls.length === 1 ? { events: [ev(1), ev(2)], throughRevision: 5, nextAfter: 2 }
      : { events: [ev(5)], throughRevision: 5, nextAfter: null };
  };
  const out = await loadFullHistory(request, { classId: "c", studentNumber: 1, workbookId: "w", page: 1 });
  assert.deepEqual(out.events.map(e => e.revision), [1, 2, 5]);
  assert.match(calls[1], /after=2&throughRevision=5/);
  assert.equal(await loadFullHistory(request, { classId: "c", studentNumber: 1, workbookId: "w", page: 1 },
    { isCurrent: () => false }), null);
});

test("scheduler coalesces bursts into one in-flight run", async () => {
  let runs = 0, release;
  const timers = [];
  const s = createRefreshScheduler({
    run: () => { runs++; return new Promise(r => { release = r; }); },
    minGapMs: 0, setTimer: f => { timers.push(f); return timers.length; }, clearTimer: () => {},
  });
  s.request(); s.request(); s.request();
  assert.equal(timers.length, 1);
  const done = timers[0]();
  s.request(); s.request();
  assert.equal(runs, 1);
  release(); await done;
  assert.equal(timers.length, 2);
  s.stop();
});
