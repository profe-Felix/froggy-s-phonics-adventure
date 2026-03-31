import React, { useState } from 'react';
import StrokeReplay from './StrokeReplay';

export default function OneLessMoreDashboard({ attempts }) {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [detailView, setDetailView] = useState(false); // false=overview, true=strokes
  const [replayAttempt, setReplayAttempt] = useState(null); // { attempt, side: 'start'|'result' }

  if (attempts.length === 0) {
    return <div className="text-gray-400 text-center py-12">No 1 More / 1 Less data yet.</div>;
  }

  const byStudent = {};
  attempts.forEach(a => {
    const sn = a.student_number;
    if (!byStudent[sn]) byStudent[sn] = [];
    byStudent[sn].push(a);
  });
  const students = Object.keys(byStudent).map(Number).sort((a, b) => a - b);

  // Stroke replay lightbox
  if (replayAttempt) {
    const { attempt, side } = replayAttempt;
    const strokesData = side === 'start' ? attempt.start_strokes_data : attempt.result_strokes_data;
    const num = side === 'start' ? attempt.starting_number : attempt.target_number;
    return (
      <div>
        <button onClick={() => setReplayAttempt(null)} className="mb-4 text-indigo-600 font-bold text-sm hover:underline">
          ← Back
        </button>
        <h3 className="text-lg font-bold text-gray-800 mb-4">
          Student #{attempt.student_number} — wrote "{side === 'start' ? 'starting' : 'result'}" number ({num})
        </h3>
        {strokesData ? (
          <StrokeReplay strokesData={strokesData} />
        ) : (
          <p className="text-gray-400">No stroke data saved for this attempt.</p>
        )}
      </div>
    );
  }

  // Student detail
  if (selectedStudent !== null) {
    const data = byStudent[selectedStudent] || [];
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setSelectedStudent(null)} className="text-indigo-600 font-bold text-sm hover:underline">← All students</button>
          <h3 className="text-lg font-bold text-gray-800">Student #{selectedStudent}</h3>
          {/* Toggle overview / strokes */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button onClick={() => setDetailView(false)}
              className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${!detailView ? 'bg-white text-indigo-700 shadow' : 'text-gray-500'}`}>
              Overview
            </button>
            <button onClick={() => setDetailView(true)}
              className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${detailView ? 'bg-white text-indigo-700 shadow' : 'text-gray-500'}`}>
              ✏️ Strokes
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {data.map((a, i) => (
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
                  <p className={`text-lg font-bold ${a.is_correct_start ? 'text-green-600' : 'text-red-500'}`}>
                    Wrote: {a.student_wrote_start ?? '?'} {a.is_correct_start ? '✓' : '✗'}
                  </p>
                  {!detailView && a.start_strokes_data && (
                    <button onClick={() => setReplayAttempt({ attempt: a, side: 'start' })}
                      className="text-xs text-indigo-500 hover:underline mt-1">▶ Replay writing</button>
                  )}
                  {detailView && a.start_strokes_data && (
                    <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden bg-white">
                      <StrokeReplay strokesData={a.start_strokes_data} compact />
                    </div>
                  )}
                </div>
                <div className="text-2xl text-indigo-300 font-bold self-center">→</div>
                {/* Result */}
                <div className="flex flex-col items-center gap-1">
                  <p className="text-xs text-gray-500 font-medium">Target: {a.target_number}</p>
                  <p className={`text-lg font-bold ${a.is_correct_result ? 'text-green-600' : 'text-red-500'}`}>
                    Wrote: {a.student_wrote_result ?? '?'} {a.is_correct_result ? '✓' : '✗'}
                  </p>
                  {!detailView && a.result_strokes_data && (
                    <button onClick={() => setReplayAttempt({ attempt: a, side: 'result' })}
                      className="text-xs text-indigo-500 hover:underline mt-1">▶ Replay writing</button>
                  )}
                  {detailView && a.result_strokes_data && (
                    <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden bg-white">
                      <StrokeReplay strokesData={a.result_strokes_data} compact />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Class overview
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
            <div key={sn}
              className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-indigo-400 transition-colors"
              onClick={() => setSelectedStudent(sn)}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-gray-800">Student #{sn}</span>
                <span className={`text-sm font-bold ${pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>{pct}%</span>
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