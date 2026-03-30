import React, { useRef, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

export default function NumberWritingCanvas({ number, studentNumber, className, onDone }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [saving, setSaving] = useState(false);

  // Stroke recording
  const allStrokes = useRef([]); // array of strokes, each stroke = [{x,y,t}, ...]
  const currentStroke = useRef([]);
  const lastPos = useRef(null);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top) * scaleY,
      t: Date.now(),
    };
  };

  const startDraw = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const pos = getPos(e, canvas);
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos;
    currentStroke.current = [pos];
    setDrawing(true);
    setHasDrawn(true);
  }, []);

  const draw = useCallback((e) => {
    e.preventDefault();
    if (!drawing) return;
    const canvas = canvasRef.current;
    const pos = getPos(e, canvas);
    const ctx = canvas.getContext('2d');

    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#4338ca';

    // Smooth with quadratic bezier using midpoint
    const prev = lastPos.current;
    const midX = (prev.x + pos.x) / 2;
    const midY = (prev.y + pos.y) / 2;
    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(midX, midY);

    lastPos.current = pos;
    currentStroke.current.push(pos);
  }, [drawing]);

  const endDraw = useCallback((e) => {
    e.preventDefault();
    if (!drawing) return;
    setDrawing(false);
    if (currentStroke.current.length > 0) {
      allStrokes.current = [...allStrokes.current, currentStroke.current];
      currentStroke.current = [];
    }
  }, [drawing]);

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    allStrokes.current = [];
    currentStroke.current = [];
    setHasDrawn(false);
  };

  const submit = async () => {
    setSaving(true);
    const canvas = canvasRef.current;
    const dataUrl = canvas.toDataURL('image/png');
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], `${studentNumber}_${number}.png`, { type: 'image/png' });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await base44.entities.NumberWritingSample.create({
      student_number: studentNumber,
      class_name: className,
      number,
      image_url: file_url,
      stroke_count: allStrokes.current.length,
      strokes_data: JSON.stringify(allStrokes.current),
    });
    setSaving(false);
    onDone();
  };

  return (
    <div className="flex flex-col items-center gap-4 select-none">
      <p className="text-white/80 text-lg font-medium">Write the number you heard:</p>

      <div className="relative rounded-2xl border-4 border-blue-200 overflow-hidden" style={{ width: 280, height: 320, background: '#f8fbff' }}>
        <svg className="absolute inset-0 pointer-events-none" width="280" height="320">
          {[0, 1].map(set => {
            const top  = 40  + set * 140;
            const mid  = top + 50;
            const base = top + 100;
            const desc = top + 130;
            return (
              <g key={set}>
                <line x1="0" y1={top}  x2="280" y2={top}  stroke="#aac4e0" strokeWidth="1" />
                <line x1="0" y1={mid}  x2="280" y2={mid}  stroke="#aac4e0" strokeWidth="1" strokeDasharray="6,4" />
                <line x1="0" y1={base} x2="280" y2={base} stroke="#3b82f6" strokeWidth="1.5" />
                <line x1="0" y1={desc} x2="280" y2={desc} stroke="#aac4e0" strokeWidth="1" />
              </g>
            );
          })}
        </svg>
        <div className="absolute top-2 right-3 text-2xl opacity-30 pointer-events-none">✏️</div>
        <canvas
          ref={canvasRef}
          width={280}
          height={320}
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

      <div className="flex gap-3 mt-2">
        <button
          onClick={clear}
          className="px-5 py-2 rounded-xl bg-white/20 text-white font-bold hover:bg-white/30"
        >
          🗑 Clear
        </button>
        <button
          onClick={submit}
          disabled={!hasDrawn || saving}
          className="px-6 py-2 rounded-xl bg-white text-indigo-700 font-bold shadow disabled:opacity-40 hover:bg-indigo-50"
        >
          {saving ? 'Saving…' : 'Next →'}
        </button>
      </div>
    </div>
  );
}