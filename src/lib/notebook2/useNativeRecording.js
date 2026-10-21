import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { draftStorage } from "./recordingDrafts";
import { recordingScope, MAX_RECORDING_MS } from "./recordingModel.mjs";

const message = e => e?.response?.data?.error || e?.message || "Recording failed. Keep this page open and retry.";
async function request(scope, page, action, body = {}) {
  const result = await base44.functions.invoke("nativeNotebookRecording", { scope, page, action, ...body });
  if (result.data?.error) throw Error(result.data.error);
  return result.data;
}
const dataUrl = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(Error("The recorded audio could not be read."));
  reader.readAsDataURL(blob);
});

export function useNativeRecording({ scope, page, operations, rootRef, finishGesture, enabled = true, readOnly = false }) {
  const scopeKey = recordingScope(scope, page), key = `${scopeKey}:page:${page}`;
  const latest = useRef({ key, operations, enabled, readOnly, finishGesture });
  const mounted = useRef(false);
  latest.current = { key, operations, enabled, readOnly, finishGesture };
  const [notes, setNotes] = useState([]), [loading, setLoading] = useState(true);
  const [error, setError] = useState(""), [phase, setPhase] = useState("idle");
  const phaseRef = useRef("idle"), context = useRef(null), pending = useRef(null), saving = useRef(new Map());
  const [placing, setPlacing] = useState(false), [selectedId, setSelectedId] = useState(null);
  const [elapsed, setElapsed] = useState(0), [laserMode, setLaserMode] = useState(false), [laser, setLaser] = useState(null);
  const [playback, setPlayback] = useState(null), playTicket = useRef(null);
  const stopRef = useRef(null);
  const changePhase = value => { phaseRef.current = value; setPhase(value); };
  const upsert = note => setNotes(old => [...old.filter(n => n.pin_id !== note.pin_id), note]);
  useEffect(() => {
    let alive = true;
    mounted.current = true;
    setNotes([]); setLoading(true); setError(""); setPlacing(false); setSelectedId(null);
    setPlayback(null); playTicket.current = null; pending.current = null; changePhase("idle");
    (async () => {
      const [network, recovery] = await Promise.allSettled([
        request(scope, page, "list"), readOnly ? null : draftStorage("get", key),
      ]);
      if (!alive) return;
      const data = network.status === "fulfilled" ? network.value : { notes: [] };
      const draft = recovery.status === "fulfilled" ? recovery.value : null;
      setNotes(data.notes || []);
      if (draft) {
        pending.current = draft; changePhase("unsaved");
        const note = data.notes?.find(n => n.pin_id === draft.note.pin_id) || draft.note;
        upsert(note); setSelectedId(note.id);
        setError("A recording is kept on this device. Retry saving it before leaving this page.");
      }
      if (!draft && network.status === "rejected") setError(message(network.reason));
      if (recovery.status === "rejected") setError(message(recovery.reason));
    })().catch(e => { if (alive) setError(message(e)); }).finally(() => { if (alive) setLoading(false); });
    return () => {
      alive = false; playTicket.current = null;
      mounted.current = false;
      const ctx = context.current;
      if (ctx && ctx.key === key && ctx.recorder.state !== "inactive") ctx.recorder.stop();
    };
  }, [key, readOnly]);
  useEffect(() => { if (!enabled) setPlacing(false); }, [enabled]);

  // Snapshot only newly committed operations, retaining measured point timing.
  const captureInk = ctx => {
    if (latest.current.key !== ctx.key) return;
    for (const operation of latest.current.operations || []) {
      if (ctx.known.has(operation.id)) continue;
      ctx.known.add(operation.id);
      const at = Math.max(0, Date.now() - ctx.started);
      const start = operation.kind === "stroke" && Number.isFinite(operation.stroke?.startedAt)
        ? Math.max(0, operation.stroke.startedAt - ctx.started) : at;
      ctx.events.push({ at, start, operation });
    }
  };
  useEffect(() => { const ctx = context.current; if (ctx?.key === key && ctx.started) captureInk(ctx); }, [operations, key]);
  useEffect(() => {
    const warn = event => {
      if (["starting", "recording", "saving", "unsaved"].includes(phaseRef.current)) {
        event.preventDefault(); event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const saveDraft = async draft => {
    if (saving.current.has(draft.key)) return saving.current.get(draft.key);
    const current = () => latest.current.key === draft.key;
    if (current()) { changePhase("saving"); setError(""); }
    const promise = (async () => {
      try {
        await draftStorage("put", draft.key, draft);
        await request(draft.scope, draft.page, "pin", { pin: draft.note });
        const data = await request(draft.scope, draft.page, "save", {
          pin: draft.note, recording_id: draft.recording_id, audio: await dataUrl(draft.blob), timeline: draft.timeline,
        });
        // A completed server save is authoritative even if local cleanup is blocked.
        try { await draftStorage("delete", draft.key); } catch { /* idempotent recovery on next open */ }
        if (current()) {
          upsert(data.note); setSelectedId(data.note.id); pending.current = null; changePhase("idle"); setError("");
        }
        return true;
      } catch (e) {
        if (current()) { pending.current = draft; changePhase("unsaved"); setError(message(e)); }
        return false;
      } finally { saving.current.delete(draft.key); }
    })();
    saving.current.set(draft.key, promise);
    return promise;
  };
  const createPin = async position => {
    if (readOnly || !enabled || phaseRef.current !== "idle") return;
    setPlacing(false);
    const pin_id = crypto.randomUUID(), local = { id: pin_id, pin_id, ...position, has_audio: false };
    upsert(local); setSelectedId(local.id); setError("");
    try {
      const data = await request(scope, page, "pin", { pin: local });
      if (latest.current.key === key) { upsert(data.note); setSelectedId(data.note.id); }
    } catch (e) { if (latest.current.key === key) setError(message(e)); }
  };
  const record = async note => {
    if (readOnly || !latest.current.enabled || phaseRef.current !== "idle") return;
    if (note.has_audio) { setError("Drop another microphone to make a new recording."); return; }
    changePhase("starting"); setError(""); setPlacing(false);
    let stream;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined")
        throw Error("Audio recording is not supported in this browser. Try Safari or Chrome.");
      if (await latest.current.finishGesture?.() === false) throw Error("Finish saving your writing before recording.");
      // Verify recovery storage before opening the microphone.
      await draftStorage("get", key);
      await request(scope, page, "pin", { pin: note });
      if (!mounted.current || latest.current.key !== key) return;
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || latest.current.key !== key) { stream.getTracks().forEach(t => t.stop()); return; }
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"]
        .find(mime => MediaRecorder.isTypeSupported(mime));
      const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const ctx = { key, scope, page, note, recorder, stream, chunks: [], events: [], pointer: [],
        started: 0, known: new Set(), recording_id: crypto.randomUUID(), timer: null };
      ctx.done = new Promise(resolve => { ctx.resolve = resolve; });
      context.current = ctx; setSelectedId(note.id);
      recorder.onstart = () => {
        ctx.started = Date.now();
        ctx.baseOperations = structuredClone(latest.current.operations || []);
        ctx.known = new Set(ctx.baseOperations.map(op => op.id));
        setElapsed(0); changePhase("recording");
        ctx.timer = setInterval(() => {
          const duration = Date.now() - ctx.started;
          setElapsed(duration);
          if (duration >= MAX_RECORDING_MS) void stopRef.current?.();
        }, 150);
      };
      recorder.ondataavailable = event => { if (event.data?.size) ctx.chunks.push(event.data); };
      recorder.onerror = event => {
        setError(message(event.error || Error("Microphone recording was interrupted.")));
        if (recorder.state !== "inactive") recorder.stop();
      };
      recorder.onstop = async () => {
        clearInterval(ctx.timer); ctx.stream.getTracks().forEach(t => t.stop());
        captureInk(ctx);
        const duration_ms = Math.min(MAX_RECORDING_MS + 4000, Math.max(1, Date.now() - ctx.started));
        const draft = { key: ctx.key, scope: ctx.scope, page: ctx.page, note: ctx.note, recording_id: ctx.recording_id,
          blob: new Blob(ctx.chunks, { type: recorder.mimeType || type || "audio/webm" }),
          timeline: { version: 1, scope_key: scopeKey, page: ctx.page, duration_ms,
            baseOperations: ctx.baseOperations || [], events: ctx.events, pointer: ctx.pointer } };
        context.current = null; setLaser(null); setLaserMode(false);
        pending.current = draft;
        if (!draft.blob.size) { changePhase("idle"); setError("No audio was captured. Please try again."); ctx.resolve(false); return; }
        const ok = await saveDraft(draft);
        ctx.resolve(ok);
      };
      recorder.start(500);
    } catch (e) {
      stream?.getTracks().forEach(t => t.stop());
      if (latest.current.key === key) { changePhase("idle"); setError(message(e)); }
    }
  };
  const stop = async () => {
    const ctx = context.current;
    if (!ctx) return phaseRef.current === "idle";
    if (!ctx.started) return false;
    await latest.current.finishGesture?.();
    if (ctx.recorder.state !== "inactive") ctx.recorder.stop();
    return ctx.done;
  };
  stopRef.current = stop;
  const finish = async () => {
    if (saving.current.has(key)) return saving.current.get(key);
    if (phaseRef.current === "starting" || phaseRef.current === "unsaved") {
      setError("Save or discard the recording before changing pages."); return false;
    }
    return context.current ? stop() : true;
  };
  const retry = async () => pending.current ? saveDraft(pending.current) : false;
  const discard = async () => {
    if (phaseRef.current !== "unsaved" || !window.confirm("Discard this unsaved recording? This cannot be undone.")) return;
    try { await draftStorage("delete", key); pending.current = null; changePhase("idle"); setError(""); }
    catch (e) { setError(message(e)); }
  };
  const move = async (note, position) => {
    if (readOnly || phaseRef.current !== "idle") return;
    try { const data = await request(scope, page, "pin", { pin: { ...note, ...position } }); upsert(data.note); }
    catch (e) { setError(message(e)); }
  };
  const remove = async note => {
    if (readOnly || phaseRef.current !== "idle") return;
    try {
      await request(scope, page, "delete", { pin: note });
      setNotes(old => old.filter(n => n.pin_id !== note.pin_id)); setSelectedId(null); setError("");
    } catch (e) { setError(message(e)); }
  };
  const play = async note => {
    const ticket = Symbol(); playTicket.current = ticket; setError("");
    try {
      const data = await request(scope, page, "play", { pin: note });
      const response = await fetch(data.timeline_url);
      if (!response.ok) throw Error("The recording's writing timeline could not load.");
      const timeline = await response.json();
      if (timeline.scope_key !== scopeKey || timeline.page !== page) throw Error("This recording belongs to another notebook page.");
      if (playTicket.current === ticket && latest.current.key === key)
        setPlayback({ note, audioUrl: data.audio_url, timeline });
    } catch (e) { if (playTicket.current === ticket) setError(message(e)); }
  };
  const pointer = useRef(null);
  const capture = (event, kind) => {
    if (event.target.closest?.("[data-native-voice-ui]")) return;
    const element = rootRef.current?.querySelector(".nbv-page,[data-native-recording-page]");
    if (!element?.contains(event.target)) return;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const point = { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
    if (placing && kind === "down") {
      event.preventDefault(); event.stopPropagation(); void createPin({ x_pct: point.x, y_pct: point.y }); return;
    }
    const ctx = context.current;
    if (!ctx?.started || phaseRef.current !== "recording") return;
    if (kind === "down") pointer.current = event.pointerId;
    if (pointer.current !== event.pointerId) return;
    const down = kind !== "up";
    const t = Math.max(0, Date.now() - ctx.started);
    if (kind !== "move" || t - (ctx.pointer.at(-1)?.t || 0) >= 16)
      ctx.pointer.push({ ...point, t, down });
    if (laserMode) {
      event.preventDefault(); event.stopPropagation(); setLaser(down ? point : null);
      if (kind === "down") element.setPointerCapture?.(event.pointerId);
      if (kind === "up") { try { element.releasePointerCapture?.(event.pointerId); } catch {} }
    }
    if (kind === "up") pointer.current = null;
  };
  return { notes, loading, error, phase, elapsed, placing,
    canRecord: enabled && !readOnly,
    setPlacing: value => setPlacing(enabled && !readOnly && phaseRef.current === "idle" ? value : false), selectedId, setSelectedId,
    record, stop, retry, discard, remove, move, play, playback, closePlayback: () => { playTicket.current = null; setPlayback(null); },
    laserMode, setLaserMode, laser, finish,
    pageHandlers: { onPointerDownCapture: e => capture(e, "down"), onPointerMoveCapture: e => capture(e, "move"),
      onPointerUpCapture: e => capture(e, "up"), onPointerCancelCapture: e => capture(e, "up") } };
}
