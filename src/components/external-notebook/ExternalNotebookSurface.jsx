import React, { useEffect, useRef, useState } from "react";
import { EXTERNAL_NOTEBOOK_CONFIG } from "@/lib/external-notebook/config";
import { persistentWorkKey } from "@/lib/external-notebook/context";
import { bootstrapExternalNotebook } from "@/lib/external-notebook/client";
import { mountNotebook } from "@/lib/external-notebook/engine";
import { createNotebookTransport } from "@/lib/external-notebook/transport";
import { openNotebookPersistence } from "@/lib/external-notebook/persistence";
import { createNotebookHostSession } from "@/lib/external-notebook/host-session";

// Mounted ONLY after the disabled/readiness checks in ExternalNotebookSlot.
// No iframe, navigation, separate login, polling, or recording in this host.
export default function ExternalNotebookSurface({ context, registerSave, onComplete }) {
  const element = useRef(null);
  const owner = useRef(null);
  const latestContext = useRef(context);
  const latestComplete = useRef(onComplete);
  latestContext.current = context;
  latestComplete.current = onComplete;
  const saving = useRef(null);
  const finishing = useRef(false);
  const [screen, setScreen] = useState({
    ready: false, failed: false, busy: false, applied: null,
    status: "Opening notebook…",
  });

  function report(entry, message) {
    if (entry?.live && owner.current === entry) {
      setScreen(value => ({ ...value, failed: true, status: message }));
    }
  }

  function applyContext(force = false) {
    const entry = owner.current, next = latestContext.current;
    if (!entry?.live) return Promise.resolve(false);
    if (!force && entry.requested === next && entry.update) return entry.update;
    entry.requested = next;
    entry.update = (entry.update || Promise.resolve()).then(async () => {
      if (!entry.live || next !== latestContext.current) return false;
      await entry.host.start();
      if (!entry.live || next !== latestContext.current) return false;
      await entry.host.updateContext(next);
      if (!entry.live || next !== latestContext.current) return false;
      entry.applied = next;
      setScreen(value => ({
        ...value, ready: true, failed: false, applied: next, status: "",
      }));
      return true;
    }).catch(() => {
      if (next === latestContext.current) {
        report(entry, "The notebook could not connect or update safely. Keep this page open and retry. Existing work was not discarded.");
      }
      return false;
    });
    return entry.update;
  }

  useEffect(() => {
    // One owner for this mounted screen. Context changes do not tear it down.
    // React's development effect replay reuses the same owner and opening task.
    if (!owner.current) {
      const initial = latestContext.current;
      const workKey = initial.role === "student"
        ? persistentWorkKey(initial, EXTERNAL_NOTEBOOK_CONFIG.appId)
        : JSON.stringify(["teacher", EXTERNAL_NOTEBOOK_CONFIG.appId, initial.schoolYear, initial.className, initial.assignmentId]);
      owner.current = {
        host: createNotebookHostSession({
          element: element.current, context: initial, workKey,
          bootstrap: bootstrapExternalNotebook,
          openPersistence: openNotebookPersistence,
          createTransport: createNotebookTransport, mount: mountNotebook,
        }),
      };
    }
    const entry = owner.current;
    entry.live = true;
    void applyContext();
    return () => {
      entry.live = false;
      queueMicrotask(() => {
        if (entry.live) return;
        // Cleanup cannot undo a parent unmount. Parent guards are still required.
        // A false close intentionally retains the connection and local storage.
        void entry.host.close().then(closed => {
          if (closed !== true) console.error("Notebook removed before saving finished. Resources and pending work were retained.");
        }).catch(error => console.error("Notebook cleanup could not finish safely:", error));
      });
    };
  }, []);

  useEffect(() => {
    void applyContext();
  }, [context]);

  function flush() {
    if (saving.current) return saving.current;
    const entry = owner.current, requested = latestContext.current;
    if (!entry?.live) return Promise.resolve(false);
    setScreen(value => ({ ...value, busy: true }));
    saving.current = Promise.resolve().then(async () => {
      if (entry.applied !== requested && !await applyContext()) return false;
      const saved = await entry.host.flush() === true;
      if (!entry.live || requested !== latestContext.current) return false;
      if (!saved) {
        report(entry, "Saving is not confirmed. Keep this notebook open and retry saving.");
        return false;
      }
      setScreen(value => ({ ...value, failed: false, status: "" }));
      return true;
    }).catch(() => {
      report(entry, "Saving could not finish. Keep this notebook open; do not switch activities yet.");
      return false;
    }).finally(() => {
      saving.current = null;
      if (entry.live) setScreen(value => ({ ...value, busy: finishing.current || !!entry.leaving }));
    });
    return saving.current;
  }

  useEffect(() => {
    // Saving and leaving are different operations. Normal saves keep the
    // notebook usable; close() must finish before its parent removes this view.
    const save = () => owner.current?.released === true ? Promise.resolve(true) : flush();
    save.close = () => {
      const entry = owner.current;
      if (!entry?.live) return Promise.resolve(false);
      if (entry.released) return Promise.resolve(true);
      if (entry.leaving) return entry.leaving;
      if (finishing.current) return Promise.resolve(false);
      setScreen(value => ({ ...value, busy: true }));
      entry.leaving = Promise.resolve().then(async () => {
        if (finishing.current || await flush() !== true) return false;
        if (!entry.live || await entry.host.close() !== true) return false;
        entry.released = true;
        return true;
      }).catch(() => {
        report(entry, "The notebook could not close safely. Keep this activity open and retry.");
        return false;
      }).then(closed => {
        if (!closed) {
          report(entry, "Your notebook is still saving. Staying on this activity.");
        }
        return closed;
      }).finally(() => {
        if (!entry.released) entry.leaving = null;
        if (entry.live) setScreen(value => ({ ...value, busy: entry.released }));
      });
      return entry.leaving;
    };
    registerSave?.(save);
    return () => { registerSave?.(null); };
  }, [registerSave]);

  const complete = async () => {
    if (finishing.current || owner.current?.leaving || typeof latestComplete.current !== "function") return;
    const entry = owner.current, requested = latestContext.current;
    const callback = latestComplete.current;
    finishing.current = true;
    setScreen(value => ({ ...value, busy: true }));
    try {
      if (await flush() !== true || !entry?.live ||
          requested !== latestContext.current || callback !== latestComplete.current) return;
      if (await callback() === false) {
        report(entry, "The activity did not finish. Your notebook remains open.");
      }
    } catch { report(entry, "The activity could not finish. Your notebook remains open."); }
    finally {
      finishing.current = false;
      if (entry?.live) setScreen(value => ({ ...value, busy: false }));
    }
  };

  const blockNewInput = event => {
    if (saving.current || finishing.current || owner.current?.leaving || !screen.ready || screen.applied !== context) {
      event.preventDefault(); event.stopPropagation();
    }
  };
  return <section style={{ position: "relative", height: "100%", minHeight: 320 }} aria-label="Live notebook">
    <div ref={element} style={{ height: "100%", minHeight: 320 }} onPointerDownCapture={blockNewInput} />
    {screen.status && <div role={screen.failed ? "alert" : "status"} style={{ padding: 16 }}>
      <p>{screen.status}</p>
      {screen.failed && <button type="button" disabled={screen.busy} onClick={() => { void applyContext(true); }}>
        Retry notebook connection
      </button>}
    </div>}
    {onComplete && <button type="button" disabled={!screen.ready || screen.busy || screen.applied !== context} onClick={complete}>
      {screen.busy ? "Saving…" : "Finish activity"}
    </button>}
  </section>;
}