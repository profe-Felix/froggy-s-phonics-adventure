import { useRef, useCallback, useEffect, useState } from 'react';

/**
 * Shared laser tracker hook (Pointer Events API).
 * - pen/touch (interactive whiteboards like Promethean/SMART): laser active
 *   while the pointer is down (touching the surface).
 * - mouse: laser active only while a button is held.
 *
 * Uses getCoalescedEvents() on pointermove so high-frequency stylus samples
 * emitted between animation frames are all captured — this is what keeps the
 * trail smooth on interactive whiteboards instead of one choppy point/frame.
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
  const pointerDown = useRef(false);
  const pointerType = useRef('mouse'); // 'mouse' | 'pen' | 'touch'
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

  const getRelativePos = useCallback((clientX, clientY, el) => {
    const rect = el.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const el = containerRef?.current;
    if (!el) return;

    const onPointerDown = (e) => {
      pointerType.current = e.pointerType || 'mouse';
      pointerDown.current = true;
      setIsActive(true);
      const pos = getRelativePos(e.clientX, e.clientY, el);
      addPoint(pos.x, pos.y);
    };

    const onPointerMove = (e) => {
      // mouse: only track while a button is held.
      // pen/touch: track while the pointer is down (touching the surface).
      if (!pointerDown.current) return;
      if (pointerType.current === 'mouse' && e.buttons === 0) return;

      // Capture every intermediate sample the board emitted since the last
      // frame — this is the key to a smooth trail on Promethean/SMART boards,
      // which fire pen events well above the display refresh rate.
      const events =
        typeof e.getCoalescedEvents === 'function' && e.getCoalescedEvents().length
          ? e.getCoalescedEvents()
          : [e];
      for (const ev of events) {
        const pos = getRelativePos(ev.clientX, ev.clientY, el);
        addPoint(pos.x, pos.y);
      }
    };

    const onPointerUp = () => {
      pointerDown.current = false;
      setIsActive(false);
      setTrailPoints([]);
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
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