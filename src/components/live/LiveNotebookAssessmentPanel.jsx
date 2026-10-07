import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { requestWithRetry } from '@/lib/classroomSync';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Radio, Eye, EyeOff, ChevronLeft, ChevronRight, X, Pause, Play, Lock, Unlock, Footprints, Users, UserCheck } from 'lucide-react';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { useClassNames } from '@/hooks/useClassNames';

// Live notebook assessment control panel.
//
// Teacher picks a class + a DigitalNotebookAssignment + a start page, then
// starts a LiveNotebookAssessment session. Students in that class auto-join
// (forced open) the notebook on the teacher's page. The teacher can:
//   - advance / go back a page (students follow in realtime in 'follow' mode)
//   - PAUSE → every student's notebook shows an "Eyes on board" overlay
//   - RESUME → lift the overlay
//   - toggle Follow / Free — follow locks students to the teacher's page;
//     free lets students navigate at their own pace
//   - select specific students (for absent students or small-group modeling)
//   - END → release students back to their normal home

export default function LiveNotebookAssessmentPanel({ onBack }) {
  const [session, setSession] = useState(null);
  const sessionRef = useRef(session);
  const controlsQueueRef = useRef(new Map());
  const [controlError, setControlError] = useState('');
  const [controlsSaving, setControlsSaving] = useState(false);
  sessionRef.current = session;
  const { classList: CLASSES } = useClassNames();
  const [className, setClassName] = useState('');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [startPage, setStartPage] = useState(1);
  const [starting, setStarting] = useState(false);

  // Student targeting: 'class' = whole class, 'selected' = pick students
  const [targetMode, setTargetMode] = useState('class');
  const [selectedStudentNumbers, setSelectedStudentNumbers] = useState(new Set());
  // Release mode: 'follow' = locked to teacher page, 'free' = own pace
  const [releaseMode, setReleaseMode] = useState('follow');

  const { data: assignments = [] } = useQuery({
    queryKey: ['notebook-assignments-live-assessment', className],
    queryFn: () =>
      base44.entities.DigitalNotebookAssignment.filter({ class_name: className }),
    enabled: !!className,
    retry: false,
  });

  // Load students for the selected class (for the student picker grid)
  const { data: students = [] } = useQuery({
    queryKey: ['students-for-notebook-assessment', className],
    queryFn: () =>
      base44.entities.Student.filter({
        class_name: className,
        school_year: ACTIVE_SCHOOL_YEAR,
      }),
    enabled: !!className && targetMode === 'selected',
    retry: false,
    staleTime: 60000,
  });

  const selectedAssignment = assignments.find(a => a.id === selectedAssignmentId);
  const totalPages = selectedAssignment
    ? Math.max(1, Number(selectedAssignment.pdf_page_count || selectedAssignment.page_count || 1))
    : 1;

  // Realtime subscription to the active session.
  useEffect(() => {
    if (!session?.id) return;
    const unsub = base44.entities.LiveNotebookAssessment.subscribe((event) => {
      const eventId = event.id || event.data?.id;
      if (eventId !== session.id) return;
      if (event.type === 'delete' || event.data?.active === false) {
        setSession(null);
        return;
      }
      setSession(prev => {
        if (!prev) return event.data;
        // Preserve teacher's own controls (release_mode toggle, page) from
        // being overwritten by delayed realtime echoes.
        return {
          ...prev,
          ...event.data,
          release_mode: prev.release_mode,
          current_page: prev.current_page,
        };
      });
    });
    return unsub;
  }, [session?.id]);

  const updateSession = async (patch) => {
    const current = sessionRef.current;
    if (!current?.id) return false;

    const id = current.id;
    let channel = controlsQueueRef.current.get(id);

    if (!channel) {
      channel = { pending: null, running: null };
      controlsQueueRef.current.set(id, channel);
    }

    channel.pending = { ...channel.pending, ...patch };
    sessionRef.current = { ...current, ...patch };
    setSession(sessionRef.current);

    if (channel.running) return channel.running;

    setControlsSaving(true);

    channel.running = (async () => {
      while (channel.pending) {
        const next = channel.pending;
        channel.pending = null;

        try {
          await requestWithRetry(() =>
            base44.entities.LiveNotebookAssessment.update(id, next)
          );
          setControlError('');
        } catch (error) {
          channel.pending = { ...next, ...channel.pending };
          setControlError('Teacher controls have NOT reached the server yet. Students may still be on the previous page. Use Retry controls.');
          return false;
        }
      }

      return true;
    })().finally(() => {
      channel.running = null;
      setControlsSaving(false);
    });

    return channel.running;
  };

  const startSession = async () => {
    if (!selectedAssignmentId || !className) return;
    setStarting(true);
    try {
      const stale = await base44.entities.LiveNotebookAssessment.filter({
        active: true,
        class_name: className,
      });
      await Promise.all(
        (stale || []).map(s =>
          base44.entities.LiveNotebookAssessment.update(s.id, { active: false }).catch(() => {})
        )
      );
    } catch {}

    const page = Math.max(1, Math.min(totalPages, Number(startPage) || 1));
    const targetStudents = targetMode === 'selected'
      ? Array.from(selectedStudentNumbers).map(n => ({ class_name: className, student_number: n }))
      : [];

    const created = await base44.entities.LiveNotebookAssessment.create({
      class_name: className,
      assignment_id: selectedAssignmentId,
      assignment_title: selectedAssignment?.title || '',
      school_year: ACTIVE_SCHOOL_YEAR,
      target_students: targetStudents,
      release_mode: releaseMode,
      current_page: page,
      total_pages: totalPages,
      paused: false,
      active: true,
      started_at: new Date().toISOString(),
    });
    setSession(created);
    setStarting(false);
  };

  const endSession = async () => {
    if (!session?.id) return;
    const saved = await updateSession({ active: false, paused: false });
    if (saved !== true) return;
    sessionRef.current = null;
    setSession(null);
    setSelectedAssignmentId('');
    setClassName('');
    setStartPage(1);
    setSelectedStudentNumbers(new Set());
    setTargetMode('class');
    setReleaseMode('follow');
  };

  const goToPage = (dir) => {
    const total = session?.total_pages || totalPages;
    const next = Math.max(1, Math.min(total, (session.current_page || 1) + dir));
    updateSession({ current_page: next });
  };

  const setPage = (page) => {
    const total = session?.total_pages || totalPages;
    const clamped = Math.max(1, Math.min(total, Number(page) || 1));
    updateSession({ current_page: clamped });
  };

  const togglePause = () => {
    updateSession({ paused: !session.paused });
  };

  const toggleReleaseMode = () => {
    const next = session.release_mode === 'follow' ? 'free' : 'follow';
    updateSession({ release_mode: next });
  };

  const toggleStudent = (num) => {
    setSelectedStudentNumbers(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  // ---------- SETUP SCREEN ----------
  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 to-pink-50 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Link to="/Lessons" className="text-rose-600 hover:underline font-bold text-sm">
              <ArrowLeft className="w-4 h-4 inline mr-1" />
              Lessons
            </Link>
            <h1 className="text-3xl font-black text-gray-800 flex items-center gap-2">
              <Radio className="w-7 h-7 text-rose-500" />
              Live Notebook Assessment
            </h1>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-6 space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">1. Pick a class</label>
              <div className="grid grid-cols-4 gap-2">
                {CLASSES.map(c => (
                  <button
                    key={c}
                    onClick={() => { setClassName(c); setSelectedAssignmentId(''); setSelectedStudentNumbers(new Set()); }}
                    className={`px-3 py-2 rounded-lg text-sm font-bold border-2 transition ${
                      className === c
                        ? 'bg-rose-500 text-white border-rose-500'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-rose-300'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {className && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">2. Pick a notebook assignment</label>
                {assignments.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No notebook assignments for this class yet.</p>
                ) : (
                  <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                    {assignments.map(a => (
                      <button
                        key={a.id}
                        onClick={() => setSelectedAssignmentId(a.id)}
                        className={`text-left px-4 py-3 rounded-xl border-2 transition ${
                          selectedAssignmentId === a.id
                            ? 'bg-rose-50 border-rose-500'
                            : 'bg-white border-gray-200 hover:border-rose-300'
                        }`}
                      >
                        <p className="font-bold text-gray-800 text-sm">{a.title}</p>
                        <p className="text-xs text-gray-400">
                          {a.status} · {a.pdf_page_count || a.page_count || a.page_range_end || '?'} pages
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedAssignmentId && (
              <>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">3. Start page</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={startPage}
                      onChange={e => setStartPage(e.target.value)}
                      className="w-24 px-3 py-2 rounded-lg border border-gray-200 text-sm font-bold text-center"
                    />
                    <span className="text-sm text-gray-400">of {totalPages}</span>
                    <span className="text-xs text-gray-400 ml-2">Default page 1 — change for long files.</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">4. Who joins?</label>
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => { setTargetMode('class'); setSelectedStudentNumbers(new Set()); }}
                      className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-bold border-2 transition ${
                        targetMode === 'class'
                          ? 'bg-rose-500 text-white border-rose-500'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      <Users className="w-4 h-4 inline mr-1.5" />
                      Whole class
                    </button>
                    <button
                      onClick={() => setTargetMode('selected')}
                      className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-bold border-2 transition ${
                        targetMode === 'selected'
                          ? 'bg-rose-500 text-white border-rose-500'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      <UserCheck className="w-4 h-4 inline mr-1.5" />
                      Select students
                    </button>
                  </div>

                  {targetMode === 'selected' && (
                    <div className="border-2 border-gray-100 rounded-xl p-3">
                      {students.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-4">No students found for {className}.</p>
                      ) : (
                        <>
                          <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-56 overflow-y-auto">
                            {students
                              .filter(s => s.name || s.photo_url)
                              .sort((a, b) => (a.student_number || 0) - (b.student_number || 0))
                              .map(s => {
                              const selected = selectedStudentNumbers.has(s.student_number);
                              return (
                                <button
                                  key={s.id}
                                  onClick={() => toggleStudent(s.student_number)}
                                  className={`relative rounded-xl border-2 overflow-hidden transition ${
                                    selected
                                      ? 'border-rose-500 ring-2 ring-rose-300'
                                      : 'border-gray-200 hover:border-rose-300'
                                  }`}
                                >
                                  {s.photo_url ? (
                                    <img src={s.photo_url} alt={s.name || `#${s.student_number}`} className="w-full aspect-square object-cover" />
                                  ) : (
                                    <div className={`w-full aspect-square flex items-center justify-center text-2xl font-black ${selected ? 'bg-rose-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                      {s.student_number}
                                    </div>
                                  )}
                                  {selected && (
                                    <div className="absolute top-0.5 right-0.5 bg-rose-500 rounded-full w-5 h-5 flex items-center justify-center">
                                      <span className="text-white text-xs font-bold">✓</span>
                                    </div>
                                  )}
                                  {s.name && (
                                    <div className="text-[10px] text-center font-bold text-gray-600 truncate px-0.5">{s.name.split(' ')[0]}</div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-xs text-gray-500 mt-2 text-center">
                            {selectedStudentNumbers.size} student(s) selected
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">5. Mode</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setReleaseMode('follow')}
                      className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-bold border-2 transition ${
                        releaseMode === 'follow'
                          ? 'bg-sky-500 text-white border-sky-500'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      <Lock className="w-4 h-4 inline mr-1.5" />
                      Follow me
                      <span className="block text-[10px] font-normal mt-0.5 opacity-80">Students locked to my page</span>
                    </button>
                    <button
                      onClick={() => setReleaseMode('free')}
                      className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-bold border-2 transition ${
                        releaseMode === 'free'
                          ? 'bg-violet-500 text-white border-violet-500'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      <Footprints className="w-4 h-4 inline mr-1.5" />
                      Free
                      <span className="block text-[10px] font-normal mt-0.5 opacity-80">Students go at own pace</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            <Button
              onClick={startSession}
              disabled={!selectedAssignmentId || !className || starting || (targetMode === 'selected' && selectedStudentNumbers.size === 0)}
              className="w-full bg-rose-500 hover:bg-rose-600 text-white font-black text-lg py-3"
            >
              <Radio className="w-5 h-5 mr-2" />
              {starting ? 'Starting…' : 'Start Assessment'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- LIVE CONTROL SCREEN ----------
  const total = session.total_pages || totalPages;
  const currentPage = session.current_page || 1;
  const paused = !!session.paused;
  const currentReleaseMode = session.release_mode || 'follow';

  return (
    <div className="relative h-screen bg-slate-900 text-white overflow-hidden">
      {(controlsSaving || controlError) && (
        <div role="status" className="fixed left-3 top-16 z-[10002] max-w-lg rounded-xl bg-amber-100 text-amber-950 p-3 text-sm">
          {controlsSaving
            ? 'Sending teacher controls — not confirmed yet.'
            : controlError}
          {controlError && !controlsSaving && (
            <button
              type="button"
              onClick={() => { void updateSession({}); }}
              className="ml-3 font-bold underline"
            >
              Retry controls
            </button>
          )}
        </div>
      )}
      {/* Top bar */}
      <div className="fixed top-0 inset-x-0 z-[10000] h-14 flex items-center justify-between gap-3 px-4 bg-slate-950 border-b border-slate-700 shadow-xl">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex items-center gap-2 text-rose-400 font-black shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
            LIVE
          </span>
          <h1 className="text-base font-bold truncate">{session.assignment_title || 'Notebook Assessment'}</h1>
          <span className="text-xs text-slate-500 hidden sm:inline">· {session.class_name}</span>
          {session.target_students?.length > 0 && (
            <span className="text-xs text-amber-400 font-bold hidden sm:inline">
              · {session.target_students.length} students
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Follow / Free toggle */}
          <button
            onClick={toggleReleaseMode}
            className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold border transition ${
              currentReleaseMode === 'free'
                ? 'bg-violet-500/20 text-violet-300 border-violet-500/40 hover:bg-violet-500/30'
                : 'bg-sky-500/20 text-sky-300 border-sky-500/40 hover:bg-sky-500/30'
            }`}
            title={
              currentReleaseMode === 'free'
                ? 'Students are free to navigate — tap to lock them to your page'
                : 'Students are locked to your page — tap to let them go at their own pace'
            }
          >
            {currentReleaseMode === 'free'
              ? <><Footprints className="w-4 h-4" /> Free</>
              : <><Lock className="w-4 h-4" /> Follow me</>
            }
          </button>

          <button
            onClick={endSession}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold bg-red-500/90 hover:bg-red-500 text-white"
          >
            <X className="w-4 h-4" />
            End
          </button>
        </div>
      </div>

      {/* Status badge */}
      <div
        className={`fixed right-3 top-[4.25rem] z-[10001] pointer-events-none rounded-full px-3 py-1.5 text-xs font-black shadow-lg border ${
          paused
            ? 'bg-amber-500 text-slate-950 border-amber-200'
            : currentReleaseMode === 'free'
              ? 'bg-violet-500 text-white border-violet-300'
              : 'bg-green-500 text-slate-950 border-green-200'
        }`}
      >
        {paused
          ? 'STUDENTS: PAUSED — EYES ON BOARD'
          : currentReleaseMode === 'free'
            ? 'STUDENTS: FREE PACE'
            : 'STUDENTS: FOLLOWING'}
      </div>

      {/* Main control area */}
      <div className="fixed inset-x-0 top-14 bottom-0 z-0 flex flex-col items-center justify-center gap-8 p-6 overflow-auto">
        {/* Pause / Resume — the big "someone at the door" button */}
        <button
          onClick={togglePause}
          className={`flex flex-col items-center justify-center gap-3 rounded-3xl px-12 py-10 shadow-2xl transition-all hover:scale-105 ${
            paused
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-amber-500 hover:bg-amber-600 text-slate-950'
          }`}
        >
          {paused ? <Play className="w-16 h-16" /> : <Pause className="w-16 h-16" />}
          <span className="text-2xl font-black">{paused ? 'Resume Assessment' : 'Pause — Eyes on Board'}</span>
          <span className="text-sm font-bold opacity-80">
            {paused ? 'Lift the overlay, students continue' : 'Freeze every screen instantly'}
          </span>
        </button>

        {/* Page navigation */}
        <div className="bg-slate-800 rounded-2xl p-6 flex flex-col items-center gap-4 shadow-xl border border-slate-700">
          <p className="text-slate-400 text-xs font-bold uppercase">Page Control</p>
          <div className="flex items-center gap-4">
            <button
              onClick={() => goToPage(-1)}
              disabled={currentPage <= 1}
              className="w-14 h-14 rounded-xl flex items-center justify-center bg-slate-700 hover:bg-slate-600 disabled:opacity-30 transition"
            >
              <ChevronLeft className="w-7 h-7" />
            </button>
            <div className="flex flex-col items-center gap-1">
              <input
                type="number"
                min={1}
                max={total}
                value={currentPage}
                onChange={e => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v)) setPage(v);
                }}
                className="w-24 text-center px-3 py-2 rounded-xl border border-slate-600 bg-slate-900 text-white font-black text-2xl"
              />
              <span className="text-slate-400 text-xs font-bold">of {total}</span>
            </div>
            <button
              onClick={() => goToPage(1)}
              disabled={currentPage >= total}
              className="w-14 h-14 rounded-xl flex items-center justify-center bg-slate-700 hover:bg-slate-600 disabled:opacity-30 transition"
            >
              <ChevronRight className="w-7 h-7" />
            </button>
          </div>
          <p className="text-slate-500 text-xs text-center max-w-xs">
            {currentReleaseMode === 'free'
              ? 'Students are free to navigate. Use Pause before walking to the door.'
              : 'Students follow this page automatically. Use Pause before walking to the door.'}
          </p>
        </div>

        {/* State indicators */}
        {paused && (
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <EyeOff className="w-5 h-5" />
            Student screens are frozen with an "Eyes on board" overlay.
          </div>
        )}
        {!paused && currentReleaseMode === 'follow' && (
          <div className="flex items-center gap-2 text-green-400 font-bold text-sm">
            <Lock className="w-5 h-5" />
            Students are locked to page {currentPage} and can draw.
          </div>
        )}
        {!paused && currentReleaseMode === 'free' && (
          <div className="flex items-center gap-2 text-violet-400 font-bold text-sm">
            <Unlock className="w-5 h-5" />
            Students are free to navigate at their own pace.
          </div>
        )}
      </div>
    </div>
  );
}