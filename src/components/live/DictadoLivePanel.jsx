import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import DictadoThumbnail from '@/components/dictation/DictadoThumbnail';
import { Eye, EyeOff, ChevronRight, ChevronLeft, Radio } from 'lucide-react';

// Teacher control for a live dictado, embedded in the Live Lesson model panel.
// Lets the teacher start the dictation (create a LiveDictationSession from the
// step's inline lines) and then drive it line-by-line (reveal → red ink, next →
// lock + fresh ink) without leaving the live lesson. Students on this step join
// the session automatically via DictationStep.
export default function DictadoLivePanel({ step, className }) {
  const qc = useQueryClient();
  const [starting, setStarting] = useState(false);

  const inlineLines = (step?.config?.lines || [])
    .map((l) => (typeof l === 'string' ? l.trim() : ''))
    .filter(Boolean);

  const { data: liveSessions = [] } = useQuery({
    queryKey: ['dictado-live-teacher', className, ACTIVE_SCHOOL_YEAR],
    queryFn: () =>
      base44.entities.LiveDictationSession.filter({
        class_name: className,
        school_year: ACTIVE_SCHOOL_YEAR,
        active: true,
      }),
    enabled: !!className,
    refetchInterval: 1000,
  });
  const session = liveSessions?.[0] || null;

  const lines = session?.lines?.length ? session.lines : inlineLines;
  const bs = session?.broadcast_state || {};
  const currentLine = bs.current_line || 0;
  const revealed = !!bs.revealed;

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

  const startDictation = async () => {
    if (!inlineLines.length || !className) return;
    setStarting(true);
    try {
      for (const s of liveSessions || []) {
        await base44.entities.LiveDictationSession.update(s.id, { active: false });
      }
      const assignment = await base44.entities.DictationAssignment.create({
        title: step?.title?.trim() || 'Dictado',
        class_name: className,
        school_year: ACTIVE_SCHOOL_YEAR,
        status: 'active',
        prompt_text: inlineLines.join(', '),
      });
      await base44.entities.LiveDictationSession.create({
        class_name: className,
        assignment_id: assignment.id,
        assignment_title: assignment.title,
        school_year: ACTIVE_SCHOOL_YEAR,
        active: true,
        started_at: new Date().toISOString(),
        lines: inlineLines,
        broadcast_state: { current_line: 0, revealed: false },
      });
      qc.invalidateQueries(['dictado-live-teacher', className, ACTIVE_SCHOOL_YEAR]);
    } catch {
      alert('Could not start dictation.');
    } finally {
      setStarting(false);
    }
  };

  const updateBS = (patch) => {
    if (!session) return;
    base44.entities.LiveDictationSession
      .update(session.id, { broadcast_state: { ...bs, ...patch } })
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
    if (!session) return;
    if (!confirm('End this dictation? Students will be freed.')) return;
    await base44.entities.LiveDictationSession.update(session.id, {
      active: false,
      broadcast_state: {},
    });
    qc.invalidateQueries(['dictado-live-teacher', className, ACTIVE_SCHOOL_YEAR]);
  };

  // No session yet
  if (!session) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-slate-200 p-6 text-center">
        <div className="text-5xl">✍️</div>
        {inlineLines.length > 0 ? (
          <>
            <p className="font-bold text-lg">Dictado ready</p>
            <p className="text-sm text-slate-400 max-w-md">
              {inlineLines.length} word{inlineLines.length === 1 ? '' : 's'}: {inlineLines.join(', ')}
            </p>
            <button
              onClick={startDictation}
              disabled={starting}
              className="px-6 py-3 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-50 font-bold text-white flex items-center gap-2"
            >
              <Radio className="w-5 h-5" /> {starting ? 'Starting…' : 'Start Dictation'}
            </button>
            <p className="text-xs text-slate-500 max-w-md">
              Students on this step will join automatically. You'll control reveal & next from here.
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-400 max-w-md">
            Add dictado words to this step in the Lesson Editor first.
          </p>
        )}
      </div>
    );
  }

  const currentWord = lines[currentLine] || '';
  const lastLine = currentLine >= lines.length - 1;

  return (
    <div className="h-full flex flex-col text-white">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/60 border-b border-slate-700 text-xs font-bold text-slate-300 shrink-0">
        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
        Dictado Live · {className}
        <button
          onClick={endSession}
          className="ml-auto px-2.5 py-1 rounded-lg text-[11px] font-bold bg-red-600/90 hover:bg-red-600 text-white"
        >
          End
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Lines */}
        <aside className="w-44 shrink-0 bg-slate-800/40 border-r border-slate-700 p-2 overflow-y-auto">
          <p className="text-[10px] text-slate-500 font-bold mb-1.5">Lines</p>
          <div className="flex flex-col gap-1">
            {lines.map((line, i) => {
              const isCurrent = i === currentLine;
              const isPast = i < currentLine;
              return (
                <button
                  key={i}
                  onClick={() => jump(i)}
                  className={`text-left px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
                    isCurrent
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : isPast
                      ? 'bg-slate-700/50 border-slate-600 text-slate-300'
                      : 'bg-slate-800 border-slate-700 text-slate-500 hover:bg-slate-700/50'
                  }`}
                >
                  <span className="font-bold mr-1">{i + 1}.</span>
                  {line}
                  {isPast && <span className="ml-1 text-green-400">✓</span>}
                  {isCurrent && revealed && <span className="ml-1 text-red-400">●</span>}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Model + controls */}
        <main className="flex-1 flex flex-col items-center justify-center gap-4 p-4 min-h-0">
          <p className="text-xs text-slate-400 font-bold">
            Line {currentLine + 1} of {lines.length}
          </p>
          <div
            className={`text-7xl font-bold leading-none ${revealed ? 'text-red-400' : 'text-white'}`}
            style={{ fontFamily: "'Andika', sans-serif" }}
          >
            {currentWord}
          </div>
          {revealed ? (
            <p className="text-red-400 text-xs font-bold">Revealed — students writing corrections in red</p>
          ) : (
            <p className="text-slate-400 text-xs font-bold">Students attempting in dark ink</p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={prev}
              disabled={currentLine === 0}
              className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 font-bold flex items-center gap-1.5 text-sm"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            {revealed ? (
              <button
                onClick={hide}
                className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 font-bold flex items-center gap-1.5 text-sm"
              >
                <EyeOff className="w-4 h-4" /> Hide
              </button>
            ) : (
              <button
                onClick={reveal}
                className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 font-bold flex items-center gap-1.5 text-sm"
              >
                <Eye className="w-4 h-4" /> Reveal
              </button>
            )}
            <button
              onClick={next}
              disabled={lastLine}
              className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 font-bold flex items-center gap-1.5 text-sm"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </main>

        {/* Student work */}
        <aside className="w-56 shrink-0 bg-slate-800/40 border-l border-slate-700 p-2 overflow-y-auto">
          <p className="text-[10px] text-slate-500 font-bold mb-1.5">Student work</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(students || []).map((st) => (
              <div key={st.id} className="bg-white rounded-md p-1">
                <p className="text-[9px] font-bold text-slate-700 truncate mb-0.5">
                  {st.name || `#${st.student_number}`}
                </p>
                <DictadoThumbnail submission={subByNumber[st.student_number]} width={104} height={120} />
              </div>
            ))}
            {(students || []).length === 0 && (
              <p className="text-[11px] text-slate-500 col-span-2">No students.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}