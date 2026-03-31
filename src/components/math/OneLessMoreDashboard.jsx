import React, { useState } from 'react';

export default function OneLessMoreDashboard({ attempts }) {
  const [selectedStudent, setSelectedStudent] = useState(null);

  if (attempts.length === 0) {
    return <div className="text-gray-400 text-center py-12">No 1 More / 1 Less data yet.</div>;
  }

  // Group by student
  const byStudent = {};
  attempts.forEach(a => {
    const sn = a.student_number;
    if (!byStudent[sn]) byStudent[sn] = [];
    byStudent[sn].push(a);
  });

  const students = Object.keys(byStudent).map(Number).sort((a, b) => a - b);

  if (selectedStudent !== null) {
    const data = byStudent[selectedStudent] || [];
    return (
      <div>
        <button onClick={() => setSelectedStudent(null)} className="mb-4 text-indigo-600 font-bold text-sm hover:underline">← All students</button>
        <h3 className="text-lg font-bold text-gray-800 mb-4">Student #{selectedStudent} — 1 More / 1 Less</h3>
        <div className="space-y-4">
          {data.map((a, i) => {
            const correctStart = a.is_correct_start;
            const correctResult = a.is_correct_result;
            return (
              <div key={a.id || i} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                <div className="flex items-center gap-3 flex-wrap mb-3">
                  <span className="font-bold text-gray-700">Round #{data.length - i}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${a.spinner_result === 'more' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                    1 {a.spinner_result === 'more' ? 'More ➕' : 'Less ➖'}
                  </span>
                  <span className="text-xs text-gray-400">{new Date(a.created_date).toLocaleString()}</span>
                </div>
                <div className="flex gap-6 flex-wrap">
                  {/* Starting */}
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-xs text-gray-500 font-medium">Starting: {a.starting_number}</p>
                    <p className={`text-lg font-bold ${correctStart ? 'text-green-600' : 'text-red-500'}`}>
                      Wrote: {a.student_wrote_start ?? '?'} {correctStart ? '✓' : '✗'}
                    </p>
                    {a.start_canvas_url && (
                      <img src={a.start_canvas_url} alt="start" className="w-28 rounded-lg border border-gray-200 bg-white" />
                    )}
                  </div>
                  <div className="text-2xl text-indigo-300 font-bold self-center">→</div>
                  {/* Result */}
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-xs text-gray-500 font-medium">Target: {a.target_number}</p>
                    <p className={`text-lg font-bold ${correctResult ? 'text-green-600' : 'text-red-500'}`}>
                      Wrote: {a.student_wrote_result ?? '?'} {correctResult ? '✓' : '✗'}
                    </p>
                    {a.result_canvas_url && (
                      <img src={a.result_canvas_url} alt="result" className="w-28 rounded-lg border border-gray-200 bg-white" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Overview
  return (
    <div>
      <h3 className="text-lg font-bold text-gray-700 mb-4">1 More / 1 Less — Class Overview</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {students.map(sn => {
          const data = byStudent[sn];
          const totalRounds = data.length;
          const correctStart = data.filter(a => a.is_correct_start).length;
          const correctResult = data.filter(a => a.is_correct_result).length;
          const total = totalRounds * 2;
          const correct = correctStart + correctResult;
          const pct = total ? Math.round(correct / total * 100) : 0;
          const moreCount = data.filter(a => a.spinner_result === 'more').length;
          const lessCount = data.filter(a => a.spinner_result === 'less').length;

          return (
            <div
              key={sn}
              className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-indigo-400 transition-colors"
              onClick={() => setSelectedStudent(sn)}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-gray-800">Student #{sn}</span>
                <span className={`text-sm font-bold ${pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                  {pct}%
                </span>
              </div>
              <div className="text-xs text-gray-400 mb-2">{totalRounds} round{totalRounds !== 1 ? 's' : ''}</div>
              <div className="flex gap-2 text-xs">
                <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">+1 ×{moreCount}</span>
                <span className="bg-pink-50 text-pink-600 px-1.5 py-0.5 rounded font-medium">-1 ×{lessCount}</span>
              </div>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}