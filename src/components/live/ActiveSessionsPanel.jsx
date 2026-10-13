import { useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2, Radio, BookOpen, PenLine, Languages, ClipboardCheck, X } from 'lucide-react';

// Lists every active "live" session that can lock student iPads, so a teacher
// can see what's still running and end it from one place — even a session
// another teacher left on. Each row shows the session type, class/group, title,
// and when it started, with an End button that deactivates it.
const SESSION_TYPES = [
  {
    key: 'live_lesson',
    label: 'Live Lesson',
    Icon: Radio,
    color: 'rose',
    queryKey: ['active-live-lesson-sessions'],
    queryFn: () => base44.entities.LiveLessonSession.filter({ active: true }, '-started_at', 200),
    title: (s) => s.lesson_title || 'Live Lesson',
    sub: (s) => `${s.class_name || '—'}${s.lesson_day ? ` · ${s.lesson_day}` : ''}${s.code ? ` · code ${s.code}` : ''}`,
    end: async (s) => {
      // Also clear any dictation this lesson spawned so students aren't
      // bounced back into a dictation after the lesson ends.
      try {
        const active = await base44.entities.LiveDictationSession.filter({ class_name: s.class_name, active: true });
        await Promise.all((active || []).map((d) => base44.entities.LiveDictationSession.update(d.id, { active: false, broadcast_state: {} }).catch(() => {})));
      } catch { /* best effort */ }
      return base44.entities.LiveLessonSession.update(s.id, { active: false });
    },
  },
  {
    key: 'notebook_assessment',
    label: 'Notebook Assessment',
    Icon: BookOpen,
    color: 'indigo',
    queryKey: ['active-notebook-assessments'],
    queryFn: () => base44.entities.LiveNotebookAssessment.filter({ active: true }, '-started_at', 200),
    title: (s) => s.assignment_title || 'Notebook Assessment',
    sub: (s) => `${s.class_name || '—'}${s.current_page ? ` · page ${s.current_page}/${s.total_pages || 1}` : ''}`,
    end: (s) => base44.entities.LiveNotebookAssessment.update(s.id, { active: false }),
  },
  {
    key: 'dictation',
    label: 'Dictation',
    Icon: PenLine,
    color: 'amber',
    queryKey: ['active-dictation-sessions'],
    queryFn: () => base44.entities.LiveDictationSession.filter({ active: true }, '-started_at', 200),
    title: (s) => s.assignment_title || 'Dictation',
    sub: (s) => `${s.class_name || '—'}${s.broadcast_state?.current_line != null ? ` · line ${s.broadcast_state.current_line + 1}` : ''}`,
    end: (s) => base44.entities.LiveDictationSession.update(s.id, { active: false, broadcast_state: {} }),
  },
  {
    key: 'spanish_reading',
    label: 'Spanish Reading',
    Icon: Languages,
    color: 'teal',
    queryKey: ['active-spanish-reading-sessions'],
    queryFn: () => base44.entities.LiveSpanishReadingSession.filter({ status: 'active' }, '-started_at', 200),
    title: (s) => `${s.teacher_name || ''} ${s.block || ''} ${s.color_group || ''}`.trim() || 'Spanish Reading',
    sub: (s) => `${s.mode || 'blending'}${s.items?.length ? ` · ${s.current_index + 1}/${s.items.length}` : ''}`,
    end: (s) => base44.entities.LiveSpanishReadingSession.update(s.id, { status: 'completed', ended_at: new Date().toISOString() }),
  },
  {
    key: 'small_group_assessment',
    label: 'Small Group Assessment',
    Icon: ClipboardCheck,
    color: 'violet',
    queryKey: ['active-small-group-assessments'],
    queryFn: () => base44.entities.SmallGroupAssessment.filter({ status: 'active' }, '-started_at', 200),
    title: (s) => `${s.teacher_name || ''} ${s.block || ''} ${s.color_group || ''}`.trim() || 'Assessment',
    sub: () => 'Assessment in progress',
    end: (s) => base44.entities.SmallGroupAssessment.update(s.id, { status: 'completed', ended_at: new Date().toISOString() }),
  },
];

const COLOR_CLASSES = {
  rose: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-600', btn: 'bg-rose-500 hover:bg-rose-600' },
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-600', btn: 'bg-indigo-500 hover:bg-indigo-600' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600', btn: 'bg-amber-500 hover:bg-amber-600' },
  teal: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-600', btn: 'bg-teal-500 hover:bg-teal-600' },
  violet: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-600', btn: 'bg-violet-500 hover:bg-violet-600' },
};

function timeAgo(iso) {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${hrs}h ${rem}m ago` : `${hrs}h ago`;
}

export default function ActiveSessionsPanel() {
  const qc = useQueryClient();
  const [endingId, setEndingId] = useState(null);

  const queries = useQueries({
    queries: SESSION_TYPES.map((t) => ({
      queryKey: t.queryKey,
      queryFn: t.queryFn,
      refetchInterval: 15000,
    })),
  });

  const loading = queries.some((q) => q.isLoading);
  const allSessions = SESSION_TYPES.flatMap((t, i) => ((queries[i].data || [])).map((s) => ({ ...s, _type: t, _id: `${t.key}:${s.id}` })));

  const handleEnd = async (session) => {
    setEndingId(session._id);
    try {
      await session._type.end(session);
      // Refresh every session list so a lesson that spawned a dictation
      // reflects the cascade immediately.
      await Promise.all(SESSION_TYPES.map((t) => qc.invalidateQueries({ queryKey: t.queryKey })));
    } catch { /* best effort */ }
    setEndingId(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-rose-400" />
      </div>
    );
  }

  if (allSessions.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-8 text-center">
        <div className="w-14 h-14 mx-auto rounded-full bg-green-50 flex items-center justify-center mb-3">
          <X className="w-7 h-7 text-green-500" />
        </div>
        <p className="text-sm font-bold text-gray-700">No active sessions</p>
        <p className="text-xs text-gray-400 mt-1">All student iPads are free. Any session you start will show up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-gray-500">
        {allSessions.length} active session{allSessions.length > 1 ? 's' : ''} · ending one frees those students' iPads
      </p>
      {allSessions.map((s) => {
        const t = s._type;
        const c = COLOR_CLASSES[t.color];
        return (
          <div key={s._id} className={`flex items-center gap-3 rounded-xl border ${c.border} ${c.bg} p-3`}>
            <span className={`w-9 h-9 rounded-full flex items-center justify-center ${c.text} bg-white/70 shrink-0`}>
              <t.Icon className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black uppercase tracking-wide ${c.text}`}>{t.label}</span>
                <span className="text-[10px] text-gray-400">{timeAgo(s.started_at)}</span>
              </div>
              <p className="text-sm font-bold text-gray-800 truncate">{t.title(s)}</p>
              <p className="text-xs text-gray-500 truncate">{t.sub(s)}</p>
            </div>
            <button
              onClick={() => handleEnd(s)}
              disabled={endingId === s._id}
              className={`shrink-0 flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold text-white ${c.btn} disabled:opacity-60`}
            >
              {endingId === s._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              End
            </button>
          </div>
        );
      })}
    </div>
  );
}