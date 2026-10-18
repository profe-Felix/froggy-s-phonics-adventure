import React, { useEffect, useRef, useState } from "react";
import { EXTERNAL_NOTEBOOK_CONFIG } from "@/lib/external-notebook/config";
import { persistentWorkKey } from "@/lib/external-notebook/context";
import { bootstrapExternalNotebook } from "@/lib/external-notebook/client";
import { mountNotebook } from "@/lib/external-notebook/engine";
import { createNotebookRenewableTransport } from "@/lib/external-notebook/renewable-transport";
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
  const retrying = useRef(null);
  const [connection, setConnection] = useState(null);
  const [screen, setScreen] = useState({
    ready: false, failed: false, busy: false, applied: null,
    status: "Opening notebook…",
  });

  function report(entry, message) {
    if (entry?.live && owner.current === entry) {
      setScreen(value => ({ ...value, failed: true, status: message }));
    }
  }

  function needsRecovery(value) {
    if (value?.role !== "student" || !["assessment", "lesson"].includes(value.kind)) return false;
    const targets = value.targetStudents ?? [], finished = value.finishedStudents ?? [];
    const sameSeat = entry => entry?.class_name === value.student?.className &&
      Number(entry.student_number) === value.student?.number;
    return value.active !== true || value.blocked === true ||
      !Array.isArray(targets) || !Array.isArray(finished) ||
      finished.some(sameSeat) || (targets.length > 0 && !targets.some(sameSeat));
  }

  function recoverContext(entry, next) {
    const current = () => entry?.live && owner.current === entry &&
      !entry.released && next === latestContext.current;
    if (!current() || next?.role !== "student" || !["assessment", "lesson"].includes(next.kind)) {
      return Promise.resolve(false);
    }
    if (entry.recoverySaved === next && entry.recoveryHeld) return Promise.resolve(true);
    if (entry.recovery) {
      return entry.recoveryRequested === next ? entry.recovery : Promise.resolve(false);
    }

    // Lock new input synchronously, including the interval before a queued
    // React render. Failure must not make the old activity editable again.
    entry.recoveryHeld = true;
    entry.recoveryRequested = next;
    setScreen(value => ({
      ...value,
      busy: true,
      status: "Saving pending notebook work…",
    }));

    entry.recovery = Promise.resolve().then(async () => {
      if (!current()) return false;
      await entry.host.start();
      if (!current()) return false;

      if (typeof entry.host.recover !== "function") {
        throw new Error("The notebook host needs its recovery update.");
      }

      if (await entry.host.recover(next) !== true || !current()) {
        throw new Error("Pending notebook work is not confirmed saved.");
      }

      entry.recoverySaved = next;
      return true;
    }).catch(() => {
      if (current()) {
        report(
          entry,
          "Pending work could not be recovered yet. This notebook stays locked and open. Retry the connection; no teacher approval is needed."
        );
      }
      return false;
    }).finally(() => {
      entry.recovery = null;
      if (entry.live && owner.current === entry) {
        setScreen(value => ({
          ...value,
          busy: !!saving.current || finishing.current ||
            !!retrying.current || !!entry.leaving,
        }));
      }
    });

    return entry.recovery;
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
      const held = entry.recoveryHeld === true;

      if ((needsRecovery(next) || held) && !await recoverContext(entry, next)) {
        return false;
      }

      if (!entry.live || next !== latestContext.current) return false;

      await entry.host.updateContext(next);
      if (!entry.live || next !== latestContext.current) return false;

      if (held && !needsRecovery(next)) {
        // Returning to an eligible activity requires fresh normal permission,
        // not removal of a local lock or reuse of the recovery capability.
        if (await entry.host.renew() !== true) {
          throw new Error("Writing permission could not renew.");
        }

        if (!entry.live || next !== latestContext.current) return false;

        entry.recoveryHeld = false;
        entry.recoverySaved = null;
      }

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
      const entry = {};
      entry.host = createNotebookHostSession({
          element: element.current, context: initial, workKey,
          bootstrap: bootstrapExternalNotebook,
          openPersistence: openNotebookPersistence,
          createTransport: createNotebookRenewableTransport, mount: mountNotebook,
          onRenewalState: state => {
            if (!entry.live || entry.released || owner.current !== entry) return;
            entry.connection = state;
            setConnection(state);
          },
        });
      owner.current = entry;
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
      if (entry.live) setScreen(value => ({ ...value, busy: finishing.current || !!retrying.current || !!entry.leaving }));
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
      if (finishing.current || retrying.current) return Promise.resolve(false);

      const requested = latestContext.current;
      const current = () => entry.live && owner.current === entry &&
        !entry.released && requested === latestContext.current;

      setScreen(value => ({ ...value, busy: true }));

      entry.leaving = Promise.resolve().then(async () => {
        if (finishing.current || !current()) return false;

        let saved = await flush() === true;
        if (!current()) return false;

        // Leaving may encounter pause/end before updated Base44 context arrives.
        // This fallback is exit-only; an ordinary failed save never freezes an
        // otherwise active notebook or requests a recovery capability.
        if (
          !saved &&
          requested?.role === "student" &&
          ["assessment", "lesson"].includes(requested.kind)
        ) {
          saved = await recoverContext(entry, requested) === true;
        }

        if (!saved || !current()) return false;
        if (await entry.host.close() !== true || !current()) return false;
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

  function retryConnection() {
    if (retrying.current) return retrying.current;
    const entry = owner.current, requested = latestContext.current;
    if (!entry?.live || entry.released || entry.leaving || saving.current || finishing.current) {
      return Promise.resolve(false);
    }
    const current = () => entry.live && owner.current === entry &&
      !entry.released && requested === latestContext.current;
    setScreen(value => ({ ...value, busy: true }));
    retrying.current = Promise.resolve().then(async () => {
      if (!current()) return false;
      await entry.host.start();
      if (!current()) return false;
      if (needsRecovery(requested) || entry.recoveryHeld) {
        if (!await recoverContext(entry, requested) || !current()) return false;
        if (!await applyContext(true) || !current()) return false;
        return await flush();
      }

      // Recover credentials BEFORE trying to drain/reapply the held context.
      if (await entry.host.renew() !== true) {
        throw new Error("The notebook connection is not renewed.");
      }
      if (!current()) return false;
      if (entry.applied !== requested && !await applyContext(true)) return false;
      if (!current()) return false;
      // Renewal readiness alone must not clear a saving/context error.
      return await flush();
    }).catch(() => {
      if (current()) {
        report(entry, "The notebook could not reconnect safely. Keep this page open and retry. Existing work was not discarded.");
      }
      return false;
    }).finally(() => {
      retrying.current = null;
      if (entry.live && owner.current === entry) {
        setScreen(value => ({ ...value, busy: !!saving.current || finishing.current || !!entry.leaving }));
      }
    });
    return retrying.current;
  }

  const complete = async () => {
    if (
      finishing.current ||
      retrying.current ||
      owner.current?.leaving ||
      owner.current?.recoveryHeld ||
      typeof latestComplete.current !== "function"
    ) return;
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

  const renewalFailed = !connection?.closed && !!connection?.error;
  const renewalStatus = connection?.closed ? "" :
    connection?.renewing ? "Refreshing notebook connection…" : connection?.error || "";
  const blockNewInput = event => {
    if (
      saving.current ||
      finishing.current ||
      retrying.current ||
      owner.current?.leaving ||
      owner.current?.recoveryHeld ||
      !screen.ready ||
      screen.applied !== context
    ) {
      event.preventDefault(); event.stopPropagation();
    }
  };
  return <section style={{ position: "relative", height: "100%", minHeight: 320 }} aria-label="Live notebook">
    <div ref={element} style={{ height: "100%", minHeight: 320 }} onPointerDownCapture={blockNewInput} />
    {(screen.status || renewalStatus) && <div role={screen.failed || renewalFailed ? "alert" : "status"} style={{
      position: "absolute", top: 12, left: 12, right: 12, maxWidth: 520,
      zIndex: 30, padding: 12, background: "#fff", border: "1px solid #d4d4d4",
      borderRadius: 8, pointerEvents: screen.failed || renewalFailed ? "auto" : "none",
    }}>
      {screen.status && <p>{screen.status}</p>}
      {renewalStatus && <p>{renewalStatus}</p>}
      {(screen.failed || renewalFailed) && <button type="button" disabled={screen.busy} onClick={() => { void retryConnection(); }}>
        Retry notebook connection
      </button>}
    </div>}
    {onComplete && <button type="button" disabled={
      !screen.ready ||
      screen.busy ||
      screen.applied !== context ||
      owner.current?.recoveryHeld
    } onClick={complete}>
      {screen.busy ? "Saving…" : "Finish activity"}
    </button>}
  </section>;
}