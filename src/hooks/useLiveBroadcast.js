import { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

// Live broadcast channel over the LiveLessonSession.broadcast_state field.
// - Teacher (model panel): calls `send(state)` — throttled writes so fast
//   gestures (e.g. dragging a counter) don't flood the DB.
// - Student (mirror panel): reads `broadcast` — the latest state pushed via the
//   realtime subscription.
// Both sides subscribe; the teacher ignores its own echo (its model panel is
// driven by local interaction, not by the received state).
const THROTTLE_MS = 90;

export function useLiveBroadcast(sessionId) {
  const [broadcast, setBroadcast] = useState(null);
  const lastSendRef = useRef(0);
  const pendingRef = useRef(null);
  const flushTimerRef = useRef(null);

  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    // Seed the initial state from the DB (subscription only fires on changes).
    base44.entities.LiveLessonSession.get(sessionId)
      .then((s) => { if (alive && s?.broadcast_state) setBroadcast(s.broadcast_state); })
      .catch(() => {});
    const unsub = base44.entities.LiveLessonSession.subscribe((event) => {
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
      base44.entities.LiveLessonSession.update(sessionId, { broadcast_state: state }).catch(() => {});
    } else if (!flushTimerRef.current) {
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        if (pendingRef.current) {
          lastSendRef.current = Date.now();
          base44.entities.LiveLessonSession.update(sessionId, { broadcast_state: pendingRef.current }).catch(() => {});
        }
      }, THROTTLE_MS - elapsed);
    }
  }, [sessionId]);

  // Clear broadcast (used on step advance / phase change to try).
  const clear = useCallback(() => {
    if (!sessionId) return;
    pendingRef.current = null;
    if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
    base44.entities.LiveLessonSession.update(sessionId, { broadcast_state: {} }).catch(() => {});
  }, [sessionId]);

  return { broadcast, send, clear };
}