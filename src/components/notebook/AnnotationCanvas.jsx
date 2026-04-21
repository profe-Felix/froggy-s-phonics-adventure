import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

function drawStroke(ctx, s, w, h) {
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
    const px = p.x * w;
    const py = p.y * h;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

const AnnotationCanvas = forwardRef(function AnnotationCanvas(
  { width, height, color, size, tool, mode = 'draw', onStrokeEnd },
  ref
) {
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
    ctx.clearRect(0, 0, c.width, c.height);
    for (const s of strokes.current) drawStroke(ctx, s, width, height);
    if (current.current) drawStroke(ctx, current.current, width, height);
  };

  useEffect(() => {
    setupCanvas();
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  const getPos = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - r.left) / r.width,
      y: (src.clientY - r.top) / r.height,
      t: Date.now(),
    };
  };

  const makeToolName = () => {
    if (tool === 'highlighter') return 'highlighter';
    if (tool === 'eraser_object') return 'eraser_object';
    if (tool === 'eraser_pixel') return 'eraser_pixel';
    return 'pen';
  };

  const beginStrokeAt = (p) => {
    current.current = {
      color,
      size,
      tool: makeToolName(),
      pts: [p],
    };
    drawing.current = true;
    redraw();
  };

  const finishStroke = () => {
    if (!drawing.current || !current.current) return;

    if (current.current.pts.length > 1) {
      strokes.current.push(current.current);
    }

    current.current = null;
    drawing.current = false;
    redraw();
    onStrokeEnd?.();
  };

  const cancelStrokeForScroll = () => {
    current.current = null;
    drawing.current = false;
    redraw();
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    const onMouseDown = (e) => {
      if (mode !== 'draw') return;
      e.preventDefault();
      beginStrokeAt(getPos(e));
    };

    const onMouseMove = (e) => {
      if (!drawing.current || !current.current) return;
      e.preventDefault();
      const p = getPos(e);
      current.current.pts.push(p);
      redraw();
    };

    const onMouseUp = () => {
      finishStroke();
    };

    const onTouchStart = (e) => {
      if (mode !== 'draw') return;

      if (e.touches.length >= 2) {
        cancelStrokeForScroll();
        return;
      }

      e.preventDefault();
      beginStrokeAt(getPos(e));
    };

    const onTouchMove = (e) => {
      if (e.touches.length >= 2) {
        cancelStrokeForScroll();
        return;
      }

      if (!drawing.current || !current.current) return;

      e.preventDefault();
      const p = getPos(e);
      current.current.pts.push(p);
      redraw();
    };

    const onTouchEnd = () => {
      finishStroke();
    };

    const onTouchCancel = () => {
      cancelStrokeForScroll();
    };

    c.addEventListener('mousedown', onMouseDown);
    c.addEventListener('mousemove', onMouseMove);
    c.addEventListener('mouseup', onMouseUp);
    c.addEventListener('mouseleave', onMouseUp);

    c.addEventListener('touchstart', onTouchStart, { passive: false });
    c.addEventListener('touchmove', onTouchMove, { passive: false });
    c.addEventListener('touchend', onTouchEnd);
    c.addEventListener('touchcancel', onTouchCancel);

    return () => {
      c.removeEventListener('mousedown', onMouseDown);
      c.removeEventListener('mousemove', onMouseMove);
      c.removeEventListener('mouseup', onMouseUp);
      c.removeEventListener('mouseleave', onMouseUp);

      c.removeEventListener('touchstart', onTouchStart);
      c.removeEventListener('touchmove', onTouchMove);
      c.removeEventListener('touchend', onTouchEnd);
      c.removeEventListener('touchcancel', onTouchCancel);

      cancelPendingTouch();
      current.current = null;
      drawing.current = false;
    };
  }, [mode, color, size, tool, width, height, onStrokeEnd]);

  useImperativeHandle(ref, () => ({
    getStrokes: () => ({ strokes: strokes.current }),
    loadStrokes: (data) => {
      if (!data) {
        strokes.current = [];
        redraw();
        return;
      }

      const raw = data.strokes || (Array.isArray(data) ? data : []);
      const sw = data.canvasWidth;
      const sh = data.canvasHeight;

      const samplePt = raw?.[0]?.pts?.[0];
      const alreadyNormalized =
        data?.normalized === true ||
        (samplePt && samplePt.x <= 1.5 && samplePt.y <= 1.5);

      if (sw && sh && !alreadyNormalized) {
        strokes.current = raw.map(s => ({
          ...s,
          pts: s.pts.map(p => ({ ...p, x: p.x / sw, y: p.y / sh }))
        }));
      } else {
        strokes.current = raw;
      }

      current.current = null;
      drawing.current = false;
      cancelPendingTouch();
      redraw();
    },
    clearStrokes: () => {
      strokes.current = [];
      current.current = null;
      drawing.current = false;
      redraw();
    },
    undo: () => {
      strokes.current.pop();
      redraw();
    },
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
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        width: width + 'px',
        height: height + 'px',
        touchAction: mode === 'draw' ? 'none' : 'auto',
        cursor:
          mode === 'draw'
            ? (tool === 'eraser_object' || tool === 'eraser_pixel' ? 'cell' : 'crosshair')
            : 'default',
        background: 'transparent',
      }}
    />
  );
});

export default AnnotationCanvas;