// V2 (Base44-only) shared UI. Isolated: never writes legacy notebook entities.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { openNativeNotebook } from "@/lib/notebook2/client";
import { buildPreviewCatalog } from "@/lib/external-notebook/dashboard-preview-model";
import { EXTERNAL_NOTEBOOK_CONFIG } from "@/lib/external-notebook/config";

export const NB2_CSS = `
.nb2{min-height:100dvh;background:hsl(192 30% 94%);color:hsl(200 30% 18%);font-family:ui-rounded,"Nunito","Segoe UI",system-ui,sans-serif;padding:8px;box-sizing:border-box}
.nb2-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px;border-radius:14px;background:hsl(48 60% 98%);margin-bottom:6px}
.nb2-title{font-weight:800;font-size:15px;margin-right:auto;display:flex;gap:6px;align-items:center}
.nb2-pill{border-radius:999px;padding:2px 9px;font-size:12px;font-weight:700;background:hsl(200 30% 93%);color:hsl(200 15% 32%);white-space:nowrap}
.nb2-pill[data-tone=ok]{background:hsl(160 40% 88%);color:hsl(165 60% 20%)}
.nb2-pill[data-tone=warn]{background:hsl(44 90% 84%);color:hsl(36 80% 22%)}
.nb2-pill[data-tone=bad]{background:hsl(4 80% 92%);color:hsl(4 70% 32%)}
.nb2-pill[data-tone=v2]{background:hsl(262 35% 90%);color:hsl(262 40% 30%)}
.nb2-pill[data-tone=cur]{background:hsl(28 80% 88%);color:hsl(24 70% 28%)}
.nb2-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:0 12px;border:0;border-radius:12px;background:hsl(200 30% 93%);color:inherit;font:inherit;font-weight:700;font-size:14px;cursor:pointer;text-decoration:none}
.nb2-btn:hover:not(:disabled){background:hsl(200 30% 88%)}
.nb2-btn:disabled{opacity:.4;cursor:not-allowed}
.nb2-btn:focus-visible{outline:3px solid hsl(28 90% 52%);outline-offset:2px}
.nb2-btn[data-kind=primary]{background:hsl(195 55% 32%);color:hsl(48 60% 98%)}
.nb2-btn[data-kind=primary]:hover:not(:disabled){background:hsl(195 55% 26%)}
.nb2-btn[data-kind=danger]{background:hsl(4 70% 46%);color:hsl(48 60% 98%)}
.nb2-btn[aria-pressed=true]{box-shadow:inset 0 0 0 2px hsl(195 55% 32%);background:hsl(195 45% 88%)}
.nb2-card{background:hsl(48 60% 98%);border-radius:14px;padding:10px;margin-bottom:6px}
.nb2-card h2{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px;color:hsl(200 20% 38%)}
.nb2-notice{border-radius:12px;padding:8px 12px;font-size:13px;font-weight:600;background:hsl(262 35% 94%);color:hsl(262 35% 28%);margin-bottom:6px}
.nb2-notice[data-tone=bad]{background:hsl(4 80% 94%);color:hsl(4 70% 30%)}
.nb2-notice[data-tone=warn]{background:hsl(44 90% 90%);color:hsl(36 80% 22%)}
.nb2-notice[data-tone=ok]{background:hsl(160 40% 90%);color:hsl(165 60% 20%)}
.nb2 select,.nb2 input[type=number],.nb2 input[type=text]{min-height:40px;border-radius:10px;border:1px solid hsl(200 20% 80%);background:hsl(48 60% 99%);padding:0 8px;font:inherit;font-size:14px;color:inherit}
.nb2-grid{display:grid;gap:6px}
.nb2-seat{min-width:40px;min-height:40px;border-radius:10px;border:0;font:inherit;font-weight:800;cursor:pointer;background:hsl(200 30% 93%)}
.nb2-seat[aria-pressed=true]{background:hsl(195 55% 32%);color:hsl(48 60% 98%)}
.nb2-skel{border-radius:10px;background:linear-gradient(90deg,hsl(200 25% 90%),hsl(200 25% 95%),hsl(200 25% 90%));background-size:200% 100%;animation:nb2s 1.2s linear infinite}
@keyframes nb2s{to{background-position:-200% 0}}
.nb2-cat{display:grid;gap:6px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.nb2-cat button{text-align:left;padding:10px;border-radius:12px;border:1px solid hsl(200 20% 86%);background:hsl(48 60% 99%);font:inherit;cursor:pointer;color:inherit}
.nb2-cat button:hover{border-color:hsl(195 55% 40%)}
`;

export const Pill = ({ tone, children, ...rest }) => <span className="nb2-pill" data-tone={tone} {...rest}>{children}</span>;
export const Notice = ({ tone, children, ...rest }) => <div className="nb2-notice" data-tone={tone} role={tone === "bad" ? "alert" : "status"} {...rest}>{children}</div>;
export const IsolationNotice = ({ variant = 2 }) => (
  <Notice data-testid="text-isolation-notice">
    Test version {variant} (Base44-only). Separate storage and separate live controls. The regular notebook and its student work are not changed.
  </Notice>
);

// Read-only list. No writes to original assignments.
export function useNotebookAssignments() {
  return useQuery({
    queryKey: ["nb2-assignments"],
    queryFn: () => base44.entities.DigitalNotebookAssignment.list("-updated_date", 500),
    staleTime: 60000,
  });
}
export function catalogFor(records, className) {
  return className && Array.isArray(records) ? buildPreviewCatalog(records, className,
    { sharedAssignmentIds: [EXTERNAL_NOTEBOOK_CONFIG.assignmentId] }) : [];
}
export function resolveAssignment(records, value) {
  if (!value || !Array.isArray(records)) return null;
  return records.find(a => a.id === value) || records.find(a => (a.title || "") === value) || null;
}

export function Catalog({ records, className, selectedId, onPick }) {
  const catalog = catalogFor(records, className);
  if (!catalog.length) return <Notice tone="warn" data-testid="text-catalog-empty">No notebooks with a PDF are available for {className} yet.</Notice>;
  const groups = [["class", `${className} notebooks`], ["shared", "Shared notebooks"]];
  return groups.map(([scope, label]) => {
    const rows = catalog.filter(c => c.scope === scope);
    if (!rows.length) return null;
    return (
      <div key={scope} style={{ marginBottom: 8 }}>
        <h2>{label}</h2>
        <div className="nb2-cat">
          {rows.map(c => {
            // Keep the exact selected id when it belongs to this group.
            const id = selectedId && c.aliases.includes(selectedId) ? selectedId : c.id;
            return (
              <button key={c.id} type="button" onClick={() => onPick(id)} data-testid={`button-assignment-${c.id}`}
                style={c.aliases.includes(selectedId) ? { borderColor: "hsl(195 55% 32%)", borderWidth: 2 } : undefined}>
                <div style={{ fontWeight: 800 }}>{c.title}</div>
                <div style={{ fontSize: 12, opacity: .7 }}>{c.pageCount} pages · {c.status}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  });
}

// Live room for one assignment. Never sends anything on mount except the client's join.
export function useNativeLive(scope, role) {
  const [state, setState] = useState({ live: null, connected: false, error: "", online: [] });
  const clientRef = useRef(null);
  const waiting = useRef(new Map());
  const key = scope ? `${scope.variant || 2}|${scope.className}|${scope.assignmentId}|${scope.schoolYear}|${scope.studentNumber || 0}` : "";
  useEffect(() => {
    if (!scope) return undefined;
    setState({ live: null, connected: false, error: "", online: [] });
    let client;
    try {
      client = openNativeNotebook({ ...scope, channel: "live", number: 0 }, role, msg => {
        if (msg.type === "connection") setState(s => ({ ...s, connected: msg.connected }));
        else if ((msg.type === "joined" || msg.type === "live") && "live" in msg) setState(s => ({ ...s, live: msg.live || null, error: "" }));
        else if (msg.type === "presence") setState(s => ({ ...s, online: msg.online || [] }));
        else if (msg.type === "control-ack" || (msg.type === "error" && msg.requestId)) {
          const pending = waiting.current.get(msg.requestId);
          if (pending) { clearTimeout(pending.timer); waiting.current.delete(msg.requestId);
            msg.type === "error" ? pending.reject(new Error(msg.message)) : pending.resolve(msg.live); }
        }
        else if (msg.type === "error") setState(s => ({ ...s, error: msg.message || "Live connection problem." }));
      });
    } catch (e) { setState(s => ({ ...s, error: e.message })); return undefined; }
    clientRef.current = client;
    return () => {
      client.close(); if (clientRef.current === client) clientRef.current = null;
      for (const p of waiting.current.values()) { clearTimeout(p.timer); p.reject(new Error("Live connection changed. Retry the control.")); }
      waiting.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, role]);
  const control = body => new Promise((resolve, reject) => {
    if (!clientRef.current || !state.connected) { reject(new Error("Wait for the live connection, then retry.")); return; }
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => { waiting.current.delete(requestId); reject(new Error("Notebook has not confirmed this control. Retry; students were not announced yet.")); }, 12000);
    waiting.current.set(requestId, { resolve, reject, timer });
    try { clientRef.current.send({ type: "control", control: body, requestId }); }
    catch (e) { clearTimeout(timer); waiting.current.delete(requestId); reject(e); }
  });
  return { ...state, control, send: data => clientRef.current?.send(data), retry: () => clientRef.current?.retry() };
}

export const currentNotebookUrl = ({ className, number, assignmentId, page }) =>
  `/DigitalNotebook?${new URLSearchParams({ class: className, number: String(number), assignmentId, page: String(page) })}`;
