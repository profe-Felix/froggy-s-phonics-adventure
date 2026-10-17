import React, { useState } from "react";
import { isExternalNotebookControlEnabled } from "@/lib/external-notebook/runtime";
import { syncExternalNotebookControls } from "@/lib/external-notebook/client";

// Optional explicit "retry sync" port. The teacher mutation path MUST also await
// syncExternalNotebookControls and visibly report failure; this is not polling.
export default function ExternalNotebookTeacherStatus({ context }) {
  const [state, setState] = useState("");
  const [busy, setBusy] = useState(false);
  if (!isExternalNotebookControlEnabled(context)) return null;
  const retry = async () => {
    if (busy) return;
    setBusy(true); setState("Synchronizing notebook controls…");
    try { await syncExternalNotebookControls(context); setState("Notebook controls synchronized."); }
    catch { setState("Notebook controls are NOT synchronized. Retry before relying on the broadcast."); }
    finally { setBusy(false); }
  };
  return <div>
    {state && <p role="status">{state}</p>}
    <button type="button" disabled={busy} onClick={retry}>Retry notebook control sync</button>
  </div>;
}