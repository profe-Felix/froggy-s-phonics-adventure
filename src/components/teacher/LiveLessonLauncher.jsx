import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchLessons } from '@/lib/lessonsLoader';
import { startLiveLessonSession } from '@/lib/liveLessonStart';
import { Radio, X } from 'lucide-react';

const LIVE_WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_OPTIONS = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
];

// Pre-filled 4-step live-lesson launcher (matches the teacher's setup card).
// Lesson + class arrive pre-selected from the path click + active class; the
// teacher just picks the day and who joins, then Start. Small-group launching
// is deferred (toggle present, surfaces a "coming soon" note).
export default function LiveLessonLauncher({
  lesson: initialLesson,
  className: initialClass,
  classes,
  onClose,
  onStarted,
}) {
  const [selectedLessonId, setSelectedLessonId] = useState(initialLesson?.id || '');
  const [selectedDay, setSelectedDay] = useState('');
  const [className, setClassName] = useState(initialClass || '');
  const [who, setWho] = useState('class'); // 'class' | 'group'
  const [starting, setStarting] = useState(false);

  const { data: lessons = [] } = useQuery({
    queryKey: ['lessons-teacher-launcher'],
    queryFn: fetchLessons,
  });

  const selectedLesson = lessons.find((l) => l.id === selectedLessonId) || initialLesson;

  const dayOptions = useMemo(() => {
    if (!Array.isArray(selectedLesson?.daily_lessons)) return [];
    return DAY_OPTIONS.map((d) => {
      const dl = selectedLesson.daily_lessons.find((x) => x.day === d.value);
      return { ...d, dl };
    }).filter(
      ({ dl }) => dl?.active !== false && Array.isArray(dl?.steps) && dl.steps.length > 0
    );
  }, [selectedLesson]);

  // Default the day to today (if it has steps) or the first available.
  useEffect(() => {
    if (!dayOptions.length) {
      setSelectedDay('');
      return;
    }
    setSelectedDay((cur) => {
      if (dayOptions.some((d) => d.value === cur)) return cur;
      const today = LIVE_WEEKDAYS[new Date().getDay()];
      return dayOptions.some((d) => d.value === today) ? today : dayOptions[0].value;
    });
  }, [dayOptions]);

  const canStart =
    !!selectedLessonId &&
    !!className &&
    !starting &&
    (dayOptions.length > 0 ? !!selectedDay : true);

  const handleStart = async () => {
    setStarting(true);
    try {
      const session = await startLiveLessonSession({
        lessonId: selectedLessonId,
        lessonSource: 'lesson',
        lessonTitle: selectedLesson?.title || '',
        lessonDay: selectedDay,
        className,
      });
      if (session) onStarted(session);
    } catch (e) {
      alert('Could not start the live lesson: ' + (e?.message || e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        style={{ color: '#2d3446' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black">Start Live Lesson</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. Pick a lesson */}
        <label className="block text-sm font-black mb-1.5">1. Pick a lesson</label>
        <select
          value={selectedLessonId}
          onChange={(e) => {
            setSelectedLessonId(e.target.value);
            setSelectedDay('');
          }}
          className="w-full mb-4 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium"
        >
          <option value="">Select a lesson…</option>
          {lessons
            .filter((l) => l.assignment_type !== 'side_quest' && l.assignment_type !== 'guided')
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.title} · {l.assignment_type === 'guided' ? 'Guided' : 'Path'}
              </option>
            ))}
        </select>

        {/* 2. Pick a day */}
        {dayOptions.length > 0 && (
          <>
            <label className="block text-sm font-black mb-1.5">2. Pick a day</label>
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {dayOptions.map(({ value, label, dl }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSelectedDay(value)}
                  className={`shrink-0 rounded-xl border-2 px-4 py-3 text-sm font-bold transition ${
                    selectedDay === value
                      ? 'bg-[#f94a63] text-white border-[#f94a63]'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-rose-300'
                  }`}
                >
                  <span className="block">{label}</span>
                  <span
                    className={`mt-1 block text-xs ${
                      selectedDay === value ? 'text-rose-100' : 'text-indigo-600'
                    }`}
                  >
                    M{dl.module_number || 1}.L{dl.curriculum_lesson_number || 1}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* 3. Pick a class */}
        <label className="block text-sm font-black mb-1.5">
          {dayOptions.length > 0 ? '3.' : '2.'} Pick a class
        </label>
        <div className="mb-4 grid grid-cols-4 gap-2">
          {classes.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setClassName(c)}
              className={`rounded-lg border-2 px-3 py-2 text-sm font-bold transition ${
                className === c
                  ? 'bg-[#f94a63] text-white border-[#f94a63]'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-rose-300'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* 4. Who joins? */}
        <label className="block text-sm font-black mb-1.5">
          {dayOptions.length > 0 ? '4.' : '3.'} Who joins?
        </label>
        <div className="mb-5 flex gap-2">
          <button
            type="button"
            onClick={() => setWho('class')}
            className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-bold transition ${
              who === 'class'
                ? 'bg-[#f94a63] text-white border-[#f94a63]'
                : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            Whole class
          </button>
          <button
            type="button"
            onClick={() => setWho('group')}
            className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-bold transition ${
              who === 'group'
                ? 'bg-[#f94a63] text-white border-[#f94a63]'
                : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            Small group
          </button>
        </div>
        {who === 'group' && (
          <p className="-mt-3 mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-400">
            Small-group launching from here is coming soon. For now, use the Live Lesson page.
          </p>
        )}

        <button
          type="button"
          onClick={handleStart}
          disabled={!canStart}
          className="w-full rounded-xl py-3 text-lg font-black text-white shadow-md transition disabled:opacity-50"
          style={{ background: '#f94a63' }}
        >
          <Radio className="mr-2 inline-block h-5 w-5" />
          {starting ? 'Starting…' : 'Start Live Lesson'}
        </button>
      </div>
    </div>
  );
}