import React, { useRef, useState, useCallback } from 'react';

export default function SimpleWritingCanvas({ onDone }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
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
    ctx.lineWidth = 6;
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
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <div className="relative rounded-2xl border-4 border-indigo-200 overflow-hidden" style={{ width: 260, height: 180, background: '#f8fbff' }}>
        {/* Writing lines */}
        <svg className="absolute inset-0 pointer-events-none" width="260" height="180">
          <line x1="0" y1="30"  x2="260" y2="30"  stroke="#aac4e0" strokeWidth="1" />
          <line x1="0" y1="80"  x2="260" y2="80"  stroke="#aac4e0" strokeWidth="1" strokeDasharray="6,4" />
          <line x1="0" y1="130" x2="260" y2="130" stroke="#3b82f6" strokeWidth="1.5" />
          <line x1="0" y1="160" x2="260" y2="160" stroke="#aac4e0" strokeWidth="1" />
        </svg>
        <canvas
          ref={canvasRef}
          width={260}
          height={180}
          className="absolute inset-0 touch-none cursor-crosshair"
          style={{ background: 'transparent' }}
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
        <button onClick={clear} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 font-bold hover:bg-gray-200">
          🗑 Clear
        </button>
        <button
          onClick={onDone}
          disabled={!hasDrawn}
          className="px-6 py-2 rounded-xl bg-indigo-600 text-white font-bold shadow disabled:opacity-40 hover:bg-indigo-700"
        >
          Next →
        </button>
      </div>
    </div>
  );
}