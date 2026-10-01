import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { Link } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, ChevronRight, ChevronLeft } from 'lucide-react';
import DictadoThumbnail from '@/components/dictation/DictadoThumbnail';

// Teacher control for a live dictado launched from a lesson step.
// Drives broadcast_state { current_line, revealed } on the LiveDictationSession;
// students react in real time (attempt → reveal locks ink + red → next line locks).
export default function DictadoLive() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session');
  const qc = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ['dictado-live-teacher', sessionId],
    queryFn: () => base44.entities.LiveDictationSession.get(sessionId),
    enabled: !!sessionId,
    refetchInterval: 1500,
  });

  const lines = session?.lines || [];
  const bs = session?.broadcast_state || {};
  const currentLine = bs.current_line || 0;
  const revealed = !!bs.revealed;
  const className = session?.class_name;

  const { data: students = [] } = useQuery({
    queryKey: ['dictado-live-students', className],
    queryFn: () =>
      base44.entities.Student.filter({
        class_name: className,
        school_year: ACTIVE_SCHOOL_YEAR,
      }),
    enabled: !!className,
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ['dictado-live-submissions', session?.assignment_id],
    queryFn: () =>
      base44.entities.DictationSubmission.filter({
        assignment_id: session.assignment_id,
        school_year: ACTIVE_SCHOOL_YEAR,
      }),
    enabled: !!session?.assignment_id,
    refetchInterval: 2500,
  });

  const subByNumber = {};
  for (const s of submissions || []) subByNumber[s.student_number] = s;

  const updateBS = (patch) => {
    base44.entities.LiveDictationSession
      .update(sessionId, { broadcast_state: { ...bs, ...patch } })
      .catch(() => {});
  };
  const reveal = () => updateBS({ revealed: true });
  const hide = () => updateBS({ revealed: false });
  const next = () =>
    updateBS({
      current_line: Math.min(currentLine + 1, Math.max(0, lines.length - 1)),
      revealed: false,
    });
  const prev = () => updateBS({ current_line: Math.max(0, currentLine - 1), revealed: false });
  const jump = (i) => updateBS({ current_line: i, revealed: false });

  const endSession = async () => {
    if (!confirm('End this dictation session? Students will be freed.')) return;
    await base44.entities.LiveDictationSession.update(sessionId, {
      active: false,
      broadcast_state: {},
    });
    qc.invalidateQueries(['dictado-live-teacher', sessionId]);
  };

  if (!sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        No session specified.
      </div>
    );
  }
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  const currentWord = lines[currentLine] || '';
  const lastLine = currentLine >= lines.length - 1;

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      <header className="flex items-center gap-3 px-4 py-3 bg-slate-800 border-b border-slate-700">
        <Link to="/Dashboard" className="text-slate-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="font-bold flex-1">
          ✍️ Dictado Live
          <span className="text-slate-400 font-normal"> · {className}</span>
        </h1>
        <button
          onClick={endSession}
          className="px-3 py-1.5 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-700"
        >
          End Session
        </button>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Lines list */}
        <aside className="w-52 shrink-0 bg-slate-800/50 border-r border-slate-700 p-3 overflow-y-auto">
          <p className="text-xs text-slate-500 font-bold mb-2">Lines</p>
          <div className="flex flex-col gap-1.5">
            {lines.map((line, i) => {
              const isCurrent = i === currentLine;
              const isPast = i < currentLine;
              return (
                <button
                  key={i}
                  onClick={() => jump(i)}
                  className={`text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                    isCurrent
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : isPast
                      ? 'bg-slate-700/50 border-slate-600 text-slate-300'
                      : 'bg-slate-800 border-slate-700 text-slate-500 hover:bg-slate-700/50'
                  }`}
                >
                  <span className="font-bold mr-1.5">{i + 1}.</span>
                  {line}
                  {isPast && <span className="ml-1 text-green-400">✓</span>}
                  {isCurrent && revealed && <span className="ml-1 text-red-400">●</span>}
                </button>
              );
            })}
            {lines.length === 0 && (
              <p className="text-xs text-slate-500">No lines on this session.</p>
            )}
          </div>
        </aside>

        {/* Model + controls */}
        <main className="flex-1 flex flex-col items-center justify-center gap-6 p-6 min-h-0">
          <div className="text-center">
            <p className="text-sm text-slate-400 font-bold mb-2">
              Line {currentLine + 1} of {lines.length}
            </p>
            <div
              className={`text-[120px] font-bold leading-none ${
                revealed ? 'text-red-400' : 'text-white'
              }`}
              style={{ fontFamily: "'Andika', sans-serif" }}
            >
              {currentWord}
            </div>
            {revealed ? (
              <p className="text-red-400 text-sm font-bold mt-2">
                Revealed — students writing corrections in red
              </p>
            ) : (
              <p className="text-slate-400 text-sm font-bold mt-2">
                Students attempting in dark ink
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={prev}
              disabled={currentLine === 0}
              className="px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-40 font-bold flex items-center gap-2"
            >
              <ChevronLeft className="w-5 h-5" /> Prev
            </button>
            {revealed ? (
              <button
                onClick={hide}
                className="px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 font-bold flex items-center gap-2"
              >
                <EyeOff className="w-5 h-5" /> Hide
              </button>
            ) : (
              <button
                onClick={reveal}
                className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 font-bold flex items-center gap-2"
              >
                <Eye className="w-5 h-5" /> Reveal
              </button>
            )}
            <button
              onClick={next}
              disabled={lastLine}
              className="px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 font-bold flex items-center gap-2"
            >
              Next <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-slate-500 max-w-md text-center">
            Reveal locks students' attempt ink and switches them to red for
            corrections. Next line locks this line and gives them fresh ink.
          </p>
        </main>

        {/* Student work */}
        <aside className="w-72 shrink-0 bg-slate-800/50 border-l border-slate-700 p-3 overflow-y-auto">
          <p className="text-xs text-slate-500 font-bold mb-2">Student work</p>
          <div className="grid grid-cols-2 gap-2">
            {(students || []).map((st) => (
              <div key={st.id} className="bg-white rounded-lg p-1.5">
                <p className="text-[10px] font-bold text-slate-700 truncate mb-1">
                  {st.name || `#${st.student_number}`}
                </p>
                <DictadoThumbnail submission={subByNumber[st.student_number]} />
              </div>
            ))}
            {(students || []).length === 0 && (
              <p className="text-xs text-slate-500 col-span-2">No students.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}