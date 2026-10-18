import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { Check, LogOut, RotateCcw } from 'lucide-react';

// Student roster shown on the live notebook assessment control screen.
// The teacher taps a student to release them early (they finish before the
// rest of the group). Released students are freed back to their normal home
// while the rest of the class keeps going. Tapping a released student
// re-adds them in case it was a mistake.
//
// `session` — the active LiveNotebookAssessment record.
// `className` — the class the assessment is broadcasting to.
// `onRelease(studentNumber)` — add student to finished_students.
// `onReadd(studentNumber)` — remove student from finished_students.
export default function NotebookAssessmentRoster({ session, className, onRelease, onReadd, embedded = false }) {
  const [confirmNum, setConfirmNum] = useState(null);

  const { data: students = [] } = useQuery({
    queryKey: ['notebook-assessment-roster', className, session?.id],
    queryFn: () => base44.entities.Student.filter({
      class_name: className,
      school_year: ACTIVE_SCHOOL_YEAR,
    }),
    enabled: !!className && !!session?.id,
    staleTime: 60000,
    retry: false,
  });

  // If the assessment targets specific students, only show those.
  const targetSet = session?.target_students?.length > 0
    ? new Set(session.target_students.map(t => Number(t.student_number)))
    : null;

  const finishedSet = new Set(
    (session?.finished_students || []).map(t => Number(t.student_number))
  );

  const visible = students
    .filter(s => s.name || s.photo_url)
    .filter(s => !targetSet || targetSet.has(Number(s.student_number)))
    .sort((a, b) => (a.student_number || 0) - (b.student_number || 0));

  if (visible.length === 0) {
    return (
      <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
        <p className="text-slate-400 text-xs font-bold text-center">No students with photos found for {className}.</p>
      </div>
    );
  }

  function renderGrid() {
    return (
      <>
      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2 max-h-44 overflow-y-auto">
        {visible.map(s => {
          const num = Number(s.student_number);
          const finished = finishedSet.has(num);
          const confirming = confirmNum === num;
          return (
            <button
              key={s.id}
              onClick={() => handleTap(num)}
              className={`relative rounded-xl border-2 overflow-hidden transition-all ${
                finished
                  ? 'border-green-500 opacity-60'
                  : confirming
                    ? 'border-amber-400 ring-2 ring-amber-300 scale-105'
                    : 'border-slate-600 hover:border-rose-400'
              }`}
              title={finished ? `${s.name || '#' + num} — tap to re-add` : confirming ? 'Tap again to release' : `${s.name || '#' + num} — tap to release`}
            >
              {s.photo_url ? (
                <img src={s.photo_url} alt={s.name || `#${num}`} className="w-full aspect-square object-cover" />
              ) : (
                <div className={`w-full aspect-square flex items-center justify-center text-xl font-black ${finished ? 'bg-green-700 text-white' : 'bg-slate-700 text-slate-300'}`}>
                  {num}
                </div>
              )}
              {finished && (
                <div className="absolute top-0.5 right-0.5 bg-green-500 rounded-full w-5 h-5 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </div>
              )}
              {confirming && !finished && (
                <div className="absolute top-0.5 right-0.5 bg-amber-400 rounded-full w-5 h-5 flex items-center justify-center">
                  <LogOut className="w-3 h-3 text-slate-900" strokeWidth={3} />
                </div>
              )}
              {s.name && (
                <div className={`text-[10px] text-center font-bold truncate px-0.5 ${finished ? 'text-green-400' : 'text-slate-300'}`}>
                  {s.name.split(' ')[0]}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-slate-500 text-[11px] mt-2 text-center">
        Tap a student to release them early · tap again to re-add
      </p>
      </>
    );
  }

  const handleTap = (num) => {
    if (finishedSet.has(num)) {
      onReadd?.(num);
      setConfirmNum(null);
    } else if (confirmNum === num) {
      onRelease?.(num);
      setConfirmNum(null);
    } else {
      setConfirmNum(num);
    }
  };

  if (embedded) {
    return (
      <details className="bg-slate-800 rounded-xl border border-slate-700 shrink-0">
        <summary className="cursor-pointer select-none px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-300 flex items-center justify-between">
          <span>Manage students</span>
          <span className="text-slate-500 normal-case">{finishedSet.size} / {visible.length} done</span>
        </summary>
        <div className="px-4 pb-3">{renderGrid()}</div>
      </details>
    );
  }

  return (
    <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <p className="text-slate-300 text-xs font-black uppercase tracking-wide">Release a student</p>
        <span className="text-xs text-slate-500 font-bold">
          {finishedSet.size} / {visible.length} done
        </span>
      </div>
      {renderGrid()}
    </div>
  );
}