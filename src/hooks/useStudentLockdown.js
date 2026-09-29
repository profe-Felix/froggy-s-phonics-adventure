import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';

// Consolidated student lockdown state — replaces 5+ independent polling
// queries (rotation, live sessions, dictation, tracing lock, assessment)
// with a single parallel fetch + realtime subscriptions.
//
// Returns all teacher-driven lockdowns at once:
// - rotationAssignedMode: table rotation activity the student is locked to
// - activeLiveSessions: non-stale active LiveLessonSession records
// - activeDictation: active LiveDictationSession for this class
// - activeTracingLock: active TracingLock for this class
// - assessmentBroadcast: { session, broadcast } when the teacher is assessing
//
// One poll every 8s (fallback) + realtime subscriptions on all 6 entity types
// that invalidate the query instantly when any teacher changes something.
// This cuts ~5 separate polled requests per cycle down to 1.
export function useStudentLockdown({ studentId, className, studentNumber, schoolYear, liveCode, enabled = true }) {
  const queryClient = useQueryClient();
  const queryKey = ['student-lockdown', studentId, className, studentNumber, liveCode, schoolYear];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!studentId || !className || !studentNumber) return null;

      // Single round-trip: 6 parallel fetches instead of 5 separate polls.
      const [seats, rotations, liveSessions, dictationSessions, tracingLocks, assessments] = await Promise.all([
        base44.entities.DeskSeat.filter({ student_id: studentId }),
        base44.entities.TableRotation.filter({ active: true, school_year: ACTIVE_SCHOOL_YEAR }),
        base44.entities.LiveLessonSession.filter({ active: true }),
        base44.entities.LiveDictationSession.filter({ class_name: className, school_year: schoolYear || ACTIVE_SCHOOL_YEAR, active: true }),
        base44.entities.TracingLock.filter({ class_name: className, active: true }),
        // Fetch ALL active assessment sessions — don't filter by teacher_name,
        // because the assessing teacher may differ from the student's homeroom
        // teacher (block B/C students are assessed by a different teacher).
        base44.entities.SmallGroupAssessment.filter({ status: 'active' }),
      ]);

      // ── Rotation ──
      let rotationAssignedMode = null;
      const seat = seats?.[0];
      if (seat?.table_number) {
        const rot = (rotations || []).find(r =>
          r.class_name === seat.class_name && r.group === seat.group
        );
        if (rot?.activities?.length) {
          const offset = rot.rotation_offset || 0;
          const idx = (seat.table_number - 1 + offset) % rot.activities.length;
          const assigned = rot.activities[idx];
          if (assigned?.activity_type && assigned.activity_type !== 'pathway') {
            rotationAssignedMode = assigned.activity_type;
          }
        }
      }

      // ── Live sessions (with 90s staleness check) ──
      const now = Date.now();
      const STALE_AFTER_MS = 90 * 1000;
      const activeLiveSessions = (liveSessions || [])
        .filter(s => {
          const lastUpdate = s.updated_date || s.started_at;
          if (!lastUpdate) return false;
          return now - new Date(lastUpdate).getTime() < STALE_AFTER_MS;
        })
        .sort((a, b) =>
          new Date(b.updated_date || b.started_at || 0).getTime() -
          new Date(a.updated_date || a.started_at || 0).getTime()
        );

      // ── Assessment broadcast ──
      // Match by student_number + class_name in the broadcast_state, not by
      // teacher_name — the assessing teacher may differ from the student's
      // homeroom teacher (block B/C students are assessed by a different teacher).
      let assessmentBroadcast = null;
      for (const sess of assessments || []) {
        const b = sess.broadcast_state || {};
        if (
          b.show_item &&
          Number(b.student_number) === Number(studentNumber) &&
          (b.class_name || '').toLowerCase() === className.toLowerCase()
        ) {
          assessmentBroadcast = { session: sess, broadcast: b };
          break;
        }
      }

      return {
        rotationAssignedMode,
        activeLiveSessions,
        activeDictation: dictationSessions?.[0] || null,
        activeTracingLock: tracingLocks?.[0] || null,
        assessmentBroadcast,
      };
    },
    enabled: enabled && !!studentId && !!className && !!studentNumber,
    refetchInterval: enabled ? 8000 : false,
    refetchIntervalInBackground: false,
    retry: false,
    staleTime: 0,
  });

  // Realtime subscriptions — invalidate on any entity change so the query
  // re-fetches instantly instead of waiting for the next 8s poll.
  useEffect(() => {
    if (!studentId) return;
    const entities = [
      base44.entities.DeskSeat,
      base44.entities.TableRotation,
      base44.entities.LiveLessonSession,
      base44.entities.LiveDictationSession,
      base44.entities.TracingLock,
      base44.entities.SmallGroupAssessment,
    ];
    const unsubs = entities.map(e =>
      e.subscribe(() => {
        queryClient.invalidateQueries({ queryKey });
      })
    );
    return () => unsubs.forEach(u => u?.());
  }, [studentId, queryClient, queryKey]);

  return {
    rotationAssignedMode: data?.rotationAssignedMode ?? null,
    activeLiveSessions: data?.activeLiveSessions ?? [],
    activeDictation: data?.activeDictation ?? null,
    activeTracingLock: data?.activeTracingLock ?? null,
    assessmentBroadcast: data?.assessmentBroadcast ?? null,
    loading: isLoading,
  };
}