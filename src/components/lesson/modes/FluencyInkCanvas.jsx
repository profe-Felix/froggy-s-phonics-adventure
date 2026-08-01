import React, { useRef, useImperativeHandle, forwardRef, useState, useEffect } from 'react';

// Minimal touch/mouse ink overlay so a student can mark words as they read a
// fluency row. Parent calls ref.clear() between rows and ref.getStrokes() on
// stop. Pointer is only captured while `active` (recording).
const FluencyInkCanvas = forwardRef(function FluencyInkCanvas({ active }, ref) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const strokes = useRef([]);
  const [dim, setDim] = useState({ w: 0, h: 0 });

  const resize = () => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setDim({ w: r.width, h: r.height });
  };
  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const redraw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2563eb';
    for (const s of strokes.current) {
      if (s.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y);
      ctx.stroke();
    }
  };

  useImperativeHandle(ref, () => ({
    clear() { strokes.current = []; redraw(); },
    getStrokes() { return strokes.current.slice(); },
  }));

  useEffect(() => { redraw(); }, [dim]);

  const posOf = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  };
  const onDown = (e) => {
    if (!active) return;
    drawing.current = true;
    strokes.current.push([posOf(e)]);
    e.preventDefault();
  };
  const onMove = (e) => {
    if (!active || !drawing.current) return;
    const s = strokes.current[strokes.current.length - 1];
    s.push(posOf(e));
    redraw();
    e.preventDefault();
  };
  const onUp = () => { drawing.current = false; };

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        width={dim.w}
        height={dim.h}
        className="absolute inset-0 touch-none"
        style={{ pointerEvents: active ? 'auto' : 'none' }}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
        onTouchStart={onDown}
        onTouchMove={onMove}
        onTouchEnd={onUp}
      />
    </div>
  );
});

export default FluencyInkCanvas;