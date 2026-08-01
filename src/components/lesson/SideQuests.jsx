import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Compass } from 'lucide-react';

// Student-facing list of side-quest lessons assigned specifically to this
// student. Tapping a card opens it in the lesson stepper (handled by GameHome).
// Side quests are lessons where assignment_type === 'side_quest' and the
// student appears in assigned_students.
export default function SideQuests({ selectedStudent, onOpen }) {
  const className = selectedStudent?.class_name || '';
  const studentNumber = selectedStudent?.number;

  const { data: lessons = [], isLoading } = useQuery({
    queryKey: ['side-quests', className, studentNumber],
    queryFn: () => base44.entities.Lesson.filter({ active: true }),
  });

  const myQuests = lessons.filter(
    (l) =>
      l.assignment_type === 'side_quest' &&
      (l.assigned_students || []).some(
        (a) => a.class_name === className && a.student_number === studentNumber
      )
  );

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-amber-50 to-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-amber-400 flex items-center justify-center shadow">
            <Compass className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-amber-900">🗺️ Side Quests</h1>
            <p className="text-xs text-amber-700">Small-group practice assigned just for you.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : myQuests.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
            <p className="text-lg font-bold text-amber-600">No side quests yet!</p>
            <p className="text-sm text-gray-400 mt-1">
              Your teacher will assign some when you join a small group.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {myQuests.map((l) => {
              const stepCount = (l.steps || []).length;
              return (
                <button
                  key={l.id}
                  onClick={() => onOpen(l)}
                  className="text-left bg-white rounded-2xl shadow-sm border-2 border-amber-100 p-5 hover:border-amber-300 hover:shadow-md transition"
                >
                  <div className="text-3xl mb-2">{l.steps?.[0]?.emoji || '⭐'}</div>
                  <h3 className="text-lg font-black text-gray-800">{l.title}</h3>
                  {l.subtitle && <p className="text-xs text-gray-500 mt-0.5">{l.subtitle}</p>}
                  <p className="text-xs text-amber-600 font-bold mt-2">
                    {stepCount} step{stepCount !== 1 ? 's' : ''} →
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}