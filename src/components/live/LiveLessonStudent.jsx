import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import LessonModeRouter from '@/components/lesson/LessonModeRouter';
import StudentMirrorPanel from './StudentMirrorPanel';
import { useLiveBroadcast } from '@/hooks/useLiveBroadcast';
import { useLiveStudentReporter } from '@/hooks/useLiveStudentWork';
import { Eye, Lock, Unlock, CheckCircle2, Radio } from 'lucide-react';

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

  // Real-time subscription — follow the teacher's pace
  useEffect(() => {
    if (!session?.id) return;
    const unsub = base44.entities.LiveLessonSession.subscribe((event) => {
      if (event.data?.id === session.id) {
        setLocalSession(event.data);
        if (event.type === 'delete' || !event.data?.active) {
          onExit?.();
        }
      }
    });
    return unsub;
  }, [session?.id]);

  // Polling safety net — realtime subscriptions can miss events when a student's
  // tab is backgrounded or the network blips, which left students stuck on the
  // old step while the teacher moved on. Every 3s we re-fetch the session and
  // reconcile: exit if the teacher ended the lesson, jump to the teacher's
  // current step/phase if we fell behind, and re-seed the broadcast so the
  // mirror catches up. This also guarantees late joiners land on the correct
  // step (their initial state comes from the fetch, not a possibly-stale cache).
  useEffect(() => {
    if (!session?.id) return;
    let alive = true;
    const tick = async () => {
      try {
        const s = await base44.entities.LiveLessonSession.get(session.id);
        if (!alive || !s) return;

        const lastUpdate = s.updated_date || s.started_at;
        const stale =
          !lastUpdate ||
          Date.now() - new Date(lastUpdate).getTime() > 90 * 1000;

        if (!s.active || stale) {
          onExit?.();
          return;
        }
        setLocalSession((prev) => {
          const prevStep = prev?.current_step ?? 0;
          const prevPhase = prev?.phase ?? 'watch';
          const newStep = s.current_step ?? 0;
          const newPhase = s.phase ?? 'watch';
          // Step changed → the teacher moved on. Re-seed the broadcast so the
          // mirror reflects the new activity even if the subscription missed it.
          if (newStep !== prevStep) refreshBroadcast();
          if (newStep !== prevStep || newPhase !== prevPhase) {
            return { ...prev, ...s };
          }
          return prev;
        });
      } catch { /* best-effort */ }
    };
    tick(); // run immediately so late joiners reconcile at mount
    const iv = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(iv); };
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = lesson?.steps || [];
  const stepIndex = localSession?.current_step || 0;
  const currentStep = steps[stepIndex];
  const phase = localSession?.phase || 'watch';

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
    phase === 'try'
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