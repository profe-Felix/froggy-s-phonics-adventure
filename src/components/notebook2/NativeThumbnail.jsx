// Read-only teacher view of one student's native ink. Teacher role never queues.
import { useEffect, useMemo, useState } from "react";
import { NotebookCanvas } from "@/lib/external-notebook/NotebookCanvas";
import { materializeDrawing } from "@/lib/external-notebook/ink-model";
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

function useScrub(ink) {
  const ops = useMemo(() => (ink.operations || []).map(o => o?.operation || o), [ink.operations]);
  const [step, setStep] = useState(null); // null = follow live
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return undefined;
    const t = setInterval(() => setStep(s => { const n = (s ?? 0) + 1; if (n >= ops.length) { setPlaying(false); return null; } return n; }), 120);
    return () => clearInterval(t);
  }, [playing, ops.length]);
  const at = step == null ? ops.length : Math.min(step, ops.length);
  const strokes = at >= ops.length ? ink.strokes : materializeDrawing(ops.slice(0, at));
  return { ops, at, strokes, playing, scrub: n => { setPlaying(false); setStep(n >= ops.length ? null : n); }, replay: () => { setStep(0); setPlaying(true); } };
}

function Connected({ assignment, image, className, student, number, page, variant, schoolYear, onOpen }) {
  const n = studentNumber(student, number);
  const ink = useStudentInk({ className, assignment, variant, number: n, page, schoolYear });
  const s = useScrub(ink);
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
      <input type="range" min={0} max={s.ops.length} value={s.at} aria-label={`Scrub student ${n} work`} disabled={!s.ops.length}
        onPointerDown={stop} onClick={stop} onChange={e => s.scrub(Number(e.target.value))} style={{ width: "100%" }} data-testid={`input-thumb-scrub-${n}`} />
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
  const s = useScrub(ink);
  useEffect(() => { const k = e => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div role="dialog" aria-label={`Student ${open.number} work`} onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "hsl(200 30% 12% / .55)", display: "grid", placeItems: "center", zIndex: 50, padding: 12 }}>
      <div className="nb2-card" onClick={e => e.stopPropagation()} style={{ width: "min(900px,100%)", maxHeight: "96dvh", overflow: "auto" }}>
        <div className="nb2-bar" style={{ padding: 0 }}>
          <span className="nb2-title">#{open.number} {open.student?.name || ""} · page {page}</span>
          <button type="button" className="nb2-btn" disabled={!s.ops.length} onClick={s.replay} data-testid="button-replay">{s.playing ? "Replaying" : "Replay"}</button>
          <button type="button" className="nb2-btn" onClick={onClose} data-testid="button-close-overlay">Close</button>
        </div>
        <NotebookCanvas workbook={open.workbook} page={page} imageUrl={imageUrl || imgUrl(image)} strokes={s.strokes} canDraw={false} />
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700, marginTop: 6 }}>
          Steps {s.at}/{s.ops.length}
          <input type="range" min={0} max={s.ops.length} value={s.at} style={{ flex: 1 }} onChange={e => s.scrub(Number(e.target.value))} data-testid="input-scrub" />
        </label>
      </div>
    </div>
  );
}
