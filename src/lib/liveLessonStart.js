import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';

// Shared session-creation logic used by both the LiveLesson setup page and the
// TeacherView launcher, so the LiveLessonSession shape stays in one place.
// Deactivates any stale active sessions for the class first so students
// auto-join THIS new lesson instead of a lingering one.
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(
    { length: 4 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

export async function startLiveLessonSession({
  lessonId,
  lessonSource = 'lesson', // 'lesson' | 'small_group'
  lessonTitle = '',
  lessonDay = '',
  className,
  targetStudents = [],
  schoolYear = ACTIVE_SCHOOL_YEAR,
}) {
  if (!lessonId || !className) return null;

  let code = genCode();
  try {
    const existing = await base44.entities.LiveLessonSession.filter({
      code,
      active: true,
    });
    if (existing?.length) code = genCode();
  } catch {
    /* ignore rare collision check failure */
  }

  try {
    const stale = await base44.entities.LiveLessonSession.filter({
      active: true,
      class_name: className,
    });
    await Promise.all(
      (stale || []).map((s) =>
        base44.entities.LiveLessonSession
          .update(s.id, { active: false })
          .catch(() => {})
      )
    );
  } catch {
    /* ignore */
  }

  return base44.entities.LiveLessonSession.create({
    code,
    lesson_id: lessonId,
    lesson_source: lessonSource,
    lesson_title: lessonTitle,
    lesson_day: lessonDay,
    class_name: className,
    school_year: schoolYear,
    target_students: targetStudents,
    current_step: 0,
    phase: 'watch',
    release_mode: 'stay',
    active: true,
    started_at: new Date().toISOString(),
    joined_students: [],
  });
}