import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { useClassNames } from '@/hooks/useClassNames';
import { COLOR_GROUPS } from '@/lib/smallGroupColors';
import { MODE_OPTIONS } from '@/lib/lessonColors';
import { StepEditor, blankStep, WEEKDAYS } from '@/pages/LessonEditor';
import { ArrowLeft, Plus, Trash2, Save, Copy, Calendar, X } from 'lucide-react';
import { Link } from 'react-router-dom';

function blankDailyLesson(day) {
  return { day, active: true, title: '', steps: [] };
}

function blankWeek() {
  return {
    title: '',
    week_label: '',
    daily_lessons: WEEKDAYS.map(({ value }) => blankDailyLesson(value)),
    active: true,
    notes: '',
  };
}

// Count total steps across all active days (for the week card summary).
function countSteps(week) {
  return (week.daily_lessons || [])
    .filter((d) => d.active !== false)
    .reduce((sum, d) => sum + (d.steps?.length || 0), 0);
}

export default function SmallGroupLessonPlanner() {
  const qc = useQueryClient();
  const { classList } = useClassNames();
  const urlParams = new URLSearchParams(window.location.search);
  const urlClass = urlParams.get('class') || '';
  const urlGroup = urlParams.get('group') || '';
  const [className, setClassName] = useState(urlClass || '');
  const [colorGroup, setColorGroup] = useState(
    COLOR_GROUPS.some((g) => g.id === urlGroup) ? urlGroup : COLOR_GROUPS[0]?.id || 'red'
  );
  const [editing, setEditing] = useState(null);
  const [expandedDay, setExpandedDay] = useState('monday');
  const [copyOpen, setCopyOpen] = useState(false);

  // Default the class once the list loads.
  useEffect(() => {
    if (!className && classList.length) setClassName(classList[0]);
  }, [classList, className]);

  const groupMeta = COLOR_GROUPS.find((g) => g.id === colorGroup);

  const { data: weeks = [], isLoading } = useQuery({
    queryKey: ['small-group-lessons', className, colorGroup, ACTIVE_SCHOOL_YEAR],
    queryFn: () =>
      base44.entities.SmallGroupLesson.filter({
        class_name: className,
        color_group: colorGroup,
        school_year: ACTIVE_SCHOOL_YEAR,
      }),
    enabled: !!className && !!colorGroup,
  });

  const sorted = useMemo(
    () => [...weeks].sort((a, b) => (a.week_label || '').localeCompare(b.week_label || '')),
    [weeks]
  );

  const save = async () => {
    if (!editing.title?.trim()) return alert('Give this week a title.');
    const cleanDaily = (editing.daily_lessons || WEEKDAYS.map(({ value }) => blankDailyLesson(value))).map((d) => ({
      day: d.day,
      active: d.active !== false,
      title: d.title || '',
      steps: (d.steps || []).map(({ __new, ...s }) => ({ ...s, config: { ...(s.config || {}) } })),
    }));
    const payload = {
      title: editing.title.trim(),
      week_label: editing.week_label || '',
      class_name: className,
      color_group: colorGroup,
      school_year: ACTIVE_SCHOOL_YEAR,
      daily_lessons: cleanDaily,
      active: editing.active !== false,
      notes: editing.notes || '',
    };
    if (editing.id) {
      await base44.entities.SmallGroupLesson.update(editing.id, payload);
    } else {
      await base44.entities.SmallGroupLesson.create(payload);
    }
    qc.invalidateQueries({ queryKey: ['small-group-lessons'] });
    setEditing(null);
  };

  const remove = async (id) => {
    if (!confirm('Delete this week?')) return;
    await base44.entities.SmallGroupLesson.delete(id);
    qc.invalidateQueries({ queryKey: ['small-group-lessons'] });
  };

  const duplicate = async (w) => {
    const { id, created_date, updated_date, created_by_id, ...payload } = w;
    await base44.entities.SmallGroupLesson.create({
      ...payload,
      title: (w.title || 'Week') + ' (copy)',
    });
    qc.invalidateQueries({ queryKey: ['small-group-lessons'] });
  };

  const copyTo = async (targetClass, targetGroup) => {
    if (!editing?.id) return;
    const { id, created_date, updated_date, created_by_id, ...payload } = editing;
    await base44.entities.SmallGroupLesson.create({
      ...payload,
      class_name: targetClass,
      color_group: targetGroup,
      title: (editing.title || 'Week') + ' (copy)',
    });
    qc.invalidateQueries({ queryKey: ['small-group-lessons'] });
    setCopyOpen(false);
    alert(`Copied to ${targetClass} / ${targetGroup}`);
  };

  // ── Edit view ──
  if (editing) {
    const dailyLessons = WEEKDAYS.map(
      ({ value }) =>
        (editing.daily_lessons || []).find((d) => d.day === value) || blankDailyLesson(value)
    );

    const updateDailyLesson = (day, patch) =>
      setEditing({
        ...editing,
        daily_lessons: dailyLessons.map((d) => (d.day === day ? { ...d, ...patch } : d)),
      });

    const setDailyLessonSteps = (day, nextSteps) => updateDailyLesson(day, { steps: nextSteps });

    const moveDailyStep = (day, index, direction) => {
      const dl = dailyLessons.find((d) => d.day === day);
      const steps = dl?.steps || [];
      const next = index + direction;
      if (next < 0 || next >= steps.length) return;
      const arr = [...steps];
      [arr[index], arr[next]] = [arr[next], arr[index]];
      setDailyLessonSteps(day, arr);
    };

    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white">
        <div className="max-w-2xl mx-auto p-4">
          <button
            onClick={() => setEditing(null)}
            className="text-indigo-600 hover:underline font-bold text-sm mb-3 inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> All weeks
          </button>
          <h1 className="text-2xl font-black text-gray-800 mb-1">
            {editing.id ? 'Edit Week' : 'New Week'}
          </h1>
          <p className="text-xs font-bold text-gray-500 mb-4">
            {className} · <span className="capitalize">{colorGroup}</span> group
          </p>

          <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-3 mb-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-gray-600 font-bold">
                Title
                <input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  placeholder="e.g. Red Group — Week 7"
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5"
                />
              </label>
              <label className="text-xs text-gray-600 font-bold">
                Week label (for sorting)
                <input
                  value={editing.week_label || ''}
                  onChange={(e) => setEditing({ ...editing, week_label: e.target.value })}
                  placeholder="e.g. Week 7"
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5"
                />
              </label>
            </div>
            <label className="text-xs text-gray-600 font-bold flex items-center gap-2">
              <input
                type="checkbox"
                checked={editing.active !== false}
                onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
              />
              Active (visible to the live runner and student quests)
            </label>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
            <div className="mb-3">
              <h2 className="font-black text-gray-700">Daily lessons</h2>
              <p className="text-xs text-gray-500 mt-1">
                Plan each school day's activities for this group. Turn off a day for holidays or
                days with no assignment.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {WEEKDAYS.map(({ value, label }) => {
                const dl = dailyLessons.find((d) => d.day === value);
                const isActive = dl?.active !== false;
                const steps = dl?.steps || [];
                return (
                  <div
                    key={value}
                    className={`rounded-xl border p-3 ${
                      isActive ? 'border-indigo-100 bg-indigo-50/50' : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div>
                        <p className="font-black text-gray-800">{label}</p>
                        {dl?.title && isActive && (
                          <p className="text-xs font-bold text-indigo-600">{dl.title}</p>
                        )}
                      </div>
                      <label className="inline-flex items-center gap-2 text-xs font-bold text-gray-600">
                        <input
                          type="checkbox"
                          checked={!isActive}
                          onChange={(e) => updateDailyLesson(value, { active: !e.target.checked })}
                        />
                        No school / no assignment
                      </label>
                    </div>

                    {isActive && (
                      <>
                        <label className="text-xs text-gray-600 font-bold block mb-2">
                          Day title (optional)
                          <input
                            value={dl?.title || ''}
                            onChange={(e) => updateDailyLesson(value, { title: e.target.value })}
                            placeholder="e.g. Introduce m"
                            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 bg-white"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedDay(expandedDay === value ? null : value)
                          }
                          className="w-full flex items-center justify-between rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-50"
                        >
                          <span>Activities ({steps.length})</span>
                          <span>{expandedDay === value ? 'Hide' : 'Edit'}</span>
                        </button>

                        {expandedDay === value && (
                          <div className="border-t border-indigo-100 pt-3 mt-2">
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <p className="text-sm font-black text-gray-700">{label} activities</p>
                              <button
                                type="button"
                                onClick={() =>
                                  setDailyLessonSteps(value, [...steps, blankStep('letter_sounds')])
                                }
                                className="text-sm font-bold text-indigo-600 inline-flex items-center gap-1 hover:underline"
                              >
                                <Plus className="w-4 h-4" /> Add step
                              </button>
                            </div>
                            <div className="flex flex-col gap-2">
                              {steps.map((step, index) => (
                                <StepEditor
                                  key={index}
                                  step={step}
                                  index={index}
                                  total={steps.length}
                                  lessonClass={className}
                                  onChange={(next) =>
                                    setDailyLessonSteps(
                                      value,
                                      steps.map((it, i) => (i === index ? next : it))
                                    )
                                  }
                                  onRemove={() =>
                                    setDailyLessonSteps(
                                      value,
                                      steps.filter((_, i) => i !== index)
                                    )
                                  }
                                  onMove={(dir) => moveDailyStep(value, index, dir)}
                                />
                              ))}
                              {steps.length === 0 && (
                                <p className="text-sm text-gray-400 text-center py-4">
                                  No activities yet. Add the first step above.
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 mb-4">
            <button
              onClick={save}
              className="flex-1 py-3 bg-green-500 text-white font-black rounded-2xl shadow hover:bg-green-600 inline-flex items-center justify-center gap-2"
            >
              <Save className="w-5 h-5" /> Save Week
            </button>
            {editing.id && (
              <button
                onClick={() => setCopyOpen(true)}
                className="px-4 py-3 bg-sky-50 text-sky-600 font-bold rounded-2xl hover:bg-sky-100 inline-flex items-center gap-1.5"
              >
                <Copy className="w-5 h-5" /> Copy to…
              </button>
            )}
          </div>

          {copyOpen && <CopyModal onClose={() => setCopyOpen(false)} onCopy={copyTo} classList={classList} />}
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <Link to="/SmallGroupManager" className="text-indigo-600 hover:underline">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-black text-gray-800">Small Group Lesson Planner</h1>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Plan a weekly M–F lesson for each color group. Each class + group has its own weeks, so a
          red group in one class is independent of a red group in another. Use “Copy to…” to reuse
          a week with another group.
        </p>

        {/* Class + group selectors */}
        <div className="bg-white rounded-2xl shadow-sm p-3 mb-4 flex flex-wrap items-center gap-3">
          <label className="text-xs text-gray-600 font-bold">
            Class
            <select
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              className="block text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 bg-white"
            >
              {classList.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Group</span>
            {COLOR_GROUPS.map((g) => (
              <button
                key={g.id}
                onClick={() => setColorGroup(g.id)}
                className={`w-7 h-7 rounded-full border-2 transition-all ${
                  colorGroup === g.id ? 'ring-2 ring-slate-800 ring-offset-1' : 'border-white/40'
                } ${g.header}`}
                title={g.label}
              />
            ))}
          </div>
          <div className="flex-1" />
          <button
            onClick={() => setEditing(blankWeek())}
            disabled={!className}
            className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl shadow hover:bg-indigo-700 inline-flex items-center gap-1 disabled:opacity-40"
          >
            <Plus className="w-4 h-4" /> New Week
          </button>
        </div>

        {!className ? (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">
            Pick a class to start planning.
          </div>
        ) : isLoading ? (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">
            Loading…
          </div>
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">
            No weeks planned for {className} · <span className="capitalize">{colorGroup}</span> yet.
            Create your first week.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {sorted.map((w) => {
              const stepCount = countSteps(w);
              return (
                <div key={w.id} className="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-indigo-500">{w.week_label || 'Week'}</p>
                      <h3 className="text-lg font-black text-gray-800">{w.title}</h3>
                    </div>
                    {!w.active && (
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                        hidden
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>
                      {stepCount} {stepCount === 1 ? 'activity' : 'activities'} across the week
                    </span>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => setEditing({ ...w })}
                      className="flex-1 py-2 bg-indigo-100 text-indigo-700 font-bold rounded-xl hover:bg-indigo-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => duplicate(w)}
                      className="px-3 py-2 bg-sky-50 text-sky-600 rounded-xl hover:bg-sky-100"
                      title="Duplicate in this group"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => remove(w.id)}
                      className="px-3 py-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CopyModal({ onClose, onCopy, classList }) {
  const [targetClass, setTargetClass] = useState(classList[0] || '');
  const [targetGroup, setTargetGroup] = useState(COLOR_GROUPS[0]?.id || 'red');
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-4 w-full max-w-sm flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-gray-800">Copy week to…</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <label className="text-xs text-gray-600 font-bold">
          Class
          <select
            value={targetClass}
            onChange={(e) => setTargetClass(e.target.value)}
            className="block w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 bg-white"
          >
            {classList.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <div>
          <p className="text-xs text-gray-600 font-bold mb-1">Group</p>
          <div className="flex items-center gap-1.5">
            {COLOR_GROUPS.map((g) => (
              <button
                key={g.id}
                onClick={() => setTargetGroup(g.id)}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  targetGroup === g.id ? 'ring-2 ring-slate-800 ring-offset-1' : 'border-white/40'
                } ${g.header}`}
                title={g.label}
              />
            ))}
          </div>
        </div>
        <button
          onClick={() => onCopy(targetClass, targetGroup)}
          className="w-full py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 inline-flex items-center justify-center gap-1.5"
        >
          <Copy className="w-4 h-4" /> Copy week
        </button>
      </div>
    </div>
  );
}