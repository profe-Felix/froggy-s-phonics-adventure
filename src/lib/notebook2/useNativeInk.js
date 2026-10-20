import { useEffect, useMemo, useRef, useState } from "react";
import { materializeDrawing, effectiveDrawingOperations } from "@/lib/external-notebook/ink-model";
import { createNotebookPageActions } from "@/lib/external-notebook/page-actions";
import { nativeScope } from "./model.mjs";
import { openNativeNotebook } from "./client";

function history(operations) {
  const active = effectiveDrawingOperations(operations), last = active.at(-1);
  const key = op => op.recording?.groupId || op.id;
  const undo = last ? active.filter(op => key(op) === key(last)).map(op => op.id) : [];
  const enabled = new Set(active.map(op => op.id));
  const latestDrawing = operations.findLastIndex(op => !["undo", "redo"].includes(op.kind));
  const lastUndo = operations.slice(latestDrawing + 1).reverse().find(op => op.kind === "undo" && op.targetIds?.some(id => !enabled.has(id)));
  return { undo, redo: lastUndo?.targetIds.filter(id => !enabled.has(id)) || [] };
}
export function useNativeInk({ scope, page, role = "student" }) {
  const key = nativeScope(scope);
  const clientRef = useRef(null), pages = useRef(new Map()), loading = useRef(new Map());
  const pendingRef = useRef([]), pageRef = useRef(page), sequence = useRef(0);
  pageRef.current = page;
  const [version, setVersion] = useState(0), [connected, setConnected] = useState(false);
  const [error, setError] = useState(""), [pending, setPending] = useState(0);
  const [readyPages, setReadyPages] = useState(new Set());
  const writer = useRef(crypto.randomUUID());
  useEffect(() => {
    pages.current = new Map(); loading.current = new Map(); pendingRef.current = [];
    setReadyPages(new Set()); setError(""); setConnected(false);
    let alive = true;
    const notify = () => { if (alive) setVersion(v => v + 1); };
    let client;
    try {
      client = openNativeNotebook(scope, role, msg => {
        if (!alive) return;
        if (msg.type === "connection") { setConnected(msg.connected); if (!msg.connected) setReadyPages(new Set()); }
        if (msg.type === "page-start") loading.current.set(msg.page, []);
        if (msg.type === "page-chunk") loading.current.get(msg.page)?.push(...msg.operations);
        if (msg.type === "page-end") {
          pages.current.set(msg.page, loading.current.get(msg.page) || []);
          loading.current.delete(msg.page);
          setReadyPages(old => new Set([...old, msg.page])); setError(""); notify();
        }
        if (msg.type === "operation") {
          const ops = pages.current.get(msg.page) || [];
          if (!ops.some(op => op.id === msg.operation.id)) pages.current.set(msg.page, [...ops, msg.operation]);
          notify();
        }
        if (msg.type === "pending") {
          pendingRef.current = msg.operations; setPending(msg.count); notify();
        }
        if (msg.type === "error") setError(msg.message);
      }, pageRef.current);
      clientRef.current = client;
    } catch (reason) { setError(reason.message); }
    return () => { alive = false; client?.close(); clientRef.current = null; };
  }, [key, role]);
  useEffect(() => { clientRef.current?.choosePage(page); }, [page, key]);
  useEffect(() => {
    const warn = event => { if (pendingRef.current.length) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const operations = useMemo(() => {
    const ops = pages.current.get(page) || [], known = new Set(ops.map(op => op.id));
    return [...ops, ...pendingRef.current.filter(p => p.page === page && !known.has(p.operation.id)).map(p => p.operation)];
  }, [page, version, key]);
  const strokes = useMemo(() => materializeDrawing(operations), [operations]);
  const undoState = history(operations);
  const stateRef = useRef({ strokes, undoState });
  stateRef.current = { strokes, undoState };
  const bound = useMemo(() => createNotebookPageActions({
    page, writerId: writer.current,
    enqueue: async operation => {
      if (role !== "student" || !clientRef.current) throw new Error("This notebook cannot accept writing yet.");
      clientRef.current.queue(operation, page);
      return ++sequence.current;
    },
  }), [page, key, role]);
  const actions = {
    onStroke: bound.onStroke, onErase: bound.onErase, onPixelErase: bound.onPixelErase,
    clear: () => bound.clear(stateRef.current.strokes, crypto.randomUUID()),
    undo: async () => { await bound.undo(stateRef.current.undoState.undo, crypto.randomUUID()); return true; },
    redo: async () => { await bound.redo(stateRef.current.undoState.redo, crypto.randomUUID()); return true; },
  };
  return {
    operations, strokes, ready: readyPages.has(page), connected, pending, error, clientRef, actions,
    canUndo: role === "student" && undoState.undo.length > 0,
    canRedo: role === "student" && undoState.redo.length > 0,
    canClear: role === "student" && strokes.length > 0,
    retry: () => { setError(""); clientRef.current?.retry(); },
    flush: () => clientRef.current?.flush() || Promise.resolve(false),
  };
}
