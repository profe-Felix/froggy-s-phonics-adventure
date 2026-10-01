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

      // ── Live sessions (with staleness check) ──
      // A session matching the live code the student just scanned is always
      // considered live — the teacher just shared that code, so even if the
      // heartbeat hasn't bumped updated_date yet the student should join.
      const now = Date.now();
      const STALE_AFTER_MS = 5 * 60 * 1000;
      const activeLiveSessions = (liveSessions || [])
        .filter(s => {
          if (liveCode && s.code === liveCode) return true;
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

  // Realtime subscriptions. For most entities we invalidate so the query
  // refetches. For SmallGroupAssessment we update the cached
  // assessmentBroadcast directly from the event's broadcast_state payload —
  // this skips the ~1-2s refetch round-trip (6 parallel fetches) so the
  // student's letter changes the instant the teacher advances, instead of
  // lingering on the previous letter for a few seconds.
  useEffect(() => {
    if (!studentId) return;
    const unsubs = [];

    // Assessment — instant cache update from the event payload.
    unsubs.push(base44.entities.SmallGroupAssessment.subscribe((event) => {
      const fresh = event?.data;
      if (!fresh || !fresh.id) return;
      if (fresh.broadcast_state === undefined) {
        // Event lacks the payload — fall back to a full refetch.
        queryClient.invalidateQueries({ queryKey });
        return;
      }
      queryClient.setQueryData(queryKey, (old) => {
        if (!old) return old;
        const b = fresh.broadcast_state || {};
        const matchesMe = b.show_item &&
          Number(b.student_number) === Number(studentNumber) &&
          (b.class_name || '').toLowerCase() === className.toLowerCase();
        if (matchesMe) {
          return { ...old, assessmentBroadcast: { session: fresh, broadcast: b } };
        }
        // Teacher moved on to another student in the same session — clear.
        const current = old.assessmentBroadcast;
        if (current && current.session?.id === fresh.id) {
          return { ...old, assessmentBroadcast: null };
        }
        return old;
      });
    }));

    // Other entities — invalidate to refetch.
    const others = [
      base44.entities.DeskSeat,
      base44.entities.TableRotation,
      base44.entities.LiveLessonSession,
      base44.entities.LiveDictationSession,
      base44.entities.TracingLock,
    ];
    unsubs.push(...others.map(e =>
      e.subscribe(() => queryClient.invalidateQueries({ queryKey }))
    ));

    return () => unsubs.forEach(u => u?.());
  }, [studentId, queryClient, queryKey, studentNumber, className]);

  return {
    rotationAssignedMode: data?.rotationAssignedMode ?? null,
    activeLiveSessions: data?.activeLiveSessions ?? [],
    activeDictation: data?.activeDictation ?? null,
    activeTracingLock: data?.activeTracingLock ?? null,
    assessmentBroadcast: data?.assessmentBroadcast ?? null,
    loading: isLoading,
  };
}