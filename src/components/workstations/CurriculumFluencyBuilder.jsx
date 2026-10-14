import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { requestWithRetry } from '@/lib/classroomSync';
import { buildFluencyPreset } from '@/lib/literacy/curriculumContentBuilder';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';

const DAYS = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
];

const CONTENT_TYPES = [
  { key: 'sight_words', label: 'Sight Words' },
  { key: 'letters', label: 'Letters / Phonemes' },
  { key: 'syllables', label: 'Syllables' },
];

// Curriculum-driven Fluency Table builder. The teacher picks a week (Lesson
// record) and a day (daily_lessons slot); the preset is generated on the fly
// from the cumulative sight-word / phoneme progression for that curriculum
// position — no manual Supabase edits needed.
export default function CurriculumFluencyBuilder({ onStart }) {
  const [weekId, setWeekId] = useState('');
  const [dayKey, setDayKey] = useState('');
  const [contentType, setContentType] = useState('sight_words');

  const { data: lessons = [], isLoading } = useQuery({
    queryKey: ['fluency-curriculum-lessons', ACTIVE_SCHOOL_YEAR],
    queryFn: async () => {
      const page = await requestWithRetry(() => base44.entities.Lesson.filter({
        active: true,
        school_year: ACTIVE_SCHOOL_YEAR,
      }, { sort: 'lesson_number', limit: 100 }));
      return page?.items ?? page ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const weeks = useMemo(() =>
    lessons.filter(l => (l.daily_lessons || []).some(d => d.active !== false && (d.module_number || 0) > 0)),
    [lessons]);

  const selectedWeek = weeks.find(w => w.id === weekId) || null;

  const availableDays = useMemo(() => {
    if (!selectedWeek) return [];
    return (selectedWeek.daily_lessons || [])
      .filter(d => d.active !== false && (d.module_number || 0) > 0)
      .map(d => {
        const meta = DAYS.find(m => m.key === d.day) || { label: d.day };
        const pos = `M${d.module_number}.L${d.curriculum_lesson_number}`;
        return { ...d, label: `${meta.label} · ${pos}${d.title ? ` — ${d.title}` : ''}` };
      });
  }, [selectedWeek]);

  // Default the day to the first available when a week is chosen.
  useEffect(() => {
    if (selectedWeek && availableDays.length && !availableDays.some(d => d.day === dayKey)) {
      setDayKey(availableDays[0].day);
    }
  }, [selectedWeek, availableDays, dayKey]);

  const selectedDay = availableDays.find(d => d.day === dayKey) || null;

  const preset = useMemo(() => {
    if (!selectedDay) return null;
    return buildFluencyPreset({
      moduleNumber: selectedDay.module_number,
      lessonNumber: selectedDay.curriculum_lesson_number,
      contentType,
      lessons,
    });
  }, [selectedDay, contentType, lessons]);

  const canStart = !!preset && preset.content.length > 0;

  const handleStart = () => {
    if (!preset || !canStart) return;
    onStart({ preset_id: preset.id, preset_data: preset });
  };

  return (
    <div className="flex flex-col gap-4 w-full max-w-md">
      <div className="flex flex-col gap-1.5">
        <label className="font-bold text-sm">Week</label>
        <select
          value={weekId}
          onChange={(e) => { setWeekId(e.target.value); setDayKey(''); }}
          className="px-3 py-2 rounded-lg border font-bold"
          disabled={isLoading}
        >
          <option value="">{isLoading ? 'Loading…' : 'Select a week'}</option>
          {weeks.map(w => (
            <option key={w.id} value={w.id}>
              {w.lesson_number ? `Week ${w.lesson_number}` : ''}{w.title ? ` — ${w.title}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="font-bold text-sm">Day</label>
        <select
          value={dayKey}
          onChange={(e) => setDayKey(e.target.value)}
          className="px-3 py-2 rounded-lg border font-bold"
          disabled={!availableDays.length}
        >
          <option value="">{availableDays.length ? 'Select a day' : '—'}</option>
          {availableDays.map(d => (
            <option key={d.day} value={d.day}>{d.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="font-bold text-sm">Content</label>
        <div className="flex gap-2">
          {CONTENT_TYPES.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setContentType(t.key)}
              className={`flex-1 px-3 py-2 rounded-lg border font-bold text-sm transition ${
                contentType === t.key
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {preset && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="font-bold text-sm text-slate-700">
            {preset.title} · {preset.rows}×{preset.cols}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {preset.content.length} items (cumulative spiral review)
          </p>
          {preset.content.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {Array.from(new Set(preset.content)).slice(0, 24).map((w, i) => (
                <span key={i} className="px-1.5 py-0.5 rounded bg-white border text-xs font-bold text-slate-600">
                  {w}
                </span>
              ))}
              {new Set(preset.content).size > 24 && (
                <span className="px-1.5 py-0.5 text-xs text-slate-400">+{new Set(preset.content).size - 24} more</span>
              )}
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleStart}
        disabled={!canStart}
        className="px-4 py-3 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Start live session
      </button>
      {selectedDay && preset && preset.content.length === 0 && (
        <p className="text-xs text-amber-600 text-center">
          No {contentType.replace('_', ' ')} found for this lesson. Pick another day or content type.
        </p>
      )}
    </div>
  );
}