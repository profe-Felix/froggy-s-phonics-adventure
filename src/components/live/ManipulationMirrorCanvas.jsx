import { useRef, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { colX, trayXNorm, layoutFor, drawScene } from './manipulationLayout';

// Student's read-only phoneme-manipulation mirror. Renders the teacher's
// broadcast state: colored chips appear in the sound boxes and a live chip
// follows the teacher's drag, so students see substitution modeled in real
// time. No interaction — locked until "try".
export default function ManipulationMirrorCanvas({ broadcast }) {
  const canvasRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const layoutRef = useRef(null);
  const rafRef = useRef(0);
  const stateRef = useRef({ placed: [], drag: null });

  const hasBroadcast = broadcast?.type === 'manipulation';
  const pal = (Array.isArray(broadcast?.palette) && broadcast.palette.length) ? broadcast.palette : ['#4DA6FF', '#F87171'];
  const N = broadcast?.boxCount || 2;

  useEffect(() => {
    if (!hasBroadcast) return;
    stateRef.current = {
      placed: broadcast.placed || [],
      drag: broadcast.drag || null,
    };
  }, [broadcast, hasBroadcast]);

  // Recompute layout when the box count changes (new item with a different word).
  useEffect(() => {
    const { w, h } = sizeRef.current;
    if (w && h) layoutRef.current = layoutFor(w, h, N);
  }, [N]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas.parentElement);
    resize();
    const loop = () => { draw(); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => { ro.disconnect(); cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resize() {
    const canvas = canvasRef.current; if (!canvas) return;
    const parent = canvas.parentElement;
    const w = parent.clientWidth, h = parent.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    sizeRef.current = { w, h, dpr };
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    layoutRef.current = layoutFor(w, h, N);
  }

  function draw() {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h, dpr } = sizeRef.current;
    const L = layoutRef.current;
    if (!w || !h || !L) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    drawScene(ctx, w, h, L, stateRef.current.placed, stateRef.current.drag, pal);
  }

  const placedCount = hasBroadcast ? (broadcast.placed || []).filter((v) => v != null).length : 0;

  return (
    <div className="flex flex-col gap-3 p-4 max-w-2xl mx-auto w-full">
      <div className="rounded-2xl bg-white border-2 border-slate-200 p-4 sm:p-6 text-center shadow-sm">
        {hasBroadcast && broadcast.inLabel && (
          <div className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-2">{broadcast.inLabel}</div>
        )}
        <div className="text-2xl sm:text-3xl font-bold text-slate-800 leading-snug min-h-[2.5rem]">
          {hasBroadcast ? broadcast.itemText : 'Waiting for your teacher…'}
        </div>
        {hasBroadcast && (
          <div className="mt-2 text-sm font-semibold text-slate-500">
            Chips: <b className="text-indigo-600">{placedCount}</b> / {broadcast.boxCount}
          </div>
        )}
      </div>

      <div className="w-full rounded-xl bg-white border-2 border-slate-200" style={{ aspectRatio: `${(N / 2.18).toFixed(2)} / 1` }}>
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      <div className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
        <Lock className="w-3.5 h-3.5" /> Watch your teacher — try it yourself when they say go
      </div>
    </div>
  );
}