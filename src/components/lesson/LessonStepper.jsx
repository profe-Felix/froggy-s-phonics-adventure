import React, { useState, useEffect, useRef } from 'react';
import { useLessonProgress } from '@/hooks/useLessonProgress';
import { X, ChevronUp, ChevronDown, Check } from 'lucide-react';
import LessonModeRouter from './LessonModeRouter';
import { isTeacherModelStudent } from '@/lib/teacherModel';

// Linear lesson flow: left dots show every step's status, right arrows move
// prev/next. Hosts one step's activity at a time via LessonModeRouter.
// Replaces the old step-card grid so a lesson reads as one continuous activity.
const NAVY = '#26264d';

export default function LessonStepper({ studentData, selectedStudent, lesson, steps, lessonId, onBack, onLessonComplete, onUpdateProgress, onStudentPatch }) {
  const { progress, isLoading, createError, retry } = useLessonProgress(selectedStudent?.number, selectedStudent?.class_name, lessonId);
  const completedSteps = progress?.completed_steps || [];
  const [stepIdx, setStepIdx] = useState(0);

  // Only auto-land on the first incomplete step ONCE (initial load). Without
  // this guard, the effect re-fires every time `progress` changes — including
  // when the student completes the current step — and yanks them to the next
  // step before they ever see the "Step Complete" coin celebration.
  const didInitialLandRef = useRef(false);

  // Filter out live_only steps — they only appear during teacher-led live lessons.
  const visibleSteps = steps
    .map((s, originalIndex) => ({ step: s, originalIndex }))
    .filter(({ step }) => step.live_scope !== 'live_only');

  useEffect(() => {
    if (!progress || !visibleSteps.length || didInitialLandRef.current) return;
    didInitialLandRef.current = true;
    const firstIncomplete = visibleSteps.findIndex(({ originalIndex }) => !completedSteps.includes(originalIndex));
    const target = firstIncomplete === -1 ? visibleSteps.length - 1 : firstIncomplete;
    setStepIdx(prev => prev !== target ? target : prev);
  }, [progress]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const cur = visibleSteps[stepIdx];
  const curOriginalIndex = cur?.originalIndex ?? 0;
  const curDone = completedSteps.includes(curOriginalIndex);
  const isLast = stepIdx >= visibleSteps.length - 1;
  // Teacher-model account (student 30) can advance without completing steps.
  const modelStudent = isTeacherModelStudent(selectedStudent?.number);
  const canNext = (curDone || modelStudent) && !isLast;
  const canPrev = stepIdx > 0;

  const goNext = () => {
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
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-white shadow flex items-center justify-center hover:bg-white/90" style={{ color: NAVY }}>
          <X className="w-5 h-5" />
        </button>
        <div className="px-5 py-1.5 rounded-full bg-white shadow text-sm font-bold truncate max-w-[65%]" style={{ color: NAVY }}>
          {step?.title || lesson?.title}
        </div>
        <div className="w-9" />
      </div>

      {/* Body: dots | activity | arrows */}
      <div className="flex-1 relative flex min-h-0">
        {/* Left dots — one per step */}
        <div className="flex flex-col items-center justify-center gap-3 px-2 sm:px-3">
          {visibleSteps.map(({ step: s, originalIndex }, i) => {
            const done = completedSteps.includes(originalIndex);
            const current = i === stepIdx;
            const clickable = done || current || modelStudent;
            return (
              <button
                key={i}
                disabled={!clickable}
                onClick={() => clickable && setStepIdx(i)}
                title={s?.title || `Step ${i + 1}`}
                className="w-3.5 h-3.5 rounded-full transition"
                style={{
                  background: done ? NAVY : current ? 'transparent' : 'rgba(38,38,77,0.2)',
                  border: current ? `2px solid ${NAVY}` : 'none',
                }}
              />
            );
          })}
        </div>

        {/* Activity */}
        <div className="flex-1 relative min-w-0">
          <LessonModeRouter
            key={stepIdx}
            step={step}
            stepIndex={curOriginalIndex}
            lessonId={lessonId}
            totalSteps={steps.length}
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

        {/* Right arrows */}
        <div className="flex flex-col items-center justify-center gap-3 px-2 sm:px-3">
          <button
            onClick={goPrev}
            disabled={!canPrev}
            className="w-10 h-10 rounded-xl bg-white shadow flex items-center justify-center disabled:opacity-30 hover:bg-white/90"
            style={{ color: NAVY }}
          >
            <ChevronUp className="w-6 h-6" />
          </button>
          <button
            onClick={goNext}
            disabled={!canNext}
            className="w-10 h-10 rounded-xl bg-white shadow flex items-center justify-center disabled:opacity-30 hover:bg-white/90"
            style={{ color: NAVY }}
          >
            <ChevronDown className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Lesson complete banner */}
      {allDone && (
        <div className="shrink-0 pb-4 flex justify-center">
          <button onClick={onBack} className="px-6 py-3 bg-green-500 text-white font-black rounded-2xl shadow hover:bg-green-600 inline-flex items-center gap-2">
            <Check className="w-5 h-5" /> Lesson Complete! Return to Path
          </button>
        </div>
      )}
    </div>
  );
}