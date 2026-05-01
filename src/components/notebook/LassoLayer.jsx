import { useRef, useEffect, useState, useCallback } from 'react';

/**
 * LassoLayer — draws over the PDF/canvas to let users select a region.
 * On pointer up → calls onCutRequest({ x, y, w, h, lassoPts, canvasW, canvasH })
 * where x/y/w/h are pixel-space bounding box of the lasso.
 */
export default function LassoLayer({ width, height, onCutRequest, disabled }) {
  const canvasRef = useRef(null);
  const pts = useRef([]);
  const drawing = useRef(false);
  const [cutBtn, setCutBtn] = useState(null); // { x, y, bbox }

  useEffect(() => {
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
  }, [width, height]);

  const getPos = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  };

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    if (pts.current.length < 2) return;

    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = 0;
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 2.5;
    ctx.fillStyle = 'rgba(124, 58, 237, 0.12)';
    ctx.beginPath();
    pts.current.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }, [width, height]);

  const getBBox = () => {
    if (pts.current.length === 0) return null;
    const xs = pts.current.map(p => p.x);
    const ys = pts.current.map(p => p.y);
    const x = Math.max(0, Math.min(...xs));
    const y = Math.max(0, Math.min(...ys));
    const x2 = Math.min(width, Math.max(...xs));
    const y2 = Math.min(height, Math.max(...ys));
    return { x, y, w: x2 - x, h: y2 - y };
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    const onDown = (e) => {
      if (disabled) return;
      // If there's a pending cut button, clicking elsewhere dismisses it
      setCutBtn(null);
      pts.current = [getPos(e)];
      drawing.current = true;
      e.preventDefault();
    };

    const onMove = (e) => {
      if (!drawing.current) return;
      pts.current.push(getPos(e));
      redraw();
      e.preventDefault();
    };

    const onUp = () => {
      if (!drawing.current) return;
      drawing.current = false;
      const bbox = getBBox();
      if (!bbox || bbox.w < 20 || bbox.h < 20) {
        // Too small — clear
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        pts.current = [];
        return;
      }
      // Show cut button near top-right of bbox
      setCutBtn({ x: bbox.x + bbox.w, y: bbox.y, bbox, pts: [...pts.current] });
    };

    c.addEventListener('mousedown', onDown);
    c.addEventListener('mousemove', onMove);
    c.addEventListener('mouseup', onUp);
    c.addEventListener('touchstart', onDown, { passive: false });
    c.addEventListener('touchmove', onMove, { passive: false });
    c.addEventListener('touchend', onUp);

    return () => {
      c.removeEventListener('mousedown', onDown);
      c.removeEventListener('mousemove', onMove);
      c.removeEventListener('mouseup', onUp);
      c.removeEventListener('touchstart', onDown);
      c.removeEventListener('touchmove', onMove);
      c.removeEventListener('touchend', onUp);
    };
  }, [disabled, redraw, width, height]);

  const handleCut = () => {
    if (!cutBtn) return;
    onCutRequest({ ...cutBtn.bbox, lassoPts: cutBtn.pts, canvasW: width, canvasH: height });
    // Clear lasso
    const c = canvasRef.current;
    if (c) {
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, width, height);
    }
    pts.current = [];
    setCutBtn(null);
  };

  const handleDismiss = () => {
    const c = canvasRef.current;
    if (c) {
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, width, height);
    }
    pts.current = [];
    setCutBtn(null);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20, width, height }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', inset: 0,
          width, height,
          cursor: disabled ? 'default' : 'crosshair',
          touchAction: 'none',
          pointerEvents: disabled ? 'none' : 'auto',
        }}
      />
      {/* Cut button */}
      {cutBtn && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(cutBtn.x + 4, width - 120),
            top: Math.max(cutBtn.y - 40, 4),
            zIndex: 30,
            display: 'flex',
            gap: 6,
          }}
        >
          <button
            onClick={handleCut}
            style={{
              background: '#7c3aed',
              color: 'white',
              border: '2px solid #a78bfa',
              borderRadius: 12,
              padding: '6px 14px',
              fontWeight: 'bold',
              fontSize: 15,
              boxShadow: '0 4px 16px rgba(124,58,237,0.5)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            ✂️ Cut
          </button>
          <button
            onClick={handleDismiss}
            style={{
              background: '#374151',
              color: '#9ca3af',
              border: '1px solid #4b5563',
              borderRadius: 12,
              padding: '6px 10px',
              fontWeight: 'bold',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}