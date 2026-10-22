import { useLessonProgress } from './useLessonProgress';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { familyCompletedIndexes, saveFamilyCompletion } from '@/lib/literacy/familyActivityPlan.mjs';
import { invokeBuilding } from './useBuildingPractice';

const pendingCreates = new Map();
// A family carousel is a view of the existing daily work, not a replacement
// lesson or a new progress namespace. Every source keeps its original index.
export function useFamilyLessonProgress(number, className, lessonId, plan = null) {
  const base = useLessonProgress(number, className, lessonId);
  const qc = useQueryClient();
  if (!plan) return base;
  const key = ['lesson-progress-all', String(number), className];
  const records = () => qc.getQueryData(key) || [];
  const find = id => records().filter(row => row.lesson_id === id)
    .sort((a, b) => new Date(b.updated_date || b.created_date || 0) -
      new Date(a.updated_date || a.created_date || 0))[0];
  const patch = row => qc.setQueryData(key, (old = []) =>
    old.some(item => item.id === row.id)
      ? old.map(item => item.id === row.id ? row : item) : [...old, row]);
  const ensure = async id => {
    if (find(id)) return find(id);
    const guard = JSON.stringify([number, className, id]);
    if (!pendingCreates.has(guard)) {
      pendingCreates.set(guard, base44.entities.LessonProgress.create({
        student_number: number, class_name: className, school_year: ACTIVE_SCHOOL_YEAR,
        lesson_id: id, completed_steps: [], current_step: 0, completed: false,
      }).then(row => { patch(row); return row; }).finally(() => pendingCreates.delete(guard)));
    }
    return pendingCreates.get(guard);
  };
  const virtual = (verifiedPlan = plan) => {
    const week = find(lessonId) || base.progress;
    if (!week) return null;
    const completed_steps = familyCompletedIndexes(verifiedPlan, records(), week);
    return { ...week, completed_steps, completed: plan.slots.length > 0 &&
      completed_steps.length === plan.slots.length };
  };
  return {
    ...base,
    progress: virtual(),
    markStepComplete: async index => {
      if (!base.progress) return null;
      let verifiedPlan = plan;
      if (plan.slots[index]?.masteryKind) {
        const status = await invokeBuilding({ action: 'catalog', lessonId, studentId: plan.studentId,
          studentNumber: Number(number), className, schoolYear: ACTIVE_SCHOOL_YEAR });
        if (!status.grandfather && !status.passedKinds.includes(plan.slots[index].masteryKind))
          throw Error('Complete 20 items with at least 18 first-try answers correct before continuing.');
        verifiedPlan = { ...plan, passedKinds: status.passedKinds, grandfather: status.grandfather };
        qc.invalidateQueries({ queryKey: ['building-catalog'] });
      }
      if (!await saveFamilyCompletion({ plan: verifiedPlan, index, weekId: lessonId, read: records, ensure,
        write: async (row, data) => patch(await base44.entities.LessonProgress.update(row.id, data)) })) return null;
      return virtual(verifiedPlan);
    },
    getActivityState: index => {
      const source = plan.slots[index]?.sources[0];
      try { return JSON.parse(find(source?.lessonId)?.activity_state || '{}')[source?.index] || null; }
      catch { return null; }
    },
    saveActivityState: async (index, state) => {
      const source = plan.slots[index]?.sources[0];
      if (!source) return;
      const row = await ensure(source.lessonId);
      let states;
      try { states = JSON.parse(row.activity_state || '{}'); } catch { states = {}; }
      states[String(source.index)] = state;
      patch(await base44.entities.LessonProgress.update(row.id, { activity_state: JSON.stringify(states) }));
    },
  };
}
