import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Multi-select student picker for side-quest assignment. Renders every student
// grouped by class as a grid of number tiles; toggled tiles are added to the
// assigned_students array as { class_name, student_number } entries.
export default function StudentPicker({ selected = [], onChange }) {
  const { data: students = [] } = useQuery({
    queryKey: ['students'],
    queryFn: () => base44.entities.Student.list(),
  });

  const isSelected = (s) =>
    selected.some(
      (a) => a.class_name === s.class_name && a.student_number === s.student_number
    );

  const toggle = (s) => {
    if (isSelected(s)) {
      onChange(
        selected.filter(
          (a) => !(a.class_name === s.class_name && a.student_number === s.student_number)
        )
      );
    } else {
      onChange([...selected, { class_name: s.class_name, student_number: s.student_number }]);
    }
  };

  const byClass = useMemo(() => {
    const m = {};
    for (const s of students) {
      const c = s.class_name || '—';
      if (!m[c]) m[c] = [];
      m[c].push(s);
    }
    return m;
  }, [students]);

  const classes = Object.keys(byClass).sort();

  return (
    <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-xl p-2 bg-gray-50">
      {classes.map((c) => (
        <div key={c} className="mb-2">
          <p className="text-xs font-black text-gray-500 px-1 py-0.5">{c}</p>
          <div className="grid grid-cols-6 sm:grid-cols-8 gap-1">
            {byClass[c]
              .sort((a, b) => a.student_number - b.student_number)
              .map((s) => {
                const on = isSelected(s);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(s)}
                    className={`text-xs font-bold rounded-lg py-1.5 transition ${
                      on
                        ? 'bg-amber-400 text-white shadow'
                        : 'bg-white text-gray-600 border border-gray-200 hover:border-amber-300'
                    }`}
                    title={s.name || `Student ${s.student_number}`}
                  >
                    {s.student_number}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
      {students.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4">No students loaded.</p>
      )}
    </div>
  );
}