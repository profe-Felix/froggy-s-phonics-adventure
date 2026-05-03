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

// Returns true if point (px, py) in canvas coords is within hitDist of any point in stroke s
function strokeHitTest(s, px, py, w, h, hitDist) {
  if (!s.pts || s.pts.length === 0) return false;
  for (let i = 0; i < s.pts.length; i++) {
    const spx = s.pts[i].x * w;
    const spy = s.pts[i].y * h;
    const dx = spx - px, dy = spy - py;
    if (dx * dx + dy * dy <= hitDist * hitDist) return true;
  }
  return false;
}

/**
 * Split a stroke into sub-strokes by removing points within eraserRadius of (px, py).
 * Returns an array of strokes (0 if fully erased, 1 if untouched, 2+ if split).
 */
function splitStrokeByPixelErase(s, px, py, w, h, eraserRadius) {
  if (!s.pts || s.pts.length === 0) return [];

  const segments = [];
  let current = [];

  for (const pt of s.pts) {
    const spx = pt.x * w;
    const spy = pt.y * h;
    const dx = spx - px, dy = spy - py;
    const inside = (dx * dx + dy * dy) <= (eraserRadius * eraserRadius);

    if (inside) {
      // This point is erased — end current segment if it has points
      if (current.length > 0) {
        segments.push({ ...s, pts: current });
        current = [];
      }
    } else {
      current.push(pt);
    }
  }

  if (current.length > 0) {
    segments.push({ ...s, pts: current });
  }

  // Filter out single-point segments (invisible)
  return segments.filter(seg => seg.pts.length >= 2);
}

const AnnotationCanvas = forwardRef(function AnnotationCanvas(
  { width, height, color, size, tool, mode = 'draw', onStrokeStart, onStrokeEnd, passThrough = false },
  ref
) {
  const canvasRef = useRef(null);
  // strokes.current = current visible strokes array
  const strokes = useRef([]);
  // undoStack.current = array of stroke-array snapshots, for undo
  const undoStack = useRef([]);
  const current = useRef(null);
  const drawing = useRef(false);
  const [eraserCursorPos, setEraserCursorPos] = useState(null);

  const pushUndo = () => {
    undoStack.current.push([...strokes.current]);
    // Cap undo stack at 50
    if (undoStack.current.length > 50) undoStack.current.shift();
  };

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
    if (tool === 'laser' || tool === 'none') return 'laser';
    return 'pen';
  };

  const beginStrokeAt = (p) => {
    current.current = { color, size, tool: makeToolName(), pts: [p] };
    drawing.current = true;
    onStrokeStart?.();
    redraw();
  };

  const finishStroke = () => {
    if (!drawing.current || !current.current) return;
    if (current.current.pts.length >= 1) {
      pushUndo();
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

    // Object eraser: remove entire strokes touched by the pointer
    // We push undo once on mousedown, then erase freely until mouseup
    const eraseStrokeAt = (p) => {
      const px = p.x * width;
      const py = p.y * height;
      const hitDist = Math.max(8, size * 1.5);
      const before = strokes.current.length;
      strokes.current = strokes.current.filter(s => !strokeHitTest(s, px, py, width, height, hitDist));
      if (strokes.current.length !== before) {
        redraw();
        onStrokeEnd?.();
      }
    };

    // Pixel eraser: split strokes at the erased point
    // We push undo once on mousedown, then split freely until mouseup
    const pixelEraseAt = (p) => {
      const px = p.x * width;
      const py = p.y * height;
      const eraserRadius = Math.max(4, size * 0.75);

      let changed = false;
      const next = [];
      for (const s of strokes.current) {
        if (s.tool === 'eraser_pixel') {
          // Don't try to split eraser strokes themselves — just keep them
          next.push(s);
          continue;
        }
        if (strokeHitTest(s, px, py, width, height, eraserRadius)) {
          const split = splitStrokeByPixelErase(s, px, py, width, height, eraserRadius);
          next.push(...split);
          changed = true;
        } else {
          next.push(s);
        }
      }
      if (changed) {
        strokes.current = next;
        redraw();
        onStrokeEnd?.();
      }
    };

    // Track whether we've pushed undo for the current eraser drag
    const eraserUndoPushed = { current: false };

    const onMouseDown = (e) => {
      if (mode !== 'draw') return;
      if (tool === 'laser' || tool === 'none') return;
      e.preventDefault();
      if (tool === 'eraser_object') {
        drawing.current = true;
        eraserUndoPushed.current = false;
        pushUndo();
        eraserUndoPushed.current = true;
        eraseStrokeAt(getPos(e));
        return;
      }
      if (tool === 'eraser_pixel') {
        drawing.current = true;
        eraserUndoPushed.current = false;
        pushUndo();
        eraserUndoPushed.current = true;
        pixelEraseAt(getPos(e));
        return;
      }
      beginStrokeAt(getPos(e));
    };

    const onMouseMove = (e) => {
      if (tool === 'eraser_pixel' || tool === 'eraser_object') {
        const r = c.getBoundingClientRect();
        setEraserCursorPos({ x: e.clientX - r.left, y: e.clientY - r.top });
      } else {
        setEraserCursorPos(null);
      }

      if (!drawing.current) return;

      if (tool === 'eraser_object') {
        e.preventDefault();
        eraseStrokeAt(getPos(e));
        return;
      }
      if (tool === 'eraser_pixel') {
        e.preventDefault();
        pixelEraseAt(getPos(e));
        return;
      }
      if (!current.current) return;
      e.preventDefault();
      current.current.pts.push(getPos(e));
      redraw();
    };

    const onMouseUp = () => {
      if (tool === 'eraser_object' || tool === 'eraser_pixel') {
        drawing.current = false;
        eraserUndoPushed.current = false;
        return;
      }
      finishStroke();
    };

    const onMouseLeave = () => {
      setEraserCursorPos(null);
      if (tool === 'eraser_object' || tool === 'eraser_pixel') {
        drawing.current = false;
        eraserUndoPushed.current = false;
        return;
      }
      finishStroke();
    };

    const onTouchStart = (e) => {
      if (mode !== 'draw') return;
      if (tool === 'laser' || tool === 'none') return;
      if (passThrough) return; // let parent handle the tap (e.g. place mic)
      if (e.touches.length >= 2) { cancelStrokeForScroll(); return; }
      e.preventDefault();
      // Show eraser cursor on touch
      if (tool === 'eraser_pixel' || tool === 'eraser_object') {
        const r = c.getBoundingClientRect();
        const t0 = e.touches[0];
        setEraserCursorPos({ x: t0.clientX - r.left, y: t0.clientY - r.top });
      }
      if (tool === 'eraser_object') {
        drawing.current = true;
        if (!eraserUndoPushed.current) { pushUndo(); eraserUndoPushed.current = true; }
        eraseStrokeAt(getPos(e));
        return;
      }
      if (tool === 'eraser_pixel') {
        drawing.current = true;
        if (!eraserUndoPushed.current) { pushUndo(); eraserUndoPushed.current = true; }
        pixelEraseAt(getPos(e));
        return;
      }
      beginStrokeAt(getPos(e));
    };

    const onTouchMove = (e) => {
      if (e.touches.length >= 2) { cancelStrokeForScroll(); return; }
      // Update eraser cursor position for touch
      if (tool === 'eraser_pixel' || tool === 'eraser_object') {
        const r = c.getBoundingClientRect();
        const t0 = e.touches[0];
        setEraserCursorPos({ x: t0.clientX - r.left, y: t0.clientY - r.top });
      }
      if (!drawing.current) return;
      if (tool === 'eraser_object') {
        e.preventDefault();
        eraseStrokeAt(getPos(e));
        return;
      }
      if (tool === 'eraser_pixel') {
        e.preventDefault();
        pixelEraseAt(getPos(e));
        return;
      }
      if (!current.current) return;
      e.preventDefault();
      current.current.pts.push(getPos(e));
      redraw();
    };

    const onTouchEnd = () => {
      if (tool === 'eraser_object' || tool === 'eraser_pixel') {
        drawing.current = false;
        eraserUndoPushed.current = false;
        setEraserCursorPos(null);
        return;
      }
      finishStroke();
    };

    const onTouchCancel = () => { cancelStrokeForScroll(); };

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
  }, [mode, color, size, tool, width, height, passThrough, onStrokeStart, onStrokeEnd]);

  useImperativeHandle(ref, () => ({
    getStrokes: () => ({ strokes: strokes.current }),
    loadStrokes: (data) => {
      if (!data) { strokes.current = []; undoStack.current = []; redraw(); return; }
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
      undoStack.current = [];
      current.current = null;
      drawing.current = false;
      redraw();
    },
    clearStrokes: () => {
      pushUndo();
      strokes.current = [];
      current.current = null;
      drawing.current = false;
      redraw();
    },
    undo: () => {
      if (undoStack.current.length === 0) return;
      strokes.current = undoStack.current.pop();
      current.current = null;
      drawing.current = false;
      redraw();
      onStrokeEnd?.();
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

  const pixelEraserRadius = Math.max(4, size * 0.75);
  const objectEraserRadius = Math.max(8, size * 1.5);
  const eraserRadius = tool === 'eraser_pixel' ? pixelEraserRadius : objectEraserRadius;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, width: width + 'px', height: height + 'px', pointerEvents: passThrough ? 'none' : 'auto' }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: width + 'px',
          height: height + 'px',
          touchAction: (mode === 'draw' && !passThrough) ? 'pinch-zoom' : 'auto',
          pointerEvents: (mode === 'draw' && !passThrough) ? 'auto' : 'none',
          cursor: tool === 'eraser_pixel' || tool === 'eraser_object' ? 'none' : 'crosshair',
          background: 'transparent',
        }}
      />
      {eraserCursorPos && (tool === 'eraser_pixel' || tool === 'eraser_object') && (
        <div
          style={{
            position: 'absolute',
            left: eraserCursorPos.x - eraserRadius,
            top: eraserCursorPos.y - eraserRadius,
            width: eraserRadius * 2,
            height: eraserRadius * 2,
            borderRadius: '50%',
            background: tool === 'eraser_object' ? 'rgba(220,38,38,0.2)' : 'rgba(150,150,150,0.35)',
            border: tool === 'eraser_object' ? '2px solid rgba(220,38,38,0.7)' : '2px solid rgba(100,100,100,0.6)',
            pointerEvents: 'none',
            zIndex: 20,
          }}
        />
      )}
    </div>
  );
});

export default AnnotationCanvas;