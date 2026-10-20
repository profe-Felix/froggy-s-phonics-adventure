// Isolated V2 teacher workspace. Controls only the V2 live room, never legacy LiveLesson entities.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { NATIVE_CLASSES } from "@/lib/notebook2/model.mjs";
import { nativeImage } from "@/lib/notebook2/assets";
import { ACTIVE_SCHOOL_YEAR } from "@/lib/schoolYear";
import PrepareImages, { useNativeAsset, preparedCount } from "@/components/notebook2/PrepareImages";
import NativeThumbnail, { ThumbOverlay } from "@/components/notebook2/NativeThumbnail";
import { NB2_CSS, Pill, Notice, IsolationNotice, Catalog, useNotebookAssignments, resolveAssignment, useNativeLive, currentNotebookUrl } from "@/components/notebook2/shared";

const SEATS = Array.from({ length: 30 }, (_, i) => i + 1);

function Workspace({ assignment, className, initialPage = 1 }) {
  const { asset, setAsset, loading: assetLoading, error: assetError } = useNativeAsset(assignment);
  const live = useNativeLive({ className, assignmentId: assignment.id, schoolYear: ACTIVE_SCHOOL_YEAR }, "teacher");
  const count = assignment.pdf_page_count;
  const [page, setPage] = useState(() => Number.isInteger(initialPage) && initialPage >= 1 && initialPage <= count ? initialPage : 1);
  const [whole, setWhole] = useState(true);
  const [checked, setChecked] = useState([]);
  const [engine, setEngine] = useState("native");
  const [viewing, setViewing] = useState(false);
  const [density, setDensity] = useState(5);
  const [open, setOpen] = useState(null);
  const [preview, setPreview] = useState(1);
  const [copied, setCopied] = useState(false);
  const L = live.live, running = !!L && L.active && !L.ended;
  const restoredId = useRef(null);
  useEffect(() => {
    if (!L?.active || restoredId.current === L.id) return;
    restoredId.current = L.id;
    setPage(L.page); setEngine(L.engine);
    setWhole(L.students.length === 30); setChecked(L.students);
  }, [L]);
  const students = whole ? SEATS : checked;
  const ready = preparedCount(asset, count), pageImage = nativeImage(asset, page);
  const canNative = !!pageImage;

  const control = (patch = {}) => {
    const body = { id: running ? L.id : crypto.randomUUID(), page, follow: true, students, engine, ...patch };
    live.send({ type: "control", control: body });
  };
  const studentLink = `${window.location.origin}/DigitalNotebook2?${new URLSearchParams({ class: className, assignment: assignment.id })}`;
  const shown = running ? L.students : students;

  return (<>
    <div className="nb2-card"><h2>1 · Images for version 2</h2>
      {assetLoading ? <div className="nb2-skel" style={{ height: 40 }} /> : assetError ? <Notice tone="bad">{assetError}</Notice>
        : <PrepareImages assignment={assignment} asset={asset} setAsset={setAsset} />}
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        <code style={{ fontSize: 12, wordBreak: "break-all" }} data-testid="text-student-link">{studentLink}</code>
        <button type="button" className="nb2-btn" onClick={async () => { try { await navigator.clipboard.writeText(studentLink); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* manual copy */ } }} data-testid="button-copy-link"><Copy size={16} />{copied ? "Copied" : "Copy student link"}</button>
      </div>
    </div>

    <div className="nb2-card"><h2>2 · Lesson</h2>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="nb2-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)} aria-label="Previous page" data-testid="button-page-prev"><ChevronLeft size={18} /></button>
        <input type="number" min={1} max={count} value={page} style={{ width: 70 }} aria-label="Page"
          onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= count) setPage(n); }} data-testid="input-page" />
        <button type="button" className="nb2-btn" disabled={page >= count} onClick={() => setPage(p => p + 1)} aria-label="Next page" data-testid="button-page-next"><ChevronRight size={18} /></button>
        <span style={{ fontSize: 13 }}>of {count}</span>
        {!canNative && <Pill tone="warn" data-testid="text-page-not-prepared">Page {page} image not prepared ({ready}/{count})</Pill>}
        {running && <button type="button" className="nb2-btn" disabled={engine === "native" && !canNative} onClick={() => control()} data-testid="button-send-page">Send page {page}</button>}
      </div>
      <div style={{ display: "flex", gap: 6, margin: "8px 0", flexWrap: "wrap" }}>
        <button type="button" className="nb2-btn" aria-pressed={whole} onClick={() => setWhole(true)} data-testid="button-whole-class">Whole class (30)</button>
        <button type="button" className="nb2-btn" aria-pressed={!whole} onClick={() => setWhole(false)} data-testid="button-checked">Checked students ({checked.length})</button>
      </div>
      {!whole && <div className="nb2-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(44px,1fr))" }}>
        {SEATS.map(n => <button key={n} type="button" className="nb2-seat" aria-pressed={checked.includes(n)} data-testid={`button-seat-${n}`}
          onClick={() => setChecked(c => c.includes(n) ? c.filter(x => x !== n) : [...c, n].sort((a, b) => a - b))}>{n}</button>)}
      </div>}
      <h2 style={{ marginTop: 10 }}>Notebook step</h2>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[["current", "Current (Replit-assisted)"], ["native", "DigitalNotebook2 (Base44-only)"]].map(([id, label]) => (
          <button key={id} type="button" className="nb2-btn" aria-pressed={engine === id} data-testid={`button-engine-${id}`}
            disabled={id === "native" && !canNative && running}
            onClick={() => { setEngine(id); if (running) control({ engine: id }); }}>{label}</button>))}
      </div>
      <p style={{ fontSize: 12, opacity: .75, margin: "6px 0" }}>Version 2 controls only move the version 2 notebook. During the Current step, follow-the-teacher stays on the regular teacher controls; this page cannot move the regular notebook.</p>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {running ? <button type="button" className="nb2-btn" data-kind="danger" onClick={() => control({ ended: true })} data-testid="button-end">End live test</button>
          : <button type="button" className="nb2-btn" data-kind="primary" disabled={!students.length || (engine === "native" && !canNative) || !live.connected}
            onClick={() => control()} data-testid="button-start">Start live test</button>}
        <Pill tone={live.connected ? "ok" : "warn"} data-testid="status-live-connection">{live.connected ? "Live room connected" : "Connecting live room"}</Pill>
        {running && <Pill tone={L.engine === "native" ? "v2" : "cur"} data-testid="status-live">Live · page {L.page} · {L.engine === "native" ? "Version 2" : "Current"} · {L.students.length} students</Pill>}
        {L?.ended && <Pill tone="warn" data-testid="status-ended">Last session ended</Pill>}
      </div>
      {live.error && <Notice tone="warn">{live.error}</Notice>}
    </div>

    {engine === "current" && <div className="nb2-card"><h2>Current notebook preview</h2>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
        <label style={{ fontSize: 13 }}>Student <select value={preview} onChange={e => setPreview(Number(e.target.value))} data-testid="select-preview-student">{SEATS.map(n => <option key={n} value={n}>{n}</option>)}</select></label>
        <Link className="nb2-btn" to={`/NotebookDashboardPreview?${new URLSearchParams({ class: className, assignment: assignment.id, page: String(page) })}`} target="_blank" data-testid="link-current-dashboard">Open current teacher dashboard</Link>
      </div>
      <iframe title="Current notebook" src={currentNotebookUrl({ className, number: preview, assignmentId: assignment.id, page })} style={{ width: "100%", height: "70dvh", border: 0, borderRadius: 12 }} data-testid="iframe-current" />
    </div>}

    <div className="nb2-card"><h2>3 · Version 2 student work · page {running ? L.page : page}</h2>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <button type="button" className="nb2-btn" aria-pressed={viewing} disabled={!nativeImage(asset, running ? L.page : page)} onClick={() => setViewing(v => !v)} data-testid="button-view-work">{viewing ? "Hide work" : "View work"}</button>
        <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>Per row <input type="range" min={2} max={8} value={density} onChange={e => setDensity(Number(e.target.value))} data-testid="input-density" /> {density}</label>
      </div>
      {viewing && (() => { const p = running ? L.page : page, img = nativeImage(asset, p); return img && (
        <div className="nb2-grid" style={{ gridTemplateColumns: `repeat(${density},minmax(0,1fr))` }}>
          {shown.map((n, i) => <NativeThumbnail key={`${n}-${p}`} delay={i * 100} assignment={assignment} image={img} className={className} number={n} page={p} onOpen={setOpen} />)}
        </div>); })()}
      {open && <ThumbOverlay key={`${open.number}:${running ? L.page : page}`} open={open} assignment={assignment} className={className} page={running ? L.page : page} imageUrl={nativeImage(asset, running ? L.page : page)?.url} onClose={() => setOpen(null)} />}
    </div>
  </>);
}

export default function LiveLesson2() {
  const [params, setParams] = useSearchParams();
  const className = NATIVE_CLASSES.includes(params.get("class")) ? params.get("class") : "Felix";
  const { data: records, isLoading, error, refetch } = useNotebookAssignments();
  const assignment = useMemo(() => resolveAssignment(records, params.get("assignment")), [records, params]);
  const set = patch => { const n = new URLSearchParams(params); Object.entries(patch).forEach(([k, v]) => v == null ? n.delete(k) : n.set(k, v)); setParams(n); };
  return (
    <div className="nb2"><style>{NB2_CSS}</style>
      <div className="nb2-bar">
        <span className="nb2-title">Live Lesson <Pill tone="v2">Version 2 test</Pill></span>
        <select value={className} onChange={e => set({ class: e.target.value, assignment: null })} aria-label="Class" data-testid="select-class">
          {NATIVE_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}</select>
        {assignment && <><Pill>{assignment.title}</Pill><button type="button" className="nb2-btn" onClick={() => set({ assignment: null })} data-testid="button-change-assignment">Change notebook</button></>}
      </div>
      <IsolationNotice />
      {isLoading ? <div className="nb2-skel" style={{ height: 200 }} />
        : error ? <Notice tone="bad">Notebooks could not load. <button type="button" className="nb2-btn" onClick={() => refetch()} data-testid="button-retry-list">Try again</button></Notice>
        : !assignment ? <div className="nb2-card"><Catalog records={records} className={className} selectedId={null} onPick={id => set({ assignment: id })} /></div>
        : <Workspace key={`${className}:${assignment.id}`} assignment={assignment} className={className} initialPage={Number(params.get("page")) || 1} />}
    </div>
  );
}
