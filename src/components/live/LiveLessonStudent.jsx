import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import LessonModeRouter from '@/components/lesson/LessonModeRouter';
import StudentMirrorPanel from './StudentMirrorPanel';
import { useLiveBroadcast } from '@/hooks/useLiveBroadcast';
import { useLiveStudentReporter } from '@/hooks/useLiveStudentWork';
import { useLessonProgress } from '@/hooks/useLessonProgress';
import { Eye, Lock, Unlock, CheckCircle2, Radio, Footprints } from 'lucide-react';

const LIVE_WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

function getLiveLessonSteps(lesson) {
  if (!lesson) {
    return [];
  }

  if (
    lesson.assignment_type === 'class' &&
    Array.isArray(lesson.daily_lessons)
  ) {
    const today =
      LIVE_WEEKDAYS[new Date().getDay()];

    const todayLesson =
      lesson.daily_lessons.find(
        (dailyLesson) =>
          dailyLesson.day === today &&
          dailyLesson.active !== false &&
          Array.isArray(dailyLesson.steps) &&
          dailyLesson.steps.length > 0
      );

    if (todayLesson) {
      return todayLesson.steps;
    }

    const firstActiveLesson =
      lesson.daily_lessons.find(
        (dailyLesson) =>
          dailyLesson.active !== false &&
          Array.isArray(dailyLesson.steps) &&
          dailyLesson.steps.length > 0
      );

    return firstActiveLesson?.steps || [];
  }

  return lesson.steps || [];
}

// Student view for a live guided lesson. Subscribes to the teacher's session
// and renders the current step. When phase=watch, students are locked (watching
// a broadcast video or a "waiting" screen). When phase=try, the activity is
// released and students can interact — the teacher advances when ready.
export default function LiveLessonStudent({ session, studentData, selectedStudent, onUpdateProgress, onStudentPatch, onExit }) {
  const [localSession, setLocalSession] = useState(session);

  // Fetch the lesson to get the full steps array
  const { data: lesson } = useQuery({
    queryKey: ['live-lesson-data', session.lesson_id],
    queryFn: async () => {
      const list = await base44.entities.Lesson.filter({ id: session.lesson_id });
      return list?.[0];
    },
    enabled: !!session?.lesson_id,
  });

  // Realtime subscription — follow the teacher's pace.
  useEffect(() => {
    const sessionId = session?.id;

    if (!sessionId) return;

    const unsubscribe =
      base44.entities.LiveLessonSession.subscribe(
        (event) => {
          if (
            event.data?.id !== sessionId
          ) {
            return;
          }

          if (
            event.type === 'delete' ||
            !event.data?.active
          ) {
            onExit?.();
            return;
          }

          setLocalSession((previous) => {
            const previousStep =
              previous?.current_step ?? 0;

            const nextStep =
              event.data.current_step ?? 0;

            if (
              nextStep !== previousStep
            ) {
              refreshBroadcast();
            }

            return {
              ...previous,
              ...event.data,
            };
          });
        }
      );

    return () => {
      unsubscribe?.();
    };
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reconcile once when joining and whenever a suspended tab becomes visible.
  // Realtime handles teacher changes while the page remains active.
  useEffect(() => {
    const sessionId = session?.id;

    if (!sessionId) return;

    let alive = true;

    const reconcileSession = async () => {
      try {
        const fresh =
          await base44.entities.LiveLessonSession.get(
            sessionId
          );

        if (!alive || !fresh) return;

        const lastUpdate =
          fresh.updated_date ||
          fresh.started_at;

        const stale =
          !lastUpdate ||
          Date.now() -
            new Date(lastUpdate).getTime() >
            90 * 1000;

        if (!fresh.active || stale) {
          onExit?.();
          return;
        }

        setLocalSession((previous) => {
          const previousStep =
            previous?.current_step ?? 0;

          const nextStep =
            fresh.current_step ?? 0;

          if (nextStep !== previousStep) {
            refreshBroadcast();
          }

          return {
            ...previous,
            ...fresh,
          };
        });
      } catch {
        // Realtime remains the primary update path.
      }
    };

    const handleVisibilityChange = () => {
      if (
        document.visibilityState ===
        'visible'
      ) {
        void reconcileSession();
      }
    };

    // One request ensures late joiners receive the latest state.
    void reconcileSession();

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange
    );

    return () => {
      alive = false;

      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange
      );
    };
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = getLiveLessonSteps(lesson);
  const teacherStep = localSession?.current_step || 0;
  const phase = localSession?.phase || 'watch';
  const releaseMode = localSession?.release_mode || 'stay';
  const isLesson = releaseMode === 'lesson';

  // In 'lesson' mode students progress through steps in order at their own
  // pace; the teacher's current_step is a floor they can't fall behind.
  const { progress: lessonProgress } = useLessonProgress(
    selectedStudent?.number,
    selectedStudent?.class_name,
    lesson?.id
  );

  const stepIndex = isLesson
    ? Math.max(lessonProgress?.current_step || 0, teacherStep)
    : teacherStep;
  const currentStep = steps[stepIndex];

  // Live mirror of the teacher's screen during the "watch" phase.
  const { broadcast, refresh: refreshBroadcast } = useLiveBroadcast(session?.id);

  // Report this student's work to the teacher dashboard during the try phase.
  const student = selectedStudent
    ? { class_name: selectedStudent.class_name, number: selectedStudent.number }
    : null;
  useLiveStudentReporter(
    session?.id,
    student,
    currentStep,
    stepIndex,
    studentData,
    phase === 'try' || isLesson
  );

  if (!lesson) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-6xl animate-bounce">🐸</div>
      </div>
    );
  }

  // Lesson ended (teacher advanced past the last step or ended session)
  if (!currentStep) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <CheckCircle2 className="w-16 h-16 text-green-500" />
        <h2 className="text-2xl font-black text-gray-800">All done! 🎉</h2>
        <button onClick={onExit} className="px-6 py-3 bg-indigo-500 text-white rounded-xl font-bold hover:bg-indigo-600">
          Back to Home
        </button>
      </div>
    );
  }

  // ---------- LESSON MODE (own pace) — always working, independent step ----------
  if (isLesson) {
    return (
      <div className="relative min-h-screen bg-slate-50">
        <div className="fixed top-0 inset-x-0 bg-violet-600 text-white text-center py-2 text-sm font-black z-[60] flex items-center justify-center gap-2">
          <Footprints className="w-4 h-4" /> Work at your own pace — step {stepIndex + 1} of {steps.length}
        </div>
        <div className="pt-10">
          <LessonModeRouter
            key={stepIndex}
            step={currentStep}
            stepIndex={stepIndex}
            lessonId={lesson.id}
            totalSteps={steps.length}
            studentData={studentData}
            selectedStudent={selectedStudent}
            onUpdateProgress={onUpdateProgress}
            onStudentPatch={onStudentPatch}
            onBack={() => {}}
            stepperMode
            onNext={() => {}}
          />
        </div>
      </div>
    );
  }

  // ---------- WATCH PHASE (locked) — live mirror of the teacher's screen ----------
  if (phase === 'watch') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        <div className="flex items-center justify-center gap-2 text-rose-400 font-black text-sm py-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
          LIVE with your teacher
        </div>
        <div className="flex-1 min-h-0">
          <StudentMirrorPanel step={currentStep} broadcast={broadcast} />
        </div>
      </div>
    );
  }

  // ---------- TRY PHASE (released) ----------
  return (
    <div className="relative">
      <div className="fixed top-0 inset-x-0 bg-green-600 text-white text-center py-2 text-sm font-black z-[60] flex items-center justify-center gap-2">
        <Unlock className="w-4 h-4" /> Try it on your iPad! Your teacher will advance when ready.
      </div>
      <div className="pt-10">
        <LessonModeRouter
          step={currentStep}
          stepIndex={stepIndex}
          lessonId={lesson.id}
          totalSteps={steps.length}
          studentData={studentData}
          selectedStudent={selectedStudent}
          onUpdateProgress={onUpdateProgress}
          onStudentPatch={onStudentPatch}
          onBack={() => {}}
          liveMode
        />
      </div>
    </div>
  );
}