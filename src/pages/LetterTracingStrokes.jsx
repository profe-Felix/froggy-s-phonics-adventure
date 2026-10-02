import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useClassNames } from '@/hooks/useClassNames';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import StrokeThumbnail from '@/components/tracing/StrokeThumbnail';

// Teacher dashboard for Letter Tracing GROUP practice: shows every student
// attempt with its actual rendered strokes so the teacher can see who is
// writing smoothly. Attempts are saved from LetterGroupTracingMode (guided
// trace lines AND freehand write lines, every letter).
export default function LetterTracingStrokes() {
  const { classList } = useClassNames();
  const [selectedClass, setSelectedClass] = useState('');
  const [filterLetter, setFilterLetter] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [onlyFreehand, setOnlyFreehand] = useState(false);

  useEffect(() => {
    if (!selectedClass && classList.length) setSelectedClass(classList[0]);
  }, [classList]);

  const { data: samples = [], isLoading } = useQuery({
    queryKey: ['group-tracing-samples', selectedClass],
    queryFn: () => base44.entities.TracingSample.filter(
      { class_name: selectedClass, source: 'group', school_year: ACTIVE_SCHOOL_YEAR },
      '-created_date', 400
    ),
    enabled: !!selectedClass,
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students', selectedClass],
    queryFn: () => base44.entities.Student.filter({ class_name: selectedClass, school_year: ACTIVE_SCHOOL_YEAR }),
    enabled: !!selectedClass,
  });

  const filtered = useMemo(
    () => samples.filter(s => {
      if (filterLetter && s.letter !== filterLetter) return false;
      if (filterGroup && s.group_key !== filterGroup) return false;
      if (onlyFreehand && s.guided) return false;
      return true;
    }),
    [samples, filterLetter, filterGroup, onlyFreehand]
  );

  const byStudent = useMemo(() => {
    const map = {};
    for (const s of filtered) {
      if (!map[s.student_number]) map[s.student_number] = [];
      map[s.student_number].push(s);
    }
    // Most recent first per student.
    for (const k of Object.keys(map)) map[k].reverse();
    return map;
  }, [filtered]);

  const letters = useMemo(
    () => Array.from(new Set(samples.map(s => s.letter).filter(Boolean))).sort(),
    [samples]
  );
  const groups = useMemo(
    () => Array.from(new Set(samples.map(s => s.group_key).filter(Boolean))).sort(),
    [samples]
  );

  const studentName = (num) => {
    const s = students.find(x => x.student_number === num);
    return s?.name || `Student ${num}`;
  };

  const avgAccuracy = (attempts) => {
    const guided = attempts.filter(a => a.guided && a.accuracy > 0);
    if (!guided.length) return null;
    return Math.round(guided.reduce((sum, a) => sum + a.accuracy, 0) / guided.length);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h1 className="text-2xl font-black text-slate-800">✏️ Letter Tracing Strokes</h1>
          <Link to="/TracingReview" className="text-indigo-600 hover:underline text-sm font-bold">
            Single-letter review →
          </Link>
        </div>
        <p className="text-slate-500 text-sm mb-4">
          Every student attempt from Letter Tracing group practice, with their actual strokes — see who's writing smoothly.
        </p>

        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Class</label>
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm font-bold"
            >
              {classList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Letter</label>
            <select
              value={filterLetter}
              onChange={e => setFilterLetter(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm font-bold"
            >
              <option value="">All</option>
              {letters.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Group</label>
            <select
              value={filterGroup}
              onChange={e => setFilterGroup(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm font-bold"
            >
              <option value="">All</option>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-1.5 text-sm font-bold text-slate-600 cursor-pointer pb-1.5">
            <input
              type="checkbox"
              checked={onlyFreehand}
              onChange={e => setOnlyFreehand(e.target.checked)}
              className="w-4 h-4"
            />
            Freehand only
          </label>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-slate-400">Loading…</div>
        ) : Object.keys(byStudent).length === 0 ? (
          <div className="text-center py-8 text-slate-400">No group tracing attempts yet for this class.</div>
        ) : (
          <div className="space-y-4">
            {Object.entries(byStudent)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([num, attempts]) => {
                const avg = avgAccuracy(attempts);
                return (
                  <div key={num} className="bg-white rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                      <h2 className="font-bold text-slate-700">
                        <span className="text-slate-400 mr-1">#{num}</span>
                        {studentName(Number(num))}
                      </h2>
                      <div className="flex items-center gap-2 text-xs font-bold">
                        {avg != null && (
                          <span className={`rounded-full px-2 py-0.5 border ${avg >= 80 ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                            avg {avg}%
                          </span>
                        )}
                        <span className="text-slate-400">{attempts.length} attempts</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-8 gap-2">
                      {attempts.slice(0, 40).map(a => (
                        <div key={a.id} className="flex flex-col items-center gap-1">
                          <StrokeThumbnail
                            strokesData={a.strokes_data}
                            letter={a.letter}
                            size={110}
                          />
                          <div className="flex items-center gap-1 text-[10px] font-bold">
                            <span className="text-slate-600">{a.letter}</span>
                            {a.guided ? (
                              <span className={`rounded-full px-1.5 ${a.accuracy >= 80 ? 'bg-green-100 text-green-700' : a.accuracy > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                {a.accuracy || '—'}%
                              </span>
                            ) : (
                              <span className="rounded-full px-1.5 bg-violet-100 text-violet-700">✍️</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}