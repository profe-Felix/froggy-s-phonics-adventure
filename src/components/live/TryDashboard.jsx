import React, { useMemo } from 'react';
import { useLiveWorkDashboard } from '@/hooks/useLiveStudentWork';
import { CheckCircle2, Loader2, Moon, Users } from 'lucide-react';

// Teacher's "try phase" dashboard. Shows a live grid of student tiles — one per
// joined student — with their current status (working / done / idle) and a
// compact, mode-aware progress readout. Refreshes in real time as students
// report heartbeats while they try the activity on their iPads.
export default function TryDashboard({ session }) {
  const works = useLiveWorkDashboard(session?.id);

  const tiles = useMemo(() => {
    const byKey = {};
    works.forEach((w) => { byKey[w.student_key] = w; });
    const roster = session?.joined_students || [];
    const rosterKeys = roster.map((r) => `${r.class_name}:${r.student_number}`);
    const allKeys = Array.from(new Set([...rosterKeys, ...Object.keys(byKey)]));
    return allKeys
      .map((key) => {
        const r = roster.find((rr) => `${rr.class_name}:${rr.student_number}` === key);
        const w = byKey[key];
        return {
          key,
          number: r?.student_number ?? w?.student_number ?? 0,
          class_name: r?.class_name || w?.class_name || '',
          work: w,
        };
      })
      .sort((a, b) => (a.number || 0) - (b.number || 0));
  }, [works, session]);

  const now = Date.now();
  const working = tiles.filter((t) => freshness(t.work, now) === 'live' && t.work?.status !== 'done').length;
  const done = tiles.filter((t) => t.work?.status === 'done').length;

  return (
    <div className="text-white">
      <div className="flex items-center gap-2 text-xs text-gray-400 font-bold mb-3">
        <Users className="w-3.5 h-3.5" /> STUDENT WORK — live during try phase
        <span className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1 text-green-400"><span className="w-2 h-2 rounded-full bg-green-500" /> {working} working</span>
          <span className="flex items-center gap-1 text-blue-400"><CheckCircle2 className="w-3 h-3" /> {done} done</span>
          <span className="text-gray-500">{tiles.length} joined</span>
        </span>
      </div>

      {tiles.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          No students have joined yet. Share the QR code or code “{session?.code}”.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {tiles.map((t) => (
            <StudentTile key={t.key} number={t.number} work={t.work} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}

function freshness(work, now) {
  if (!work?.updated_at) return 'idle';
  const age = now - new Date(work.updated_at).getTime();
  if (age < 16000) return 'live';
  if (age < 45000) return 'recent';
  return 'idle';
}

function StudentTile({ number, work }) {
  const fresh = freshness(work, Date.now());
  const isDone = work?.status === 'done';
  const isWorking = !isDone && fresh === 'live';

  const ring = isDone
    ? 'border-blue-400 bg-blue-500/10'
    : isWorking
      ? 'border-green-400 bg-green-500/10'
      : 'border-slate-600 bg-slate-700/30';

  const Badge = isDone ? (
    <span className="flex items-center gap-1 text-blue-300 text-xs font-bold"><CheckCircle2 className="w-3.5 h-3.5" /> Done</span>
  ) : isWorking ? (
    <span className="flex items-center gap-1 text-green-300 text-xs font-bold">
      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Working
    </span>
  ) : (
    <span className="flex items-center gap-1 text-gray-400 text-xs font-bold"><Moon className="w-3.5 h-3.5" /> Idle</span>
  );

  const label = work?.progress_data?.label || (work ? 'Working…' : 'Not started');
  const mode = work?.mode || '';

  return (
    <div className={`rounded-xl border-2 ${ring} p-3 flex flex-col gap-1.5`}>
      <div className="flex items-center justify-between">
        <span className="text-2xl font-black">{number}</span>
        {Badge}
      </div>
      <div className="text-sm font-semibold text-white/90 leading-tight min-h-[2.5rem]">{label}</div>
      {mode && <div className="text-[10px] uppercase tracking-wide text-gray-400">{mode}</div>}
    </div>
  );
}