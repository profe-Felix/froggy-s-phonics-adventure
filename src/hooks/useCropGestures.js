import { useEffect, useRef, useState, useCallback } from 'react';

// Shared pan + pinch/scroll zoom gestures for the crop viewport.
// `touch-action: none` on the viewport element is required so multi-touch
// pointer events fire on iOS instead of the browser intercepting the gesture.
export function useCropGestures({ maxZoom = 8, minZoom = 0.5 }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);
  const viewportRef = useRef(null);

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const setViewportRef = useCallback((el) => {
    if (viewportRef.current && viewportRef.current._wheelHandler) {
      viewportRef.current.removeEventListener('wheel', viewportRef.current._wheelHandler);
      delete viewportRef.current._wheelHandler;
    }
    viewportRef.current = el;
    if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      const fine = e.shiftKey;
      const delta = fine ? 0.04 : 0.12;
      const factor = e.deltaY < 0 ? 1 + delta : 1 - delta;
      setZoom((z) => Math.max(minZoom, Math.min(maxZoom, +(z * factor).toFixed(2))));
    };
    el.addEventListener('wheel', handler, { passive: false });
    el._wheelHandler = handler;
  }, [maxZoom, minZoom]);

  const handlePointerDown = (e) => {
    e.currentTarget?.setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      pinchRef.current = { startDist: dist, startZoom: zoomRef.current };
      dragRef.current = null;
    } else if (pointersRef.current.size === 1) {
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        panX: panRef.current.x,
        panY: panRef.current.y,
      };
    }
  };

  const handlePointerMove = (e) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const factor = dist / pinchRef.current.startDist;
      setZoom(Math.max(minZoom, Math.min(maxZoom, +(pinchRef.current.startZoom * factor).toFixed(2))));
    } else if (dragRef.current) {
      setPan({
        x: dragRef.current.panX + (e.clientX - dragRef.current.startX),
        y: dragRef.current.panY + (e.clientY - dragRef.current.startY),
      });
    }
  };

  const handlePointerUp = (e) => {
    pointersRef.current.delete(e.pointerId);
    e.currentTarget?.releasePointerCapture?.(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 1) {
      const [p] = [...pointersRef.current.values()];
      dragRef.current = { startX: p.x, startY: p.y, panX: panRef.current.x, panY: panRef.current.y };
    } else if (pointersRef.current.size === 0) {
      dragRef.current = null;
    }
  };

  return {
    zoom, pan, setZoom, setPan, zoomRef, panRef, reset,
    setViewportRef, handlePointerDown, handlePointerMove, handlePointerUp,
  };
}