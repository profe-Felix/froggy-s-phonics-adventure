import { useState, useRef, useEffect } from 'react';
import { RefreshCw, ChevronRight, Volume2 } from 'lucide-react';
import { MIN_BOXES, MAX_BOXES, colX, trayXNorm, layoutFor, drawScene } from './manipulationLayout';

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

// Teacher's phoneme-manipulation model canvas. Drag a colored chip from the tray
// (it clones — the source stays) onto a sound box to model a sound; drag a
// different color onto a filled box to model substitution. Every placement and
// the live drag position are broadcast so student iPads mirror the chips moving
// in real time. No recording or submission — this is pure modeling.
export default function ManipulationModelCanvas({ items, modeDef, palette, send }) {
  const pal = (Array.isArray(palette) && palette.length) ? palette : ['#4DA6FF', '#F87171'];
  const [pos, setPos] = useState(0);
  const [placed, setPlaced] = useState([]);
  const [drag, setDrag] = useState(null);

  const placedRef = useRef([]);
  const dragRef = useRef(null);
  const canvasRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const layoutRef = useRef(null);
  const rafRef = useRef(0);
  const NRef = useRef(MIN_BOXES);

  const hasItems = items.length > 0;
  const current = hasItems ? items[pos] || items[0] : null;
  const N = current ? clamp(current.answer || MIN_BOXES, MIN_BOXES, MAX_BOXES) : MIN_BOXES;

  const broadcast = (nextPlaced, nextDrag, itemIdx = pos, item = current) => {
    send({
      type: 'manipulation',
      placed: nextPlaced,
      drag: nextDrag,
      itemIndex: itemIdx,
      itemText: item?.text || '',
      boxCount: NRef.current,
      palette: pal,
      inLabel: modeDef?.in || '',
    });
  };

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas.parentElement);
    resize();
    const loop = () => { draw(); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => { ro.disconnect(); cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset + initial broadcast when the item changes so students see the right word.
  useEffect(() => {
    const n = current ? clamp(current.answer || MIN_BOXES, MIN_BOXES, MAX_BOXES) : MIN_BOXES;
    NRef.current = n;
    const p = Array(n).fill(null);
    placedRef.current = p;
    setPlaced(p);
    broadcast(p, null, pos, current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, items]);

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
    drawScene(ctx, w, h, L, placedRef.current, dragRef.current, pal);
  }

  function onPointerDown(e) {
    const { w, h } = sizeRef.current;
    const L = layoutRef.current; if (!L) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    // tray hit -> clone drag (source stays)
    for (let c = 0; c < pal.length; c++) {
      const tx = trayXNorm(c, pal.length) * w;
      if (Math.hypot(px - tx, py - L.trayY) < L.chipR * 1.5) {
        canvasRef.current.setPointerCapture(e.pointerId);
        const d = { type: 'clone', color: c, x: px / w, y: py / h };
        dragRef.current = d; setDrag(d);
        broadcast(placedRef.current, d);
        return;
      }
    }
    // placed hit -> lift it out (move/remove drag)
    const p = placedRef.current;
    for (let i = 0; i < L.n; i++) {
      if (p[i] == null) continue;
      const bx = colX(i, L.n) * w;
      if (Math.hypot(px - bx, py - L.boxCenterY) < L.chipR * 1.5) {
        canvasRef.current.setPointerCapture(e.pointerId);
        const color = p[i];
        const next = p.map((v, idx) => (idx === i ? null : v));
        placedRef.current = next; setPlaced(next);
        const d = { type: 'move', color, fromBox: i, x: px / w, y: py / h };
        dragRef.current = d; setDrag(d);
        broadcast(next, d);
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
    setDrag({ ...d });
    broadcast(placedRef.current, d);
  }

  function onPointerUp(e) {
    const d = dragRef.current; if (!d) return;
    const { w } = sizeRef.current;
    const L = layoutRef.current; if (!L) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    let target = null;
    if (py < L.thresholdY && px >= 0 && px < L.s * L.n) {
      target = clamp(Math.floor(px / L.s), 0, L.n - 1);
    }
    let next = placedRef.current;
    if (d.type === 'clone') {
      if (target != null) next = placedRef.current.map((v, idx) => (idx === target ? d.color : v));
    } else {
      if (target == null) {
        // dropped back to tray -> removed (already nulled on down)
      } else {
        next = placedRef.current.map((v, idx) => (idx === target ? d.color : v));
      }
    }
    placedRef.current = next; setPlaced(next);
    dragRef.current = null; setDrag(null);
    broadcast(next, null);
  }

  function reset() {
    const p = Array(NRef.current).fill(null);
    placedRef.current = p; setPlaced(p);
    dragRef.current = null; setDrag(null);
    broadcast(p, null);
  }

  function next() {
    setPos(p => (p + 1) % items.length);
  }

  function speak() {
    try {
      const u = new SpeechSynthesisUtterance(current.text);
      u.lang = 'es-ES'; u.rate = 0.85;
      window.speechSynthesis?.speak(u);
    } catch { /* best-effort */ }
  }

  if (!hasItems) {
    return <div className="p-6 text-slate-500 text-center">No items for this activity.</div>;
  }

  const placedCount = placed.filter((v) => v != null).length;

  return (
    <div className="flex flex-col gap-3 p-4 max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-400">Item {pos + 1} / {items.length}</span>
        <span className="ml-auto text-sm font-semibold text-slate-600">
          Chips: <b className="text-indigo-600">{placedCount}</b> / {N}
        </span>
      </div>

      <div className="rounded-2xl bg-white border-2 border-slate-200 p-4 sm:p-6 text-center shadow-sm">
        {modeDef?.in && <div className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-2">{modeDef.in}</div>}
        <div className="text-2xl sm:text-3xl font-bold text-slate-800 leading-snug">{current.text}</div>
        <button onClick={speak} className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-sm font-bold">
          <Volume2 className="w-4 h-4" /> Say it
        </button>
      </div>

      <div className="font-bold text-slate-700 text-sm">Drag a colored chip to each sound. Swap colors to change a sound — students see it live.</div>
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

      <div className="flex justify-center gap-2">
        <button onClick={reset} className="px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold text-sm flex items-center gap-1.5">
          <RefreshCw className="w-4 h-4" /> Reset
        </button>
        <button onClick={next} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold text-sm flex items-center gap-1.5">
          Next item <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}