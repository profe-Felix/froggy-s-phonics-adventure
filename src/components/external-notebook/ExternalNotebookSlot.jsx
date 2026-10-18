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
export default function ExternalNotebookSlot({
  context, children, registerSave, onComplete,
}) {
  const desired = describe(context, onComplete);
  const latest = useRef(desired);
  latest.current = desired;

  const [view, setView] = useState(() => ({
    ...desired,
    generation: 0,
  }));
  const current = useRef(view);
  current.current = view;

  const childSave = useRef(null);
  const mounted = useRef(false);
  const moving = useRef(null);
  const closing = useRef(null);
  const sealed = useRef(null);
  const reconcile = useRef(null);
  const [notice, setNotice] = useState({ busy: false, error: "" });

  const registerChild = useCallback(save => {
    if (current.current.generation !== view.generation) return;
    childSave.current = save;
    if (save) queueMicrotask(() => { void reconcile.current?.(); });
  }, [view.generation]);

  const save = useCallback(async () => {
    const previous = current.current;
    const target = latest.current;
    const child = childSave.current;

    const unchanged = () =>
      mounted.current &&
      current.current === previous &&
      latest.current.active === target.active &&
      latest.current.key === target.key &&
      latest.current.signature === target.signature;

    if (
      !previous.active ||
      !target.active ||
      previous.key !== target.key ||
      previous.signature !== target.signature ||
      moving.current ||
      closing.current ||
      !unchanged()
    ) return false;

    if (sealed.current === previous.generation) return true;

    try {
      return (
        typeof child === "function" &&
        await child() === true &&
        unchanged() &&
        childSave.current === child &&
        !moving.current &&
        !closing.current
      );
    } catch {
      return false;
    }
  }, []);

  const close = useCallback(() => {
    if (closing.current) return closing.current;

    const previous = current.current;
    const target = latest.current;
    const child = childSave.current;

    const sameTarget = () =>
      latest.current.active === target.active &&
      latest.current.key === target.key &&
      latest.current.signature === target.signature;

    const sameOwner = () =>
      mounted.current &&
      current.current === previous &&
      childSave.current === child;

    if (
      !sameOwner() ||
      !previous.active ||
      !target.active ||
      moving.current ||
      previous.key !== target.key ||
      previous.signature !== target.signature
    ) return Promise.resolve(false);

    if (sealed.current === previous.generation) {
      return Promise.resolve(true);
    }

    if (typeof child?.close !== "function") {
      return Promise.resolve(false);
    }

    setNotice({ busy: true, error: "" });

    closing.current = Promise.resolve().then(async () => {
      if (!sameOwner() || !sameTarget()) return false;
      if (await child.close() !== true || !sameOwner()) return false;

      sealed.current = previous.generation;
      return sameTarget();
    }).catch(() => false).then(closed => {
      if (mounted.current) {
        setNotice({
          busy: sealed.current === previous.generation,
          error: closed || !sameTarget()
            ? ""
            : "The notebook has not confirmed a safe close. Keep this activity open and retry.",
          action: "close",
        });
      }
      return closed;
    }).finally(() => {
      closing.current = null;
      if (mounted.current && !sameTarget()) {
        queueMicrotask(() => { void reconcile.current?.(); });
      }
    });

    return closing.current;
  }, []);

  save.close = close;

  function move() {
    if (!mounted.current) return Promise.resolve(false);
    if (closing.current) return closing.current;
    if (moving.current) return moving.current;

    const previous = current.current;
    const target = latest.current;

    if (sealed.current === previous.generation) {
      if (
        target.active === previous.active &&
        target.key === previous.key &&
        target.signature === previous.signature
      ) return Promise.resolve(true);

      childSave.current = null;
      setView({
        ...target,
        generation: previous.generation + 1,
      });
      setNotice({ busy: false, error: "" });
      return Promise.resolve(true);
    }

    if (!previous.active) {
      if (target.active) {
        setView({
          ...target,
          generation: previous.generation + 1,
        });
      }
      return Promise.resolve(true);
    }

    if (target.active && target.key === previous.key) {
      if (target.signature !== previous.signature) {
        setView({
          ...target,
          generation: previous.generation,
        });
      }
      setNotice({ busy: false, error: "" });
      return Promise.resolve(true);
    }

    if (typeof childSave.current?.close !== "function") {
      setNotice({
        busy: false,
        error: "Waiting for the notebook save connection. Keep this activity open and retry.",
      });
      return Promise.resolve(false);
    }

    const leave = childSave.current.close;
    setNotice({ busy: true, error: "" });

    moving.current = Promise.resolve().then(async () => {
      if (await leave() !== true) {
        if (mounted.current) {
          setNotice({
            busy: false,
            error: "The notebook has not finished saving. Staying here; retry when it reconnects.",
          });
        }
        return false;
      }

      if (!mounted.current) return false;

      sealed.current = previous.generation;
      childSave.current = null;

      // Requests may change while saving. Open only the newest destination.
      // Always remount after a confirmed close, even if it is the same source.
      setView({
        ...latest.current,
        generation: previous.generation + 1,
      });
      setNotice({ busy: false, error: "" });
      return true;
    }).catch(() => {
      if (mounted.current) {
        setNotice({
          busy: false,
          error: "The notebook could not close safely. Keep this activity open and retry.",
        });
      }
      return false;
    }).finally(() => {
      moving.current = null;

      // A changed request is reconsidered once; failed requests do not spin.
      if (
        mounted.current &&
        latest.current.signature !== target.signature
      ) {
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
    if (
      moving.current ||
      closing.current ||
      sealed.current === view.generation ||
      changing
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <section
      aria-label="Live notebook activity"
      style={{ height: "100%", minHeight: 320 }}
    >
      <div
        style={{ height: "100%", minHeight: 320 }}
        onPointerDownCapture={blockNewInput}
      >
        <ExternalNotebookSurface
          key={view.generation}
          context={view.context}
          registerSave={registerChild}
          onComplete={changing ? view.onComplete : onComplete}
        />
      </div>

      {(notice.busy || notice.error) && (
        <div
          role={notice.error ? "alert" : "status"}
          style={{ padding: 12 }}
        >
          <p>
            {notice.error || (
              sealed.current === view.generation
                ? "Notebook saved. Waiting for the activity change…"
                : "Saving your notebook before changing activities…"
            )}
          </p>

          {notice.error && (
            <button
              type="button"
              onClick={() => {
                void (notice.action === "close" ? close() : move());
              }}
            >
              Retry saving and switching
            </button>
          )}
        </div>
      )}
    </section>
  );
}