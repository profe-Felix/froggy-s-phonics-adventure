// Read-only teacher view of one student's native ink. Teacher role never queues.
import { useEffect, useMemo, useRef, useState } from "react";
import { NotebookCanvas } from "@/lib/external-notebook/NotebookCanvas";
import { replayFrame } from "@/lib/external-notebook/ink-model";
import { buildFormationTimeline } from "@/lib/notebook2/formationReplay";
import FormationControls from "./FormationControls";
import { useNativeInk } from "@/lib/notebook2/useNativeInk";
import { ACTIVE_SCHOOL_YEAR } from "@/lib/schoolYear";

const imgUrl = image => (typeof image === "string" ? image : image?.url) || "";
const imgSize = image => ({ width: image?.width || 1000, height: image?.height || 1294 });
const studentNumber = (student, number) => Number(student?.student_number ?? number);

function useStudentInk({ className, assignment, variant, number, page, schoolYear = ACTIVE_SCHOOL_YEAR }) {
  const scope = useMemo(() => ({ className, assignmentId: assignment.id, schoolYear, channel: "ink", number, variant }),
    [className, assignment.id, number, variant, schoolYear]);
  return useNativeInk({ scope, page, role: "teacher" });
}

function useScrub(ink, resetKey) {
  const ops = useMemo(() => (ink.operations || []).map(o => o?.operation || o), [ink.operations]);
  const timeline = useMemo(() => buildFormationTimeline(ops.map((operation, i) => ({ revision: i + 1, operation }))), [ops]);
  const total = timeline.at(-1)?.end || 0;
  const [time, setTime] = useState(null); // null = follow live
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0.5);
  const position = useRef(time); position.current = time;
  useEffect(() => { setTime(null); setPlaying(false); }, [resetKey]);
  useEffect(() => {
    if (!playing) return undefined;
    const start = performance.now(), from = position.current ?? 0;
    let raf;
    const tick = now => {
      const next = Math.min(total, from + (now - start) * speed);
      setTime(next);
      if (next < total) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total, speed]);
  const at = time == null ? total : Math.min(time, total);
  const frame = useMemo(() => time == null ? null : replayFrame(timeline, at), [timeline, at, time === null]);
  return { ops, timeline, total, at, strokes: frame ? frame.strokes : ink.strokes, playing, speed, setSpeed,
    scrub: n => { setPlaying(false); setTime(n); },
    live: () => { setPlaying(false); setTime(null); },
    replay: () => {
      if (playing) { setPlaying(false); return; }
      if (time == null || at >= total) setTime(0);
      setPlaying(true);
    } };
}

function Connected({ assignment, image, className, student, number, page, variant, schoolYear, onOpen }) {
  const n = studentNumber(student, number);
  const ink = useStudentInk({ className, assignment, variant, number: n, page, schoolYear });
  const s = useScrub(ink, `${className}:${assignment.id}:${n}:${page}:${variant}`);
  const { width, height } = imgSize(image);
  const workbook = { id: `nb${variant}-${assignment.id}`, title: assignment.title, width, height, pageCount: assignment.pdf_page_count };
  const stop = e => e.stopPropagation();
  return (
    <div data-testid={`card-thumb-${n}`} style={{ borderRadius: 12, background: "hsl(48 60% 98%)", padding: 4, display: "flex", flexDirection: "column", gap: 4 }}>
      <button type="button" onClick={() => onOpen({ number: n, student, workbook })} aria-label={`Open student ${n} work`} data-testid={`button-open-thumb-${n}`}
        style={{ all: "unset", cursor: "zoom-in", display: "block" }}>
        <NotebookCanvas workbook={workbook} page={page} imageUrl={imgUrl(image)} strokes={s.strokes} canDraw={false} />
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, minWidth: 0 }}>
        {student?.photo_url ? <img src={student.photo_url} alt="" style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", flex: "none" }} />
          : <span style={{ width: 22, height: 22, borderRadius: "50%", background: "hsl(200 30% 88%)", display: "grid", placeItems: "center", fontSize: 10, flex: "none" }}>{n}</span>}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} data-testid={`text-thumb-name-${n}`}>#{n} {student?.name || ""}</span>
        <span title={ink.connected ? "Work feed connected (not student presence)" : "Work feed connecting"} data-testid={`status-thumb-${n}`}
          style={{ width: 8, height: 8, borderRadius: "50%", flex: "none", background: ink.connected ? "hsl(150 55% 40%)" : "hsl(38 90% 55%)" }} />
      </div>
      <input type="range" min={0} max={s.total} step={1} value={s.at} aria-label={`Scrub student ${n} work`} disabled={!s.ops.length}
        onPointerDown={stop} onClick={stop} onChange={e => s.scrub(Number(e.target.value))} style={{ width: "100%" }} data-testid={`input-thumb-scrub-${n}`} />
      <button type="button" onClick={s.live} style={{ alignSelf: "flex-end", fontSize: 11, padding: "1px 5px" }}>Live</button>
    </div>
  );
}

// Staggered mount so 30 connections do not open at once.
export default function NativeThumbnail({ delay = 0, ...props }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), delay); return () => clearTimeout(t); }, [delay]);
  const { width, height } = imgSize(props.image);
  if (!on) return <div className="nb2-skel" style={{ aspectRatio: `${width}/${height}` }} data-testid={`skel-thumb-${studentNumber(props.student, props.number)}`} />;
  return <Connected {...props} />;
}

export function ThumbOverlay({ open, page, image, imageUrl, variant, onClose, assignment, className, schoolYear }) {
  const ink = useStudentInk({ className, assignment, variant, number: open.number, page, schoolYear });
  const s = useScrub(ink, `${className}:${assignment.id}:${open.number}:${page}:${variant}`);
  useEffect(() => { const k = e => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div role="dialog" aria-label={`Student ${open.number} work`} onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "hsl(200 30% 12% / .55)", display: "grid", placeItems: "center", zIndex: 50, padding: 12 }}>
      <div className="nb2-card" onClick={e => e.stopPropagation()} style={{ width: "min(900px,100%)", maxHeight: "96dvh", overflow: "auto" }}>
        <div className="nb2-bar" style={{ padding: 0 }}>
          <span className="nb2-title">#{open.number} {open.student?.name || ""} · page {page}</span>
          <button type="button" className="nb2-btn" disabled={!s.ops.length} onClick={s.replay} data-testid="button-replay">{s.playing ? "Pause" : "Replay"}</button>
          <select aria-label="Replay speed" value={s.speed} onChange={e => s.setSpeed(Number(e.target.value))}>
            {[0.25, 0.5, 1].map(value => <option key={value} value={value}>{value}×</option>)}
          </select>
          <button type="button" className="nb2-btn" onClick={s.live}>Live</button>
          <button type="button" className="nb2-btn" onClick={onClose} data-testid="button-close-overlay">Close</button>
        </div>
        <NotebookCanvas workbook={open.workbook} page={page} imageUrl={imageUrl || imgUrl(image)} strokes={s.strokes} canDraw={false} />
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700, marginTop: 6 }}>
          Page replay
          <input type="range" min={0} max={s.total} step={1} value={s.at} style={{ flex: 1 }} onChange={e => s.scrub(Number(e.target.value))} data-testid="input-scrub" />
        </label>
        <FormationControls timeline={s.timeline} time={s.at} onSeek={s.scrub} />
      </div>
    </div>
  );
}
