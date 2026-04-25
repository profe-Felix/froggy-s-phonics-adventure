import React, { useRef, useState, useCallback } from 'react';

/**
 * Full-width writing canvas with primary lines.
 * Student writes the word, then presses "Done Writing → Build It"
 * onDone(strokesData, dataUrl) is called.
 */
export default function SpellingWriteStep({ word, onDone, onPlaySound }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const allStrokes = useRef([]);
  const currentStroke = useRef([]);
  const [hasDrawn, setHasDrawn] = useState(false);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top) * scaleY,
      t: Date.now()
    };
  };

  const startDraw = useCallback((e) => {
    e.preventDefault();
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos;
    currentStroke.current = [pos];
    drawing.current = true;
    setHasDrawn(true);
  }, []);

  const draw = useCallback((e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e40af';
    const prev = lastPos.current;
    const midX = (prev.x + pos.x) / 2;
    const midY = (prev.y + pos.y) / 2;
    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(midX, midY);
    lastPos.current = pos;
    currentStroke.current.push(pos);
  }, []);

  const endDraw = useCallback((e) => {
    e.preventDefault();
    if (!drawing.current) return;
    drawing.current = false;
    if (currentStroke.current.length > 0) {
      allStrokes.current = [...allStrokes.current, currentStroke.current];
      currentStroke.current = [];
    }
  }, []);

  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    allStrokes.current = [];
    currentStroke.current = [];
    setHasDrawn(false);
  };

  const handleDone = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    // Render final image: bg + guide lines + strokes
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#f0f7ff';
    ctx.fillRect(0, 0, w, h);

    // Draw guide lines (3 rows of primary lines)
    const lineY = (row, offset) => Math.round(row * (h / 3) + offset * (h / 3));
    [0, 1, 2].forEach(row => {
      const top = lineY(row, 0.05);
      const mid = lineY(row, 0.4);
      const base = lineY(row, 0.72);
      // top line
      ctx.save(); ctx.strokeStyle = '#b0c4de'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(w, top); ctx.stroke();
      // mid dashed
      ctx.setLineDash([8, 5]); ctx.strokeStyle = '#b0c4de';
      ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
      ctx.setLineDash([]);
      // baseline solid blue
      ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, base); ctx.lineTo(w, base); ctx.stroke();
      ctx.restore();
    });

    // Redraw strokes
    ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1e40af';
    allStrokes.current.forEach(stroke => {
      if (stroke.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) {
        const prev = stroke[i - 1];
        const cur = stroke[i];
        ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + cur.x) / 2, (prev.y + cur.y) / 2);
      }
      ctx.stroke();
    });

    const url = canvas.toDataURL('image/png');
    onDone(allStrokes.current, url);
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4 w-full max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <p className="text-lg font-black text-indigo-700">✏️ Write the word:</p>
        <button onClick={onPlaySound}
          className="w-10 h-10 rounded-full bg-indigo-100 hover:bg-indigo-200 flex items-center justify-center text-lg">
          🔊
        </button>
      </div>

      {/* Canvas with primary guide lines drawn via SVG overlay */}
      <div className="relative rounded-2xl border-4 border-indigo-300 overflow-hidden w-full"
        style={{ height: 180, background: '#f0f7ff' }}>
        {/* SVG guide lines — 3 rows */}
        <svg className="absolute inset-0 pointer-events-none w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 180">
          {[0, 1, 2].map(row => {
            const rowH = 60;
            const top = row * rowH + 3;
            const mid = row * rowH + 24;
            const base = row * rowH + 43;
            return (
              <g key={row}>
                <line x1="0" y1={top} x2="400" y2={top} stroke="#b0c4de" strokeWidth="1" />
                <line x1="0" y1={mid} x2="400" y2={mid} stroke="#b0c4de" strokeWidth="1" strokeDasharray="8,5" />
                <line x1="0" y1={base} x2="400" y2={base} stroke="#3b82f6" strokeWidth="1.5" />
              </g>
            );
          })}
        </svg>
        <canvas
          ref={canvasRef}
          width={800}
          height={360}
          className="absolute inset-0 touch-none w-full h-full"
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

      <div className="flex gap-3 w-full">
        <button onClick={clear}
          className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 text-base">
          🗑 Clear
        </button>
        <button
          onClick={handleDone}
          disabled={!hasDrawn}
          className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white font-bold shadow-lg disabled:opacity-40 hover:bg-indigo-700 text-base">
          Done Writing → Build It
        </button>
      </div>
    </div>
  );
}