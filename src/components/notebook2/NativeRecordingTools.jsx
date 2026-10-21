// Base44-only microphone-drop recording tools for V2/V3 worksheets.
// Pins render via portal into the current page element. All UI marked data-native-voice-ui.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NotebookCanvas } from "@/lib/external-notebook/NotebookCanvas";
import { recordingFrame } from "@/lib/notebook2/recordingModel.mjs";

const CSS = `
.nrt-panel{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:4px 6px;margin:4px 0;border-radius:12px;background:hsl(48 60% 98%);font-size:13px}
.nrt-btn{display:inline-flex;align-items:center;gap:6px;min-height:44px;min-width:44px;padding:0 10px;border:0;border-radius:10px;background:hsl(200 30% 93%);color:hsl(200 30% 18%);font:inherit;font-weight:700;cursor:pointer;touch-action:manipulation}
.nrt-btn:disabled{opacity:.4;cursor:not-allowed}
.nrt-btn:focus-visible,.nrt-pin:focus-visible{outline:3px solid hsl(28 90% 52%);outline-offset:2px}
.nrt-btn[aria-pressed=true]{box-shadow:inset 0 0 0 2px hsl(195 55% 32%);background:hsl(195 45% 88%)}
.nrt-btn[data-kind=rec]{background:hsl(4 70% 46%);color:hsl(48 60% 98%)}
.nrt-btn[data-kind=primary]{background:hsl(195 55% 32%);color:hsl(48 60% 98%)}
.nrt-status{font-weight:700;color:hsl(200 15% 32%)}
.nrt-status[data-tone=bad]{color:hsl(4 70% 34%)}
.nrt-dot{width:10px;height:10px;border-radius:50%;background:hsl(4 75% 50%);animation:nrtp 1s ease-in-out infinite}
@keyframes nrtp{50%{opacity:.3}}
.nrt-layer{position:absolute;inset:0;pointer-events:none;z-index:5}
.nrt-pin{position:absolute;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;border:2px solid hsl(48 60% 98%);background:hsl(195 55% 32%);color:hsl(48 60% 98%);display:grid;place-items:center;cursor:pointer;pointer-events:auto;touch-action:none;box-shadow:0 2px 6px hsl(200 40% 20%/.35);padding:0}
.nrt-pin[data-empty=true]{background:hsl(36 80% 46%)}
.nrt-pin[data-selected=true]{transform:scale(1.18);background:hsl(4 70% 46%)}
.nrt-pin[data-drag=true]{cursor:grabbing;opacity:.8}
.nrt-modal{position:fixed;inset:0;z-index:1000;background:hsl(200 40% 10%/.55);display:flex;align-items:center;justify-content:center;padding:8px}
.nrt-sheet{background:hsl(48 60% 98%);border-radius:14px;padding:8px;width:min(720px,100%);max-height:calc(100dvh - 16px);display:flex;flex-direction:column;gap:6px;overflow:hidden}
.nrt-stage{flex:1;min-height:0;overflow:auto}
.nrt-stage-inner{position:relative;margin:0 auto;max-width:min(100%,calc((100dvh - 150px) * var(--nrt-ar)))}
.nrt-sheet audio{width:100%}
@media (max-width:480px){.nrt-btn .nrt-lbl{display:none}}
`;

const Mic = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);
const fmt = ms => { const s = Math.max(0, Math.floor((ms || 0) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const clamp = v => Math.min(1, Math.max(0, v));

function findPage(root) {
  return root?.querySelector?.("[data-native-recording-page]") || root?.querySelector?.(".nbv-page") || null;
}

function Pins({ host, notes, editable, selectedId, onSelect, onMove, laser }) {
  const [drag, setDrag] = useState(null);
  const cleanup = useRef(null);
  const moved = useRef(false);
  useEffect(() => () => cleanup.current?.(), []);
  const start = (e, note) => {
    if (!editable || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.stopPropagation();
    const rect = host.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY, id = e.pointerId;
    moved.current = false;
    const mv = ev => {
      if (ev.pointerId !== id) return;
      if (!moved.current && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      moved.current = true; ev.preventDefault();
      setDrag({ id: note.id, x: clamp((ev.clientX - rect.left) / rect.width), y: clamp((ev.clientY - rect.top) / rect.height) });
    };
    const end = ev => {
      if (ev.pointerId !== id) return;
      done();
      if (moved.current && ev.type === "pointerup") onMove(note, { x_pct: clamp((ev.clientX - rect.left) / rect.width), y_pct: clamp((ev.clientY - rect.top) / rect.height) });
      setDrag(null);
    };
    const done = () => {
      document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", end); document.removeEventListener("pointercancel", end);
      cleanup.current = null;
    };
    cleanup.current?.();
    document.addEventListener("pointermove", mv, { passive: false });
    document.addEventListener("pointerup", end); document.addEventListener("pointercancel", end);
    cleanup.current = done;
  };
  return createPortal(
    <div className="nrt-layer" data-native-voice-ui>
      {laser && <span aria-hidden="true" data-testid="dot-voice-laser" style={{ position: "absolute", left: `${clamp(laser.x) * 100}%`, top: `${clamp(laser.y) * 100}%`, width: 16, height: 16, margin: "-8px 0 0 -8px", borderRadius: "50%", background: "hsl(4 85% 50%)", border: "2px solid hsl(48 100% 97%)", boxShadow: "0 0 0 1px hsl(200 40% 15%/.5)", pointerEvents: "none" }} />}
      {notes.map((n, i) => {
        const d = drag?.id === n.id ? drag : null;
        return (
          <button key={n.id} type="button" className="nrt-pin" data-native-voice-ui data-empty={!n.has_audio} data-selected={selectedId === n.id} data-drag={!!d}
            style={{ left: `${(d ? d.x : n.x_pct) * 100}%`, top: `${(d ? d.y : n.y_pct) * 100}%` }}
            aria-label={`Voice note ${i + 1}${n.has_audio ? `, ${fmt(n.duration_ms)} recorded` : ", not recorded"}`}
            aria-pressed={selectedId === n.id}
            onPointerDown={e => start(e, n)}
            onClick={e => { e.stopPropagation(); if (moved.current) { moved.current = false; return; } onSelect(n.id === selectedId ? null : n.id); }}
            data-testid={`pin-voice-${n.id}`}><Mic /></button>
        );
      })}
    </div>, host);
}

function Playback({ playback, workbook, imageUrl, onClose }) {
  const audio = useRef(null);
  const [ms, setMs] = useState(0);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const a = audio.current; if (!a) return undefined;
    let raf = 0;
    const read = () => setMs(a.currentTime * 1000);
    const loop = () => { read(); raf = requestAnimationFrame(loop); };
    const play = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); };
    const stop = () => { cancelAnimationFrame(raf); read(); };
    a.addEventListener("play", play); a.addEventListener("pause", stop); a.addEventListener("ended", stop);
    a.addEventListener("timeupdate", read); a.addEventListener("seeked", read);
    const key = e => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", key);
    return () => { cancelAnimationFrame(raf); a.removeEventListener("play", play); a.removeEventListener("pause", stop); a.removeEventListener("ended", stop);
      a.removeEventListener("timeupdate", read); a.removeEventListener("seeked", read); document.removeEventListener("keydown", key); a.pause(); };
  }, [playback.audioUrl]);
  const frame = playback.timeline ? recordingFrame(playback.timeline, ms) : { strokes: [], laser: null };
  const laser = frame?.laser;
  const ar = workbook?.width && workbook?.height ? workbook.width / workbook.height : 0.75;
  const overlay = laser ? (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} aria-hidden="true">
      <ellipse cx={clamp(laser.x) * 100} cy={clamp(laser.y) * 100} rx={1.6} ry={1.6 * ar} fill="hsl(4 85% 50%)" stroke="hsl(48 100% 97%)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
    </svg>) : null;
  return createPortal(
    <div className="nrt-modal" data-native-voice-ui role="dialog" aria-modal="true" aria-label="Voice note replay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="nrt-sheet">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <strong style={{ marginRight: "auto" }}>Replay · {fmt(ms)} / {fmt(playback.timeline?.duration_ms ?? playback.note?.duration_ms)}</strong>
          <button type="button" className="nrt-btn" onClick={onClose} aria-label="Close replay" data-testid="button-voice-close">Close</button>
        </div>
        <div className="nrt-stage"><div className="nrt-stage-inner" style={{ "--nrt-ar": ar }}>
          <NotebookCanvas workbook={workbook} page={workbook?.page || 1} imageUrl={imageUrl} strokes={frame?.strokes || []} canDraw={false} pageOverlay={overlay} />
        </div></div>
        <audio ref={audio} src={playback.audioUrl} controls preload="metadata" aria-label="Voice note audio" data-testid="audio-voice" />
      </div>
    </div>, document.body);
}

export default function NativeRecordingTools({ voice, rootRef, readOnly = false, workbook, imageUrl }) {
  const [host, setHost] = useState(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const root = rootRef?.current; if (!root) return undefined;
    const sync = () => setHost(h => { const p = findPage(root); return p === h ? h : p; });
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [rootRef]);
  useEffect(() => {
    if (!host) return;
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
  }, [host]);
  useEffect(() => { setConfirm(false); }, [voice.selectedId]);

  const notes = voice.notes || [];
  const phase = voice.phase || "idle";
  const busy = phase === "recording" || phase === "saving" || phase === "starting";
  const editable = !readOnly && phase === "idle";
  const sel = notes.find(n => n.id === voice.selectedId) || null;

  return (
    <>
      <style>{CSS}</style>
      {host && <Pins host={host} notes={notes} editable={editable} selectedId={voice.selectedId}
        laser={phase === "recording" && voice.laserMode ? voice.laser : null}
        onSelect={id => { if (!busy) voice.setSelectedId(id); }} onMove={(n, pos) => voice.move(n, pos)} />}
      <div className="nrt-panel" data-native-voice-ui role="group" aria-label="Voice notes" data-testid="panel-voice">
        {voice.loading ? <span className="nb2-skel" style={{ width: 120, height: 24 }} role="status" aria-label="Loading voice notes" />
          : <>
            {!readOnly && phase === "idle" && (
              <button type="button" className="nrt-btn" disabled={voice.canRecord === false} aria-pressed={!!voice.placing} onClick={() => voice.setPlacing(!voice.placing)}
                aria-label={voice.placing ? "Cancel microphone drop" : "Drop a microphone on the page"} data-testid="button-voice-place">
                <Mic /><span>{voice.placing ? "Tap the page where you want to explain" : "Explain your work out loud"}</span></button>
            )}
            {readOnly && notes.length === 0 && <span className="nrt-status">No voice notes on this page.</span>}
            {sel && phase === "idle" && <>
              {sel.has_audio && <button type="button" className="nrt-btn" data-kind="primary" onClick={() => voice.play(sel)} aria-label="Play voice note" data-testid="button-voice-play">Play</button>}
              {!readOnly && !sel.has_audio && <>
                <span className="nrt-status">Pin placed. Ready to explain?</span>
                <button type="button" className="nrt-btn" disabled={voice.canRecord === false} data-kind="rec" onClick={() => voice.record(sel)} aria-label="Start recording" data-testid="button-voice-record"><Mic />Record</button>
              </>}
              {!readOnly && (confirm
                ? <><span className="nrt-status">Delete?</span>
                  <button type="button" className="nrt-btn" data-kind="rec" onClick={() => { setConfirm(false); voice.remove(sel); }} aria-label="Confirm delete voice note" data-testid="button-voice-confirm-delete">Yes</button>
                  <button type="button" className="nrt-btn" onClick={() => setConfirm(false)} aria-label="Keep voice note">No</button></>
                : <button type="button" className="nrt-btn" onClick={() => setConfirm(true)} aria-label="Delete voice note" data-testid="button-voice-delete">Delete</button>)}
            </>}
            {phase === "starting" && <>
              <span className="nrt-status" role="status">Waking the microphone… Allow access if asked.</span>
              <button type="button" className="nrt-btn" onClick={() => voice.cancelStart()} aria-label="Cancel starting microphone" data-testid="button-voice-cancel-start">Cancel</button>
            </>}
            {phase === "recording" && <>
              <span className="nrt-dot" aria-hidden="true" /><span className="nrt-status" role="timer" aria-live="off">{fmt(voice.elapsed)}</span>
              <span className="nrt-status">Keep writing and pointing</span>
              <button type="button" className="nrt-btn" aria-pressed={!!voice.laserMode} onClick={() => voice.setLaserMode(!voice.laserMode)}
                aria-label={voice.laserMode ? "Switch to pen" : "Switch to pointer"} data-testid="button-voice-laser">{voice.laserMode ? "Pointer on" : "Pointer"}</button>
              <button type="button" className="nrt-btn" data-kind="rec" onClick={() => voice.stop()} aria-label="Stop recording" data-testid="button-voice-stop">Stop and save</button>
            </>}
            {phase === "saving" && <span className="nrt-status" role="status">Saving recording...</span>}
            {phase === "unsaved" && <>
              <span className="nrt-status" data-tone="bad" role="alert">Recording not saved.</span>
              <button type="button" className="nrt-btn" data-kind="primary" onClick={() => voice.retry()} aria-label="Retry saving recording" data-testid="button-voice-retry">Retry</button>
              <button type="button" className="nrt-btn" onClick={() => voice.discard()} aria-label="Discard unsaved recording" data-testid="button-voice-discard">Discard</button>
            </>}
            {voice.error && phase !== "unsaved" && <span className="nrt-status" data-tone="bad" role="alert">{String(voice.error?.message || voice.error)}</span>}
          </>}
      </div>
      {voice.playback && <Playback playback={voice.playback} workbook={workbook} imageUrl={imageUrl} onClose={() => voice.closePlayback()} />}
    </>
  );
}
