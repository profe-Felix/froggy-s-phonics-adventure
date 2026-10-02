import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Radio, Eye, EyeOff, ChevronLeft, ChevronRight, X, Pause, Play } from 'lucide-react';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { useClassNames } from '@/hooks/useClassNames';

// Live notebook assessment control panel.
//
// Teacher picks a class + a DigitalNotebookAssignment + a start page, then
// starts a LiveNotebookAssessment session. Students in that class auto-join
// (forced open) the notebook on the teacher's page. The teacher can:
//   - advance / go back a page (students follow in realtime)
//   - PAUSE → every student's notebook shows an "Eyes on board" overlay and
//     drawing/navigation is frozen (used when someone comes to the door)
//   - RESUME → lift the overlay
//   - END → release students back to their normal home
//
// This panel is rendered inside LiveLesson's "Assessment" tab. It owns its
// own session state so the lesson tab's logic stays untouched.

export default function LiveNotebookAssessmentPanel({ onBack }) {
  const [session, setSession] = useState(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const { classList: CLASSES } = useClassNames();
  const [className, setClassName] = useState('');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [startPage, setStartPage] = useState(1);
  const [starting, setStarting] = useState(false);

  const { data: assignments = [] } = useQuery({
    queryKey: ['notebook-assignments-live-assessment', className],
    queryFn: () =>
      base44.entities.DigitalNotebookAssignment.filter({ class_name: className }),
    enabled: !!className,
    retry: false,
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
      if (event.type === 'delete' || !event.data?.active) {
        setSession(null);
        return;
      }
      setSession(prev => prev ? { ...prev, ...event.data } : event.data);
    });
    return unsub;
  }, [session?.id]);

  const updateSession = async (patch) => {
    if (!session?.id) return;
    setSession(prev => prev ? { ...prev, ...patch } : prev);
    try {
      await base44.entities.LiveNotebookAssessment.update(session.id, patch);
    } catch {}
  };

  const startSession = async () => {
    if (!selectedAssignmentId || !className) return;
    setStarting(true);
    // Deactivate any leftover active sessions for this class so students
    // auto-join THIS new assessment instead of a stale one.
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
    const created = await base44.entities.LiveNotebookAssessment.create({
      class_name: className,
      assignment_id: selectedAssignmentId,
      assignment_title: selectedAssignment?.title || '',
      school_year: ACTIVE_SCHOOL_YEAR,
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
    await updateSession({ active: false, paused: false });
    setSession(null);
    setSelectedAssignmentId('');
    setClassName('');
    setStartPage(1);
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
                    onClick={() => { setClassName(c); setSelectedAssignmentId(''); }}
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
            )}

            <Button
              onClick={startSession}
              disabled={!selectedAssignmentId || !className || starting}
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

  return (
    <div className="relative h-screen bg-slate-900 text-white overflow-hidden">
      {/* Top bar */}
      <div className="fixed top-0 inset-x-0 z-[10000] h-14 flex items-center justify-between gap-3 px-4 bg-slate-950 border-b border-slate-700 shadow-xl">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex items-center gap-2 text-rose-400 font-black shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
            LIVE
          </span>
          <h1 className="text-base font-bold truncate">{session.assignment_title || 'Notebook Assessment'}</h1>
          <span className="text-xs text-slate-500 hidden sm:inline">· {session.class_name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
            : 'bg-green-500 text-slate-950 border-green-200'
        }`}
      >
        {paused ? 'STUDENTS: PAUSED — EYES ON BOARD' : 'STUDENTS: ASSESSING'}
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
            Students follow this page automatically. Use Pause before walking to the door.
          </p>
        </div>

        {/* Pause state indicator */}
        {paused && (
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <EyeOff className="w-5 h-5" />
            Student screens are frozen with an "Eyes on board" overlay.
          </div>
        )}
        {!paused && (
          <div className="flex items-center gap-2 text-green-400 font-bold text-sm">
            <Eye className="w-5 h-5" />
            Students are on page {currentPage} and can draw.
          </div>
        )}
      </div>
    </div>
  );
}