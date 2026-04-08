import React, { useRef, useState, useCallback } from 'react';

// onDone(strokesData, dataUrl)
export default function SimpleWritingCanvas({ onDone }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const allStrokes = useRef([]);
  const currentStroke = useRef([]);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [done, setDone] = useState(false);
  const [dataUrl, setDataUrl] = useState(null);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY, t: Date.now() };
  };

  const startDraw = useCallback((e) => {
    if (done) return;
    e.preventDefault();
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos;
    currentStroke.current = [pos];
    drawing.current = true;
    setHasDrawn(true);
  }, [done]);

  const draw = useCallback((e) => {
    if (done) return;
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
    currentStroke.current.push(pos);
  }, [done]);

  const endDraw = useCallback((e) => {
    if (done) return;
    e.preventDefault();
    if (!drawing.current) return;
    drawing.current = false;
    if (currentStroke.current.length > 0) {
      allStrokes.current = [...allStrokes.current, currentStroke.current];
      currentStroke.current = [];
    }
  }, [done]);

  const clear = () => {
    if (done) return;
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    allStrokes.current = [];
    currentStroke.current = [];
    setHasDrawn(false);
  };

  const handleDone = () => {
    const canvas = canvasRef.current;
    const url = canvas.toDataURL('image/png');
    setDataUrl(url);
    setDone(true);
    onDone(allStrokes.current, url);
  };

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <div className="relative rounded-2xl border-4 overflow-hidden"
        style={{ width: 150, height: 110, background: '#f8fbff', borderColor: done ? '#6366f1' : '#c7d2fe' }}>
        <svg className="absolute inset-0 pointer-events-none" width="150" height="110">
          <line x1="0" y1="18"  x2="150" y2="18"  stroke="#aac4e0" strokeWidth="1" />
          <line x1="0" y1="50"  x2="150" y2="50"  stroke="#aac4e0" strokeWidth="1" strokeDasharray="6,4" />
          <line x1="0" y1="82" x2="150" y2="82" stroke="#3b82f6" strokeWidth="1.5" />
          <line x1="0" y1="100" x2="150" y2="100" stroke="#aac4e0" strokeWidth="1" />
        </svg>
        <canvas
          ref={canvasRef}
          width={180}
          height={120}
          className="absolute inset-0 touch-none"
          style={{ background: 'transparent', cursor: done ? 'default' : 'crosshair' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {done && (
          <div className="absolute top-1 right-2 text-green-500 font-bold text-lg">✓</div>
        )}
      </div>
      {!done && (
        <div className="flex gap-2 w-full" style={{ width: 150 }}>
          <button onClick={clear} className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 text-sm">
            🗑 Clear
          </button>
          <button
            onClick={handleDone}
            disabled={!hasDrawn}
            className="flex-1 py-2 rounded-xl bg-indigo-600 text-white font-bold shadow disabled:opacity-40 hover:bg-indigo-700 text-sm"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}