// Read-only teacher view of one student's native ink. Teacher role never queues.
import { useEffect, useMemo, useState } from "react";
import { NotebookCanvas } from "@/lib/external-notebook/NotebookCanvas";
import { materializeDrawing } from "@/lib/external-notebook/ink-model";
import { useNativeInk } from "@/lib/notebook2/useNativeInk";
import { ACTIVE_SCHOOL_YEAR } from "@/lib/schoolYear";

function Connected({ assignment, image, className, number, page, onOpen }) {
  const scope = useMemo(() => ({ className, assignmentId: assignment.id, schoolYear: ACTIVE_SCHOOL_YEAR, channel: "ink", number }),
    [className, assignment.id, number]);
  const ink = useNativeInk({ scope, page, role: "teacher" });
  const workbook = { id: `nb2-${assignment.id}`, title: assignment.title, width: image.width, height: image.height, pageCount: assignment.pdf_page_count };
  return (
    <button type="button" onClick={() => onOpen({ number, ink, workbook })} data-testid={`card-thumb-${number}`}
      style={{ all: "unset", cursor: "pointer", display: "block", borderRadius: 12, background: "hsl(48 60% 98%)", padding: 4 }}>
      <NotebookCanvas workbook={workbook} page={page} imageUrl={image.url} strokes={ink.strokes} canDraw={false} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 800, padding: "4px 4px 0" }}>
        <span>#{number}</span>
        <span style={{ opacity: .6 }}>{ink.connected ? `${ink.strokes.length} marks` : "connecting"}</span>
      </div>
    </button>
  );
}

// Staggered mount so 30 connections do not open at once.
export default function NativeThumbnail({ delay, ...props }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), delay); return () => clearTimeout(t); }, [delay]);
  if (!on) return <div className="nb2-skel" style={{ aspectRatio: `${props.image.width}/${props.image.height}` }} data-testid={`skel-thumb-${props.number}`} />;
  return <Connected {...props} />;
}

export function ThumbOverlay({ open, page, imageUrl, onClose, assignment, className }) {
  const scope = useMemo(() => ({ className, assignmentId: assignment.id, schoolYear: ACTIVE_SCHOOL_YEAR, channel: "ink", number: open.number }),
    [className, assignment.id, open.number]);
  const liveInk = useNativeInk({ scope, page, role: "teacher" });
  const ops = useMemo(() => (liveInk.operations || []).map(o => o?.operation || o), [liveInk.operations]);
  const [step, setStep] = useState(ops.length);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { if (!playing) setStep(ops.length); }, [ops.length, playing]);
  useEffect(() => {
    if (!playing) return undefined;
    const t = setInterval(() => setStep(s => { if (s >= ops.length) { setPlaying(false); return s; } return s + 1; }), 120);
    return () => clearInterval(t);
  }, [playing, ops.length]);
  const strokes = step >= ops.length ? liveInk.strokes : materializeDrawing(ops.slice(0, step));
  return (
    <div role="dialog" aria-label={`Student ${open.number} work`} onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "hsl(200 30% 12% / .55)", display: "grid", placeItems: "center", zIndex: 50, padding: 12 }}>
      <div className="nb2-card" onClick={e => e.stopPropagation()} style={{ width: "min(900px,100%)", maxHeight: "96dvh", overflow: "auto" }}>
        <div className="nb2-bar" style={{ padding: 0 }}>
          <span className="nb2-title">Student {open.number} · page {page}</span>
          <button type="button" className="nb2-btn" onClick={() => { setStep(0); setPlaying(true); }} data-testid="button-replay">Replay</button>
          <button type="button" className="nb2-btn" onClick={onClose} data-testid="button-close-overlay">Close</button>
        </div>
        <NotebookCanvas workbook={open.workbook} page={page} imageUrl={imageUrl} strokes={strokes} canDraw={false} />
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700, marginTop: 6 }}>
          Steps {step}/{ops.length}
          <input type="range" min={0} max={ops.length} value={step} style={{ flex: 1 }}
            onChange={e => { setPlaying(false); setStep(Number(e.target.value)); }} data-testid="input-scrub" />
        </label>
      </div>
    </div>
  );
}
