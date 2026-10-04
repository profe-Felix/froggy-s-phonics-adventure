import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { requestWithRetry, retryDelay } from '@/lib/classroomSync';
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

// Student view for a live guided lesson. Subscribes to the teacher's session
// and renders the current step. When phase=watch, students are locked (watching
// a broadcast video or a "waiting" screen). When phase=try, the activity is
// released and students can interact — the teacher advances when ready.
export default function LiveLessonStudent({ session, studentData, selectedStudent, onUpdateProgress, onStudentPatch, onExit }) {
  const [localSession, setLocalSession] = useState(session);
  const localSessionRef = useRef(session);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const [sessionSyncError, setSessionSyncError] = useState('');

  // Fetch the lesson to get the full steps array
  const { data: lesson, error: lessonError, refetch: retryLesson } = useQuery({
    queryKey: ['live-lesson-data', session.lesson_id],
    queryFn: async () => {
      const list = await requestWithRetry(() => base44.entities.Lesson.filter({ id: session.lesson_id }));
      return list?.[0];
    },
    enabled: !!session?.lesson_id,
  });

  // Use usable event payloads immediately; REST is initial/recovery only.
  useEffect(() => {
    const sessionId = session?.id;
    if (!sessionId) return;
    let alive = true;
    let inFlight = false;
    let eventVersion = 0;
    let blockedUntil = 0;
    let timer;

    const apply = fresh => {
      if (!alive || !fresh) return;
      if (fresh.active === false) {
        exitRef.current?.();
        return;
      }
      const merged = { ...localSessionRef.current, ...fresh, id: sessionId };
      const changedStep = merged.current_step !== localSessionRef.current?.current_step;
      localSessionRef.current = merged;
      setLocalSession(merged);
      setSessionSyncError('');
      if (changedStep && fresh.broadcast_state === undefined) refreshBroadcast();
    };

    const refresh = async () => {
      if (!alive || inFlight || Date.now() < blockedUntil) return;
      inFlight = true;
      const version = eventVersion;
      try {
        const fresh = await requestWithRetry(() => base44.entities.LiveLessonSession.get(sessionId));
        if (alive && version === eventVersion) apply(fresh);
      } catch (error) {
        blockedUntil = Date.now() + retryDelay(error, 2);
        if (alive) setSessionSyncError('Connection interrupted — keeping your activity and retrying.');
      } finally {
        inFlight = false;
      }
    };

    const unsubscribe = base44.entities.LiveLessonSession.subscribe(event => {
      if (!alive || (event.id || event.data?.id) !== sessionId) return;
      eventVersion += 1;
      if (event.type === 'delete') {
        exitRef.current?.();
        return;
      }
      const data = event.data || {};
      if (['active', 'phase', 'current_step', 'release_mode', 'broadcast_state'].some(key => key in data)) {
        apply(data);
      } else {
        void refresh();
      }
    });

    const recover = async () => {
      if (!alive) return;
      if (document.visibilityState === 'visible') await refresh();
      if (alive) timer = setTimeout(recover, 8000 + Math.random() * 3000);
    };

    void refresh();
    timer = setTimeout(recover, 8000 + Math.random() * 3000);

    const visible = () => {
      if (document.visibilityState === 'visible') {
        blockedUntil = 0;
        void refresh();
      }
    };

    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', visible);

    return () => {
      alive = false;
      unsubscribe?.();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', visible);
    };
  }, [session?.id]);

  const steps = getLiveLessonSteps(
    lesson,
    localSession?.lesson_day || session?.lesson_day || ''
  );
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

  if (!lesson && lessonError) {
    return (
      <div role="alert" className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center gap-4 p-6">
        <p>The lesson could not load yet. Your student information is still selected.</p>
        <button type="button" onClick={() => retryLesson()} className="bg-indigo-600 rounded-xl px-5 py-3">
          Retry lesson
        </button>
      </div>
    );
  }

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
      <div className="relative h-screen overflow-hidden flex flex-col bg-slate-50">
        <div className="bg-violet-600 text-white text-center py-2 text-sm font-black flex items-center justify-center gap-2 shrink-0">
          <Footprints className="w-4 h-4" /> Work at your own pace — step {stepIndex + 1} of {steps.length}
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
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
    <div className="relative h-screen overflow-hidden flex flex-col">
      <div className="bg-green-600 text-white text-center py-2 text-sm font-black flex items-center justify-center gap-2 shrink-0">
        <Unlock className="w-4 h-4" /> Try it on your iPad! Your teacher will advance when ready.
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
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