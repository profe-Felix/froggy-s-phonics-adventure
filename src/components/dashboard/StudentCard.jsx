import React from 'react';

const MODE_LABELS = {
  letter_sounds: 'Letters',
  sight_words_easy: 'Sight Words',
  sight_words_spelling: 'SW Spelling',
  spelling: 'Spelling',
  case_matching: 'Cases'
};

function getMasteryColor(mastered, total) {
  if (total === 0) return 'bg-gray-100 text-gray-400';
  const pct = mastered / total;
  if (pct >= 0.8) return 'bg-green-100 text-green-800 border-green-300';
  if (pct >= 0.4) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  return 'bg-red-100 text-red-800 border-red-300';
}

export default function StudentCard({ student, onClick }) {
  const mp = student.mode_progress || {};
  const currentMode = student.current_mode || 'letter_sounds';
  const modeData = mp[currentMode] || {};
  const mastered = (modeData.mastered_items || []).length;
  const learning = (modeData.learning_items || []).length;
  const total = mastered + learning;
  const colorClass = getMasteryColor(mastered, total);

  return (
    <button
      onClick={() => onClick(student)}
      className={`border rounded-xl p-3 text-left w-full transition hover:scale-105 hover:shadow-md ${colorClass}`}
    >
      <div className="font-bold text-lg leading-none">{student.student_number}</div>
      {student.name && <div className="text-xs mt-0.5 truncate opacity-70">{student.name}</div>}
      <div className="text-xs mt-1 font-medium">{MODE_LABELS[currentMode]}</div>
      <div className="text-xs opacity-60">{mastered}/{total} mastered</div>
    </button>
  );
}