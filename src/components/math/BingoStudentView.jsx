import React, { useState } from 'react';
import { motion } from 'framer-motion';

const MIN_ATTEMPTS = 2;

export default function BingoStudentView({ responses }) {
  const [selectedStudent, setSelectedStudent] = useState(null);

  // Build: { student -> { number -> { correct, total, times[] } } }
  const byStudent = {};
  responses.forEach(r => {
    if (r.free_space_click || r.not_on_card) return; // skip non-number responses
    const sn = r.student_number;
    const num = r.called_number;
    if (!byStudent[sn]) byStudent[sn] = {};
    if (!byStudent[sn][num]) byStudent[sn][num] = { correct: 0, total: 0, times: [] };
    byStudent[sn][num].total++;
    if (r.is_correct) byStudent[sn][num].correct++;
    if (r.response_time_ms) byStudent[sn][num].times.push(r.response_time_ms);
  });

  const students = Object.keys(byStudent).map(Number).sort((a, b) => a - b);
  const allNumbers = [...new Set(responses.filter(r => !r.free_space_click).map(r => r.called_number))].sort((a, b) => a - b);

  const getColor = (correct, total) => {
    if (total < MIN_ATTEMPTS) return 'bg-gray-100 text-gray-400';
    const pct = correct / total;
    if (pct >= 0.8) return 'bg-green-100 text-green-700 border border-green-300';
    if (pct >= 0.5) return 'bg-yellow-100 text-yellow-700 border border-yellow-300';
    return 'bg-red-100 text-red-700 border border-red-300';
  };

  const avgTime = (times) => times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length / 100) / 10 : null;

  if (students.length === 0) {
    return <div className="text-gray-400 text-center py-12">No Bingo response data yet.</div>;
  }

  if (selectedStudent !== null) {
    const data = byStudent[selectedStudent] || {};
    return (
      <div>
        <button onClick={() => setSelectedStudent(null)} className="mb-4 text-indigo-600 font-bold text-sm hover:underline">← All students</button>
        <h3 className="text-lg font-bold text-gray-800 mb-4">Student #{selectedStudent} — Bingo</h3>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {allNumbers.map(num => {
            const s = data[num] || { correct: 0, total: 0, times: [] };
            const t = avgTime(s.times);
            return (
              <div key={num} className={`rounded-xl p-3 text-center ${getColor(s.correct, s.total)}`}>
                <div className="text-2xl font-bold">{num}</div>
                <div className="text-xs mt-1">{s.total === 0 ? '—' : `${s.correct}/${s.total}`}</div>
                {t && <div className="text-xs opacity-70">{t}s</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {students.map(sn => {
        const data = byStudent[sn];
        const nums = Object.keys(data).map(Number);
        const totalCorrect = nums.reduce((s, n) => s + data[n].correct, 0);
        const totalAttempts = nums.reduce((s, n) => s + data[n].total, 0);
        const overallPct = totalAttempts ? Math.round(totalCorrect / totalAttempts * 100) : 0;
        const allTimes = nums.flatMap(n => data[n].times);
        const avg = avgTime(allTimes);
        const struggling = nums.filter(n => data[n].total >= MIN_ATTEMPTS && data[n].correct / data[n].total < 0.5);
        return (
          <motion.div
            key={sn}
            whileHover={{ scale: 1.02 }}
            className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-indigo-400"
            onClick={() => setSelectedStudent(sn)}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-gray-800">Student #{sn}</span>
              <span className={`text-sm font-bold ${overallPct >= 80 ? 'text-green-600' : overallPct >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                {overallPct}%
              </span>
            </div>
            <div className="text-xs text-gray-400 mb-2">
              {totalAttempts} responses{avg ? ` · avg ${avg}s` : ''}
            </div>
            {struggling.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {struggling.map(n => (
                  <span key={n} className="bg-red-100 text-red-600 text-xs font-bold px-1.5 py-0.5 rounded">{n}</span>
                ))}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}