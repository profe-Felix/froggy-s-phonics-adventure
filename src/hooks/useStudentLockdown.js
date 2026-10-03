import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { requestWithRetry } from '@/lib/classroomSync';
import { useAssessmentSessions } from '@/hooks/useAssessmentSessions';

const TYPES = [
  'DeskSeat',
  'TableRotation',
  'LiveLessonSession',
  'LiveDictationSession',
  'TracingLock',
  'LiveNotebookAssessment',
];

// Each entity has its own cache. A change to one no longer reloads all seven.
export function useStudentLockdown({
  studentId, className, studentNumber, schoolYear, liveCode, enabled = true,
}) {
  const qc = useQueryClient();
  const year = schoolYear || ACTIVE_SCHOOL_YEAR;
  const ready = enabled && !!studentId && !!className && !!studentNumber;
  const [pollMs] = useState(() => 25000 + Math.random() * 5000);

  const keys = useMemo(() => TYPES.map(type =>
    ['student-lockdown-v2', type, studentId, className, year]),
  [studentId, className, year]);

  const filters = [
    { student_id: studentId },
    { active: true, school_year: year },
    { active: true },
    { class_name: className, school_year: year, active: true },
    { class_name: className, active: true },
    { class_name: className, school_year: year, active: true },
  ];

  const queries = useQueries({
    queries: TYPES.map((type, i) => ({
      queryKey: keys[i],
      queryFn: () => requestWithRetry(() => base44.entities[type].filter(filters[i])),
      enabled: ready,
      staleTime: 15000,
      refetchOnWindowFocus: false,
      refetchInterval: pollMs,
      refetchIntervalInBackground: false,
      retry: false,
    })),
  });

  const { sessions: assessments } = useAssessmentSessions({
    enabled: ready,
    className: className || '',
    studentNumber,
  });

  useEffect(() => {
    if (!ready) return;

    const timers = new Map();

    const unsubs = TYPES.map((type, i) => base44.entities[type].subscribe(event => {
      const data = event.data || {};
      const id = event.id || data.id;

      if (!id) return;

      if (
        data.class_name &&
        data.class_name !== className &&
        type !== 'LiveLessonSession'
      ) {
        return;
      }

      if (
        type === 'DeskSeat' &&
        data.student_id &&
        data.student_id !== studentId
      ) {
        return;
      }

      const old = qc.getQueryData(keys[i]);
      const existing = old?.find(record => record.id === id);

      if (event.type === 'delete') {
        if (existing) {
          qc.setQueryData(keys[i], old.filter(record => record.id !== id));
        }
        return;
      }

      if (existing) {
        // Partial payloads cannot erase fields; heartbeat and broadcast
        // changes update the cache without any follow-up REST requests.
        const merged = { ...existing, ...data, id };

        qc.setQueryData(
          keys[i],
          old.map(record => record.id === id ? merged : record)
        );

        return;
      }

      // New records need one authoritative read of THIS entity only.
      // Debounce bursts, and keep the slow safety fetch for missed events.
      clearTimeout(timers.get(type));

      timers.set(type, setTimeout(() => {
        timers.delete(type);
        void qc.invalidateQueries({ queryKey: keys[i], exact: true });
      }, 350 + Math.random() * 300));
    }));

    const visible = () => {
      if (document.visibilityState === 'visible') {
        keys.forEach(key =>
          void qc.invalidateQueries({ queryKey: key, exact: true })
        );
      }
    };

    document.addEventListener('visibilitychange', visible);

    return () => {
      unsubs.forEach(unsub => unsub?.());
      timers.forEach(timer => clearTimeout(timer));
      document.removeEventListener('visibilitychange', visible);
    };
  }, [ready, qc, keys, className, studentId]);

  const seats = queries[0].data || [];
  const rotations = queries[1].data || [];
  const seat = seats[0];

  const rotation = seat && rotations.find(r =>
    r.active &&
    r.class_name === seat.class_name &&
    r.group === seat.group
  );

  const slot = rotation?.activities?.length
    ? (seat.table_number - 1 + (rotation.rotation_offset || 0)) % rotation.activities.length
    : -1;

  const mode = rotation?.activities?.[slot]?.activity_type;
  const liveData = queries[2].data;

  const activeLiveSessions = useMemo(() => (liveData || [])
    .filter(s => s.active && (
      (liveCode && s.code === liveCode) ||
      Date.now() - new Date(s.updated_date || s.started_at || 0).getTime() < 5 * 60 * 1000
    ))
    .sort((a, b) =>
      new Date(b.updated_date || b.started_at || 0) -
      new Date(a.updated_date || a.started_at || 0)
    ),
  [liveData, liveCode]);

  const matching = assessments.find(s => {
    const b = s.broadcast_state || {};

    return s.status === 'active' &&
      b.show_item &&
      Number(b.student_number) === Number(studentNumber) &&
      String(b.class_name || '').toLowerCase() === String(className || '').toLowerCase();
  });

  return {
    rotationAssignedMode: mode && mode !== 'pathway' ? mode : null,
    activeLiveSessions,
    activeDictation: queries[3].data?.find(s => s.active) || null,
    activeTracingLock: queries[4].data?.find(s => s.active) || null,
    activeNotebookAssessment: queries[5].data?.find(s => s.active) || null,
    assessmentBroadcast: matching
      ? { session: matching, broadcast: matching.broadcast_state }
      : null,
    loading: ready && queries.some(query => query.isLoading),
  };
}