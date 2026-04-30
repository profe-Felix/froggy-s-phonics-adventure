import { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';

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

// Returns true if point (px, py) in canvas coords is within hitDist of stroke s
function strokeHitTest(s, px, py, w, h, hitDist = 18) {
  if (!s.pts || s.pts.length === 0) return false;
  for (let i = 0; i < s.pts.length; i++) {
    const spx = s.pts[i].x * w;
    const spy = s.pts[i].y * h;
    const dx = spx - px, dy = spy - py;
    if (dx * dx + dy * dy <= hitDist * hitDist) return true;
  }
  return false;
}

const AnnotationCanvas = forwardRef(function AnnotationCanvas(
  { width, height, color, size, tool, mode = 'draw', onStrokeStart, onStrokeEnd },
  ref
) {
  const canvasRef = useRef(null);
  const strokes = useRef([]);
  const current = useRef(null);
  const drawing = useRef(false);
  const [eraserCursorPos, setEraserCursorPos] = useState(null); // {x, y} in px for pixel eraser cursor

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

    // Clear in CSS-pixel space because the context is scaled to DPR.
    ctx.clearRect(0, 0, width, height);

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
    if (tool === 'laser' || tool === 'none') return 'laser'; // handled outside canvas
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
    onStrokeStart?.();
    redraw();
  };

  const finishStroke = () => {
    if (!drawing.current || !current.current) return;

    // Keep even very short strokes/taps.
    if (current.current.pts.length >= 1) {
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

    // Stroke eraser: remove any stroke that the pointer touches
    const eraseStrokeAt = (p) => {
      const px = p.x * width;
      const py = p.y * height;
      const hitDist = Math.max(12, size * 3);
      const before = strokes.current.length;
      strokes.current = strokes.current.filter(s => !strokeHitTest(s, px, py, width, height, hitDist));
      if (strokes.current.length !== before) {
        redraw();
        onStrokeEnd?.();
      }
    };

    const onMouseDown = (e) => {
      if (mode !== 'draw') return;
      if (tool === 'laser' || tool === 'none') return;
      e.preventDefault();
      if (tool === 'eraser_object') {
        drawing.current = true;
        eraseStrokeAt(getPos(e));
        return;
      }
      beginStrokeAt(getPos(e));
    };

    const onMouseMove = (e) => {
      // Update eraser cursor position for both erasers
      if (tool === 'eraser_pixel' || tool === 'eraser_object') {
        const r = c.getBoundingClientRect();
        setEraserCursorPos({ x: e.clientX - r.left, y: e.clientY - r.top });
      } else {
        setEraserCursorPos(null);
      }

      if (tool === 'eraser_object' && drawing.current) {
        e.preventDefault();
        eraseStrokeAt(getPos(e));
        return;
      }
      if (!drawing.current || !current.current) return;
      e.preventDefault();
      const p = getPos(e);
      current.current.pts.push(p);
      redraw();
    };

    const onMouseUp = () => {
      if (tool === 'eraser_object') { drawing.current = false; return; }
      finishStroke();
    };

    const onMouseLeave = () => {
      setEraserCursorPos(null);
      if (tool === 'eraser_object') { drawing.current = false; return; }
      finishStroke();
    };

    const onTouchStart = (e) => {
      if (mode !== 'draw') return;
      if (tool === 'laser' || tool === 'none') return;
      if (e.touches.length >= 2) { cancelStrokeForScroll(); return; }
      e.preventDefault();
      if (tool === 'eraser_object') {
        drawing.current = true;
        eraseStrokeAt(getPos(e));
        return;
      }
      beginStrokeAt(getPos(e));
    };

    const onTouchMove = (e) => {
      if (e.touches.length >= 2) { cancelStrokeForScroll(); return; }
      if (tool === 'eraser_object' && drawing.current) {
        e.preventDefault();
        eraseStrokeAt(getPos(e));
        return;
      }
      if (!drawing.current || !current.current) return;
      e.preventDefault();
      const p = getPos(e);
      current.current.pts.push(p);
      redraw();
    };

    const onTouchEnd = () => {
      if (tool === 'eraser_object') { drawing.current = false; return; }
      finishStroke();
    };

    const onTouchCancel = () => {
      cancelStrokeForScroll();
    };

    c.addEventListener('mousedown', onMouseDown);
    c.addEventListener('mousemove', onMouseMove);
    c.addEventListener('mouseup', onMouseUp);
    c.addEventListener('mouseleave', onMouseLeave);

    c.addEventListener('touchstart', onTouchStart, { passive: false });
    c.addEventListener('touchmove', onTouchMove, { passive: false });
    c.addEventListener('touchend', onTouchEnd);
    c.addEventListener('touchcancel', onTouchCancel);

    return () => {
      c.removeEventListener('mousedown', onMouseDown);
      c.removeEventListener('mousemove', onMouseMove);
      c.removeEventListener('mouseup', onMouseUp);
      c.removeEventListener('mouseleave', onMouseLeave);

      c.removeEventListener('touchstart', onTouchStart);
      c.removeEventListener('touchmove', onTouchMove);
      c.removeEventListener('touchend', onTouchEnd);
      c.removeEventListener('touchcancel', onTouchCancel);

      current.current = null;
      drawing.current = false;
    };
  }, [mode, color, size, tool, width, height, onStrokeStart, onStrokeEnd]);

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
        strokes.current = raw.map((s) => ({
          ...s,
          pts: s.pts.map((p) => ({ ...p, x: p.x / sw, y: p.y / sh })),
        }));
      } else {
        strokes.current = raw;
      }

      current.current = null;
      drawing.current = false;
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
      (data?.strokes || []).forEach((s) => {
        s.pts.forEach((p) => allPts.push({ ...p, stroke: s }));
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
    },
  }));

  // Pixel eraser: lineWidth = size * 1.5, so radius = size * 0.75
  // Object eraser: hitDist = max(12, size * 3), so radius = max(12, size * 3)
  const pixelEraserRadius = Math.max(4, size * 0.75);
  const objectEraserRadius = Math.max(12, size * 3);
  const eraserRadius = tool === 'eraser_pixel' ? pixelEraserRadius : objectEraserRadius;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, width: width + 'px', height: height + 'px' }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: width + 'px',
          height: height + 'px',
          touchAction: mode === 'draw' ? 'pan-x pan-y' : 'auto',
          pointerEvents: mode === 'draw' ? 'auto' : 'none',
          cursor: tool === 'eraser_pixel' || tool === 'eraser_object' ? 'none' : 'crosshair',
          background: 'transparent',
        }}
      />
      {/* Eraser cursor overlay */}
      {eraserCursorPos && (tool === 'eraser_pixel' || tool === 'eraser_object') && (
        <div
          style={{
            position: 'absolute',
            left: eraserCursorPos.x - eraserRadius,
            top: eraserCursorPos.y - eraserRadius,
            width: eraserRadius * 2,
            height: eraserRadius * 2,
            borderRadius: '50%',
            background: tool === 'eraser_object'
              ? 'rgba(220,38,38,0.25)'
              : 'rgba(150,150,150,0.35)',
            border: tool === 'eraser_object'
              ? '2px solid rgba(220,38,38,0.8)'
              : '2px solid rgba(100,100,100,0.6)',
            pointerEvents: 'none',
            zIndex: 20,
          }}
        />
      )}
    </div>
  );
});

export default AnnotationCanvas;