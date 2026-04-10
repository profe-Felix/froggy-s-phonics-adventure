import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

function drawStroke(ctx, s) {
  if (!s.pts || s.pts.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (s.tool === 'highlighter') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = s.color;
    ctx.lineWidth = Math.max(1, s.size * 2.5);
    ctx.globalAlpha = 0.35;
  } else if (s.tool === 'eraser_object') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(1, s.size * 6);
    ctx.globalAlpha = 1;
  } else if (s.tool === 'eraser_pixel') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(1, s.size * 1.5);
    ctx.globalAlpha = 1;
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = s.color;
    ctx.lineWidth = Math.max(1, s.size);
    ctx.globalAlpha = 1;
  }
  ctx.beginPath();
  for (let i = 0; i < s.pts.length; i++) {
    const p = s.pts[i];
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();
}

const AnnotationCanvas = forwardRef(function AnnotationCanvas({ width, height, color, size, tool, mode = 'draw' }, ref) {
  const canvasRef = useRef(null);
  const strokes = useRef([]);
  const current = useRef(null);
  const drawing = useRef(false);

  const setupCanvas = () => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = height * dpr;
    c.style.width = width + 'px';
    c.style.height = height + 'px';
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  };

  const redraw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const s of strokes.current) drawStroke(ctx, s);
    if (current.current) drawStroke(ctx, current.current);
  };

  useEffect(() => { setupCanvas(); redraw(); }, [width, height]);

  const getPos = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top, t: Date.now() };
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    const onDown = (e) => {
      if (mode !== 'draw') return;
      // Allow 2-finger scroll to pass through
      if (e.touches && e.touches.length >= 2) return;
      e.preventDefault();
      const p = getPos(e);
      const toolName = tool === 'highlighter' ? 'highlighter' : tool === 'eraser_object' ? 'eraser_object' : tool === 'eraser_pixel' ? 'eraser_pixel' : 'pen';
      current.current = { color, size, tool: toolName, pts: [p] };
      drawing.current = true;
      redraw();
    };
    const onMove = (e) => {
      if (!drawing.current || !current.current) return;
      // Allow 2-finger scroll
      if (e.touches && e.touches.length >= 2) { drawing.current = false; current.current = null; redraw(); return; }
      e.preventDefault();
      const p = getPos(e);
      current.current.pts.push(p);
      redraw();
    };
    const onUp = () => {
      if (!drawing.current || !current.current) return;
      if (current.current.pts.length > 1) strokes.current.push(current.current);
      current.current = null;
      drawing.current = false;
      redraw();
    };

    c.addEventListener('mousedown', onDown);
    c.addEventListener('mousemove', onMove);
    c.addEventListener('mouseup', onUp);
    c.addEventListener('mouseleave', onUp);
    c.addEventListener('touchstart', onDown, { passive: true });
    c.addEventListener('touchmove', onMove, { passive: false }); // must be non-passive to prevent scroll during single-finger draw
    c.addEventListener('touchend', onUp);
    return () => {
      c.removeEventListener('mousedown', onDown);
      c.removeEventListener('mousemove', onMove);
      c.removeEventListener('mouseup', onUp);
      c.removeEventListener('mouseleave', onUp);
      c.removeEventListener('touchstart', onDown);
      c.removeEventListener('touchmove', onMove);
      c.removeEventListener('touchend', onUp);
    };
  }, [mode, color, size, tool]);

  useImperativeHandle(ref, () => ({
    getStrokes: () => ({ strokes: strokes.current, canvasWidth: width, canvasHeight: height }),
    loadStrokes: (data) => {
      strokes.current = (data && data.strokes) ? data.strokes : [];
      current.current = null;
      redraw();
    },
    clearStrokes: () => { strokes.current = []; current.current = null; redraw(); },
    undo: () => { strokes.current.pop(); redraw(); },
    replayStrokes: (data, onFrame) => {
      const allPts = [];
      (data?.strokes || []).forEach(s => {
        s.pts.forEach(p => allPts.push({ ...p, stroke: s }));
      });
      allPts.sort((a, b) => (a.t || 0) - (b.t || 0));
      let i = 0;
      const step = () => {
        if (i >= allPts.length) return;
        if (onFrame) onFrame(allPts[i]);
        i++;
        requestAnimationFrame(step);
      };
      step();
    }
  }));

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', inset: 0, zIndex: 10,
        width: width + 'px', height: height + 'px',
        touchAction: mode === 'draw' ? 'pan-x pan-y' : 'auto',
        cursor: mode === 'draw' ? (tool === 'eraser_object' || tool === 'eraser_pixel' ? 'cell' : 'crosshair') : 'default',
        background: 'transparent',
      }}
    />
  );
});

export default AnnotationCanvas;