import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLessonProgress } from '@/hooks/useLessonProgress';
import { fetchLessons } from '@/lib/lessonsLoader';
import LessonStepper from './LessonStepper';
import { STEP_COLORS, colorOf, MODE_BY_VALUE } from '@/lib/lessonColors';
import { ArrowLeft, Lock, Check, Star, ChevronRight } from 'lucide-react';

const WEEKDAYS = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
];

// Free-play fallback shown when no lesson is assigned to the class.
function FreePlayFallback({ onFreePlay, onLogout, studentData }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-100 to-white flex flex-col items-center justify-center gap-4 p-6">
      <div className="text-5xl">📭</div>
      <h1 className="text-2xl font-black text-gray-800 text-center">No lessons assigned yet</h1>
      <p className="text-gray-500 text-center max-w-sm">
        Your teacher hasn't set up a lesson for {studentData?.class_name || 'this class'} yet.
      </p>
      <div className="flex gap-3 mt-2">
        <button onClick={onFreePlay}
          className="px-6 py-3 bg-green-500 text-white font-black rounded-2xl shadow hover:bg-green-600">
          ▶ Play freely
        </button>
        <button onClick={onLogout}
          className="px-6 py-3 bg-white text-gray-600 font-bold rounded-2xl shadow border hover:bg-gray-50">
          Log out
        </button>
      </div>
    </div>
  );
}

function StepCard({ step, index, status, onStart }) {
  const c = colorOf(step.color);
  const num = index + 1;
  const isLocked = status === 'locked';
  const isDone = status === 'done';
  const isCurrent = status === 'current';

  return (
    <button
      disabled={isLocked}
      onClick={() => !isLocked && onStart(step, index)}
      className={[
        'relative rounded-3xl p-4 flex flex-col items-center justify-center aspect-square transition-all',
        'shadow-md border-4',
        c.bg,
        isLocked ? 'opacity-50 grayscale border-white/60 cursor-not-allowed' : 'border-white hover:scale-[1.03] hover:shadow-lg',
        isCurrent ? `ring-4 ${c.ring}` : '',
      ].join(' ')}
    >
      {/* faded big number */}
      <span className="absolute top-1 left-1/2 -translate-x-1/2 text-6xl font-black text-white/55 select-none pointer-events-none">
        {num}
      </span>
      {/* star badge */}
      <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-yellow-300 border-2 border-white shadow flex items-center justify-center">
        <Star className="w-3.5 h-3.5 text-yellow-700 fill-yellow-500" />
      </span>
      {/* emoji / illustration */}
      {step.emojiImage && !isLocked ? (
        <img src={step.emojiImage} alt="" className="w-12 h-12 sm:w-14 sm:h-14 mt-4 mb-1 object-contain drop-shadow-sm" />
      ) : (
        <span className="text-4xl sm:text-5xl mt-6 mb-1 drop-shadow-sm">
          {isLocked ? '🔒' : (step.emoji || MODE_BY_VALUE[step.mode]?.emoji || '⭐')}
        </span>
      )}
      <span className="text-xs sm:text-sm font-black text-gray-700 text-center leading-tight px-1">
        {step.title}
      </span>
      {isDone && (
        <span className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-green-500 border-2 border-white shadow flex items-center justify-center">
          <Check className="w-4 h-4 text-white" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

export default function LessonMap({
  studentData,
  selectedStudent,
  onUpdateProgress,
  onStudentPatch,
  onLogout,
  onFreePlay,
  initialLessonId,
  onBack,
  onLessonComplete,
  accessContext = 'school',
}) {
  const className = selectedStudent?.class_name;
  const [lessonIdx, setLessonIdx] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);

  const { data: lessons = [] } = useQuery({
    queryKey: ['lessons', className],
    queryFn: fetchLessons,
  });

  const myLessons = useMemo(
    () => lessons
      .filter(l => !l.class_name || l.class_name === className)
      .sort((a, b) => (a.lesson_number || 0) - (b.lesson_number || 0)),
    [lessons, className]
  );

  const currentLesson =
    myLessons[Math.min(lessonIdx, myLessons.length - 1)] || null;

  const {
    progress: weekProgress,
    markStepComplete: markWeekdayComplete,
  } = useLessonProgress(
    selectedStudent?.number,
    selectedStudent?.class_name,
    currentLesson?.id
  );

  // When opened from a level puck, jump straight to that lesson.
  useEffect(() => {
    if (!initialLessonId || !myLessons.length) return;
    const idx = myLessons.findIndex((l) => l.id === initialLessonId);

    if (idx >= 0) {
      setLessonIdx(idx);
      setSelectedDay(null);
    }
  }, [initialLessonId, myLessons]);

  if (!myLessons.length) {
    return <FreePlayFallback onFreePlay={onFreePlay} onLogout={onLogout} studentData={studentData} />;
  }

  const dailyLessons = WEEKDAYS.map(({ value, label }) => {
    const savedDailyLesson = (currentLesson?.daily_lessons || []).find(
      (dailyLesson) => dailyLesson.day === value
    );

    return {
      day: value,
      label,
      active: savedDailyLesson?.active !== false,
      module_number: savedDailyLesson?.module_number || 1,
      curriculum_lesson_number:
        savedDailyLesson?.curriculum_lesson_number || 1,
      title: savedDailyLesson?.title || '',
      steps: savedDailyLesson?.steps || [],
    };
  });

  const isStepAvailable = (step) =>
    step.live_scope !== 'live_only' &&
    (
      accessContext !== 'home' ||
      step.access_scope !== 'school_only'
    );

  const requiredDayIndexes = dailyLessons
    .map((dailyLesson, weekdayIndex) =>
      dailyLesson.active !== false &&
      dailyLesson.steps.some(isStepAvailable)
        ? weekdayIndex
        : null
    )
    .filter((weekdayIndex) => weekdayIndex !== null);

  const hasDailyLessons =
    Array.isArray(currentLesson?.daily_lessons) &&
    currentLesson.daily_lessons.length > 0;

  const selectedDailyLesson = dailyLessons.find(
    (dailyLesson) => dailyLesson.day === selectedDay
  );

  const handleDailyLessonComplete = async () => {
    if (!selectedDailyLesson) return;

    const weekdayIndex = WEEKDAYS.findIndex(
      ({ value }) => value === selectedDailyLesson.day
    );

    if (
      weekdayIndex < 0 ||
      !requiredDayIndexes.includes(weekdayIndex)
    ) {
      return;
    }

    const updatedWeekProgress = await markWeekdayComplete(
      weekdayIndex,
      requiredDayIndexes.length,
      requiredDayIndexes
    );

    const weekJustCompleted =
      updatedWeekProgress?.completed &&
      !weekProgress?.completed;

    if (weekJustCompleted) {
      onLessonComplete?.(currentLesson.lesson_number);
    }
  };

  if (hasDailyLessons && !selectedDailyLesson) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-100 to-white p-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-5">
            <button
              onClick={onBack}
              className="w-10 h-10 rounded-full bg-white text-indigo-700 shadow flex items-center justify-center hover:bg-indigo-50"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div>
              <h1 className="text-2xl font-black text-indigo-900">
                Week {currentLesson.lesson_number || ''}
              </h1>
              <p className="text-sm text-gray-600">
                {currentLesson.subtitle || currentLesson.title}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {dailyLessons.map((dailyLesson) => {
              const availableSteps =
                dailyLesson.steps.filter(isStepAvailable);

              const activityCount = availableSteps.length;

              const canOpen =
                dailyLesson.active !== false &&
                activityCount > 0;

              const weekdayIndex = WEEKDAYS.findIndex(
                ({ value }) => value === dailyLesson.day
              );

              const isComplete =
                canOpen &&
                weekdayIndex >= 0 &&
                (weekProgress?.completed_steps || []).includes(
                  weekdayIndex
                );

              return (
                <button
                  key={dailyLesson.day}
                  type="button"
                  disabled={!canOpen}
                  onClick={() => canOpen && setSelectedDay(dailyLesson.day)}
                  className={[
                    'rounded-3xl border-4 p-5 text-left shadow-md transition',
                    isComplete
                      ? 'bg-green-50 border-green-300 hover:scale-[1.02] hover:shadow-lg'
                      : canOpen
                        ? 'bg-white border-white hover:scale-[1.02] hover:shadow-lg'
                        : 'bg-gray-100 border-white opacity-65 cursor-not-allowed',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xl font-black text-gray-800">
                        {dailyLesson.label}
                      </p>

                      {dailyLesson.active !== false ? (
                        <p className="text-sm font-black text-indigo-600 mt-1">
                          M{dailyLesson.module_number}.L{dailyLesson.curriculum_lesson_number}
                        </p>
                      ) : (
                        <p className="text-sm font-bold text-gray-500 mt-1">
                          No school
                        </p>
                      )}
                    </div>

                    <span className="text-3xl">
                      {isComplete
                        ? '✅'
                        : dailyLesson.active === false
                          ? '🏫'
                          : '📚'}
                    </span>
                  </div>

                  {dailyLesson.active !== false && (
                    <>
                      {dailyLesson.title && (
                        <p className="text-sm font-bold text-gray-700 mt-3">
                          {dailyLesson.title}
                        </p>
                      )}

                      <p
                        className={[
                          'text-xs mt-2',
                          isComplete
                            ? 'font-black text-green-600'
                            : 'text-gray-500',
                        ].join(' ')}
                      >
                        {isComplete
                          ? `Complete • ${activityCount} activit${activityCount === 1 ? 'y' : 'ies'}`
                          : activityCount > 0
                            ? `${activityCount} activit${activityCount === 1 ? 'y' : 'ies'}`
                            : accessContext === 'home' &&
                              dailyLesson.steps.length > 0
                              ? 'School activities only'
                              : 'No activities assigned yet'}
                      </p>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (hasDailyLessons && selectedDailyLesson) {
    const dailyLessonTitle =
      selectedDailyLesson.title ||
      `${selectedDailyLesson.label} • M${selectedDailyLesson.module_number}.L${selectedDailyLesson.curriculum_lesson_number}`;

    return (
      <LessonStepper
        key={`${currentLesson.id}-${selectedDailyLesson.day}`}
        studentData={studentData}
        selectedStudent={selectedStudent}
        lesson={{
          ...currentLesson,
          title: dailyLessonTitle,
        }}
        steps={selectedDailyLesson.steps}
        lessonId={`${currentLesson.id}:${selectedDailyLesson.day}`}
        onBack={() => setSelectedDay(null)}
        onLessonComplete={handleDailyLessonComplete}
        onUpdateProgress={onUpdateProgress}
        onStudentPatch={onStudentPatch}
        accessContext={accessContext}
      />
    );
  }

  const steps = currentLesson?.steps || [];

  return (
    <LessonStepper
      key={currentLesson.id}
      studentData={studentData}
      selectedStudent={selectedStudent}
      lesson={currentLesson}
      steps={steps}
      lessonId={currentLesson.id}
      onBack={onBack}
      onLessonComplete={onLessonComplete}
      onUpdateProgress={onUpdateProgress}
      onStudentPatch={onStudentPatch}
      accessContext={accessContext}
    />
  );
}

function LessonMapInner({ studentNumber, className, lesson, steps, lessonId, isLast, onStartStep, onNextLesson, onLogout, onBack, onLessonComplete, showInfo, setShowInfo }) {
  const { progress, isLoading } = useLessonProgress(studentNumber, className, lessonId);
  const completedSteps = progress?.completed_steps || [];
  const firstIncomplete = steps.findIndex((_, i) => !completedSteps.includes(i));
  const allDone = completedSteps.length >= steps.length && steps.length > 0;

  const awardedRef = useRef(false);
  useEffect(() => {
    if (allDone && !awardedRef.current && onLessonComplete) {
      awardedRef.current = true;
      onLessonComplete(lesson?.lesson_number);
    }
  }, [allDone, lesson, onLessonComplete]);

  if (isLoading || !progress) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={onBack || onLogout} className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center hover:bg-indigo-200">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            {allDone && (
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500">
                <Check className="w-4 h-4 text-white" strokeWidth={3} />
              </span>
            )}
            <h1 className="font-black text-indigo-900 text-base sm:text-xl">
              Lesson {lesson?.lesson_number || ''}{allDone ? ' Complete!' : ''}
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 -mt-0.5">{lesson?.subtitle || lesson?.title}</p>
        </div>
        <button onClick={() => setShowInfo(s => !s)}
          className="px-3 py-1 rounded-full bg-white border border-indigo-200 text-indigo-700 text-xs font-bold hover:bg-indigo-50">
          Info
        </button>
      </div>

      {showInfo && (
        <div className="mx-4 mb-2 rounded-xl bg-indigo-50 border border-indigo-100 px-3 py-2 text-xs text-indigo-700">
          Complete each step in order — the next one unlocks when the current step is done. ⭐ = step, ✅ = complete, 🔒 = locked.
        </div>
      )}

      {/* Step grid */}
      <div className="flex-1 px-4 pb-6 flex flex-col items-center justify-center">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 max-w-3xl w-full">
          {steps.map((step, i) => {
            const done = completedSteps.includes(i);
            const status = done ? 'done' : i === firstIncomplete ? 'current' : 'locked';
            return <StepCard key={i} step={step} index={i} status={status} onStart={onStartStep} />;
          })}
        </div>

        {allDone && (
          <div className="mt-6 text-center">
            <div className="text-4xl mb-2">🎉</div>
            {!isLast ? (
              <button onClick={onNextLesson}
                className="px-6 py-3 bg-green-500 text-white font-black rounded-2xl shadow hover:bg-green-600 inline-flex items-center gap-2">
                Next Lesson <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <p className="font-black text-green-600">All lessons complete — amazing work!</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}