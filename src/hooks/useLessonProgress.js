import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';

// Module-level guard: prevents two components that share the same lesson key
// (e.g. LessonMap + LessonStepper mounting at the same time) from both firing
// a create and producing duplicate LessonProgress records.
const creatingKeys = new Set();

// Per-student, per-lesson progression state. Lazily creates a LessonProgress
// record the first time a student opens a lesson.
//
// All callers share a single "lesson-progress-all" query (one network request
// per student) instead of each firing its own per-lesson filter. React Query
// deduplicates the broad query across every component that uses this hook, so
// mounting LessonMap + LessonStepper + LessonModeRouter for the same lesson
// produces ONE LessonProgress fetch, not four.
export function useLessonProgress(studentNumber, className, lessonId) {
  const qc = useQueryClient();
  const broadKey = ['lesson-progress-all', String(studentNumber), className];
  const [createError, setCreateError] = useState(false);

  const { data: allProgress = [], isLoading } = useQuery({
    queryKey: broadKey,
    queryFn: () => base44.entities.LessonProgress.filter({
      student_number: studentNumber,
      class_name: className,
    }),
    enabled: !!studentNumber && !!className,
    staleTime: 60000,
    refetchOnMount: false,
    retry: false,
  });

  // Derive the single record for this lesson from the shared broad list.
  const progress = useMemo(() => {
    if (!lessonId || !allProgress?.length) return null;
    const matches = allProgress.filter(p => p.lesson_id === lessonId);
    if (!matches.length) return null;
    if (matches.length === 1) return matches[0];
    // If duplicates exist from a past race, keep the most recently updated.
    return matches.sort((a, b) =>
      new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date)
    )[0];
  }, [allProgress, lessonId]);

  // Lazily create a progress record the first time a student opens a lesson.
  // Done as a side-effect (not inside the queryFn) so a cancelled query never
  // leaves the student stuck on the loading spinner.
  useEffect(() => {
    if (!lessonId || !studentNumber || isLoading) return;
    if (progress) return; // already exists
    const keyStr = broadKey.join('|') + '|' + lessonId;
    if (creatingKeys.has(keyStr)) return; // another component is already creating
    let cancelled = false;
    creatingKeys.add(keyStr);
    setCreateError(false);
    (async () => {
      try {
        const created = await base44.entities.LessonProgress.create({
          student_number: studentNumber,
          class_name: className,
          school_year: ACTIVE_SCHOOL_YEAR,
          lesson_id: lessonId,
          completed_steps: [],
          current_step: 0,
          completed: false,
        });
        if (!cancelled) {
          qc.setQueryData(broadKey, (old = []) => [...old, created]);
        }
      } catch (e) {
        // If the create lost a race (another tab/component made it), refetch.
        if (!cancelled) qc.invalidateQueries({ queryKey: broadKey });
        if (!cancelled) setCreateError(true);
      } finally {
        creatingKeys.delete(keyStr);
      }
    })();
    return () => { cancelled = true; };
  }, [progress, isLoading, lessonId, studentNumber, className]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = () => {
    setCreateError(false);
    qc.invalidateQueries({ queryKey: broadKey });
  };

  const markStepComplete = async (
    stepIndex,
    totalSteps,
    requiredStepIndexes = null
  ) => {
    if (!progress) return null;

    if ((progress.completed_steps || []).includes(stepIndex)) {
      return progress;
    }

    const completed_steps = [
      ...(progress.completed_steps || []),
      stepIndex,
    ];

    const completed = Array.isArray(requiredStepIndexes)
      ? requiredStepIndexes.every((requiredIndex) =>
          completed_steps.includes(requiredIndex)
        )
      : completed_steps.length >= totalSteps;

    const current_step = completed
      ? Math.max(totalSteps - 1, 0)
      : Math.max(progress.current_step || 0, stepIndex + 1);

    const updated = await base44.entities.LessonProgress.update(
      progress.id,
      {
        completed_steps,
        current_step,
        completed,
      }
    );

    qc.setQueryData(broadKey, (old = []) =>
      old.map(p => (p.id === updated.id ? updated : p))
    );

    return updated;
  };

  // Persist within-activity progress (e.g. which counting items were already
  // answered correctly) so a student who exits mid-activity resumes where they
  // left off instead of resetting to zero.
  const saveActivityState = async (stepIndex, state) => {
    if (!progress) return;
    let cur = {};
    try { cur = JSON.parse(progress.activity_state || '{}'); } catch { cur = {}; }
    cur[String(stepIndex)] = state;
    const activity_state = JSON.stringify(cur);
    if (progress.activity_state === activity_state) return;
    const updated = await base44.entities.LessonProgress.update(progress.id, { activity_state });
    qc.setQueryData(broadKey, (old = []) =>
      old.map(p => (p.id === updated.id ? { ...p, activity_state } : p))
    );
  };

  const getActivityState = (stepIndex) => {
    if (!progress?.activity_state) return null;
    try {
      const cur = JSON.parse(progress.activity_state);
      return cur[String(stepIndex)] || null;
    } catch { return null; }
  };

  return { progress, isLoading, markStepComplete, saveActivityState, getActivityState, createError, retry };
}