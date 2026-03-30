import React, { useState } from 'react';
import { motion } from 'framer-motion';

export default function StudentAccuracyView({ attempts, samples, onViewSample }) {
  const [selectedStudent, setSelectedStudent] = useState(null);

  // Build per-student, per-number stats
  const byStudent = {};
  attempts.forEach(a => {
    if (!byStudent[a.student_number]) byStudent[a.student_number] = {};
    if (!byStudent[a.student_number][a.number]) byStudent[a.student_number][a.number] = { correct: 0, total: 0 };
    byStudent[a.student_number][a.number].total++;
    if (a.correct) byStudent[a.student_number][a.number].correct++;
  });

  const students = Object.keys(byStudent).map(Number).sort((a, b) => a - b);

  const getColor = (correct, total) => {
    if (total === 0) return 'bg-gray-100 text-gray-400';
    const pct = correct / total;
    if (pct >= 0.8) return 'bg-green-100 text-green-700 border border-green-300';
    if (pct >= 0.5) return 'bg-yellow-100 text-yellow-700 border border-yellow-300';
    return 'bg-red-100 text-red-700 border border-red-300';
  };

  const allNumbers = [...new Set(attempts.map(a => a.number))].sort((a, b) => a - b);

  if (students.length === 0) {
    return <div className="text-gray-400 text-center py-12">No attempt data yet.</div>;
  }

  if (selectedStudent !== null) {
    const studentData = byStudent[selectedStudent] || {};
    const studentSamples = samples.filter(s => s.student_number === selectedStudent);
    return (
      <div>
        <button onClick={() => setSelectedStudent(null)} className="mb-4 text-indigo-600 font-bold text-sm hover:underline">← All students</button>
        <h3 className="text-lg font-bold text-gray-800 mb-4">Student #{selectedStudent}</h3>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-6">
          {allNumbers.map(num => {
            const s = studentData[num] || { correct: 0, total: 0 };
            return (
              <div key={num} className={`rounded-xl p-3 text-center ${getColor(s.correct, s.total)}`}>
                <div className="text-2xl font-bold">{num}</div>
                <div className="text-xs mt-1">{s.total === 0 ? '—' : `${s.correct}/${s.total}`}</div>
              </div>
            );
          })}
        </div>
        {studentSamples.length > 0 && (
          <>
            <h4 className="font-bold text-gray-700 mb-3">Writing Samples</h4>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {studentSamples.map(sample => (
                <div
                  key={sample.id}
                  className="bg-gray-50 rounded-xl p-2 border border-gray-200 cursor-pointer hover:border-indigo-400"
                  onClick={() => onViewSample(sample)}
                >
                  <div className="text-center font-bold text-indigo-600 text-sm mb-1">#{sample.number}</div>
                  {sample.image_url && <img src={sample.image_url} alt="" className="w-full rounded-lg" />}
                </div>
              ))}
            </div>
          </>
        )}
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
        const struggling = nums.filter(n => {
          const d = data[n];
          return d.total >= 3 && d.correct / d.total < 0.5;
        });
        return (
          <motion.div
            key={sn}
            whileHover={{ scale: 1.02 }}
            className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-indigo-400"
            onClick={() => setSelectedStudent(sn)}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-gray-800">Student #{sn}</span>
              <span className={`text-sm font-bold ${overallPct >= 80 ? 'text-green-600' : overallPct >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                {overallPct}%
              </span>
            </div>
            <div className="text-xs text-gray-400 mb-2">{totalAttempts} attempts · {nums.length} numbers</div>
            {struggling.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {struggling.map(n => (
                  <span key={n} className="bg-red-100 text-red-600 text-xs font-bold px-1.5 py-0.5 rounded">
                    {n}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}