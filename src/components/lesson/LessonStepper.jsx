import React, { useState, useEffect, useRef } from 'react';
import { useLessonProgress } from '@/hooks/useLessonProgress';
import { X, Check } from 'lucide-react';
import LessonModeRouter from './LessonModeRouter';
import StepCarousel from './StepCarousel';
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
  const canNext = (curDone || modelStudent) && !isLast;
  const canPrev = stepIdx > 0;

  // When an activity completes, return to overview so the student sees the
  // star fill in and the next card pulsate.
  const goNext = () => {
    if (!curDone && !modelStudent) return;
    stopAllAudio();
    setViewMode('overview');
  };
  // Carousel arrows navigate between activities directly (stay in activity mode).
  const carouselNext = () => {
    if (!curDone && !modelStudent) return;
    if (isLast) { onBack?.(); return; }
    setStepIdx(i => i + 1);
  };
  const goPrev = () => canPrev && setStepIdx(i => i - 1);
  const step = cur?.step;

  return (
    <div className="relative h-screen flex flex-col bg-[#dae2f3]">
      {/* Top bar: exit + step title */}
      <div className="flex items-center justify-between px-4 py-3 z-30 shrink-0">
        <button onClick={() => { stopAllAudio(); setViewMode('overview'); }} className="w-9 h-9 rounded-full bg-white shadow flex items-center justify-center hover:bg-white/90" style={{ color: NAVY }}>
          <X className="w-5 h-5" />
        </button>
        <div className="px-5 py-1.5 rounded-full bg-white shadow text-sm font-bold truncate max-w-[65%]" style={{ color: NAVY }}>
          {step?.title || lesson?.title}
        </div>
        <div className="w-9" />
      </div>

      {/* Activity fills the space */}
      <div className="flex-1 relative min-h-0">
        <LessonModeRouter
          key={stepIdx}
          step={step}
          stepIndex={curOriginalIndex}
          lessonId={lessonId}
          totalSteps={completionStepCount}
          studentData={studentData}
          selectedStudent={selectedStudent}
          onUpdateProgress={onUpdateProgress}
          onStudentPatch={onStudentPatch}
          onBack={onBack}
          stepperMode
          onNext={goNext}
          isLast={isLast}
        />
      </div>

      {/* Bottom: step carousel (or lesson complete banner) */}
      {allDone ? (
        <div className="shrink-0 pb-4 flex justify-center">
          <button onClick={onBack} className="px-6 py-3 bg-green-500 text-white font-black rounded-2xl shadow hover:bg-green-600 inline-flex items-center gap-2">
            <Check className="w-5 h-5" /> Lesson Complete! Return to Path
          </button>
        </div>
      ) : (
        <div className="shrink-0 pb-3 flex justify-center">
          <StepCarousel
            steps={visibleSteps}
            currentIdx={stepIdx}
            completedSteps={completedSteps}
            studentData={studentData}
            onStepClick={(i) => setStepIdx(i)}
            onPrev={goPrev}
            onNext={carouselNext}
            canPrev={canPrev}
            canNext={canNext}
          />
        </div>
      )}
    </div>
  );
}