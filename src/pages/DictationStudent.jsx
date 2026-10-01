import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

  // Live session monitoring — if the student was forced in via a live
  // session, poll for its end and free the student back to the login screen.
  // Also used to join the live line-by-line flow when the teacher is driving.
  const urlClass = params.get('class');
  const liveClass = session?.class_name || urlClass;
  const queryClient = useQueryClient();
  const liveQueryKey = ['live-dictation-student', liveClass, ACTIVE_SCHOOL_YEAR];
  const { data: liveSessions = [] } = useQuery({
    queryKey: liveQueryKey,
    queryFn: () =>
      base44.entities.LiveDictationSession.filter({
        class_name: liveClass,
        school_year: ACTIVE_SCHOOL_YEAR,
        active: true,
      }),
    enabled: !!session && !!liveClass,
    refetchInterval: 5000, // 5s fallback (was 1s — caused 429 cascades)
    retry: false, // don't retry on 429 — makes rate limiting worse
  });
  const liveActive = Array.isArray(liveSessions) && liveSessions.length > 0;

  // Realtime: invalidate on any LiveDictationSession change for instant
  // updates without the 1-second polling that was flooding the API.
  useEffect(() => {
    if (!liveClass) return;
    const unsub = base44.entities.LiveDictationSession.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: liveQueryKey });
    });
    return unsub;
  }, [liveClass, queryClient, liveQueryKey]);

  // Track whether we've ever seen the live session as active. The fromLive
  // redirect must only fire AFTER we've confirmed the session existed and
  // then ended — not during the initial query load (when liveActive is
  // briefly false) or during a transient 429 error. Without this guard the
  // student bounces: DictationStudent → home → lockdown redirect → repeat.
  const [sawLiveSession, setSawLiveSession] = useState(false);
  useEffect(() => {
    if (liveActive) setSawLiveSession(true);
  }, [liveActive]);

  // Only needed for the non-live (legacy) flow — live sessions carry their own lines/title.
  const { data: assignment } = useQuery({
    queryKey: ['dictation-assignment', session?.assignmentId],
    queryFn: () => base44.entities.DictationAssignment.get(session.assignmentId),
    enabled: !!session?.assignmentId && !liveActive,
    retry: false,
  });

  // If the student was redirected here from a live dictation session (the
  // live-lesson end race sends them to this page before the LiveDictationSession
  // deactivates), send them back to their game home once that session ends —
  // otherwise they'd be stranded on the dictation page with no way out.
  const fromLive = params.get('fromLive') === '1';
  useEffect(() => {
    // Only redirect back home after we've confirmed the live session existed
    // and has now ended (sawLiveSession=true, liveActive=false). This prevents
    // the home→dictation→home loop that occurred during initial query load.
    if (session && sawLiveSession && !liveActive && liveClass && fromLive) {
      const returnUrl = `/ID?class=${encodeURIComponent(session.class_name)}&number=${session.studentNumber}`;
      window.location.href = returnUrl;
    }
  }, [session, liveActive, sawLiveSession, liveClass, fromLive]);

  // If the student joined directly (no assignment in URL) and the live session
  // has ended, free them back to the login screen. Same sawLiveSession guard
  // prevents clearing the session during initial load.
  useEffect(() => {
    if (session && sawLiveSession && !liveActive && liveClass && !params.get('assignment') && !fromLive) {
      setSession(null);
    }
  }, [session, liveActive, sawLiveSession, liveClass, fromLive]);

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