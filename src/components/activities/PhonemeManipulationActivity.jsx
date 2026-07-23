import { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import useAudioRecorder from '@/hooks/useAudioRecorder';
import { buildActivity } from '@/lib/activities/engine';
import { PALETTE, paletteFill } from '@/lib/activities/palette';
import { RefreshCw, Volume2, Mic, Send } from 'lucide-react';

// Phoneme manipulation ("count + change"). One square box per sound in the
// word. A tray of COLORED source chips sits below; dragging a chip CLONES it
// (the source stays) so the student can drop a different color onto a box to
// replace a sound (substitution). Each drag is recorded as a timestamped
// motion path with its color, so the teacher can replay the whole sequence.
const MIN_BOXES = 2, MAX_BOXES = 8;
const colX = (i, n) => (i + 0.5) / n;
const trayXNorm = (c, n) => (c + 1) / (n + 1);

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function drawChip(ctx, x, y, r, fill) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.14); ctx.strokeStyle = '#000'; ctx.stroke();
}

function layoutFor(w, h, n) {
  const s = w / n;
  const pad = s * 0.10;
  const boxY0 = pad;
  const boxY1 = pad + s;
  const boxCenterY = pad + s / 2;
  const chipR = s * 0.34;
  const trayY = boxY1 + s * 0.30 + chipR;
  const thresholdY = boxY1 + (trayY - boxY1) * 0.5; // above -> box drop; below -> tray
  return { s, boxY0, boxY1, boxCenterY, chipR, trayY, thresholdY, boxCenterYNorm: boxCenterY / h, trayYNorm: trayY / h, n };
}

export default function PhonemeManipulationActivity({ config, studentName }) {
  const activity = useMemo(() => buildActivity(config), [config]);
  const recorder = useAudioRecorder();
  const [order, setOrder] = useState([]);
  const [pos, setPos] = useState(0);
  const [phase, setPhase] = useState('ready');
  const [placed, setPlaced] = useState([]); // colorKey[]|null, length N
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const placedRef = useRef([]);
  const gesturesRef = useRef([]);
  const dragRef = useRef(null);
  const canvasRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const layoutRef = useRef(null);
  const NRef = useRef(MIN_BOXES);
  const drawRafRef = useRef(0);
  const pendingSubmitRef = useRef(false);
  const phaseRef = useRef('ready');

  const hasItems = activity.items.length > 0;
  const current = hasItems ? activity.items[order[pos]] || activity.items[0] : null;
  const { modeDef } = activity;
  const N = current ? clamp(current.answer || MIN_BOXES, MIN_BOXES, MAX_BOXES) : MIN_BOXES;

  useEffect(() => {
    if (!activity.items.length) return;
    setOrder(shuffle(activity.items.map((_, i) => i)));
    setPos(0);
    resetItem(activity.items[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity]);

  useEffect(() => {
    if (pendingSubmitRef.current && recorder.state === 'stopped') {
      pendingSubmitRef.current = false;
      doSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.state]);

  // canvas resize + always-on draw loop so drags render live
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas.parentElement);
    resize();
    const loop = () => { draw(); drawRafRef.current = requestAnimationFrame(loop); };
    drawRafRef.current = requestAnimationFrame(loop);
    return () => { ro.disconnect(); cancelAnimationFrame(drawRafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetItem(item) {
    const n = item ? clamp(item.answer || MIN_BOXES, MIN_BOXES, MAX_BOXES) : MIN_BOXES;
    NRef.current = n;
    setPhase('ready'); phaseRef.current = 'ready';
    setPlaced(Array(n).fill(null)); placedRef.current = Array(n).fill(null);
    gesturesRef.current = [];
    dragRef.current = null;
    setSubmitError(null);
    pendingSubmitRef.current = false;
    recorder.reset();
    recomputeLayout();
  }

  function recomputeLayout() {
    const { w, h } = sizeRef.current;
    if (w && h) layoutRef.current = layoutFor(w, h, NRef.current);
  }

  function resize() {
    const canvas = canvasRef.current; if (!canvas) return;
    const parent = canvas.parentElement;
    const w = parent.clientWidth, h = parent.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    sizeRef.current = { w, h, dpr };
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    layoutRef.current = layoutFor(w, h, NRef.current);
  }

  function draw() {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h, dpr } = sizeRef.current;
    const L = layoutRef.current;
    if (!w || !h || !L) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const n = L.n;
    ctx.lineWidth = Math.max(2, L.s * 0.05);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(0, L.boxY0, L.s * n, L.s);
    for (let i = 1; i < n; i++) {
      const lx = i * L.s;
      ctx.beginPath(); ctx.moveTo(lx, L.boxY0); ctx.lineTo(lx, L.boxY1); ctx.stroke();
    }
    // tray palette (cloning sources)
    for (let c = 0; c < PALETTE.length; c++) {
      drawChip(ctx, trayXNorm(c, PALETTE.length) * w, L.trayY, L.chipR, PALETTE[c].fill);
    }
    // placed counters
    const p = placedRef.current;
    for (let i = 0; i < n; i++) {
      if (p[i]) drawChip(ctx, colX(i, n) * w, L.boxCenterY, L.chipR, paletteFill(p[i]));
    }
    // moving counter on top
    if (dragRef.current) {
      drawChip(ctx, dragRef.current.x * w, dragRef.current.y * h, L.chipR, paletteFill(dragRef.current.color));
    }
  }

  function startReady() {
    setSubmitError(null);
    recorder.startRecording()
      .then(() => { setPhase('recording'); phaseRef.current = 'recording'; })
      .catch((e) => setSubmitError('No se pudo acceder al micrófono: ' + (e?.message || e)));
  }

  function recT() { return Date.now() - (recorder.getRecordingStartTime() || Date.now()); }

  function onPointerDown(e) {
    if (phaseRef.current !== 'recording') return;
    const { w, h } = sizeRef.current;
    const L = layoutRef.current; if (!L) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    // tray hit -> clone drag (source stays)
    for (let c = 0; c < PALETTE.length; c++) {
      const tx = trayXNorm(c, PALETTE.length) * w;
      if (Math.hypot(px - tx, py - L.trayY) < L.chipR * 1.5) {
        canvasRef.current.setPointerCapture(e.pointerId);
        const t = recT();
        dragRef.current = { type: 'clone', color: PALETTE[c].key, x: px / w, y: py / h, path: [{ t, x: px / w, y: py / h }] };
        return;
      }
    }
    // placed hit -> move/remove drag (lift it out of the box)
    const p = placedRef.current;
    for (let i = 0; i < L.n; i++) {
      if (!p[i]) continue;
      const bx = colX(i, L.n) * w;
      if (Math.hypot(px - bx, py - L.boxCenterY) < L.chipR * 1.5) {
        canvasRef.current.setPointerCapture(e.pointerId);
        const t = recT();
        const color = p[i];
        placedRef.current = placedRef.current.map((v, idx) => (idx === i ? null : v));
        setPlaced(placedRef.current);
        dragRef.current = { type: 'move', color, fromBox: i, x: px / w, y: py / h, path: [{ t, x: px / w, y: py / h }] };
        return;
      }
    }
  }

  function onPointerMove(e) {
    if (!dragRef.current) return;
    const { w, h } = sizeRef.current;
    const rect = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const d = dragRef.current;
    d.x = px / w; d.y = py / h;
    d.path.push({ t: recT(), x: d.x, y: d.y });
  }

  function onPointerUp(e) {
    if (!dragRef.current) return;
    const { w } = sizeRef.current;
    const L = layoutRef.current; if (!L) return;
    const d = dragRef.current;
    const rect = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const t = recT();
    let target = null;
    if (py < L.thresholdY && px >= 0 && px < L.s * L.n) {
      target = clamp(Math.floor(px / L.s), 0, L.n - 1);
    }
    if (d.type === 'clone') {
      if (target != null) {
        placedRef.current = placedRef.current.map((v, idx) => (idx === target ? d.color : v));
        setPlaced(placedRef.current);
        d.path.push({ t, x: colX(target, L.n), y: L.boxCenterYNorm });
        gesturesRef.current.push({ type: 'place', color: d.color, toBox: target, t0: d.path[0].t, t1: t, path: d.path });
      }
    } else { // move
      if (target == null) {
        d.path.push({ t, x: d.x, y: d.y });
        gesturesRef.current.push({ type: 'remove', color: d.color, fromBox: d.fromBox, t0: d.path[0].t, t1: t, path: d.path });
      } else if (target === d.fromBox) {
        placedRef.current = placedRef.current.map((v, idx) => (idx === target ? d.color : v));
        setPlaced(placedRef.current);
      } else {
        placedRef.current = placedRef.current.map((v, idx) => (idx === target ? d.color : v));
        setPlaced(placedRef.current);
        d.path.push({ t, x: colX(target, L.n), y: L.boxCenterYNorm });
        gesturesRef.current.push({ type: 'move', color: d.color, fromBox: d.fromBox, toBox: target, t0: d.path[0].t, t1: t, path: d.path });
      }
    }
    dragRef.current = null;
  }

  function enviar() {
    if (phaseRef.current !== 'recording' || saving) return;
    pendingSubmitRef.current = true;
    recorder.stopRecording();
  }

  async function doSubmit() {
    setSaving(true); setSubmitError(null);
    try {
      let audioUrl = '';
      const blob = recorder.getBlob();
      if (blob) {
        const f = new File([blob], `act-${Date.now()}.webm`, { type: blob.type });
        const up = await base44.integrations.Core.UploadFile({ file: f });
        audioUrl = up?.file_url || '';
      }
      const placedCount = placedRef.current.filter(Boolean).length;
      await base44.entities.ActivityResponse.create({
        activity_mode: 'phoneme_manipulation',
        student_name: studentName || 'Estudiante',
        class_name: '',
        item_text: current.text,
        item_index: order[pos],
        tile_count: NRef.current,
        placed_count: placedCount,
        correct_count: current.answer,
        is_correct: false,
        placements_data: JSON.stringify({
          palette: PALETTE.map((p) => p.key),
          gestures: gesturesRef.current,
          boxCount: NRef.current,
          finalPlaced: placedRef.current,
        }),
        audio_url: audioUrl,
        duration_ms: recorder.durationMs || 0,
        submitted_at: new Date().toISOString(),
        reviewed: false,
        teacher_note: '',
      });
      setPhase('submitted'); phaseRef.current = 'submitted';
    } catch (e) {
      setSubmitError('Error al guardar: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  function next() {
    const nextPos = (pos + 1) % activity.items.length;
    setPos(nextPos);
    resetItem(activity.items[nextPos]);
  }

  function speak() {
    try {
      const u = new SpeechSynthesisUtterance(current.text);
      u.lang = 'es-ES'; u.rate = 0.85;
      window.speechSynthesis?.speak(u);
    } catch { /* best-effort */ }
  }

  const placedCount = placed.filter(Boolean).length;

  if (!hasItems) {
    return <div className="p-6 text-slate-500 text-center">Añade elementos para empezar.</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-400">Elemento {pos + 1} / {activity.items.length}</span>
        <span className="ml-auto text-sm font-semibold text-slate-600">
          Fichas: <b className="text-indigo-600">{placedCount}</b> / {N}
        </span>
      </div>

      <div className="rounded-2xl bg-white border-2 border-slate-200 p-4 sm:p-6 text-center shadow-sm">
        <div className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-2">{modeDef.in}</div>
        <div className="text-2xl sm:text-3xl font-bold text-slate-800 leading-snug">{current.text}</div>
        <button onClick={speak} className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-sm font-bold">
          <Volume2 className="w-4 h-4" /> Escuchar
        </button>
      </div>

      <div className="flex items-center justify-center gap-3 min-h-[44px] flex-wrap">
        {phase === 'ready' && (
          <button onClick={startReady} className="px-5 py-2 rounded-lg bg-indigo-600 text-white font-bold flex items-center gap-1.5">
            <Mic className="w-4 h-4" /> Listo
          </button>
        )}
        {phase === 'recording' && (
          <>
            <span className="inline-flex items-center gap-1.5 text-red-600 font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
              Grabando {recorder.formatTime(recorder.elapsed)}
            </span>
            <button onClick={enviar} disabled={saving} className="px-5 py-2 rounded-lg bg-green-600 text-white font-bold flex items-center gap-1.5 disabled:opacity-50">
              <Send className="w-4 h-4" /> {saving ? 'Guardando…' : 'Enviar'}
            </button>
          </>
        )}
        {phase === 'submitted' && (
          <>
            <span className="font-bold text-lg text-green-600">¡Enviado! 🎉</span>
            <button onClick={next} className="px-5 py-2 rounded-lg bg-indigo-600 text-white font-bold">Siguiente</button>
          </>
        )}
      </div>

      {submitError && <div className="text-center text-sm text-red-600">{submitError}</div>}

      <div>
        <div className="font-bold text-slate-700 text-sm mb-1">Arrastra una ficha de color a cada sonido. Para cambiar un sonido, arrastra una ficha de otro color.</div>
        <div className="w-full rounded-xl bg-white border-2 border-slate-200" style={{ aspectRatio: `${(N / 2.18).toFixed(2)} / 1` }}>
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>
      </div>

      <div className="flex justify-center">
        <button onClick={() => resetItem(current)} className="px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold text-sm flex items-center gap-1.5">
          <RefreshCw className="w-4 h-4" /> Reiniciar
        </button>
      </div>
    </div>
  );
}