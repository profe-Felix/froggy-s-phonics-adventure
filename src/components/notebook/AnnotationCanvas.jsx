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

  const activePointers = useRef(new Set());
  const drawingPointerId = useRef(null);

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
    return {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
      t: Date.now(),
    };
  };

  const releaseCaptureIfAny = (c, id) => {
    if (id == null) return;
    try {
      c.releasePointerCapture(id);
    } catch {}
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    const shouldDraw = (e) => {
      if (mode !== 'draw') return false;

      const allowed =
        tool === 'pen' ||
        tool === 'highlighter' ||
        tool === 'eraser_object' ||
        tool === 'eraser_pixel';

      if (!allowed) return false;

      // Apple Pencil / pen always draws
      if (e.pointerType === 'pen') return true;

      // One finger draws; second finger should allow scroll
      return activePointers.current.size <= 1;
    };

    const makeToolName = () => {
      if (tool === 'highlighter') return 'highlighter';
      if (tool === 'eraser_object') return 'eraser_object';
      if (tool === 'eraser_pixel') return 'eraser_pixel';
      return 'pen';
    };

    const endStroke = () => {
      if (current.current) {
        if (current.current.pts.length > 1) {
          strokes.current.push(current.current);
        }
        current.current = null;
        redraw();
        onStrokeEnd?.();
      }
      releaseCaptureIfAny(c, drawingPointerId.current);
      drawingPointerId.current = null;
    };

    const onPointerDown = (e) => {
      if (e.pointerType !== 'pen') {
        activePointers.current.add(e.pointerId);
      }

      // If a second finger goes down while drawing with a finger, stop drawing.
      if (
        activePointers.current.size > 1 &&
        drawingPointerId.current != null &&
        e.pointerType !== 'pen'
      ) {
        endStroke();
        return;
      }

      if (!shouldDraw(e)) return;

      drawingPointerId.current = e.pointerId;

      // Capture finger input once drawing starts.
      // Do not capture pen so two-finger scroll can still happen while using Pencil.
      if (e.pointerType !== 'pen') {
        try {
          c.setPointerCapture(e.pointerId);
        } catch {}
      }

      const p = getPos(e);
      current.current = {
        color,
        size,
        tool: makeToolName(),
        pts: [p],
      };
      redraw();

      // Only block default once we actually committed to drawing with a finger
      if (e.pointerType !== 'pen') e.preventDefault?.();
    };

    const onPointerMove = (e) => {
      // If a second finger is present, stop drawing and let scroll happen
      if (e.pointerType !== 'pen' && activePointers.current.size > 1) {
        if (drawingPointerId.current === e.pointerId) {
          endStroke();
        }
        return;
      }

      if (drawingPointerId.current !== e.pointerId) return;
      if (!current.current || !shouldDraw(e)) {
        endStroke();
        return;
      }

      const p = getPos(e);
      current.current.pts.push(p);
      redraw();

      if (e.pointerType !== 'pen') e.preventDefault?.();
    };

    const onPointerUp = (e) => {
      if (e.pointerType !== 'pen') {
        activePointers.current.delete(e.pointerId);
      }
      if (drawingPointerId.current === e.pointerId) {
        endStroke();
      }
      releaseCaptureIfAny(c, e.pointerId);
    };

    const onPointerCancel = (e) => {
      if (e.pointerType !== 'pen') {
        activePointers.current.delete(e.pointerId);
      }
      if (drawingPointerId.current === e.pointerId) {
        endStroke();
      }
      releaseCaptureIfAny(c, e.pointerId);
    };

    c.addEventListener('pointerdown', onPointerDown, { passive: false });
    c.addEventListener('pointermove', onPointerMove, { passive: false });
    c.addEventListener('pointerup', onPointerUp, { passive: true });
    c.addEventListener('pointercancel', onPointerCancel, { passive: true });

    return () => {
      c.removeEventListener('pointerdown', onPointerDown);
      c.removeEventListener('pointermove', onPointerMove);
      c.removeEventListener('pointerup', onPointerUp);
      c.removeEventListener('pointercancel', onPointerCancel);
      activePointers.current.clear();
      drawingPointerId.current = null;
      current.current = null;
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
      redraw();
    },
    clearStrokes: () => {
      strokes.current = [];
      current.current = null;
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
        touchAction: mode === 'draw' ? 'pan-y' : 'auto',
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