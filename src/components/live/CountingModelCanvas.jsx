import { useState, useRef, useEffect } from 'react';
import { RefreshCw, ChevronRight, Volume2 } from 'lucide-react';
import { BOX_COUNT, ASPECT, colX, layoutFor, drawScene } from './countingLayout';

// Teacher's counting model canvas (counting_words / counting_phonemes). The
// teacher drags chips up into the boxes to model counting; every placement and
// the live drag position are broadcast so student iPads mirror the chips
// moving in real time. No recording or submission — this is pure modeling.
export default function CountingModelCanvas({ items, modeDef, send }) {
  const [pos, setPos] = useState(0);
  const [placed, setPlaced] = useState(() => Array(BOX_COUNT).fill(false));
  const [drag, setDrag] = useState(null); // { chip, x, y }

  const placedRef = useRef(Array(BOX_COUNT).fill(false));
  const dragRef = useRef(null);
  const canvasRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const layoutRef = useRef(null);
  const rafRef = useRef(0);

  const hasItems = items.length > 0;
  const current = hasItems ? items[pos] || items[0] : null;
  const correct = current ? current.answer : 0;
  const unitWord = modeDef?.what === 'palabras' ? 'palabra' : 'sonido';

  const broadcast = (nextPlaced, nextDrag, itemIdx = pos, item = current) => {
    send({
      type: 'counting',
      placed: nextPlaced,
      drag: nextDrag,
      itemIndex: itemIdx,
      itemText: item?.text || '',
      correct,
      unitWord,
      inLabel: modeDef?.in || '',
      mode: modeDef?.key || '',
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

  // Initial broadcast when the item changes so students see the right word.
  useEffect(() => {
    const p = Array(BOX_COUNT).fill(false);
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
    drawScene(ctx, w, h, L, placedRef.current, dragRef.current);
  }

  function onPointerDown(e) {
    const { w, h } = sizeRef.current;
    const L = layoutRef.current; if (!L) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const i = Math.min(BOX_COUNT - 1, Math.max(0, Math.floor(px / L.s)));
    const curYpx = placedRef.current[i] ? L.boxCenterY : L.homeY;
    if (Math.abs(py - curYpx) < L.chipR * 1.6) {
      canvasRef.current.setPointerCapture(e.pointerId);
      const d = { chip: i, fromPlaced: placedRef.current[i], x: colX(i), y: curYpx / h };
      dragRef.current = d;
      setDrag(d);
      broadcast(placedRef.current, d);
    }
  }

  function onPointerMove(e) {
    if (!dragRef.current) return;
    const { h } = sizeRef.current;
    const rect = canvasRef.current.getBoundingClientRect();
    const py = e.clientY - rect.top;
    const ny = Math.min(0.95, Math.max(0.05, py / h));
    const d = dragRef.current;
    d.y = ny; d.x = colX(d.chip);
    setDrag({ ...d });
    broadcast(placedRef.current, d);
  }

  function onPointerUp() {
    const d = dragRef.current; if (!d) return;
    const { h } = sizeRef.current;
    const L = layoutRef.current;
    const yp = d.y * h;
    let placedAfter = d.fromPlaced;
    if (!d.fromPlaced && yp < L.boxY1) placedAfter = true;
    else if (d.fromPlaced && yp > L.boxY1) placedAfter = false;
    const next = placedRef.current.map((v, idx) => (idx === d.chip ? placedAfter : v));
    placedRef.current = next;
    setPlaced(next);
    dragRef.current = null;
    setDrag(null);
    broadcast(next, null);
  }

  function reset() {
    const p = Array(BOX_COUNT).fill(false);
    placedRef.current = p;
    setPlaced(p);
    dragRef.current = null;
    setDrag(null);
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

  const placedCount = placed.filter(Boolean).length;

  return (
    <div className="flex flex-col gap-3 p-4 max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-400">Item {pos + 1} / {items.length}</span>
        <span className="ml-auto text-sm font-semibold text-slate-600">
          Chips: <b className="text-indigo-600">{placedCount}</b>{correct ? <> · answer {correct}</> : null}
        </span>
      </div>

      <div className="rounded-2xl bg-white border-2 border-slate-200 p-4 sm:p-6 text-center shadow-sm">
        {modeDef?.in && <div className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-2">{modeDef.in}</div>}
        <div className="text-2xl sm:text-3xl font-bold text-slate-800 leading-snug">{current.text}</div>
        <button onClick={speak} className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-sm font-bold">
          <Volume2 className="w-4 h-4" /> Say it
        </button>
      </div>

      <div className="font-bold text-slate-700 text-sm">Drag a chip up for each {unitWord} — students see it move.</div>
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