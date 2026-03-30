import React from 'react';

const MIN_ATTEMPTS = 2;
const STRUGGLE_THRESHOLD = 0.5;

export default function BingoStruggleGroups({ responses }) {
  // Build: { number -> { student -> { correct, total } } }
  const byNumber = {};
  responses.forEach(r => {
    if (r.free_space_click || r.not_on_card) return;
    const num = r.called_number;
    const sn = r.student_number;
    if (!byNumber[num]) byNumber[num] = {};
    if (!byNumber[num][sn]) byNumber[num][sn] = { correct: 0, total: 0 };
    byNumber[num][sn].total++;
    if (r.is_correct) byNumber[num][sn].correct++;
  });

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
        No struggle groups yet — need at least {MIN_ATTEMPTS} Bingo responses per student per number.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(g => (
        <div key={g.number} className="border border-orange-200 bg-orange-50 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl font-bold text-orange-700">#{g.number}</span>
            <span className="text-sm text-orange-500 font-medium">{g.struggling.length} student{g.struggling.length !== 1 ? 's' : ''} struggling in Bingo</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {g.struggling.map(s => (
              <div key={s.student_number} className="bg-white border border-orange-200 rounded-lg px-3 py-1.5 text-sm">
                <span className="font-bold text-gray-700">Student #{s.student_number}</span>
                <span className="ml-2 text-orange-500">{s.accuracy}%</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}