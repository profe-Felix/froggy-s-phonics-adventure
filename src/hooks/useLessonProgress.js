import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';

// Per-student, per-lesson progression state. Lazily creates a LessonProgress
// record the first time a student opens a lesson. Shared via the react-query
// cache so both the LessonMap (gating) and the active step router (completion)
// see the same data.
export function useLessonProgress(studentNumber, className, lessonId) {
  const qc = useQueryClient();
  const key = ['lesson-progress', String(studentNumber), className, lessonId];

  const { data: progress, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const list = await base44.entities.LessonProgress.filter({
        student_number: studentNumber,
        class_name: className,
        lesson_id: lessonId,
      });
      if (list[0]) return list[0];
      return await base44.entities.LessonProgress.create({
        student_number: studentNumber,
        class_name: className,
        school_year: ACTIVE_SCHOOL_YEAR,
        lesson_id: lessonId,
        completed_steps: [],
        current_step: 0,
        completed: false,
      });
    },
    enabled: !!lessonId && !!studentNumber,
  });

  const markStepComplete = async (stepIndex, totalSteps) => {
    if (!progress) return;
    if ((progress.completed_steps || []).includes(stepIndex)) return;
    const completed_steps = [...(progress.completed_steps || []), stepIndex];
    const completed = completed_steps.length >= totalSteps;
    const current_step = completed ? totalSteps - 1 : Math.max(progress.current_step || 0, stepIndex + 1);
    const updated = await base44.entities.LessonProgress.update(progress.id, {
      completed_steps,
      current_step,
      completed,
    });
    qc.setQueryData(key, updated);
  };

  return { progress, isLoading, markStepComplete };
}