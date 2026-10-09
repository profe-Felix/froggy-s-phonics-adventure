import { useRef, useState, useCallback } from 'react';

// Blank writing canvas with primary writing lines (sky / fence / grass / dirt).
// Used in the AdaptiveWordPractice "try it first" step — the student attempts
// to write the target syllable or word freehand, then clicks Next to proceed
// to the keyboard build step. No accuracy check; this is a low-stakes first
// attempt so the student can see what they might be missing.
export default function FreehandWriteCanvas({ onNext }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  const CW = 800;
  const CH = 200;
  const SKY_Y = 30;
  const FENCE_Y = 80;
  const GRASS_Y = 130;
  const DIRT_Y = 170;

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = useCallback((e) => {
    e.preventDefault();
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos;
    drawing.current = true;
    setHasDrawn(true);
  }, []);

  const draw = useCallback((e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#4338ca';
    const prev = lastPos.current;
    const midX = (prev.x + pos.x) / 2;
    const midY = (prev.y + pos.y) / 2;
    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(midX, midY);
    lastPos.current = pos;
  }, []);

  const endDraw = useCallback((e) => {
    e.preventDefault();
    drawing.current = false;
  }, []);

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  return (
    <div className="flex flex-col items-center gap-4 select-none w-full">
      <div
        className="relative rounded-2xl border-4 border-blue-200 overflow-hidden w-full max-w-2xl"
        style={{ background: '#fff' }}
      >
        <svg
          className="absolute inset-0 pointer-events-none w-full"
          style={{ height: '100%' }}
          viewBox={`0 0 ${CW} ${CH}`}
          preserveAspectRatio="none"
        >
          <rect x="0" y="0" width={CW} height={FENCE_Y} fill="#e8f0fe" opacity="0.45" />
          <rect x="0" y={FENCE_Y} width={CW} height={GRASS_Y - FENCE_Y} fill="#e8f5e9" opacity="0.45" />
          <rect x="0" y={GRASS_Y} width={CW} height={DIRT_Y - GRASS_Y} fill="#fff3e0" opacity="0.45" />
          <line x1="0" y1={SKY_Y} x2={CW} y2={SKY_Y} stroke="#4a90e2" strokeWidth="2" />
          <line x1="0" y1={FENCE_Y} x2={CW} y2={FENCE_Y} stroke="#000" strokeWidth="1.5" strokeDasharray="8,5" />
          <line x1="0" y1={GRASS_Y} x2={CW} y2={GRASS_Y} stroke="#43a047" strokeWidth="2" />
          <line x1="0" y1={DIRT_Y} x2={CW} y2={DIRT_Y} stroke="#795548" strokeWidth="1.5" />
        </svg>
        <canvas
          ref={canvasRef}
          width={CW}
          height={CH}
          className="relative block w-full touch-none"
          style={{ background: 'transparent', cursor: 'crosshair' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      <div className="flex gap-3">
        <button
          onClick={clear}
          className="px-5 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 transition-colors"
        >
          🗑 Borrar
        </button>
        <button
          onClick={() => onNext?.()}
          className="px-8 py-2.5 rounded-xl bg-blue-600 text-white font-black shadow-md hover:bg-blue-700 transition-colors"
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}