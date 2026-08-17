import { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import useAudioRecorder from '@/hooks/useAudioRecorder';
import { buildActivity } from '@/lib/activities/engine';
import { playTts } from '@/lib/audio';
import { RefreshCw, Volume2, Mic, Send } from 'lucide-react';

// Canvas-based Elkonin counting. Eight SQUARE boxes sit touching in a single
// row (one frame with dividers); one chip rests below each box. The student
// drags a chip STRAIGHT UP into the box above it to count one unit. Chips the
// student doesn't move stay put — no sliding. Each drag is recorded as a
// timestamped motion path so the teacher can replay the chip rising.
const BOX_COUNT = 8;
const colX = (i) => (i + 0.5) / BOX_COUNT;
// Canvas keeps a fixed aspect ratio so the square boxes + chip row scale to any
// device width. Layout is computed in px from the box side s = width / BOX_COUNT.
const ASPECT = '3.5 / 1';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function drawChip(ctx, x, y, r) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#4DA6FF'; ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.14); ctx.strokeStyle = '#000'; ctx.stroke();
}

// px geometry from a canvas width; normalized y refs are derived from the real
// height so stored motion paths stay valid across device widths.
function layoutFor(w, h) {
  const s = w / BOX_COUNT;            // square box side
  const pad = s * 0.10;
  const boxY0 = pad;
  const boxY1 = boxY0 + s;
  const boxCenterY = boxY0 + s / 2;
  const chipR = s * 0.34;
  const homeY = boxY1 + s * 0.30 + chipR;
  const thresholdY = boxY1 + (homeY - boxY1) * 0.5; // release above -> placed
  return {
    s, pad, boxY0, boxY1, boxCenterY, chipR, homeY, thresholdY,
    boxCenterYNorm: boxCenterY / h,
    homeYNorm: homeY / h,
  };
}

export default function ElkoninCountActivity({ config, studentName }) {
  const activity = useMemo(() => buildActivity(config), [config]);
  const recorder = useAudioRecorder();
  const [order, setOrder] = useState([]);
  const [pos, setPos] = useState(0);
  const [phase, setPhase] = useState('ready'); // ready | recording | submitted
  const [placed, setPlaced] = useState(() => Array(BOX_COUNT).fill(false));
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const placedRef = useRef(Array(BOX_COUNT).fill(false));
  const gesturesRef = useRef([]);
  const dragRef = useRef(null);
  const canvasRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const layoutRef = useRef(null);
  const drawRafRef = useRef(0);
  const pendingSubmitRef = useRef(false);
  const phaseRef = useRef('ready');

  const hasItems = activity.items.length > 0;
  const current = hasItems ? activity.items[order[pos]] || activity.items[0] : null;
  const { modeDef } = activity;
  const correct = current ? current.answer : 0;
  const unitWord = modeDef.what === 'palabras' ? 'palabra' : 'sonido';

  useEffect(() => {
    if (!activity.items.length) return;
    setOrder(shuffle(activity.items.map((_, i) => i)));
    setPos(0);
    resetItem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity]);

  useEffect(() => {
    if (pendingSubmitRef.current && recorder.state === 'stopped') {
      pendingSubmitRef.current = false;
      doSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.state]);

  // canvas resize + always-on draw loop (single instance) so drags render live
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

  function resetItem() {
    setPhase('ready'); phaseRef.current = 'ready';
    setPlaced(Array(BOX_COUNT).fill(false)); placedRef.current = Array(BOX_COUNT).fill(false);
    gesturesRef.current = [];
    dragRef.current = null;
    setSubmitError(null);
    pendingSubmitRef.current = false;
    recorder.reset();
  }

  function resize() {
    const canvas = canvasRef.current; if (!canvas) return;
    const parent = canvas.parentElement;
    const w = parent.clientWidth, h = parent.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    sizeRef.current = { w, h, dpr };
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    layoutRef.current = layoutFor(w, h);
  }

  function draw() {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h, dpr } = sizeRef.current;
    const L = layoutRef.current;
    if (!w || !h || !L) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // one frame + dividers -> square touching boxes
    ctx.lineWidth = Math.max(2, L.s * 0.05);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(0, L.boxY0, L.s * BOX_COUNT, L.s);
    for (let i = 1; i < BOX_COUNT; i++) {
      const lx = i * L.s;
      ctx.beginPath(); ctx.moveTo(lx, L.boxY0); ctx.lineTo(lx, L.boxY1); ctx.stroke();
    }
    const p = placedRef.current;
    for (let i = 0; i < BOX_COUNT; i++) {
      let cx, cy;
      if (dragRef.current && dragRef.current.chip === i) {
        cx = dragRef.current.x * w; cy = dragRef.current.y * h;
      } else {
        cx = colX(i) * w; cy = (p[i] ? L.boxCenterY : L.homeY);
      }
      drawChip(ctx, cx, cy, L.chipR);
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
    const i = Math.min(BOX_COUNT - 1, Math.max(0, Math.floor(px / L.s)));
    const p = placedRef.current;
    const curYpx = p[i] ? L.boxCenterY : L.homeY;
    if (Math.abs(py - curYpx) < L.chipR * 1.6) {
      canvasRef.current.setPointerCapture(e.pointerId);
      const t = recT();
      const yNorm = curYpx / h;
      dragRef.current = { chip: i, fromPlaced: p[i], x: colX(i), y: yNorm, path: [{ t, x: colX(i), y: yNorm }] };
    }
  }

  function onPointerMove(e) {
    if (!dragRef.current) return;
    const { h } = sizeRef.current;
    const rect = canvasRef.current.getBoundingClientRect();
    const py = e.clientY - rect.top;
    const ny = Math.min(0.95, Math.max(0.05, py / h));
    const d = dragRef.current;
    d.y = ny; d.x = colX(d.chip); // x locked to its column -> no sliding
    d.path.push({ t: recT(), x: d.x, y: ny });
  }

  function onPointerUp() {
    if (!dragRef.current) return;
    const { h } = sizeRef.current;
    const L = layoutRef.current; if (!L) return;
    const d = dragRef.current;
    const t = recT();
    const yp = d.y * h;
    let placedAfter = d.fromPlaced;
    if (!d.fromPlaced && yp < L.thresholdY) placedAfter = true;
    else if (d.fromPlaced && yp > L.thresholdY) placedAfter = false;
    const finalY = placedAfter ? L.boxCenterYNorm : L.homeYNorm;
    d.path.push({ t, x: colX(d.chip), y: finalY });
    gesturesRef.current.push({ chip: d.chip, t0: d.path[0].t, t1: t, placedAfter, path: d.path });
    placedRef.current = placedRef.current.map((v, idx) => (idx === d.chip ? placedAfter : v));
    setPlaced(placedRef.current);
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
        activity_mode: activity.mode,
        student_name: studentName || 'Estudiante',
        class_name: '',
        item_text: current.text,
        item_index: order[pos],
        tile_count: BOX_COUNT,
        placed_count: placedCount,
        correct_count: correct,
        is_correct: placedCount === correct,
        placements_data: JSON.stringify(gesturesRef.current),
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
    setPos((p) => (p + 1) % activity.items.length);
    resetItem();
  }

  function speak() {
    playTts(current.text, 'es');
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
          Fichas: <b className="text-indigo-600">{placedCount}</b>
          {phase === 'submitted' && <> · Correcto: <b className={placedCount === correct ? 'text-green-600' : 'text-amber-600'}>{correct}</b></>}
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
            <span className={`font-bold text-lg ${placedCount === correct ? 'text-green-600' : 'text-amber-600'}`}>
              {placedCount === correct ? '¡Correcto! 🎉' : `Colocaste ${placedCount} · era ${correct}`}
            </span>
            <button onClick={next} className="px-5 py-2 rounded-lg bg-indigo-600 text-white font-bold">Siguiente</button>
          </>
        )}
      </div>

      {submitError && <div className="text-center text-sm text-red-600">{submitError}</div>}

      <div>
        <div className="font-bold text-slate-700 text-sm mb-1">Arrastra una ficha hacia arriba por cada {unitWord}</div>
        <div className="w-full rounded-xl bg-white border-2 border-slate-200" style={{ aspectRatio: ASPECT }}>
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
        <button onClick={resetItem} className="px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold text-sm flex items-center gap-1.5">
          <RefreshCw className="w-4 h-4" /> Reiniciar
        </button>
      </div>
    </div>
  );
}