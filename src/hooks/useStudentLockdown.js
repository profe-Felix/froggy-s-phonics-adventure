import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { requestWithRetry, wait } from '@/lib/classroomSync';
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
  // Polling is a safety net only — realtime subscriptions handle live updates.
  // Keep it slow so a class of 20 students doesn't saturate the rate limit.
  const [pollMs] = useState(() => 60000 + Math.random() * 20000);
  const [loadJitter] = useState(() => Math.random() * 800);

  const keys = useMemo(() => TYPES.map(type =>
    ['student-lockdown-v2', type, studentId, className, year]),
  [studentId, className, year]);

  const filters = [
    { student_id: studentId },
    { active: true, school_year: year, class_name: className },
    { active: true },
    { class_name: className, school_year: year, active: true },
    { class_name: className, active: true },
    { class_name: className, school_year: year, active: true },
  ];

  // Spread requests across students as well as entities. Identical delays
  // on every device merely move a whole-class burst to a later instant.
  const queries = useQueries({
    queries: TYPES.map((type, i) => ({
      queryKey: keys[i],
      queryFn: async ({ signal }) => {
        await wait(((Number(studentNumber) - 1) % 30) * 120 + loadJitter + i * 350);
        if (signal.aborted) throw new DOMException('Notebook navigation cancelled this read', 'AbortError');
        return requestWithRetry(() => {
          if (signal.aborted) throw new DOMException('Notebook navigation cancelled this read', 'AbortError');
          return base44.entities[type].filter(filters[i]);
        });
      },
      enabled: ready,
      staleTime: 60000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchInterval: pollMs + i * 3000,
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

      // Complete realtime records can enter the cache without making every
      // student fetch the same session again. Incomplete payloads still recover.
      const expected = filters[i];
      if (Object.keys(expected).every(key => key in data)) {
        if (Object.entries(expected).every(([key, value]) => data[key] === value)) {
          qc.setQueryData(keys[i], records => [...(records || []).filter(record => record.id !== id), { ...data, id }]);
        }
        return;
      }

      // Debounce incomplete payloads; the slow safety fetch covers missed events.
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
    activeNotebookAssessment: queries[5].data?.find(s => {
      if (!s.active) return false;
      // Teacher released this student early — they're no longer in the
      // assessment and should not be pulled back in on refresh.
      if (Array.isArray(s.finished_students) && s.finished_students.some(
        t => String(t.class_name || '') === String(className || '') &&
          Number(t.student_number) === Number(studentNumber)
      )) return false;
      // Whole class (empty target_students) = everyone joins.
      if (!s.target_students || s.target_students.length === 0) return true;
      // Targeted: only listed students join.
      return s.target_students.some(
        t => String(t.class_name || '') === String(className || '') &&
          Number(t.student_number) === Number(studentNumber)
      );
    }) || null,
    assessmentBroadcast: matching
      ? { session: matching, broadcast: matching.broadcast_state }
      : null,
    loading: ready && queries.some(query => query.isLoading),
  };
}