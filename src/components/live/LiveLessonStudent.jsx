import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import LessonModeRouter from '@/components/lesson/LessonModeRouter';
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

  const steps = lesson?.steps || [];
  const stepIndex = localSession?.current_step || 0;
  const currentStep = steps[stepIndex];
  const phase = localSession?.phase || 'watch';

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

  // ---------- WATCH PHASE (locked) ----------
  if (phase === 'watch') {
    const videoUrl = currentStep.config?.videoUrl;
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-2 text-rose-400 font-black text-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
          LIVE with your teacher
        </div>

        {videoUrl ? (
          <div className="w-full max-w-2xl flex flex-col items-center gap-3">
            <video
              src={videoUrl}
              controls
              autoPlay
              className="w-full rounded-2xl shadow-2xl bg-black"
            />
            <div className="text-white/80 text-sm flex items-center gap-2">
              <Eye className="w-4 h-4" /> Watch on your iPad — your teacher will tell you when to try.
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="w-24 h-24 rounded-full bg-indigo-500/20 flex items-center justify-center">
              <Eye className="w-12 h-12 text-indigo-300" />
            </div>
            <h2 className="text-2xl font-black text-white">{currentStep.title}</h2>
            <p className="text-white/70 text-center max-w-xs">
              👀 Watch your teacher… getting ready to practice!
            </p>
          </div>
        )}

        <div className="text-xs text-white/50 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5" /> Locked until your teacher says go
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