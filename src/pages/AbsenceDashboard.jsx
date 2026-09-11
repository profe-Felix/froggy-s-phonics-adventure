import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { ArrowLeft, Clock, UserX, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { parseName } from '@/lib/nameNormalize';

export default function AbsenceDashboard() {
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Student.filter({ school_year: ACTIVE_SCHOOL_YEAR }, '-updated_date', 200).then((all) => {
      const unique = [...new Set(all.map((s) => s.class_name).filter(Boolean))].sort();
      setClasses(unique);
      if (unique.length > 0) setSelectedClass(unique[0]);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedClass) return;
    base44.entities.CarpetAbsence.filter({ class_name: selectedClass }, '-started_at', 500).then((recs) => {
      setRecords(recs);
    });
  }, [selectedClass]);

  // Per-student summary
  const summary = {};
  for (const r of records) {
    if (!r.student_id) continue;
    if (!summary[r.student_id]) {
      summary[r.student_id] = {
        name: r.student_name || '',
        absentCount: 0,
        pulledCount: 0,
        totalMinutes: 0,
        sessions: [],
      };
    }
    if (r.type === 'absent') summary[r.student_id].absentCount++;
    if (r.type === 'stepped_out') summary[r.student_id].pulledCount++;
    summary[r.student_id].totalMinutes += r.duration_minutes || 0;
    if (r.ended_at) summary[r.student_id].sessions.push(r);
  }

  const sortedSummary = Object.entries(summary).sort(
    (a, b) => b[1].totalMinutes - a[1].totalMinutes
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to="/Dashboard" className="text-gray-400 hover:text-gray-600">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Absence & Pull-out Tracker</h1>
              <p className="text-sm text-gray-500">{records.length} records</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {classes.map((cls) => (
              <button
                key={cls}
                onClick={() => setSelectedClass(cls)}
                className={`px-4 py-2 rounded-full font-medium text-sm transition ${
                  selectedClass === cls ? 'bg-blue-600 text-white shadow' : 'bg-white text-gray-600 border hover:bg-blue-50'
                }`}
              >
                {cls}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {sortedSummary.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            No absence records yet. Mark students absent or pulled out from the Carpet page.
          </div>
        ) : (
          <>
            {/* Per-student summary */}
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" /> Student Summary
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
              {sortedSummary.map(([id, s]) => {
                const { first } = parseName(s.name);
                return (
                  <div key={id} className="bg-white rounded-lg border p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{first || s.name}</div>
                      <div className="text-xs text-muted-foreground flex gap-3 mt-1 flex-wrap">
                        <span className="flex items-center gap-1">
                          <UserX className="w-3 h-3 text-red-400" /> {s.absentCount} absent
                        </span>
                        <span className="flex items-center gap-1">
                          <UserX className="w-3 h-3 text-amber-400" /> {s.pulledCount} pulled
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {s.totalMinutes}m total
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recent records */}
            <h2 className="text-lg font-bold mb-3">Recent Records</h2>
            <div className="bg-white rounded-lg border overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Student</th>
                    <th className="text-left px-4 py-2 font-medium">Type</th>
                    <th className="text-left px-4 py-2 font-medium">Started</th>
                    <th className="text-left px-4 py-2 font-medium">Ended</th>
                    <th className="text-left px-4 py-2 font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {records.slice(0, 50).map((r) => {
                    const { first } = parseName(r.student_name);
                    const start = new Date(r.started_at);
                    const end = r.ended_at ? new Date(r.ended_at) : null;
                    return (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="px-4 py-2">{first || r.student_name}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              r.type === 'absent' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {r.type === 'absent' ? 'Absent' : 'Pulled'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                          {start.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                          {end ? end.toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-2">{r.duration_minutes ? `${r.duration_minutes}m` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}