import React from 'react';

const MIN_ATTEMPTS = 3;
const STRUGGLE_THRESHOLD = 0.5;

export default function StruggleGroups({ attempts }) {
  // attempts: array of NumberAttempt records
  // Build: { number -> { student -> { correct, total } } }
  const byNumber = {};
  attempts.forEach(a => {
    if (!byNumber[a.number]) byNumber[a.number] = {};
    if (!byNumber[a.number][a.student_number]) byNumber[a.number][a.student_number] = { correct: 0, total: 0 };
    byNumber[a.number][a.student_number].total++;
    if (a.correct) byNumber[a.number][a.student_number].correct++;
  });

  // Find numbers where ≥2 students are struggling
  const groups = Object.entries(byNumber)
    .map(([num, students]) => {
      const struggling = Object.entries(students)
        .filter(([, s]) => s.total >= MIN_ATTEMPTS && s.correct / s.total < STRUGGLE_THRESHOLD)
        .map(([sn, s]) => ({ student_number: parseInt(sn), accuracy: Math.round(s.correct / s.total * 100) }))
        .sort((a, b) => a.accuracy - b.accuracy);
      return { number: parseInt(num), struggling };
    })
    .filter(g => g.struggling.length >= 1)
    .sort((a, b) => b.struggling.length - a.struggling.length);

  if (groups.length === 0) {
    return (
      <div className="text-gray-400 text-center py-12">
        No struggle groups yet — need at least {MIN_ATTEMPTS} attempts per student per number.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(g => (
        <div key={g.number} className="border border-red-200 bg-red-50 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl font-bold text-red-700">#{g.number}</span>
            <span className="text-sm text-red-500 font-medium">{g.struggling.length} student{g.struggling.length !== 1 ? 's' : ''} struggling</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {g.struggling.map(s => (
              <div key={s.student_number} className="bg-white border border-red-200 rounded-lg px-3 py-1.5 text-sm">
                <span className="font-bold text-gray-700">Student #{s.student_number}</span>
                <span className="ml-2 text-red-500">{s.accuracy}%</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}