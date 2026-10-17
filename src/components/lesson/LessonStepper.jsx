import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLessonProgress } from '@/hooks/useLessonProgress';
import { X, Check } from 'lucide-react';
import LessonModeRouter from './LessonModeRouter';
import LessonOverview from './LessonOverview';
import { isTeacherModelStudent } from '@/lib/teacherModel';
import { stopAllAudio } from '@/lib/audio';

// Linear lesson flow: left dots show every step's status, right arrows move
// prev/next. Hosts one step's activity at a time via LessonModeRouter.
// Replaces the old step-card grid so a lesson reads as one continuous activity.
const NAVY = '#26264d';

export default function LessonStepper({
  studentData,
  selectedStudent,
  lesson,
  steps,
  lessonId,
  onBack,
  onLessonComplete,
  onUpdateProgress,
  onStudentPatch,
  accessContext = 'school',
}) {
  const { progress, isLoading, createError, retry } = useLessonProgress(selectedStudent?.number, selectedStudent?.class_name, lessonId);
  const completedSteps = progress?.completed_steps || [];
  const [stepIdx, setStepIdx] = useState(0);
  const [viewMode, setViewMode] = useState('overview');
  const activitySaveRef = useRef(null);
  const registerActivitySave = useCallback(save => { activitySaveRef.current = save; }, []);
  const leaveTaskRef = useRef(null);
  const mountedRef = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const [activityGeneration, setActivityGeneration] = useState(0);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const leaveActivity = (destination = 'overview') => {
    if (leaveTaskRef.current) return leaveTaskRef.current;
    if (!mountedRef.current) return Promise.resolve(false);
    const exit = onBack;
    if (destination === 'path' && typeof exit !== 'function') {
      setLeaveError('The lesson cannot return to the path yet. Keep this activity open.');
      return Promise.resolve(false);
    }
    setLeaving(true);
    setLeaveError('');
    let closedNotebook = false;
    leaveTaskRef.current = Promise.resolve().then(async () => {
      const save = activitySaveRef.current;
      if (save) {
        const closesNotebook = typeof save.close === 'function';
        const saved = await (closesNotebook ? save.close() : save());
        if (!mountedRef.current) return false;
        if (saved !== true) {
          setLeaveError('Your notebook is still saving. Staying here; try the same button again after it reconnects.');
          return false;
        }
        closedNotebook = closesNotebook;
      }
      if (!mountedRef.current) return false;
      stopAllAudio();
      if (destination === 'path') {
        if (await exit() === false) throw new Error('The lesson could not leave.');
      } else {
        setViewMode('overview');
      }
      return true;
    }).catch(() => {
      if (mountedRef.current) {
        // A confirmed close must not leave a dead engine on screen if the
        // outer navigation fails. Reopen the same saved work on retry.
        if (closedNotebook) setActivityGeneration(value => value + 1);
        setLeaveError('The activity could not finish leaving. Staying here; try the same button again.');
      }
      return false;
    }).finally(() => {
      leaveTaskRef.current = null;
      if (mountedRef.current) setLeaving(false);
    });
    return leaveTaskRef.current;
  };

  // Independent lessons never show live-only activities. Home sessions also
  // hide activities marked school-only.
  const visibleSteps = steps
    .map((step, originalIndex) => ({
      step,
      originalIndex,
    }))
    .filter(({ step }) =>
      step.live_scope !== 'live_only'
    )
    .filter(({ step }) =>
      accessContext !== 'home' ||
      step.access_scope !== 'school_only'
    );

  const visibleOriginalIndexes = new Set(
    visibleSteps.map(({ originalIndex }) => originalIndex)
  );

  const completedHiddenStepCount =
    completedSteps.filter(
      (completedIndex) =>
        !visibleOriginalIndexes.has(completedIndex)
    ).length;

  const completionStepCount =
    visibleSteps.length + completedHiddenStepCount;

  // Stop all audio from the previous step when the step changes (manual nav
  // via arrows or dots). The key={stepIdx} remount unmounts the old component,
  // but `new Audio()` objects are not in the DOM and keep playing without this.
  useEffect(() => { stopAllAudio(); }, [stepIdx]);

  const allDone = visibleSteps.length > 0 && visibleSteps.every(({ originalIndex }) => completedSteps.includes(originalIndex));
  const awardedRef = useRef(false);
  useEffect(() => {
    if (allDone && !awardedRef.current && onLessonComplete) {
      awardedRef.current = true;
      onLessonComplete(lesson?.lesson_number);
    }
  }, [allDone, lesson, onLessonComplete]);

  if (isLoading || (!progress && !createError)) {
    return (
      <div className="h-screen bg-[#dae2f3] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-white border-t-[#26264d] rounded-full animate-spin" />
      </div>
    );
  }

  if (!progress && createError) {
    return (
      <div className="h-screen bg-[#dae2f3] flex flex-col items-center justify-center gap-4">
        <div className="text-5xl">🐸</div>
        <p className="text-[#26264d] font-bold text-lg text-center px-6">
          Oops! Something went wrong loading this lesson.
        </p>
        <button
          onClick={retry}
          className="px-6 py-3 rounded-full bg-[#26264d] text-white font-bold text-base shadow-lg active:scale-95"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (visibleSteps.length === 0) {
    return (
      <div className="h-screen bg-[#dae2f3] flex flex-col items-center justify-center gap-4 p-6">
        <div className="text-5xl">🏫</div>

        <h1 className="text-xl font-black text-[#26264d] text-center">
          No activities available at home
        </h1>

        <p className="text-sm text-gray-600 text-center max-w-sm">
          This lesson contains school-only activities. Complete them with your teacher at school.
        </p>

        <button
          onClick={onBack}
          className="px-6 py-3 rounded-full bg-white text-[#26264d] font-bold shadow"
        >
          Go back
        </button>
      </div>
    );
  }

  // OVERVIEW MODE: show large colorful cards before jumping into an activity.
  // The first incomplete card pulsates to show where to start.
  if (viewMode === 'overview') {
    return (
      <LessonOverview
        lesson={lesson}
        steps={visibleSteps}
        completedSteps={completedSteps}
        onStepClick={(i) => { setStepIdx(i); setViewMode('activity'); }}
        onBack={onBack}
        allDone={allDone}
        onLessonComplete={() => onBack?.()}
      />
    );
  }

  const cur = visibleSteps[stepIdx];
  const curOriginalIndex = cur?.originalIndex ?? 0;
  const curDone = completedSteps.includes(curOriginalIndex);
  const isLast = stepIdx >= visibleSteps.length - 1;
  // Teacher-model account (student 30) can advance without completing steps.
  const modelStudent = isTeacherModelStudent(selectedStudent?.number);
  // When an activity completes, return to overview so the student sees the
  // star fill in and the next card pulsate.
  const goNext = () => {
    if (!curDone && !modelStudent) return Promise.resolve(false);
    return leaveActivity();
  };
  const step = cur?.step;

  return (
    <div className="relative h-screen flex flex-col bg-[#dae2f3]">
      {/* Top bar: exit + step title */}
      <div className="flex items-center justify-between px-4 py-3 z-30 shrink-0">
        <button type="button" disabled={leaving} onClick={() => { void leaveActivity(); }} className="w-9 h-9 rounded-full bg-white shadow flex items-center justify-center hover:bg-white/90" style={{ color: NAVY }}>
          <X className="w-5 h-5" />
        </button>
        <div className="px-5 py-1.5 rounded-full bg-white shadow text-sm font-bold truncate max-w-[65%]" style={{ color: NAVY }}>
          {step?.title || lesson?.title}
        </div>
        <div className="w-9" />
      </div>

      {leaveError && <div role="alert" className="px-4 py-2 text-sm font-bold text-red-800 bg-red-50">
        {leaveError}
      </div>}

      {/* Activity fills the space */}
      <div className="flex-1 relative min-h-0" aria-busy={leaving} onPointerDownCapture={event => {
        if (leaveTaskRef.current) { event.preventDefault(); event.stopPropagation(); }
      }}>
        <LessonModeRouter
          key={`${stepIdx}:${activityGeneration}`}
          registerActivitySave={registerActivitySave}
          step={step}
          stepIndex={curOriginalIndex}
          lessonId={lessonId}
          totalSteps={completionStepCount}
          studentData={studentData}
          selectedStudent={selectedStudent}
          onUpdateProgress={onUpdateProgress}
          onStudentPatch={onStudentPatch}
          onBack={() => leaveActivity('path')}
          stepperMode
          onNext={goNext}
          isLast={isLast}
        />
      </div>

      {/* Bottom: lesson complete banner (only when all done) */}
      {allDone && (
        <div className="shrink-0 pb-4 flex justify-center">
          <button type="button" disabled={leaving} onClick={() => { void leaveActivity('path'); }} className="px-6 py-3 bg-green-500 text-white font-black rounded-2xl shadow hover:bg-green-600 inline-flex items-center gap-2">
            <Check className="w-5 h-5" /> Lesson Complete! Return to Path
          </button>
        </div>
      )}
    </div>
  );
}