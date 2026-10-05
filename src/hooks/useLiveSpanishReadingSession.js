import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';

// Student-side discovery of the active live Spanish Reading session for their
// small group. The student accesses via their normal class+number URL params
// (class = homeroom). We resolve their SmallGroupAssignment(s) to find which
// (teacher, block, color_group) groups they belong to, then match an active
// LiveSpanishReadingSession for one of those groups.
//
// Realtime subscription keeps the student in sync as the teacher advances
// current_index or ends the session.
export function useLiveSpanishReadingSession({ className, studentNumber }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!className || !studentNumber) {
      setLoading(false);
      return;
    }

    let alive = true;
    let unsubscribe = null;
    let timer = null;
    const myGroups = []; // [{ teacher_name, block, color_group }]

    const matches = (s) =>
      !!s &&
      s.status === 'active' &&
      myGroups.some(
        (g) =>
          g.teacher_name === s.teacher_name &&
          g.block === s.block &&
          g.color_group === s.color_group
      );

    const refresh = async () => {
      try {
        const active = await base44.entities.LiveSpanishReadingSession.filter({
          status: 'active',
          school_year: ACTIVE_SCHOOL_YEAR,
        });
        if (!alive) return;
        setSession((active || []).find(matches) || null);
      } catch {
        /* ignore — next poll/subscription will retry */
      }
    };

    (async () => {
      try {
        const students = await base44.entities.Student.filter({
          class_name: className,
          student_number: studentNumber,
          school_year: ACTIVE_SCHOOL_YEAR,
        });
        if (!alive) return;
        const student = (students || [])[0];
        if (!student) {
          setLoading(false);
          return;
        }

        const assignments = await base44.entities.SmallGroupAssignment.filter({
          student_id: student.id,
          school_year: ACTIVE_SCHOOL_YEAR,
        });
        if (!alive) return;
        for (const a of assignments || []) {
          myGroups.push({
            teacher_name: a.teacher_name,
            block: a.block,
            color_group: a.color_group,
          });
        }

        await refresh();
        if (!alive) return;
        setLoading(false);

        unsubscribe = base44.entities.LiveSpanishReadingSession.subscribe(async (event) => {
          if (!alive) return;
          if (event.type === 'delete') {
            setSession(null);
            return;
          }
          const data = event.data || {};
          if (matches(data)) {
            setSession(data);
          } else if (data.status === 'completed') {
            await refresh();
          } else {
            // A new session may have started for this group — re-discover.
            await refresh();
          }
        });

        timer = setInterval(refresh, 5000);
      } catch {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      if (unsubscribe) unsubscribe();
      if (timer) clearInterval(timer);
    };
  }, [className, studentNumber]);

  return { session, loading };
}