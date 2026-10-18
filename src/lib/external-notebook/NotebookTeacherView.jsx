// Teacher monitoring view: read-only thumbnails, on-demand scrub, enlarged replay.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { buildReplayTimeline, inkPath, replayFrame } from "./ink-model";
import "./teacher-view.css";

const W = 1000;
const fmt = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

function Stroke({ s, h }) {
  const id = `nbt-m-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const cuts = s.erasures || [];
  return (
    <g>
      {!!cuts.length && <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={h} style={{ maskType: "luminance" }}>
          <rect width={W} height={h} fill="white" />
          {cuts.map(c => <path key={c.id} d={inkPath(c.points, h, false)} fill="none" stroke="black"
            strokeWidth={c.width * W} strokeLinecap="round" strokeLinejoin="round" />)}
        </mask>
      </defs>}
      <path d={inkPath(s.points, h)} mask={cuts.length ? `url(#${id})` : undefined} fill="none" stroke={s.color}
        strokeWidth={s.width * W} strokeLinecap="round" strokeLinejoin="round"
        opacity={s.tool === "highlighter" ? 0.38 : 1}
        style={s.tool === "highlighter" ? { mixBlendMode: "multiply" } : undefined} />
    </g>
  );
}

// Image and ink share ONE coordinate space (x in 0..1000, y scaled by page ratio),
// so the page artwork and normalized strokes stay proportionally aligned.
function PageInk({ workbook, imageUrl, strokes, label }) {
  const h = W * (workbook.height || 1294) / (workbook.width || 1000);
  return (
    <svg className="nbt-svg" viewBox={`0 0 ${W} ${h}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      {imageUrl && <image href={imageUrl} x={0} y={0} width={W} height={h} preserveAspectRatio="none" />}
      {strokes?.map(s => <Stroke key={s.id} s={s} h={h} />)}
    </svg>
  );
}

function useHistory(onLoad, studentNumber, armed, revision) {
  const [st, setSt] = useState({ events: null, loading: false, error: "" });
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(onLoad); loadRef.current = onLoad;
  useEffect(() => {
    if (!armed) return;
    let live = true;
    setSt(p => ({ ...p, loading: true, error: "" }));
    loadRef.current(studentNumber).then(
      events => { if (live) setSt({ events, loading: false, error: "" }); },
      error => { if (live) setSt(p => ({ ...p, loading: false, error: error?.message || "History failed to load." })); });
    return () => { live = false; };
  }, [armed, studentNumber, revision, nonce]);
  const timeline = useMemo(() => st.events ? buildReplayTimeline(st.events) : [], [st.events]);
  return { ...st, timeline, total: timeline.at(-1)?.end ?? 0, retry: () => setNonce(n => n + 1) };
}

function Tile({ workbook, imageUrl, notebook, online, hot, onLoadHistory, onOpen, page }) {
  const n = notebook.studentNumber;
  const [armed, setArmed] = useState(false);
  const [time, setTime] = useState(null);
  const hist = useHistory(onLoadHistory, n, armed, notebook.revision);
  useEffect(() => { setArmed(false); setTime(null); }, [page]);
  const frame = useMemo(() => time !== null && hist.timeline.length ? replayFrame(hist.timeline, time) : null, [hist.timeline, time]);
  const scrubbing = time !== null;
  return (
    <div className="nbt-tile" data-scrub={scrubbing ? "1" : "0"}>
      <button type="button" className="nbt-face" onClick={() => onOpen(n)} aria-label={`Open notebook ${n}`}>
        <PageInk workbook={workbook} imageUrl={imageUrl} strokes={frame ? frame.strokes : notebook.strokes} label={`Notebook ${n}`} />
        <span className="nbt-num">{n}</span>
        {scrubbing ? <span className="nbt-tag">Replay</span> : online ? <span className="nbt-dot" data-hot={hot ? "1" : "0"} title="Online" /> : null}
      </button>
      <div className="nbt-scrub">
        <input type="range" min={0} max={Math.max(1, hist.total)} step={10}
          value={scrubbing ? time : Math.max(1, hist.total)}
          onPointerDown={() => setArmed(true)} onFocus={() => setArmed(true)}
          onChange={e => { if (hist.timeline.length) setTime(Number(e.target.value)); }}
          aria-label={`Scrub saved history for notebook ${n}`} />
        <button type="button" className="nbt-mini" data-on={scrubbing ? "1" : "0"} disabled={!scrubbing}
          onClick={() => setTime(null)}>Live</button>
      </div>
      <div className={`nbt-note${hist.error ? " err" : ""}`}>
        {hist.error ? <>History unavailable. <button type="button" className="nbt-mini" onClick={hist.retry}>Retry</button></>
          : hist.loading ? "Loading history" : scrubbing ? `${fmt(time)} / ${fmt(hist.total)}`
          : notebook.revision === 0 ? "No writing yet" : ""}
      </div>
    </div>
  );
}

function Replay({ workbook, imageUrl, notebook, onLoadHistory, onClose }) {
  const n = notebook.studentNumber;
  const hist = useHistory(onLoadHistory, n, true, notebook.revision);
  const [time, setTime] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const t = time ?? hist.total;
  useEffect(() => {
    if (!playing) return;
    let raf, last = performance.now();
    const tick = now => {
      const dt = (now - last) * speed; last = now;
      setTime(prev => {
        const next = (prev ?? 0) + dt;
        if (next >= hist.total) { setPlaying(false); return hist.total; }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, hist.total]);
  useEffect(() => {
    const key = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const frame = useMemo(() => hist.timeline.length && time !== null ? replayFrame(hist.timeline, time) : null, [hist.timeline, time]);
  const play = () => { if (t >= hist.total) setTime(0); setPlaying(p => !p); };
  return (
    <div className="nbt-modal" role="dialog" aria-modal="true" aria-label={`Notebook ${n}`} onClick={onClose}>
      <div className="nbt-sheet" onClick={e => e.stopPropagation()}>
        <div className="nbt-sheet-head">
          <h3>Notebook {n}</h3>
          <button type="button" className="nbt-btn" onClick={onClose}>Close</button>
        </div>
        <div className="nbt-stage">
          <PageInk workbook={workbook} imageUrl={imageUrl} strokes={frame ? frame.strokes : notebook.strokes} label={`Notebook ${n} enlarged`} />
        </div>
        {hist.error ? (
          <div className="nbt-alert">Saved handwriting could not load: {hist.error}
            <button type="button" className="nbt-btn" onClick={hist.retry}>Retry</button></div>
        ) : (
          <div className="nbt-transport">
            <button type="button" className="nbt-btn primary" disabled={!hist.timeline.length} onClick={play}>
              {playing ? "Pause" : "Play"}</button>
            <input type="range" min={0} max={Math.max(1, hist.total)} step={10} value={Math.min(t, Math.max(1, hist.total))}
              disabled={!hist.timeline.length} aria-label="Replay position"
              onChange={e => { setPlaying(false); setTime(Number(e.target.value)); }} />
            <span>{hist.loading ? "Loading" : `${fmt(t)} / ${fmt(hist.total)}`}</span>
            <select className="nbt-btn" value={speed} onChange={e => setSpeed(Number(e.target.value))} aria-label="Speed">
              {[1, 2, 4, 8].map(s => <option key={s} value={s}>{s}x</option>)}
            </select>
            <button type="button" className="nbt-btn" disabled={time === null} onClick={() => { setPlaying(false); setTime(null); }}>Live</button>
          </div>
        )}
        {!hist.loading && !hist.error && !hist.timeline.length && <div className="nbt-note">No saved handwriting on this page yet.</div>}
      </div>
    </div>
  );
}

const STATUS = { live: "Live", connecting: "Connecting", reconnecting: "Reconnecting", offline: "Offline", expired: "Authorization expired" };

export function NotebookTeacherView({ state, onSetPage, onRefresh, onRetryImage, onRetryConnection, onLoadHistory }) {
  const [cols, setCols] = useState(5);
  const [open, setOpen] = useState(null);
  const { workbook, overview, image, classroom } = state;
  const ar = `${workbook.width || 1000} / ${workbook.height || 1294}`;
  const targets = classroom?.targetStudentNumbers?.length ? new Set(classroom.targetStudentNumbers) : null;
  const notebooks = (overview.notebooks || []).filter(nb => !targets || targets.has(nb.studentNumber));
  const openNb = open && notebooks.find(nb => nb.studentNumber === open);
  const online = Object.values(state.presence).filter(c => c > 0).length;
  const now = Date.now();
  return (
    <div className="nbt" style={{ "--nbt-cols": cols, "--nbt-ar": ar }}>
      <div className="nbt-bar">
        <div className="nbt-title">{workbook.title || "Class notebooks"}
          <small>{classroom?.name ? `${classroom.name} · ` : ""}{online} online{overview.generatedAt ? ` · updated ${new Date(overview.generatedAt).toLocaleTimeString()}` : ""}</small></div>
        <span className="nbt-pill" data-s={state.connection}><i />{STATUS[state.connection] || state.connection}</span>
        <label className="nbt-ctl">Page
          <select value={state.page} onChange={e => onSetPage(Number(e.target.value))}>
            {state.pages.map(p => <option key={p} value={p}>{p}{p === classroom?.currentPage ? " (class)" : ""}</option>)}
          </select></label>
        <label className="nbt-ctl">Columns
          <input type="range" min={2} max={8} value={cols} onChange={e => setCols(Number(e.target.value))} aria-label="Columns" />
          <span>{cols}</span></label>
        <button type="button" className="nbt-btn" onClick={onRefresh} disabled={overview.loading}>Refresh</button>
      </div>
      {(state.connection === "offline" || state.connection === "expired") && (
        <div className="nbt-alert">{state.connectionError || "The live connection dropped. Thumbnails may be behind."}
          {state.connection === "offline" && <button type="button" className="nbt-btn" onClick={onRetryConnection}>Reconnect</button>}</div>)}
      {overview.error && <div className="nbt-alert">{overview.error}<button type="button" className="nbt-btn" onClick={onRefresh}>Retry</button></div>}
      {image.error && <div className="nbt-alert">Page image failed: {image.error}<button type="button" className="nbt-btn" onClick={onRetryImage}>Retry</button></div>}
      {!overview.notebooks ? (
        overview.loading ? <div className="nbt-grid">{Array.from({ length: cols * 2 }, (_, i) => <div key={i} className="nbt-skel" />)}</div>
          : <div className="nbt-empty">No overview loaded yet.</div>
      ) : !notebooks.length ? <div className="nbt-empty">No notebooks are assigned to this class page.</div> : (
        <div className="nbt-grid">
          {notebooks.map(nb => (
            <Tile key={nb.studentNumber} workbook={workbook} imageUrl={image.url} notebook={nb} page={state.page}
              online={(state.presence[nb.studentNumber] || 0) > 0}
              hot={now - (state.activity[nb.studentNumber] || 0) < 8000}
              onLoadHistory={onLoadHistory} onOpen={setOpen} />))}
        </div>)}
      {openNb && <Replay key={`${state.page}:${openNb.studentNumber}`} workbook={workbook} imageUrl={image.url}
        notebook={openNb} onLoadHistory={onLoadHistory} onClose={() => setOpen(null)} />}
    </div>
  );
}
