import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import DictationCanvas from '@/components/dictation/DictationCanvas';
import DictationLogin from '@/components/dictation/DictationLogin';
import BackButton from '@/components/ui/BackButton';

export default function DictationStudent() {
  const params = new URLSearchParams(window.location.search);
  const [session, setSession] = useState(() => {
    const a = params.get('assignment');
    const c = params.get('class');
    const s = params.get('student');
    if (a && c && s) {
      return { assignmentId: a, class_name: c, studentNumber: parseInt(s), assignmentTitle: '', promptText: '' };
    }
    return null;
  });
  const [schoolYear, setSchoolYear] = useState(ACTIVE_SCHOOL_YEAR);

  const { data: assignment } = useQuery({
    queryKey: ['dictation-assignment', session?.assignmentId],
    queryFn: () => base44.entities.DictationAssignment.get(session.assignmentId),
    enabled: !!session?.assignmentId,
  });

  useEffect(() => {
    if (!session?.class_name || !session?.studentNumber) return;
    base44.entities.Student
      .filter({ class_name: session.class_name, student_number: session.studentNumber, school_year: ACTIVE_SCHOOL_YEAR })
      .then((students) => {
        if (students.length > 0) setSchoolYear(students[0].school_year || ACTIVE_SCHOOL_YEAR);
      })
      .catch(() => {});
  }, [session?.class_name, session?.studentNumber]);

  if (session) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-200 bg-white">
          <BackButton tone="indigo" onClick={() => setSession(null)} />
          <h1 className="text-lg font-black text-slate-800 flex-1">
            📝 {assignment?.title || session.assignmentTitle || 'Dictation'}
          </h1>
          <span className="text-sm font-bold text-slate-500">
            {session.class_name} · #{session.studentNumber}
          </span>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <DictationCanvas
            assignmentId={session.assignmentId}
            studentNumber={session.studentNumber}
            className={session.class_name}
            schoolYear={schoolYear}
            promptText={assignment?.prompt_text ?? session.promptText}
          />
        </div>
      </div>
    );
  }

  return <DictationLogin onStart={setSession} />;
}