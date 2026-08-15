import { useRef, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { BOX_COUNT, ASPECT, layoutFor, drawScene } from './countingLayout';

// Student's read-only counting mirror. Renders the teacher's broadcast state:
// chips appear at home/in-box/live-drag positions so students see the teacher
// modeling the count in real time. No interaction — locked until "try".
export default function CountingMirrorCanvas({ broadcast }) {
  const canvasRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const layoutRef = useRef(null);
  const rafRef = useRef(0);
  const stateRef = useRef({ placed: Array(BOX_COUNT).fill(false), drag: null });

  // Keep the latest broadcast in a ref for the draw loop.
  useEffect(() => {
    if (!broadcast || broadcast.type !== 'counting') return;
    stateRef.current = {
      placed: broadcast.placed || Array(BOX_COUNT).fill(false),
      drag: broadcast.drag || null,
    };
  }, [broadcast]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas.parentElement);
    resize();
    const loop = () => { draw(); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => { ro.disconnect(); cancelAnimationFrame(rafRef.current); };
  }, []);

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
    drawScene(ctx, w, h, L, stateRef.current.placed, stateRef.current.drag);
  }

  const hasBroadcast = broadcast?.type === 'counting';
  const placedCount = hasBroadcast ? (broadcast.placed || []).filter(Boolean).length : 0;
  const itemText = hasBroadcast ? broadcast.itemText : '';

  return (
    <div className="flex flex-col gap-3 p-4 max-w-2xl mx-auto w-full">
      <div className="rounded-2xl bg-white border-2 border-slate-200 p-4 sm:p-6 text-center shadow-sm">
        {hasBroadcast && broadcast.inLabel && (
          <div className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-2">{broadcast.inLabel}</div>
        )}
        <div className="text-2xl sm:text-3xl font-bold text-slate-800 leading-snug min-h-[2.5rem]">
          {itemText || 'Waiting for your teacher…'}
        </div>
        {hasBroadcast && (
          <div className="mt-2 text-sm font-semibold text-slate-500">
            Chips: <b className="text-indigo-600">{placedCount}</b>
            {broadcast.correct ? <> · answer {broadcast.correct}</> : null}
          </div>
        )}
      </div>

      <div className="w-full rounded-xl bg-white border-2 border-slate-200" style={{ aspectRatio: ASPECT }}>
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      <div className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
        <Lock className="w-3.5 h-3.5" /> Watch your teacher — try it yourself when they say go
      </div>
    </div>
  );
}