import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import DictationCanvas from '@/components/dictation/DictationCanvas';
import DictadoLinesCanvas from '@/components/dictation/DictadoLinesCanvas';
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

  // Live session monitoring — if the student was forced in via a live
  // session, poll for its end and free the student back to the login screen.
  // Also used to join the live line-by-line flow when the teacher is driving.
  const urlClass = params.get('class');
  const liveClass = session?.class_name || urlClass;
  const { data: liveSessions = [] } = useQuery({
    queryKey: ['live-dictation-student', liveClass, ACTIVE_SCHOOL_YEAR],
    queryFn: () =>
      base44.entities.LiveDictationSession.filter({
        class_name: liveClass,
        school_year: ACTIVE_SCHOOL_YEAR,
        active: true,
      }),
    enabled: !!session && !!liveClass,
    refetchInterval: 1000,
  });
  const liveActive = Array.isArray(liveSessions) && liveSessions.length > 0;

  // If the student is in a session but the live session has ended, free them.
  useEffect(() => {
    if (session && !liveActive && liveClass && !params.get('assignment')) {
      setSession(null);
    }
  }, [session, liveActive, liveClass]);

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
    // If the teacher is running a live dictado for this class, join the
    // live line-by-line flow (which responds to Reveal / Next / Prev).
    const live = Array.isArray(liveSessions) && liveSessions.length > 0 ? liveSessions[0] : null;
    const liveLines = live?.lines?.length ? live.lines : [];
    const bs = live?.broadcast_state || {};
    const useLive = live && liveLines.length > 0;
    return (
      <div className="h-screen overflow-hidden bg-slate-50 flex flex-col">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-200 bg-white">
          <BackButton tone="indigo" onClick={() => setSession(null)} />
          <h1 className="text-lg font-black text-slate-800 flex-1">
            📝 {useLive ? (live.assignment_title || 'Dictado Live') : (assignment?.title || session.assignmentTitle || 'Dictation')}
          </h1>
          <span className="text-sm font-bold text-slate-500">
            {session.class_name} · #{session.studentNumber}
          </span>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          {useLive ? (
            <DictadoLinesCanvas
              lines={liveLines}
              currentLine={bs.current_line || 0}
              revealed={!!bs.revealed}
              assignmentId={live.assignment_id}
              studentNumber={session.studentNumber}
              className={session.class_name}
              schoolYear={schoolYear}
            />
          ) : (
            <DictationCanvas
              assignmentId={session.assignmentId}
              studentNumber={session.studentNumber}
              className={session.class_name}
              schoolYear={schoolYear}
            />
          )}
        </div>
      </div>
    );
  }

  return <DictationLogin onStart={setSession} initialClass={params.get('class')} />;
}