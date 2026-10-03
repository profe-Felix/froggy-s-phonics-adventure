import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { mergeAssessment, requestWithRetry, retryDelay } from '@/lib/classroomSync';

// Shared by the standalone assessment page and the in-app overlay.
// Stable lifecycle, top-level event IDs, ordered payloads, and guarded recovery.
export function useAssessmentSessions({
  enabled = true, sessionId = null, className = '', studentNumber = null,
} = {}) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [syncMessage, setSyncMessage] = useState('Checking for updates…');

  useEffect(() => {
    if (!enabled) {
      setSessions([]);
      setLoading(false);
      return;
    }

    let alive = true;
    let discovering = false;
    let recoveryTimer;
    let discoveryTimer;
    let blockedUntil = 0;

    const records = new Map();
    const versions = new Map();
    const fetching = new Set();
    const lastDisplay = new Map();

    const publish = () => {
      if (alive) setSessions([...records.values()]);
    };

    const apply = (data) => {
      if (!data?.id || (sessionId && data.id !== sessionId)) return;

      // Keep display metadata only; results never need to render on an iPad.
      const merged = mergeAssessment(records.get(data.id), data);

      records.set(data.id, {
        id: data.id,
        status: merged.status || 'active',
        broadcast_state: merged.broadcast_state || {},
      });

      publish();
    };

    const failed = (error) => {
      if (!alive) return;

      blockedUntil = Date.now() + retryDelay(error, 2);
      setSyncMessage('Connection interrupted — keeping the last item and retrying.');
      setLoading(false);
    };

    const refresh = async (id, force = false) => {
      if (!alive || fetching.has(id) || (!force && Date.now() < blockedUntil)) return;

      fetching.add(id);
      const version = versions.get(id) || 0;

      try {
        const fresh = await requestWithRetry(() =>
          base44.entities.SmallGroupAssessment.get(id)
        );

        if (!alive) return;

        if ((versions.get(id) || 0) === version) {
          apply(fresh);
        }

        blockedUntil = 0;
        setLoading(false);
        setSyncMessage('Connected — recovery check');
      } catch (error) {
        failed(error);
      } finally {
        fetching.delete(id);
      }
    };

    const discover = async (force = false) => {
      if (!alive || discovering || (!force && Date.now() < blockedUntil)) return;
      if (sessionId) return refresh(sessionId, force);

      discovering = true;
      const startVersions = new Map(versions);

      try {
        const active = await requestWithRetry(() =>
          base44.entities.SmallGroupAssessment.filter({ status: 'active' })
        );

        if (!alive) return;

        const ids = new Set((active || []).map(s => s.id));

        for (const record of active || []) {
          if (
            (versions.get(record.id) || 0) ===
            (startVersions.get(record.id) || 0)
          ) {
            apply(record);
          }
        }

        // A confirmed active-list response can retire sessions that ended
        // while disconnected. A failed request never clears the display.
        for (const [id, record] of records) {
          if (
            record.status === 'active' &&
            !ids.has(id) &&
            (versions.get(id) || 0) === (startVersions.get(id) || 0)
          ) {
            records.set(id, { ...record, status: 'completed' });
          }
        }

        publish();
        blockedUntil = 0;
        setLoading(false);
        setSyncMessage('Connected');
      } catch (error) {
        failed(error);
      } finally {
        discovering = false;
      }
    };

    const unsubscribe = base44.entities.SmallGroupAssessment.subscribe(event => {
      if (!alive) return;

      const id = event.id || event.data?.id;

      if (!id || (sessionId && id !== sessionId)) return;

      versions.set(id, (versions.get(id) || 0) + 1);

      if (event.type === 'delete') {
        records.delete(id);
        publish();
        return;
      }

      const data = event.data || {};

      if (data.broadcast_state !== undefined || data.status !== undefined) {
        apply({ ...data, id });
        setLoading(false);
      }

      if (data.broadcast_state !== undefined) {
        lastDisplay.set(id, Date.now());
        setSyncMessage('Connected — live update');
      } else if (data.status === undefined && data.results === undefined) {
        void refresh(id);
      }
    });

    void discover();

    const recover = async () => {
      if (!alive) return;

      if (document.visibilityState === 'visible') {
        if (sessionId && !records.has(sessionId)) {
          await refresh(sessionId);
        }

        for (const record of records.values()) {
          const broadcast = record.broadcast_state || {};

          const isMyTurn =
            broadcast.show_item &&
            Number(broadcast.student_number) === Number(studentNumber) &&
            String(broadcast.class_name || '').toLowerCase() === className.toLowerCase();

          // Fast recovery belongs to the one actively assessed student (or
          // an explicit group-session link), not every child in the school.
          if (
            record.status === 'active' &&
            (sessionId || isMyTurn) &&
            Date.now() - (lastDisplay.get(record.id) || 0) > 2500
          ) {
            await refresh(record.id);
          }
        }
      }

      if (alive) {
        recoveryTimer = setTimeout(recover, 2500 + Math.random() * 700);
      }
    };

    const rediscover = async () => {
      if (!alive) return;

      if (document.visibilityState === 'visible' && !sessionId) {
        await discover();
      }

      if (alive) {
        discoveryTimer = setTimeout(rediscover, 15000 + Math.random() * 3000);
      }
    };

    recoveryTimer = setTimeout(recover, 2500 + Math.random() * 700);
    discoveryTimer = setTimeout(rediscover, 15000 + Math.random() * 3000);

    const visible = () => {
      if (document.visibilityState !== 'visible') return;

      blockedUntil = 0;
      void discover(true);
    };

    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', visible);

    return () => {
      alive = false;
      unsubscribe?.();
      clearTimeout(recoveryTimer);
      clearTimeout(discoveryTimer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', visible);
    };
  }, [enabled, sessionId, className, studentNumber]);

  return { sessions, loading, syncMessage };
}
