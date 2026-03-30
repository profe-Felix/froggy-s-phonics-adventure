import React, { useRef, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

export default function NumberWritingCanvas({ number, studentNumber, className, onDone }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [saving, setSaving] = useState(false);
  const lastPos = useRef(null);

  const getPos = (e, canvas) => {
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
    const canvas = canvasRef.current;
    const pos = getPos(e, canvas);
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos;
    setDrawing(true);
    setHasDrawn(true);
  }, []);

  const draw = useCallback((e) => {
    e.preventDefault();
    if (!drawing) return;
    const canvas = canvasRef.current;
    const pos = getPos(e, canvas);
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#4338ca';
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  }, [drawing]);

  const endDraw = useCallback((e) => {
    e.preventDefault();
    if (!drawing) return;
    setDrawing(false);
    setStrokeCount(s => s + 1);
  }, [drawing]);

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setStrokeCount(0);
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
      stroke_count: strokeCount,
    });
    setSaving(false);
    onDone();
  };

  return (
    <div className="flex flex-col items-center gap-4 select-none">
      <p className="text-white/80 text-lg font-medium">Write the number you heard:</p>

      <div className="relative">
        {/* Ghost guide number */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[120px] font-bold text-white/10 leading-none">{number}</span>
        </div>
        <canvas
          ref={canvasRef}
          width={280}
          height={320}
          className="rounded-2xl border-4 border-white/40 bg-white/10 touch-none cursor-crosshair"
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