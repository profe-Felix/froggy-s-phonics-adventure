import { useRef, useCallback, useEffect, useState } from 'react';

/**
 * Shared laser tracker hook.
 * - On touch/stylus: always active (fading trail while moving, disappears on lift)
 * - On mouse: only active while mouse button is held down
 *
 * Returns:
 *   laserTrailPoints  — current fading trail for rendering
 *   isActive          — whether laser is currently drawing
 *   startRecordingLaser / stopRecordingLaser / getLaserData — for audio sync
 *   bindContainer     — attach to a container div's ref to start tracking
 */
export default function useLaserTracker({ containerRef, enabled = true }) {
  const [trailPoints, setTrailPoints] = useState([]); // [{x, y, t, alpha}]
  const rawTrail = useRef([]); // timestamped points for recording
  const recording = useRef(false);
  const recordStart = useRef(0);
  const fadeTimer = useRef(null);
  const isTouch = useRef(false);
  const mouseDown = useRef(false);
  const [isActive, setIsActive] = useState(false);

  // Fade trail: each point fades out over 600ms
  const FADE_MS = 600;

  const addPoint = useCallback((x, y) => {
    const t = Date.now();
    const pt = { x, y, t };
    setTrailPoints(prev => {
      const now = Date.now();
      const filtered = prev.filter(p => now - p.t < FADE_MS);
      return [...filtered, { ...pt, alpha: 1 }];
    });
    if (recording.current) {
      rawTrail.current.push({
        x_pct: x,
        y_pct: y,
        t: t - recordStart.current,
      });
    }
    // Clear trail after FADE_MS of inactivity
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => {
      setTrailPoints([]);
      setIsActive(false);
    }, FADE_MS);
  }, []);

  const getRelativePos = useCallback((e, el) => {
    const rect = el.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) / rect.width,
      y: (src.clientY - rect.top) / rect.height,
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const el = containerRef?.current;
    if (!el) return;

    const onTouchStart = (e) => {
      isTouch.current = true;
      setIsActive(true);
      const pos = getRelativePos(e, el);
      addPoint(pos.x, pos.y);
    };

    const onTouchMove = (e) => {
      if (!isTouch.current) return;
      // Only prevent default if single touch (don't block pinch-zoom)
      if (e.touches.length === 1) e.preventDefault();
      else return;
      setIsActive(true);
      const pos = getRelativePos(e, el);
      addPoint(pos.x, pos.y);
    };

    const onTouchEnd = () => {
      isTouch.current = false;
      // Trail fades naturally via timeout
    };

    const onMouseDown = (e) => {
      if (isTouch.current) return;
      mouseDown.current = true;
      setIsActive(true);
      const pos = getRelativePos(e, el);
      addPoint(pos.x, pos.y);
    };

    const onMouseMove = (e) => {
      if (!mouseDown.current || isTouch.current) return;
      const pos = getRelativePos(e, el);
      addPoint(pos.x, pos.y);
    };

    const onMouseUp = () => {
      mouseDown.current = false;
      setIsActive(false);
      setTrailPoints([]);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, [enabled, containerRef, addPoint, getRelativePos]);

  const startRecordingLaser = useCallback(() => {
    rawTrail.current = [];
    recordStart.current = Date.now();
    recording.current = true;
  }, []);

  const stopRecordingLaser = useCallback(() => {
    recording.current = false;
  }, []);

  const getLaserData = useCallback(() => {
    return rawTrail.current;
  }, []);

  const clearLaser = useCallback(() => {
    setTrailPoints([]);
    setIsActive(false);
    rawTrail.current = [];
  }, []);

  return {
    trailPoints,
    isActive,
    startRecordingLaser,
    stopRecordingLaser,
    getLaserData,
    clearLaser,
  };
}