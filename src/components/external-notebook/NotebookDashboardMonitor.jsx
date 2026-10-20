import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { EXTERNAL_NOTEBOOK_CONFIG } from "@/lib/external-notebook/config";
import { createNotebookHostSession } from "@/lib/external-notebook/host-session";
import { createNotebookRenewableTransport } from "@/lib/external-notebook/renewable-transport";
import { mountNotebookDashboard } from "@/lib/external-notebook/dashboard-preview-runtime";
import { validatePreviewSession } from "@/lib/external-notebook/dashboard-preview-model";

async function bootstrap(context) {
  const response = await base44.functions.invoke("notebookDashboardBootstrap", {
    className: context.className, schoolYear: context.schoolYear, assignmentId: context.assignmentId,
  });
  if (response?.data?.error) throw new Error(response.data.error);
  return validatePreviewSession(response?.data, context, EXTERNAL_NOTEBOOK_CONFIG.notebookOrigin);
}

export default function NotebookDashboardMonitor({ context, onPageChange }) {
  const node = useRef(null);
  const active = useRef(null);
  const latest = useRef({ context, onPageChange });
  latest.current = { context, onPageChange };
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState({ loading: true, error: "" });
  // Page navigation updates the mounted viewer, not its connection.
  const signature = JSON.stringify({ ...context, page: undefined });
  useEffect(() => {
    const mount = document.createElement("div");
    node.current.appendChild(mount);
    let disposed = false;
    setStatus({ loading: true, error: "" });
    const host = createNotebookHostSession({
      element: mount, context: latest.current.context,
      workKey: JSON.stringify(["dashboard-preview", context.schoolYear, context.className, context.assignmentId]),
      bootstrap,
      // The teacher viewer never writes local or server ink.
      openPersistence: async () => ({ async close() {} }),
      createTransport: createNotebookRenewableTransport,
      mount: options => mountNotebookDashboard({ ...options,
        onPageChange: page => latest.current.onPageChange?.(page) }),
    });
    const ready = host.start();
    active.current = { host, ready, updates: ready };
    ready.then(() => {
      if (!disposed) setStatus({ loading: false, error: "" });
    }).catch(error => {
      if (!disposed) setStatus({ loading: false,
        error: error?.response?.data?.error || error?.message || "Could not open the view-only monitor." });
    });
    return () => {
      disposed = true;
      if (active.current?.host === host) active.current = null;
      void host.close().finally(() => mount.remove());
    };
  }, [signature, attempt]);
  useEffect(() => {
    let cancelled = false;
    const current = active.current;
    if (current) current.updates = current.updates.catch(() => {}).then(async () => {
      if (!cancelled && active.current === current) await current.host.updateContext(latest.current.context);
    }).catch(error => {
      if (!cancelled && active.current === current) setStatus({ loading: false,
        error: error?.message || "The dashboard page could not change." });
    });
    return () => { cancelled = true; };
  }, [context.page, signature, attempt]);
  return <section aria-label="New notebook work monitor">
    {status.loading && <p role="status" className="p-5 text-sm text-slate-600">Connecting to the view-only dashboard…</p>}
    {status.error && <div role="alert" className="m-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
      <p>{status.error}</p>
      <button type="button" className="mt-3 rounded-lg bg-slate-800 px-4 py-2 font-semibold text-white"
        onClick={() => setAttempt(n => n + 1)}>Retry connection</button>
    </div>}
    <div ref={node} />
  </section>;
}
