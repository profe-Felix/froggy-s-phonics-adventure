import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Lock, Unlock, ChevronLeft, ChevronRight, X, Radio, Users, PenLine, Footprints, LayoutGrid, MonitorPlay } from 'lucide-react';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { useLiveBroadcast } from '@/hooks/useLiveBroadcast';
import TeacherModelPanel from '@/components/live/TeacherModelPanel';
import TryDashboard from '@/components/live/TryDashboard';
import { useClassNames } from '@/hooks/useClassNames';

const LIVE_WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const LIVE_DAY_OPTIONS = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
];

function getLiveLessonSteps(lesson, selectedDay = '') {
  if (!lesson) {
    return [];
  }

  if (
    lesson.assignment_type === 'class' &&
    Array.isArray(lesson.daily_lessons)
  ) {
    const usableDailyLessons = lesson.daily_lessons.filter(
      (dailyLesson) =>
        dailyLesson.active !== false &&
        Array.isArray(dailyLesson.steps) &&
        dailyLesson.steps.length > 0
    );

    if (selectedDay) {
      const selectedDailyLesson = usableDailyLessons.find(
        (dailyLesson) => dailyLesson.day === selectedDay
      );

      if (selectedDailyLesson) {
        return selectedDailyLesson.steps;
      }
    }

    const today = LIVE_WEEKDAYS[new Date().getDay()];

    const todayLesson = usableDailyLessons.find(
      (dailyLesson) => dailyLesson.day === today
    );

    if (todayLesson) {
      return todayLesson.steps;
    }

    return usableDailyLessons[0]?.steps || [];
  }

  return lesson.steps || [];
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(
    { length: 4 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

export default function LiveLesson() {
  const [session, setSession] = useState(null);
  // Always-current session snapshot so the heartbeat interval reads live
  // step/phase values instead of the stale ones captured at setup.
  const sessionRef = useRef(session);
  const { classList: CLASSES } = useClassNames();
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [selectedLessonDay, setSelectedLessonDay] = useState('');
  const [className, setClassName] = useState('');
  const [targetMode, setTargetMode] = useState('class');
  const [pickedStudents, setPickedStudents] = useState([]);
  const [starting, setStarting] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);

  const { data: lessons = [] } = useQuery({
    queryKey: ['lessons-all-live'],
    queryFn: () => base44.entities.Lesson.filter({ active: true }),
  });

  const selectedLesson = lessons.find(l => l.id === selectedLessonId);

  const selectableDailyLessons =
    selectedLesson?.assignment_type === 'class' &&
    Array.isArray(selectedLesson?.daily_lessons)
      ? LIVE_DAY_OPTIONS.map((dayOption) => {
          const dailyLesson = selectedLesson.daily_lessons.find(
            (item) => item.day === dayOption.value
          );

          return {
            ...dayOption,
            dailyLesson,
          };
        }).filter(
          ({ dailyLesson }) =>
            dailyLesson?.active !== false &&
            Array.isArray(dailyLesson?.steps) &&
            dailyLesson.steps.length > 0
        )
      : [];

  useEffect(() => {
    if (!selectableDailyLessons.length) {
      setSelectedLessonDay('');
      return;
    }

    const today = LIVE_WEEKDAYS[new Date().getDay()];

    setSelectedLessonDay((currentDay) => {
      const currentDayStillExists = selectableDailyLessons.some(
        ({ value }) => value === currentDay
      );

      if (currentDayStillExists) {
        return currentDay;
      }

      const todayExists = selectableDailyLessons.some(
        ({ value }) => value === today
      );

      return todayExists
        ? today
        : selectableDailyLessons[0].value;
    });
  }, [selectedLessonId]);

  const { data: classStudents = [] } = useQuery({
    queryKey: ['class-students-live', className],
    queryFn: () =>
      base44.entities.Student.filter({
        class_name: className,
        school_year: ACTIVE_SCHOOL_YEAR,
      }),
    enabled: !!className,
  });

  // Real-time subscription to the active session.
  //
  // IMPORTANT: the teacher tab is authoritative for current_step and phase.
  // Student joins, heartbeats, and delayed realtime events are allowed to
  // refresh the rest of the session, but they must NEVER move the teacher
  // backward to an older activity.
  useEffect(() => {
    if (!session?.id) return;

    const unsub = base44.entities.LiveLessonSession.subscribe((event) => {
      const eventId =
        event.id ||
        event.data?.id;

      if (eventId !== session.id) return;

      if (event.type === 'delete' || !event.data?.active) {
        setSession(null);
        return;
      }

      setSession(prev => {
        if (!prev) return event.data;

        return {
          ...event.data,

          // Preserve the teacher's current controls instead of accepting
          // possibly delayed values from another realtime update.
          current_step: prev.current_step,
          phase: prev.phase,
        };
      });
    });

    return unsub;
  }, [session?.id]);

  const { send, clear: clearBroadcast } = useLiveBroadcast(session?.id);

  // Keep the ref in sync with the latest session state so the heartbeat
  // interval always reads the current step/phase.
  useEffect(() => { sessionRef.current = session; }, [session]);

  // ------------------------------------------------------------
  // LIVE LESSON HEARTBEAT
  //
  // While this page is still open, touch the session every
  // 15 seconds. This refreshes Base44's built-in updated_date.
  //
  // IMPORTANT:
  // Switching tabs or putting Chrome in the background does NOT
  // intentionally end the session.
  //
  // When the teacher returns to this tab, we immediately send
  // another heartbeat in case the browser throttled background
  // timers.
  //
  // Student devices will use a longer timeout (90 seconds), so
  // ordinary background-tab throttling will not end the lesson.
  // ------------------------------------------------------------
  useEffect(() => {
    if (!session?.id || !session?.active) return;

    let cancelled = false;

    const heartbeat = async () => {
      if (cancelled) return;

      try {
        const s = sessionRef.current;
        if (!s?.id) return;
        await base44.entities.LiveLessonSession.update(
          s.id,
          {
            active: true,
          }
        );
      } catch {
        // Best effort only. A temporary network failure should
        // not interrupt the teacher's lesson.
      }
    };

    // Send one immediately.
    heartbeat();

    // Then every 15 seconds.
    const interval = setInterval(heartbeat, 15000);

    // If the browser throttled the background tab, immediately
    // refresh the heartbeat when the teacher returns.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        heartbeat();
      }
    };

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange
    );

    return () => {
      cancelled = true;
      clearInterval(interval);

      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange
      );
    };
  }, [session?.id, session?.active]);

  const startSession = async () => {
    if (!selectedLessonId || !className) return;

    setStarting(true);

    let code = genCode();

    // Avoid rare code collisions
    const existing =
      await base44.entities.LiveLessonSession.filter({
        code,
        active: true,
      });

    if (existing?.length) {
      code = genCode();
    }

    const target =
      targetMode === 'group'
        ? pickedStudents
        : [];

    // Deactivate any leftover active sessions for this class so students
    // auto-join THIS new lesson instead of a stale session from a previous one.
    try {
      const stale =
        await base44.entities.LiveLessonSession.filter({
          active: true,
          class_name: className,
        });
      await Promise.all(
        (stale || []).map(s =>
          base44.entities.LiveLessonSession
            .update(s.id, { active: false })
            .catch(() => {})
        )
      );
    } catch {}

    const created =
      await base44.entities.LiveLessonSession.create({
        code,
        lesson_id: selectedLessonId,
        lesson_title: selectedLesson?.title || '',
        lesson_day: selectedLessonDay || '',
        class_name: className,
        school_year: ACTIVE_SCHOOL_YEAR,
        target_students: target,
        current_step: 0,
        phase: 'watch',
        release_mode: 'stay',
        active: true,
        started_at: new Date().toISOString(),
        joined_students: [],
      });

    setSession(created);
    setStarting(false);
  };

  const updateSession = async (patch) => {
    if (!session?.id) return;

    setSession(prev =>
      prev
        ? { ...prev, ...patch }
        : prev
    );

    try {
      await base44.entities.LiveLessonSession.update(
        session.id,
        patch
      );
    } catch {}
  };

  const advance = (dir) => {
    const steps = getLiveLessonSteps(
      selectedLesson,
      session?.lesson_day || selectedLessonDay
    );

    if (!steps.length) return;

    const next = Math.max(
      0,
      Math.min(
        steps.length - 1,
        (session.current_step || 0) +
          dir
      )
    );

    clearBroadcast(false);

    updateSession({
      current_step: next,
      phase: 'watch',
      broadcast_state: {},
    });
  };

  const goToStep = (i) => {
    clearBroadcast(false);

    updateSession({
      current_step: i,
      phase: 'watch',
      broadcast_state: {},
    });
  };

  const setPhase = (nextPhase) => {
    if (nextPhase === 'try') {
      clearBroadcast(false);

      updateSession({
        phase: 'try',
        broadcast_state: {},
      });

      return;
    }

    updateSession({
      phase: 'watch',
    });
  };

  const setReleaseMode = (
    nextMode
  ) => {
    if (nextMode === 'lesson') {
      clearBroadcast(false);

      updateSession({
        release_mode: 'lesson',
        broadcast_state: {},
      });

      return;
    }

    updateSession({
      release_mode: 'stay',
      phase: 'watch',
    });
  };

  const endSession = async () => {
    await updateSession({
      active: false,
    });

    setSession(null);
    setSelectedLessonId('');
    setClassName('');
    setPickedStudents([]);
    setTargetMode('class');
    setShowQR(false);
  };

  const toggleStudent = (s) => {
    const key =
      `${s.class_name}:${s.student_number}`;

    setPickedStudents(prev => {
      const exists = prev.some(
        p =>
          `${p.class_name}:${p.student_number}` === key
      );

      return exists
        ? prev.filter(
            p =>
              `${p.class_name}:${p.student_number}` !== key
          )
        : [
            ...prev,
            {
              class_name: s.class_name,
              student_number: s.student_number,
            },
          ];
    });
  };

  // ---------- SETUP SCREEN ----------
  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 to-pink-50 p-6">
        <div className="max-w-2xl mx-auto">

          <div className="flex items-center gap-3 mb-6">
            <Link
              to="/Lessons"
              className="text-rose-600 hover:underline font-bold text-sm"
            >
              <ArrowLeft className="w-4 h-4 inline mr-1" />
              Lessons
            </Link>

            <h1 className="text-3xl font-black text-gray-800 flex items-center gap-2">
              <Radio className="w-7 h-7 text-rose-500" />
              Live Lesson
            </h1>

            <Link
              to="/LiveTracing"
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100"
            >
              <PenLine className="w-4 h-4" />
              Standalone Tracing
            </Link>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-6 space-y-5">

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                1. Pick a lesson
              </label>

              <select
                value={selectedLessonId}
                onChange={(e) => {
                  setSelectedLessonId(e.target.value);
                  setSelectedLessonDay('');
                }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium"
              >
                <option value="">
                  Select a lesson…
                </option>

                {lessons.map((lesson) => (
                  <option
                    key={lesson.id}
                    value={lesson.id}
                  >
                    {lesson.title} · {lesson.assignment_type === 'guided'
                      ? 'Guided'
                      : lesson.assignment_type === 'side_quest'
                        ? 'Small group'
                        : 'Path'}
                  </option>
                ))}
              </select>
            </div>

            {selectableDailyLessons.length > 0 && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  2. Pick a day
                </label>

                <div className="flex gap-2 overflow-x-auto pb-1">
                  {selectableDailyLessons.map(
                    ({ value, label, dailyLesson }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSelectedLessonDay(value)}
                        className={`shrink-0 rounded-xl border-2 px-4 py-3 text-sm font-bold transition ${
                          selectedLessonDay === value
                            ? 'bg-rose-500 text-white border-rose-500'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-rose-300'
                        }`}
                      >
                        <span className="block">{label}</span>
                        <span
                          className={`block text-xs mt-1 ${
                            selectedLessonDay === value
                              ? 'text-rose-100'
                              : 'text-indigo-600'
                          }`}
                        >
                          M{dailyLesson.module_number || 1}.L
                          {dailyLesson.curriculum_lesson_number || 1}
                        </span>
                      </button>
                    )
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                {selectableDailyLessons.length > 0
                  ? '3. Pick a class'
                  : '2. Pick a class'}
              </label>

              <div className="grid grid-cols-4 gap-2">
                {CLASSES.map(c => (
                  <button
                    key={c}
                    onClick={() => setClassName(c)}
                    className={`px-3 py-2 rounded-lg text-sm font-bold border-2 transition ${
                      className === c
                        ? 'bg-rose-500 text-white border-rose-500'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-rose-300'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                {selectableDailyLessons.length > 0
                  ? '4. Who joins?'
                  : '3. Who joins?'}
              </label>

              <div className="flex gap-2 mb-3">
                <button
                  onClick={() =>
                    setTargetMode('class')
                  }
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-bold border-2 transition ${
                    targetMode === 'class'
                      ? 'bg-rose-500 text-white border-rose-500'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  Whole class
                </button>

                <button
                  onClick={() =>
                    setTargetMode('group')
                  }
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-bold border-2 transition ${
                    targetMode === 'group'
                      ? 'bg-rose-500 text-white border-rose-500'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  Small group
                </button>
              </div>

              {targetMode === 'group' && className && (
                <div className="border-2 border-gray-100 rounded-xl p-3 max-h-48 overflow-y-auto">

                  <div className="grid grid-cols-6 gap-2">
                    {classStudents.map(s => {
                      const picked =
                        pickedStudents.some(
                          p =>
                            p.class_name === s.class_name &&
                            p.student_number === s.student_number
                        );

                      return (
                        <button
                          key={s.id}
                          onClick={() =>
                            toggleStudent(s)
                          }
                          className={`h-11 rounded-lg font-bold text-sm border-2 transition ${
                            picked
                              ? 'bg-rose-500 text-white border-rose-500'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-rose-300'
                          }`}
                        >
                          {s.student_number}
                        </button>
                      );
                    })}
                  </div>

                  <p className="text-xs text-gray-400 mt-2">
                    {pickedStudents.length} student(s) selected
                  </p>

                </div>
              )}
            </div>

            <Button
              onClick={startSession}
              disabled={
                !selectedLessonId ||
                !className ||
                starting ||
                (
                  selectableDailyLessons.length > 0 &&
                  !selectedLessonDay
                )
              }
              className="w-full bg-rose-500 hover:bg-rose-600 text-white font-black text-lg py-3"
            >
              <Radio className="w-5 h-5 mr-2" />
              {starting
                ? 'Starting…'
                : 'Start Live Lesson'}
            </Button>

          </div>
        </div>
      </div>
    );
  }

  // ---------- LIVE CONTROL SCREEN ----------
  const steps = getLiveLessonSteps(
    selectedLesson
  );

  const currentStep =
    steps[session.current_step || 0];

  const phase =
    session.phase || 'watch';

  const joinUrl =
    `${window.location.origin}/?live=${session.code}&class=${encodeURIComponent(session.class_name)}`;

  const isLocked =
    phase === 'watch';

  const releaseMode =
    session.release_mode || 'stay';

  return (
    <div className="relative h-screen bg-slate-900 text-white overflow-hidden">

      {/* Top bar */}
      <div className="fixed top-0 inset-x-0 z-[10000] h-14 flex items-center justify-between gap-3 px-4 bg-slate-950 border-b border-slate-700 shadow-xl overflow-x-auto">

        <div className="flex items-center gap-3 min-w-0">

          <span className="flex items-center gap-2 text-rose-400 font-black shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
            LIVE
          </span>

          <h1 className="text-base font-bold truncate">
            {session.lesson_title || 'Live Lesson'}
          </h1>

          <span className="text-xs text-slate-500 hidden sm:inline">
            · {session.class_name}
          </span>

        </div>

        <div className="flex items-center gap-2 shrink-0">

          <button
            onClick={() =>
              setShowQR(v => !v)
            }
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700"
          >
            <Users className="w-4 h-4" />
            Join
          </button>

          {/* Release mode: Together (everyone on my step) vs Own pace (students
              work through steps in order, my step is a floor). */}
          <button
            onClick={() =>
              setReleaseMode(
                releaseMode === 'lesson'
                  ? 'stay'
                  : 'lesson'
              )
            }
            className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold border transition ${
              releaseMode === 'lesson'
                ? 'bg-violet-500/20 text-violet-300 border-violet-500/40 hover:bg-violet-500/30'
                : 'bg-sky-500/20 text-sky-300 border-sky-500/40 hover:bg-sky-500/30'
            }`}
            title={
              releaseMode === 'lesson'
                ? 'Students work at their own pace — tap to bring everyone together'
                : 'Everyone stays on your step — tap to release to their own pace'
            }
          >
            {releaseMode === 'lesson'
              ? <Footprints className="w-4 h-4" />
              : <Users className="w-4 h-4" />
            }

            {releaseMode === 'lesson'
              ? 'Own pace'
              : 'Together'}
          </button>

          {/* Lock/unlock only applies in Together mode — in Own pace students
              are always working independently. */}
          {releaseMode === 'stay' && (
            <button
              onClick={() =>
                setPhase(
                  isLocked
                    ? 'try'
                    : 'watch'
                )
              }
              className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold border transition ${
                isLocked
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-green-500/20 text-green-300 border-green-500/40 hover:bg-green-500/30'
              }`}
              title={
                isLocked
                  ? 'Students locked — tap to release'
                  : 'Students released — tap to lock'
              }
            >
              {isLocked
                ? <Lock className="w-4 h-4" />
                : <Unlock className="w-4 h-4" />
              }

              {isLocked
                ? 'Locked'
                : 'Released'}
            </button>
          )}

          {/* Toggle between the model (student 30 / broadcast) and the live
              class dashboard so the teacher can monitor student work. */}
          <button
            onClick={() =>
              setShowDashboard(v => !v)
            }
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700"
            title={showDashboard ? 'Show the model' : 'Show class dashboard'}
          >
            {showDashboard
              ? <MonitorPlay className="w-4 h-4" />
              : <LayoutGrid className="w-4 h-4" />
            }
            {showDashboard
              ? 'Model'
              : 'Dashboard'}
          </button>

          <button
            onClick={endSession}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold bg-red-500/90 hover:bg-red-500 text-white"
          >
            <X className="w-4 h-4" />
            End
          </button>

        </div>
      </div>

      {/* Main modeling area */}
      <div
        className="fixed inset-x-0 top-14 bottom-14 z-0 overflow-auto bg-slate-900"
        data-live-lesson-stage
      >

        <div
          className={`fixed right-3 top-[4.25rem] z-[10001] pointer-events-none rounded-full px-3 py-1.5 text-xs font-black shadow-lg border ${
            releaseMode === 'lesson'
              ? 'bg-violet-600 text-white border-violet-300'
              : isLocked
                ? 'bg-amber-500 text-slate-950 border-amber-200'
                : 'bg-green-500 text-slate-950 border-green-200'
          }`}
        >
          {releaseMode === 'lesson'
            ? 'STUDENTS: OWN PACE'
            : isLocked
              ? 'STUDENTS: WATCHING'
              : 'STUDENTS: RELEASED'}
        </div>

        {showDashboard ? (
          <TryDashboard
            session={session}
          />
        ) : (
          <TeacherModelPanel
            step={currentStep}
            stepIndex={session.current_step || 0}
            send={send}
            className={session.class_name}
            lesson={selectedLesson}
          />
        )}

      </div>

      {/* Bottom step toolbar */}
      <div className="fixed bottom-0 inset-x-0 z-[10000] h-14 flex items-center gap-2 px-3 bg-slate-950 border-t border-slate-700 shadow-xl">

        <button
          onClick={() => advance(-1)}
          disabled={
            (session.current_step || 0) === 0
          }
          className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-40 shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 flex items-center gap-1.5 overflow-x-auto justify-center">

          {steps.map((s, i) => {
            const active =
              i ===
              (session.current_step || 0);

            return (
              <button
                key={i}
                onClick={() =>
                  goToStep(i)
                }
                className={`h-9 px-3 rounded-lg flex items-center gap-1.5 text-xs font-bold whitespace-nowrap transition ${
                  active
                    ? 'bg-rose-500 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
                title={s.title}
              >
                <span className="text-base leading-none">
                  {s.emoji || '▶'}
                </span>

                <span>
                  {i + 1}
                </span>
              </button>
            );
          })}

        </div>

        <button
          onClick={() => advance(1)}
          disabled={
            (session.current_step || 0) >=
            steps.length - 1
          }
          className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-40 shrink-0"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

      </div>

      {/* QR + join code popover */}
      {showQR && (
        <div
          className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/60"
          onClick={() =>
            setShowQR(false)
          }
        >

          <div
            className="bg-white rounded-2xl p-6 flex flex-col items-center gap-3"
            onClick={e =>
              e.stopPropagation()
            }
          >

            <div className="text-gray-800 font-bold text-sm flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              Students join
            </div>

            <div className="bg-white p-1 rounded-xl">
              <QRCodeSVG
                value={joinUrl}
                size={180}
              />
            </div>

            <div className="text-center">

              <div className="text-xs text-gray-400 font-bold">
                OR enter code
              </div>

              <div className="text-3xl font-black text-gray-800 tracking-widest">
                {session.code}
              </div>

            </div>

            <div className="text-xs text-gray-400 text-center">
              {targetMode === 'group'
                ? `Small group: ${session.target_students?.length || 0} students`
                : `Whole class: ${session.class_name}`
              }
            </div>

            <button
              onClick={() =>
                setShowQR(false)
              }
              className="mt-1 px-4 h-9 rounded-lg bg-slate-800 text-white text-xs font-bold"
            >
              Close
            </button>

          </div>
        </div>
      )}

    </div>
  );
}