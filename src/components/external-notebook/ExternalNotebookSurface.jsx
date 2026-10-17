import React, { useEffect, useRef, useState } from "react";
import { EXTERNAL_NOTEBOOK_CONFIG } from "@/lib/external-notebook/config";
import { persistentWorkKey } from "@/lib/external-notebook/context";
import { bootstrapExternalNotebook } from "@/lib/external-notebook/client";
import { mountNotebook } from "@/lib/external-notebook/engine";
import { createNotebookTransport } from "@/lib/external-notebook/transport";
import { openNotebookPersistence } from "@/lib/external-notebook/persistence";

// Mounted ONLY after the disabled/readiness checks in ExternalNotebookSlot.
// No iframe, navigation, separate login, polling, or recording in this host.
export default function ExternalNotebookSurface({ context, registerSave, onComplete }) {
  const element = useRef(null);
  const runtime = useRef(null);
  const latestContext = useRef(context);
  const latestComplete = useRef(onComplete);
  latestContext.current = context;
  latestComplete.current = onComplete;
  const [status, setStatus] = useState("Opening notebook…");
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [completing, setCompleting] = useState(false);
  const workKey = context.role === "student"
    ? persistentWorkKey(context, EXTERNAL_NOTEBOOK_CONFIG.appId)
    : JSON.stringify(["teacher", EXTERNAL_NOTEBOOK_CONFIG.appId, context.schoolYear, context.className, context.assignmentId]);
  const scopeKey = JSON.stringify([workKey, context.kind, context.sourceId, context.stepId || ""]);

  useEffect(() => {
    const flush = async () => {
      try { return runtime.current ? (await runtime.current.flush()) === true : false; }
      catch { setFailed(true); setStatus("Your work is still on this device. Keep this notebook open and retry saving."); return false; }
    };
    registerSave?.(flush);
    return () => { registerSave?.(null); };
  }, [registerSave]);

  useEffect(() => {
    let alive = true;
    let mountedRuntime = null;
    let transport = null;
    let persistence = null;
    const controller = new AbortController();
    const close = async () => {
      // All implementations must preserve the durable outbox on close.
      try { await mountedRuntime?.close({ keepOutbox: true }); }
      finally {
        try { await transport?.close?.(); }
        finally { await persistence?.close?.({ keepOutbox: true }); }
      }
    };
    setReady(false); setFailed(false); setStatus("Opening notebook…");
    void (async () => {
      try {
        const initial = latestContext.current;
        const session = await bootstrapExternalNotebook(initial);
        if (!alive) return;
        persistence = await openNotebookPersistence({ workKey });
        if (!alive) return;
        transport = await createNotebookTransport({ session, signal: controller.signal });
        if (!alive) return;
        mountedRuntime = await mountNotebook({
          element: element.current, role: initial.role, context: initial,
          session, transport, persistence,
        });
        if (!alive) return;
        if (!mountedRuntime || typeof mountedRuntime.flush !== "function" ||
            typeof mountedRuntime.updateContext !== "function" || typeof mountedRuntime.close !== "function") {
          throw new Error("The notebook engine does not implement the save/transition contract.");
        }
        runtime.current = mountedRuntime;
        await mountedRuntime.updateContext(latestContext.current);
        if (alive) { setReady(true); setStatus(""); }
      } catch {
        if (alive) {
          setFailed(true);
          setStatus("The new notebook could not open. Keep this page open and retry. No switch to the old notebook was made.");
        }
      } finally {
        if (!alive) await close().catch(() => {});
      }
    })();
    return () => {
      alive = false;
      controller.abort();
      runtime.current = null;
      // Parent must await registered flush BEFORE unmount. This is cleanup,
      // not a substitute for that guarantee; it never deletes local work.
      void close().catch(() => {});
    };
  }, [scopeKey, workKey, attempt]);

  useEffect(() => {
    if (!runtime.current) return;
    void runtime.current.updateContext(context).catch(() => {
      setFailed(true); setStatus("The notebook context could not update. Keep this page open.");
    });
  }, [context]);

  const complete = async () => {
    if (completing) return;
    setCompleting(true);
    try {
      if (!runtime.current || (await runtime.current.flush()) !== true) {
        setFailed(true); setStatus("Still saving your work. Keep this notebook open and try again."); return;
      }
      await latestComplete.current?.();
    } catch { setFailed(true); setStatus("The activity could not finish. Your notebook remains open."); }
    finally { setCompleting(false); }
  };

  return <section style={{ position: "relative", height: "100%", minHeight: 320 }} aria-label="Live notebook">
    <div ref={element} style={{ height: "100%", minHeight: 320 }} />
    {status && <div role={failed ? "alert" : "status"} style={{ padding: 16 }}>
      <p>{status}</p>
      {/* Never restart a mounted engine/outbox as a retry shortcut. */}
      {failed && !runtime.current && <button type="button" onClick={() => setAttempt(n => n + 1)}>Retry notebook connection</button>}
    </div>}
    {onComplete && <button type="button" disabled={!ready || completing || failed} onClick={complete}>
      {completing ? "Saving…" : "Finish activity"}
    </button>}
  </section>;
}