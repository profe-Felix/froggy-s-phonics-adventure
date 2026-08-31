import { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

// Live broadcast channel over the LiveTracingSession.broadcast_state field.
// Same throttled write/realtime-read pattern as useLiveBroadcast, but on the
// standalone tracing session entity (no class/lesson required).
const THROTTLE_MS = 50;

export function useLiveTracingBroadcast(sessionId) {
  const [broadcast, setBroadcast] = useState(null);
  const lastSendRef = useRef(0);
  const pendingRef = useRef(null);
  const flushTimerRef = useRef(null);

  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    base44.entities.LiveTracingSession.get(sessionId)
      .then((s) => { if (alive && s?.broadcast_state) setBroadcast(s.broadcast_state); })
      .catch(() => {});
    const unsub = base44.entities.LiveTracingSession.subscribe((event) => {
      if (event.data?.id === sessionId && event.data?.broadcast_state) {
        setBroadcast(event.data.broadcast_state);
      }
    });
    return () => { alive = false; unsub?.(); };
  }, [sessionId]);

  const send = useCallback((state) => {
    if (!sessionId) return;
    pendingRef.current = state;
    const now = Date.now();
    const elapsed = now - lastSendRef.current;
    if (elapsed >= THROTTLE_MS) {
      lastSendRef.current = now;
      base44.entities.LiveTracingSession.update(sessionId, { broadcast_state: state }).catch(() => {});
    } else if (!flushTimerRef.current) {
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        if (pendingRef.current) {
          lastSendRef.current = Date.now();
          base44.entities.LiveTracingSession.update(sessionId, { broadcast_state: pendingRef.current }).catch(() => {});
        }
      }, THROTTLE_MS - elapsed);
    }
  }, [sessionId]);

  const refresh = useCallback(() => {
    if (!sessionId) return;
    base44.entities.LiveTracingSession.get(sessionId)
      .then((s) => { if (s?.broadcast_state) setBroadcast(s.broadcast_state); })
      .catch(() => {});
  }, [sessionId]);

  const clear = useCallback(() => {
    if (!sessionId) return;
    pendingRef.current = null;
    if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
    base44.entities.LiveTracingSession.update(sessionId, { broadcast_state: {} }).catch(() => {});
  }, [sessionId]);

  return { broadcast, send, clear, refresh };
}