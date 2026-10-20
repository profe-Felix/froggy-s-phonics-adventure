// Isolated native teacher workspace (variant 2 / 3). Controls only the native live room, never legacy LiveLesson entities.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Copy, RotateCcw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { NATIVE_CLASSES } from "@/lib/notebook2/model.mjs";
import { usePageBackground } from "@/lib/notebook2/pageBackground";
import { nativeImage } from "@/lib/notebook2/assets";
import { publishNativeLaunch, endNativeLaunch } from "@/lib/notebook2/announcements";
import { ACTIVE_SCHOOL_YEAR } from "@/lib/schoolYear";
import PrepareImages, { useNativeAsset, preparedCount } from "@/components/notebook2/PrepareImages";
import NativeThumbnail, { ThumbOverlay } from "@/components/notebook2/NativeThumbnail";
import { NB2_CSS, Pill, Notice, IsolationNotice, Catalog, useNotebookAssignments, resolveAssignment, useNativeLive } from "@/components/notebook2/shared";

const errText = e => e?.message || String(e || "Unknown error");

// Newest-first records; keep the first record per seat 1..30.
export function dedupRoster(records) {
  const seen = new Map();
  const rows = Array.isArray(records) ? records : records?.items;
  if (!Array.isArray(rows)) throw new Error("The class roster returned an unexpected response.");
  for (const r of rows) {
    const n = Number(r?.student_number);
    if (Number.isInteger(n) && n >= 1 && n <= 30 && !seen.has(n)) seen.set(n, r);
  }
  // Whole class includes late arrivals even if their profile did not exist at Start.
  return Array.from({ length: 30 }, (_, i) => seen.get(i + 1) || { student_number: i + 1, name: "", photo_url: "" });
}

function useRoster(className) {
  return useQuery({
    queryKey: ["nb-native-roster", className, ACTIVE_SCHOOL_YEAR],
    queryFn: () => base44.entities.Student.filter({ class_name: className, school_year: ACTIVE_SCHOOL_YEAR }, "-updated_date", 500),
    select: dedupRoster,
  });
}

function Workspace({ assignment, className, variant, schoolYear, embedded, initialPage = 1 }) {
  const { asset, setAsset, loading: assetLoading, error: assetError } = useNativeAsset(assignment, variant);
  const scope = useMemo(() => ({ className, assignmentId: assignment.id, schoolYear, variant }), [className, assignment.id, variant, schoolYear]);
  const live = useNativeLive(scope, "teacher");
  const roster = useRoster(className);
  const seats = useMemo(() => roster.data || [], [roster.data]);
  const byNumber = useMemo(() => new Map(seats.map(s => [Number(s.student_number), s])), [seats]);
  const count = assignment.pdf_page_count;
  const [page, setPage] = useState(() => Number.isInteger(initialPage) && initialPage >= 1 && initialPage <= count ? initialPage : 1);
  const [whole, setWhole] = useState(true);
  const [checked, setChecked] = useState([]);
  const [following, setFollowing] = useState(true);
  const [canWrite, setCanWrite] = useState(true);
  const [density, setDensity] = useState(5);
  const [open, setOpen] = useState(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState("");
  const [controlError, setControlError] = useState("");
  const [announce, setAnnounce] = useState({ state: "idle", error: "", sessionId: null });
  const [endState, setEndState] = useState(null); // { sessionId, control: ok|err, announce: ok|err, errors[] }
  const L = live.live, running = !!L && L.active && !L.ended;
  const restoredId = useRef(null);
  useEffect(() => {
    if (!L?.active || L.ended || restoredId.current === L.id) return;
    restoredId.current = L.id;
    setPage(L.page); setFollowing(L.follow !== false); setCanWrite(L.canWrite !== false);
    setWhole(seats.length > 0 && L.students?.length === seats.length && seats.every(s => L.students.includes(s.student_number)));
    setChecked(L.students || []);
    setAnnounce(a => a.sessionId === L.id ? a : { state: "unknown", error: "", sessionId: L.id });
  }, [L]);

  const allNumbers = useMemo(() => seats.map(s => Number(s.student_number)), [seats]);
  const students = whole ? allNumbers : checked.filter(n => byNumber.has(n));
  const ready = preparedCount(asset, count);
  const bg = usePageBackground(asset, page, variant);
  const shownPage = running ? L.page : page;
  const liveBg = usePageBackground(asset, shownPage, variant);
  const canNative = !!bg.image;
  const shown = running ? (L.students || []) : students;

  const base = patch => ({ id: running ? L.id : crypto.randomUUID(), page: running ? L.page : page, follow: following, following, canWrite, students, engine: "native", variant, ...patch });
  const doControl = async (label, patch) => {
    setBusy(label); setControlError("");
    try {
      const body = base(patch);
      if (!nativeImage(asset, body.page) && !body.ended) throw new Error(`Prepare page ${body.page} in notebook setup before sending students there.`);
      return await live.control(body);
    }
    catch (e) { setControlError(`${label} failed: ${errText(e)}`); return null; }
    finally { setBusy(""); }
  };
  const publish = async (sessionId, list, p, control) => {
    if (embedded) return; // Parent LiveLesson already admits its own targeted students.
    setAnnounce({ state: "pending", error: "", sessionId });
    try {
      await publishNativeLaunch({ className, assignmentId: assignment.id, sessionId, students: list, variant, page: p, control, schoolYear });
      setAnnounce({ state: "ok", error: "", sessionId });
    } catch (e) { setAnnounce({ state: "error", error: errText(e), sessionId }); }
  };
  const start = async () => {
    setEndState(null);
    const ok = await doControl("Start", {});
    // Announce only once the actor has echoed the active session.
    if (ok && ok.active !== false && !ok.ended) await publish(ok.id, ok.students || students, ok.page || page, ok);
  };
  const update = async (label, patch) => {
    if (!running) return;
    const ok = await doControl(label, patch);
    if (!ok) { setFollowing(L.follow !== false); setCanWrite(L.canWrite !== false); }
    if (ok) await publish(ok.id, ok.students || patch.students || students, ok.page || page, ok);
  };
  const end = async (retryOnly) => {
    const sessionId = running ? L.id : endState?.sessionId;
    if (!sessionId) return;
    setBusy("End"); setControlError("");
    const needControl = !retryOnly || endState?.control !== "ok";
    const needAnnounce = !retryOnly || endState?.announce !== "ok";
    const [c, a] = await Promise.allSettled([
      needControl ? live.control({ ...base({}), id: sessionId, ended: true, active: false }) : Promise.resolve(),
      needAnnounce ? endNativeLaunch(className, sessionId, variant, schoolYear) : Promise.resolve(),
    ]);
    const errors = [c.status === "rejected" && `Live room: ${errText(c.reason)}`, a.status === "rejected" && `Announcement: ${errText(a.reason)}`].filter(Boolean);
    setEndState({ sessionId, control: c.status === "fulfilled" ? "ok" : "err", announce: a.status === "fulfilled" ? "ok" : "err", errors });
    setBusy("");
  };
  const goPage = n => {
    if (n < 1 || n > count) return;
    setPage(n);
    if (running && following) update("Page", { page: n });
  };
  const studentLink = `${window.location.origin}/DigitalNotebook${variant}?${new URLSearchParams({ class: className, assignment: assignment.id, year: schoolYear })}`;
  const actorConfirmed = running && live.connected;

  return (<>
    <div className="nb2-card">
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="nb2-btn" disabled={page <= 1 || !!busy} onClick={() => goPage(page - 1)} aria-label="Previous page" data-testid="button-page-prev"><ChevronLeft size={18} /></button>
        <input type="number" min={1} max={count} value={page} style={{ width: 64 }} aria-label="Page" disabled={!!busy}
          onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n)) goPage(n); }} data-testid="input-page" />
        <button type="button" className="nb2-btn" disabled={page >= count || !!busy} onClick={() => goPage(page + 1)} aria-label="Next page" data-testid="button-page-next"><ChevronRight size={18} /></button>
        <span style={{ fontSize: 13 }}>of {count}</span>
        {!canNative && !bg.loading && <Pill tone="warn" data-testid="text-page-not-prepared">Page {page} image not prepared ({ready}/{count})</Pill>}
        {running && (!following || page !== L.page) && <button type="button" className="nb2-btn" disabled={!canNative || !!busy} onClick={() => update("Send page", { page, pageCommand: crypto.randomUUID() })} data-testid="button-send-page">Send page {page}</button>}
        <span style={{ flex: 1 }} />
        <button type="button" className="nb2-btn" aria-pressed={following} disabled={!!busy}
          onClick={() => { const v = !following; setFollowing(v); if (running) update("Follow", { follow: v, following: v, ...(v ? { page } : {}) }); }} data-testid="button-follow">Follow me {following ? "on" : "off"}</button>
        <button type="button" className="nb2-btn" aria-pressed={canWrite} disabled={!!busy}
          onClick={() => { const v = !canWrite; setCanWrite(v); if (running) update(v ? "Unlock" : "Lock", { canWrite: v }); }} data-testid="button-can-write">{canWrite ? "Can write" : "Locked"}</button>
      </div>

      <div style={{ display: "flex", gap: 6, margin: "8px 0", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="nb2-btn" aria-pressed={whole} onClick={() => setWhole(true)} data-testid="button-whole-class">Whole class ({allNumbers.length})</button>
        <button type="button" className="nb2-btn" aria-pressed={!whole} onClick={() => setWhole(false)} data-testid="button-checked">Checked students ({checked.length})</button>
        {running && <button type="button" className="nb2-btn" disabled={!students.length || !!busy || !actorConfirmed}
          onClick={() => update("Update group", { students })} data-testid="button-update-group">Update group</button>}
      </div>
      {!whole && (roster.isLoading ? <div className="nb2-skel" style={{ height: 60 }} />
        : roster.error ? <Notice tone="bad">Roster could not load. <button type="button" className="nb2-btn" onClick={() => roster.refetch()} data-testid="button-retry-roster">Try again</button></Notice>
        : !seats.length ? <Notice tone="warn">No students enrolled in {className} for {ACTIVE_SCHOOL_YEAR}.</Notice>
        : <div className="nb2-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(92px,1fr))" }}>
          {seats.map(s => { const n = Number(s.student_number); const on = checked.includes(n); return (
            <button key={n} type="button" className="nb2-seat" aria-pressed={on} data-testid={`button-seat-${n}`}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: 4, textAlign: "left" }}
              onClick={() => setChecked(c => on ? c.filter(x => x !== n) : [...c, n].sort((a, b) => a - b))}>
              {s.photo_url ? <img src={s.photo_url} alt="" style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover" }} />
                : <span style={{ width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", background: "hsl(200 30% 90%)", fontSize: 11 }}>{n}</span>}
              <span style={{ fontSize: 12, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis" }}>#{n} {s.name || ""}</span>
              <span aria-label={live.online?.includes(n) ? "In this notebook" : "Not connected to this notebook"}
                style={{ fontSize: 10, color: live.online?.includes(n) ? "#168449" : "#657985" }}>{live.online?.includes(n) ? "Live" : "—"}</span>
            </button>); })}
        </div>)}

      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
        {running ? <button type="button" className="nb2-btn" data-kind="danger" disabled={!!busy} onClick={() => end(false)} data-testid="button-end">{busy === "End" ? "Ending" : "End lesson"}</button>
          : <button type="button" className="nb2-btn" data-kind="primary" disabled={!students.length || !canNative || !live.connected || !!busy}
            onClick={start} data-testid="button-start">{busy === "Start" ? "Starting" : "Start lesson"}</button>}
        <Pill tone={live.connected ? "ok" : "warn"} data-testid="status-live-connection">{live.connected ? "Live room connected" : "Connecting live room"}</Pill>
        {!live.connected && <button type="button" className="nb2-btn" onClick={() => live.retry()} data-testid="button-retry-live"><RotateCcw size={14} />Reconnect</button>}
        {running && <Pill tone="v2" data-testid="status-live">Live · page {L.page} · {(L.students || []).length} students · {L.follow === false ? "free" : "following"} · {L.canWrite === false ? "locked" : "writing"}</Pill>}
        {running && announce.state === "pending" && <Pill data-testid="status-announce">Announcing to class</Pill>}
        {running && announce.state === "ok" && <Pill tone="ok" data-testid="status-announce">Class admitted</Pill>}
        {running && (announce.state === "error" || announce.state === "unknown") && actorConfirmed &&
          <button type="button" className="nb2-btn" onClick={() => publish(L.id, L.students || [], L.page)} data-testid="button-retry-announce">
            <RotateCcw size={14} />{announce.state === "error" ? "Retry announcement" : "Re-announce"}</button>}
        {!running && L?.ended && !endState?.errors?.length && <Pill tone="warn" data-testid="status-ended">Last session ended</Pill>}
      </div>
      {busy && busy !== "Start" && busy !== "End" && <p style={{ fontSize: 12, opacity: .7, margin: "6px 0 0" }} data-testid="status-busy">{busy}: waiting for live room</p>}
      {controlError && <Notice tone="bad" data-testid="text-control-error">{controlError}</Notice>}
      {running && announce.state === "error" && <Notice tone="warn" data-testid="text-announce-error">Students were not admitted: {announce.error}</Notice>}
      {endState?.errors?.length > 0 && <Notice tone="bad" data-testid="text-end-error">End incomplete. {endState.errors.join(" · ")}{" "}
        <button type="button" className="nb2-btn" disabled={!!busy} onClick={() => end(true)} data-testid="button-retry-end">Retry end</button></Notice>}
      {live.error && <Notice tone="warn">{live.error}</Notice>}
    </div>

    <div className="nb2-card">
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Student work · page {shownPage}</h2>
        <span style={{ flex: 1 }} />
        <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>Per row <input type="range" min={2} max={8} value={density} onChange={e => setDensity(Number(e.target.value))} data-testid="input-density" /> {density}</label>
      </div>
      {liveBg.loading ? <div className="nb2-skel" style={{ height: 160 }} />
        : liveBg.error ? <Notice tone="bad">Page image failed: {errText(liveBg.error)}</Notice>
        : !liveBg.image ? <Notice tone="warn">Prepare page {shownPage} images to see student work.</Notice>
        : !shown.length ? <Notice>No students selected.</Notice>
        : <div className="nb2-grid" style={{ gridTemplateColumns: `repeat(${density},minmax(0,1fr))` }}>
          {shown.map((n, i) => <NativeThumbnail key={`${n}-${shownPage}`} delay={i * 100} assignment={assignment} image={liveBg.image} variant={variant} schoolYear={schoolYear}
            student={byNumber.get(n) || { student_number: n }} number={n} className={className} page={shownPage} onOpen={setOpen} />)}
        </div>}
      {open && liveBg.image && <ThumbOverlay key={`${open.number}:${shownPage}`} open={open} assignment={assignment} className={className} variant={variant} schoolYear={schoolYear}
        page={shownPage} image={liveBg.image} onClose={() => setOpen(null)} />}
    </div>

    <div className="nb2-card">
      <button type="button" className="nb2-btn" aria-expanded={setupOpen} onClick={() => setSetupOpen(v => !v)} data-testid="button-toggle-setup">
        {setupOpen ? "Hide" : "Show"} notebook setup ({ready}/{count} {variant === 3 ? "PDF pages" : "images"} ready)</button>
      {setupOpen && <div style={{ marginTop: 8 }}>
        {assetLoading ? <div className="nb2-skel" style={{ height: 40 }} /> : assetError ? <Notice tone="bad">{assetError}</Notice>
          : <PrepareImages assignment={assignment} asset={asset} setAsset={setAsset} variant={variant} page={page} />}
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
          <code style={{ fontSize: 12, wordBreak: "break-all" }} data-testid="text-student-link">{studentLink}</code>
          <button type="button" className="nb2-btn" onClick={async () => { try { await navigator.clipboard.writeText(studentLink); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* manual copy */ } }} data-testid="button-copy-link"><Copy size={16} />{copied ? "Copied" : "Copy student link"}</button>
        </div>
      </div>}
    </div>
  </>);
}

export default function LiveLesson2({ variant = 2 }) {
  const [params, setParams] = useSearchParams();
  const className = NATIVE_CLASSES.includes(params.get("class")) ? params.get("class") : "Felix";
  const schoolYear = /^\d{2}-\d{2}$/.test(params.get("year") || "") ? params.get("year") : ACTIVE_SCHOOL_YEAR;
  const { data: records, isLoading, error, refetch } = useNotebookAssignments();
  const assignment = useMemo(() => resolveAssignment(records, params.get("assignment")), [records, params]);
  const set = patch => { const n = new URLSearchParams(params); Object.entries(patch).forEach(([k, v]) => v == null ? n.delete(k) : n.set(k, v)); setParams(n); };
  return (
    <div className="nb2"><style>{NB2_CSS}</style>
      <div className="nb2-bar">
        <span className="nb2-title">Live Lesson <Pill tone="v2">Notebook {variant}</Pill></span>
        <select value={className} onChange={e => set({ class: e.target.value, assignment: null })} aria-label="Class" data-testid="select-class">
          {NATIVE_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}</select>
        {assignment && <><Pill>{assignment.title}</Pill><button type="button" className="nb2-btn" onClick={() => set({ assignment: null })} data-testid="button-change-assignment">Change notebook</button></>}
      </div>
      <IsolationNotice variant={variant} />
      {schoolYear !== ACTIVE_SCHOOL_YEAR && <Notice tone="warn">Separate school-year workspace: {schoolYear}. Live entry and writing do not use the current school year.</Notice>}
      {isLoading ? <div className="nb2-skel" style={{ height: 200 }} />
        : error ? <Notice tone="bad">Notebooks could not load. <button type="button" className="nb2-btn" onClick={() => refetch()} data-testid="button-retry-list">Try again</button></Notice>
        : !assignment ? <div className="nb2-card"><Catalog records={records} className={className} selectedId={null} onPick={id => set({ assignment: id })} /></div>
        : <Workspace key={`${variant}:${className}:${assignment.id}:${schoolYear}`} assignment={assignment} className={className} variant={variant} schoolYear={schoolYear} embedded={params.get("embedded") === "1"} initialPage={Number(params.get("page")) || 1} />}
    </div>
  );
}

export function LiveLesson3() { return <LiveLesson2 variant={3} />; }
