import { getIntroducedGraphemesThrough } from './curriculumGraphemes.js';
import { knownSightWordsAt } from './sightWordProgression.mjs';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const PRESENTATION = new Set(['title', 'emoji', 'emojiImage', 'color', 'id', 'generatedCurriculum']);
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
export const isFamilyPath = lesson => lesson?.language === 'es' &&
  !['guided', 'side_quest'].includes(lesson.assignment_type);
export const familyLevelTitle = lesson => `Level ${lesson?.lesson_number || 1}`;
export const availableForFamily = (step, context) => step.live_scope !== 'live_only' &&
  (context !== 'home' || step.access_scope !== 'school_only');

// Never deduplicate on the title alone. Keep changes to pages, word lists,
// completion rules and access restrictions, even when their captions match.
export function familyActivitySignature(step) {
  const copy = Object.fromEntries(Object.entries(step).filter(([key]) => !PRESENTATION.has(key)));
  const config = { ...(copy.config || {}) };
  const p = config.curriculumPosition;
  if (step.mode === 'fluency' && p && config.curriculumContentType && !config.bookVocabulary &&
      !config.curriculumPositionOverride) {
    const position = { moduleNumber: Number(p.module_number),
      lessonNumber: Number(p.curriculum_lesson_end || p.curriculum_lesson_number) };
    if (['letters', 'sight_words_all'].includes(config.curriculumContentType)) {
      config.practiceContent = config.curriculumContentType === 'letters'
        ? getIntroducedGraphemesThrough(position) : knownSightWordsAt(position);
      delete config.curriculumPosition;
    }
  }
  delete config.generatedCurriculum;
  copy.config = config;
  return JSON.stringify(stable(copy));
}

export function buildFamilyActivityPlan(lesson, context = 'school', building = null) {
  const slots = [], bySignature = new Map(), days = [];
  const add = (step, ref) => {
    const key = familyActivitySignature(step);
    const existing = bySignature.get(key);
    if (existing) existing.sources.push(ref);
    else {
      const slot = { step, sources: [ref] };
      slots.push(slot);
      bySignature.set(key, slot);
    }
  };
  if (lesson?.daily_lessons?.length) {
    DAYS.forEach((day, weekdayIndex) => {
      const daily = lesson.daily_lessons.find(item => item.day === day);
      if (!daily || daily.active === false) return;
      const required = (daily.steps || []).flatMap((step, index) =>
        availableForFamily(step, context) ? [index] : []);
      if (!required.length) return;
      const source = { lessonId: `${lesson.id}:${day}`, weekdayIndex, required };
      days.push(source);
      required.forEach(index => add(daily.steps[index], { ...source, index }));
    });
  } else {
    const required = (lesson?.steps || []).flatMap((step, index) =>
      availableForFamily(step, context) ? [index] : []);
    required.forEach(index => add(lesson.steps[index],
      { lessonId: lesson.id, index, required, weekdayIndex: null }));
  }
  // Flattening five days must not put Tuesday's new HFW after Monday's book.
  // Keep preparation in source order, then the readers in their original order.
  const books = slots.filter(slot => slot.step.mode === 'book_reading');
  const preparation = slots.filter(slot => slot.step.mode !== 'book_reading');
  const titles = { sight_words: 'Construye: palabras frecuentes', syllables: 'Construye: sílabas',
    words: 'Construye: palabras', phrases: 'Construye: frases' };
  const requiredKinds = building?.requiredKinds || [];
  const buildingSlots = requiredKinds.map(kind => ({
    masteryKind: kind,
    step: { mode: 'word_builder', title: titles[kind], emoji: '', color: 'purple',
      live_scope: 'both', access_scope: 'both', completion: { type: 'mastery', target: 20 },
      config: { buildingKind: kind, masteryLevelId: lesson.id } },
    sources: [{ lessonId: `${lesson.id}:building`, index: Object.keys(titles).indexOf(kind),
      weekdayIndex: null, required: requiredKinds.map(k => Object.keys(titles).indexOf(k)) }],
  }));
  return { slots: [...preparation, ...buildingSlots, ...books], days, building,
    passedKinds: building?.passedKinds || [], grandfather: building?.grandfather === true,
    studentId: building?.studentId };
}

export function familyCompletedIndexes(plan, records, week) {
  return plan.slots.flatMap((slot, index) => slot.masteryKind
    ? (plan.grandfather || plan.passedKinds?.includes(slot.masteryKind) &&
        slot.sources.some(source => records.some(row => row.lesson_id === source.lessonId &&
          row.completed_steps?.includes(source.index))) ? [index] : [])
    : slot.sources.some(source => {
    const row = records.filter(record => record.lesson_id === source.lessonId)
      .sort((a, b) => new Date(b.updated_date || b.created_date || 0) -
        new Date(a.updated_date || a.created_date || 0))[0];
    return row?.completed_steps?.includes(source.index) ||
      (source.weekdayIndex !== null && week?.completed_steps?.includes(source.weekdayIndex));
  }) ? [index] : []);
}

export async function saveFamilyCompletion({ plan, index, weekId, read, ensure, write }) {
  if (!plan.slots[index]) return null;
  const completed = new Set([...familyCompletedIndexes(plan, read(), read().find(r => r.lesson_id === weekId)), index]);
  const grouped = new Map();
  for (const i of completed) for (const source of plan.slots[i].sources) {
    if (!grouped.has(source.lessonId)) grouped.set(source.lessonId, { indexes: new Set(), required: source.required });
    grouped.get(source.lessonId).indexes.add(source.index);
  }
  // Group by daily record and serialize writes. This both avoids lost-index
  // races and gives an already-finished repeated chart credit in each day.
  for (const [id, group] of grouped) {
    const row = await ensure(id);
    const completed_steps = [...new Set([...(row.completed_steps || []), ...group.indexes])];
    const done = group.required.every(i => completed_steps.includes(i));
    if (completed_steps.length !== (row.completed_steps || []).length || row.completed !== done)
      await write(row, { completed_steps, completed: done,
        current_step: Math.max(row.current_step || 0, ...completed_steps.map(i => i + 1)) });
  }
  if (plan.days.length) {
    const week = await ensure(weekId);
    const completed_steps = [...new Set([...(week.completed_steps || []),
      ...plan.days.filter(day => day.required.every(i => read().some(row =>
        row.lesson_id === day.lessonId && row.completed_steps?.includes(i)))).map(day => day.weekdayIndex)])];
    const done = plan.days.every(day => completed_steps.includes(day.weekdayIndex)) &&
      plan.slots.every((slot, slotIndex) => completed.has(slotIndex));
    if (completed_steps.length !== (week.completed_steps || []).length || week.completed !== done)
      await write(week, { completed_steps, completed: done,
        current_step: Math.max(week.current_step || 0, 0, ...completed_steps) });
  }
  return true;
}
