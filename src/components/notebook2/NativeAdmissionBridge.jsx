// Admission metadata only. Normal lesson controls and stable ink are untouched.
// Preserve the underlying activity mounted while the native lesson is shown.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { getNativeIdentity, subscribeNativeIdentity } from "@/lib/notebook2/identity";
import { chooseNativeLaunch, mergeNativeLaunch, matchesNativeLaunch } from "@/lib/notebook2/admissionModel.mjs";
import { useNativeAsset } from "./PrepareImages";
import NativeStudentSurface from "./NativeStudentSurface";
import { NB2_CSS, Notice, useNativeLive } from "./shared";

function Session({ launch, identity, leaving, onExit }) {
  const save = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const query = useQuery({ queryKey: ["native-admitted-assignment", launch.assignment_id],
    queryFn: () => base44.entities.DigitalNotebookAssignment.get(launch.assignment_id) });
  const { asset, loading, error: assetError, reload } = useNativeAsset(query.data, launch.variant);
  const live = useNativeLive({ className: identity.className, assignmentId: launch.assignment_id,
    schoolYear: identity.schoolYear, variant: launch.variant, studentNumber: identity.number }, "student");
  const registerSave = useCallback(fn => { save.current = fn; }, []);
  const terminal = live.live?.id === launch.session_id && live.live?.ended;
  const replaced = live.live?.active && live.live.id !== launch.session_id;
  const exiting = leaving || terminal || replaced;
  useEffect(() => {
    if (!exiting) return undefined;
    let alive = true, timer;
    const finish = async () => {
      setSaving(true);
      try {
        if (save.current && await save.current() !== true) throw new Error("Saving your writing before leaving. Keep this page open; retrying automatically.");
        if (alive) onExit(!!terminal || !!replaced);
      } catch (reason) { if (alive) { setError(reason.message); timer = setTimeout(finish, 3000); } }
    };
    void finish();
    return () => { alive = false; clearTimeout(timer); };
  }, [exiting, terminal, replaced, onExit]);
  return <div role="dialog" aria-label={`Live notebook version ${launch.variant}`} data-testid="native-classroom-session"
    className="nb2" style={{ position: "fixed", inset: 0, zIndex: 10000, overflow: "auto", background: "#f2f8fa" }}>
    <style>{NB2_CSS}</style>
    <div className="nb2-bar"><strong>{query.data?.title || "Live notebook"} · Version {launch.variant}</strong>
      <span>{identity.className} · #{identity.number}</span>{saving && <span>Saving before returning…</span>}</div>
    {(error || live.error) && <Notice tone="warn">{error || live.error} <button className="nb2-btn" onClick={live.retry}>Retry connection</button></Notice>}
    {query.isLoading || loading ? <p role="status">Opening your live notebook…</p> : query.error || assetError || !asset
      ? <Notice tone="warn">{assetError || "Your notebook is not ready yet."}
        <button className="nb2-btn" onClick={() => { query.refetch(); reload(); }}>Retry notebook</button></Notice>
      : <>{!live.live && <Notice tone="warn">The worksheet is ready. Waiting for the teacher's live controls; writing is paused.
          <button className="nb2-btn" onClick={live.retry}>Retry live controls</button></Notice>}
        <NativeStudentSurface assignment={query.data} asset={asset} className={identity.className} number={identity.number}
          variant={launch.variant} schoolYear={identity.schoolYear} readOnly={!!exiting || !live.live}
          initialPage={live.live?.page || launch.page || 1} live={live.live} registerSave={registerSave} onRetryAsset={reload} /></>}
  </div>;
}

export default function NativeAdmissionBridge() {
  const identity = useSyncExternalStore(subscribeNativeIdentity, getNativeIdentity, () => null);
  const cache = useQueryClient(), eventVersion = useRef(0);
  const ended = useRef(new Set()), entering = useRef(false);
  const [active, setActive] = useState(null), [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const key = ["native-classroom-launches", identity?.className, identity?.schoolYear];
  const enabled = !!identity?.enabled;
  const query = useQuery({ queryKey: key, enabled,
    queryFn: async () => {
      const version = eventVersion.current;
      const rows = await base44.entities.NativeNotebookLaunch.filter({ class_name: identity.className,
        school_year: identity.schoolYear, active: true }, "-started_at", 100);
      return version === eventVersion.current ? rows : cache.getQueryData(key) || rows;
    }, staleTime: 10000, refetchInterval: 30000, refetchOnWindowFocus: true });
  useEffect(() => {
    if (!enabled) return undefined;
    return base44.entities.NativeNotebookLaunch.subscribe(event => {
      const data = event.data;
      if (data?.class_name && (data.class_name !== identity.className || data.school_year !== identity.schoolYear)) return;
      if (!data?.class_name && !(cache.getQueryData(key) || []).some(row => row.id === (event.id || data?.id))) {
        cache.invalidateQueries({ queryKey: key }); return;
      }
      eventVersion.current++;
      cache.setQueryData(key, rows => mergeNativeLaunch(rows, event));
    });
  }, [enabled, identity?.className, identity?.schoolYear, cache]);
  const candidate = enabled ? chooseNativeLaunch(query.data, identity, ended.current) : null;
  const candidateRef = useRef(candidate); candidateRef.current = candidate;
  useEffect(() => {
    if (active || entering.current || !candidate || !enabled) return undefined;
    let alive = true, timer;
    entering.current = true;
    (async () => {
      try {
        if (identity.beforeEnter && await identity.beforeEnter() === false) throw new Error("Finishing your current writing before joining the live notebook. Retrying automatically.");
        if (alive && candidateRef.current?.session_id === candidate.session_id) {
          setActive({ launch: candidate, identity }); setError("");
        }
      } catch (reason) { if (alive) { setError(reason.message); timer = setTimeout(() => setRetry(n => n + 1), 3000); } }
      finally { entering.current = false; }
    })();
    return () => { alive = false; clearTimeout(timer); entering.current = false; };
  }, [active, candidate?.id, identity?.enabled, query.dataUpdatedAt, retry]);
  const terminalExit = useCallback(terminal => {
    if (terminal && active) ended.current.add(`${active.launch.variant}:${active.launch.session_id}`);
    setActive(null);
  }, [active]);
  if (!active) return error ? <div role="status" style={{ position: "fixed", bottom: 8, left: 8, zIndex: 10000, background: "#fff2cb", padding: 8 }}>{error}</div> : null;
  const stillSelected = enabled && identity.className === active.identity.className && identity.number === active.identity.number
    && (query.data || []).some(row => row.session_id === active.launch.session_id && row.variant === active.launch.variant && matchesNativeLaunch(row, identity));
  return <Session key={`${active.launch.variant}:${active.launch.session_id}`} launch={active.launch} identity={active.identity}
    leaving={!stillSelected} onExit={terminalExit} />;
}
