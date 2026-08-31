import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import LessonModeRouter from '@/components/lesson/LessonModeRouter';
import { Eye, User } from 'lucide-react';

// Teacher's "model on the board" view for activity types that don't have a
// live iPad broadcast. Instead of a static placeholder, this renders the real
// activity as student 30 — the teacher demonstrates on the main screen exactly
// what students will do on their iPads. Runs in live mode so no step completion
// or coin rewards are written; progress is not persisted (pure modeling).
export default function Student30Preview({ step, stepIndex, lesson, className }) {
  const { data: student30, isLoading } = useQuery({
    queryKey: ['student-30-preview', className, ACTIVE_SCHOOL_YEAR],
    queryFn: async () => {
      const list = await base44.entities.Student.filter({
        class_name: className,
        school_year: ACTIVE_SCHOOL_YEAR,
        student_number: 30,
      });
      return list?.[0];
    },
    enabled: !!className,
    staleTime: 60000,
  });

  if (isLoading) {
    return <div className="p-10 text-center text-slate-400">Loading student 30…</div>;
  }

  if (!student30) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-300 p-8 text-center">
        <User className="w-12 h-12 opacity-50" />
        <p className="text-lg font-bold text-slate-200">No student 30 in {className}</p>
        <p className="text-sm text-slate-400 max-w-md">
          Add a student number 30 to this class to model “{step?.title}” live on the board.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/60 border-b border-slate-700 text-xs font-bold text-slate-300 shrink-0">
        <Eye className="w-3.5 h-3.5 text-indigo-400" />
        Modeling as student 30 · {step?.title}
      </div>
      <div className="flex-1 min-h-0 overflow-auto bg-white">
        <LessonModeRouter
          key={`${stepIndex}-${step?.mode}`}
          step={step}
          stepIndex={stepIndex}
          lessonId={lesson?.id}
          totalSteps={(lesson?.steps || []).length}
          studentData={student30}
          selectedStudent={{ number: 30, class_name: className }}
          onUpdateProgress={() => {}}
          onStudentPatch={async () => {}}
          onBack={() => {}}
          stepperMode
          liveMode
        />
      </div>
    </div>
  );
}