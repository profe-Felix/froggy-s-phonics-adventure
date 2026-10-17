import React, { useCallback, useEffect, useRef, useState } from "react";
import { isExternalNotebookActive } from "@/lib/external-notebook/runtime";
import ExternalNotebookSurface from "./ExternalNotebookSurface";

function describe(context, onComplete) {
  return {
    active: !!isExternalNotebookActive(context), context, onComplete,
    signature: JSON.stringify(context ?? null),
    key: JSON.stringify([
      context?.role, context?.schoolYear, context?.className,
      context?.assignmentId, context?.student?.id, context?.student?.number,
      context?.student?.className, context?.student?.schoolYear,
      context?.kind, context?.sourceId, context?.stepId,
    ]),
  };
}

// children is the EXACT existing activity; never duplicate the old writer.
// With the shipped switches/readiness values this returns children unchanged.
export default function ExternalNotebookSlot({ context, children, registerSave, onComplete }) {
  const desired = describe(context, onComplete);
  const latest = useRef(desired);
  latest.current = desired;
  const [view, setView] = useState(() => ({ ...desired, generation: 0 }));
  const current = useRef(view);
  current.current = view;
  const childSave = useRef(null);
  const mounted = useRef(false);
  const moving = useRef(null);
  const reconcile = useRef(null);
  const [notice, setNotice] = useState({ busy: false, error: "" });

  const registerChild = useCallback(save => {
    childSave.current = save;
    if (save) queueMicrotask(() => { void reconcile.current?.(); });
  }, []);
  const save = useCallback(async () => {
    if (!mounted.current || !current.current.active || moving.current) return false;
    try { return typeof childSave.current === "function" && await childSave.current() === true; }
    catch { return false; }
  }, []);
  const close = useCallback(async () => {
    if (!mounted.current || !current.current.active) return false;
    try {
      if (moving.current) return false;
      return typeof childSave.current?.close === "function" && await childSave.current.close() === true;
    } catch { return false; }
  }, []);
  save.close = close;

  function move() {
    if (!mounted.current) return Promise.resolve(false);
    if (moving.current) return moving.current;
    const previous = current.current, target = latest.current;
    if (!previous.active) {
      if (target.active) setView({ ...target, generation: previous.generation + 1 });
      return Promise.resolve(true);
    }
    if (target.active && target.key === previous.key) {
      if (target.signature !== previous.signature) {
        setView({ ...target, generation: previous.generation });
      }
      setNotice({ busy: false, error: "" });
      return Promise.resolve(true);
    }
    if (typeof childSave.current?.close !== "function") {
      setNotice({ busy: false, error: "Waiting for the notebook save connection. Keep this activity open and retry." });
      return Promise.resolve(false);
    }
    const leave = childSave.current.close;
    setNotice({ busy: true, error: "" });
    moving.current = Promise.resolve().then(async () => {
      if (await leave() !== true) {
        if (mounted.current) setNotice({
          busy: false, error: "The notebook has not finished saving. Staying here; retry when it reconnects.",
        });
        return false;
      }
      if (!mounted.current) return false;
      // Requests may change while saving. Open only the newest destination.
      // Always remount after a confirmed close, even if it is the same source.
      setView({ ...latest.current, generation: previous.generation + 1 });
      setNotice({ busy: false, error: "" });
      return true;
    }).catch(() => {
      if (mounted.current) setNotice({
        busy: false, error: "The notebook could not close safely. Keep this activity open and retry.",
      });
      return false;
    }).finally(() => {
      moving.current = null;
      // A changed request is reconsidered once; failed requests do not spin.
      if (mounted.current && latest.current.signature !== target.signature) {
        queueMicrotask(() => { void reconcile.current?.(); });
      }
    });
    return moving.current;
  }
  reconcile.current = move;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    void move();
  }, [desired.active, desired.key, desired.signature]);
  useEffect(() => {
    if (!view.active) return;
    registerSave?.(save);
    return () => { registerSave?.(null); };
  }, [view.active, registerSave, save]);

  if (!view.active) return <>{children}</>;
  const changing = !desired.active || desired.key !== view.key;
  const blockNewInput = event => {
    if (moving.current || changing) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  return <section aria-label="Live notebook activity" style={{ height: "100%", minHeight: 320 }}>
    <div style={{ height: "100%", minHeight: 320 }} onPointerDownCapture={blockNewInput}>
      <ExternalNotebookSurface
        key={view.generation}
        context={view.context}
        registerSave={registerChild}
        onComplete={changing ? view.onComplete : onComplete}
      />
    </div>
    {(notice.busy || notice.error) && <div role={notice.error ? "alert" : "status"} style={{ padding: 12 }}>
      <p>{notice.error || "Saving your notebook before changing activities…"}</p>
      {notice.error && <button type="button" onClick={() => { void move(); }}>
        Retry saving and switching
      </button>}
    </div>}
  </section>;
}