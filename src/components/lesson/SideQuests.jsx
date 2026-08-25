import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Compass, Sparkles } from 'lucide-react';

// Student-facing list of extra-practice lessons. Two groups:
//   • Guided Practice — teacher-authored lessons (assignment_type === 'guided')
//     available to everyone; not on the level path. A teacher can launch one
//     live (same QR/join flow) or students can start it themselves here.
//   • Side Quests — lessons (assignment_type === 'side_quest') assigned to
//     this specific student for small-group work.
// Tapping a card opens it in the lesson stepper (handled by GameHome).
export default function SideQuests({ selectedStudent, onOpen }) {
  const className = selectedStudent?.class_name || '';
  const studentNumber = selectedStudent?.number;

  const { data: lessons = [], isLoading } = useQuery({
    queryKey: ['side-quests', className, studentNumber],
    queryFn: () => base44.entities.Lesson.filter({ active: true }),
  });

  const guidedPractice = lessons.filter(
    (l) =>
      l.assignment_type === 'guided' &&
      (!l.class_name || l.class_name === className)
  );

  const myQuests = lessons.filter(
    (l) =>
      l.assignment_type === 'side_quest' &&
      (l.assigned_students || []).some(
        (a) => a.class_name === className && a.student_number === studentNumber
      )
  );

  const QuestCard = ({ l, accent }) => (
    <button
      key={l.id}
      onClick={() => onOpen(l)}
      className={`text-left bg-white rounded-2xl shadow-sm border-2 ${accent} p-5 hover:shadow-md transition`}
    >
      <div className="text-3xl mb-2">{l.steps?.[0]?.emoji || '⭐'}</div>
      <h3 className="text-lg font-black text-gray-800">{l.title}</h3>
      {l.subtitle && <p className="text-xs text-gray-500 mt-0.5">{l.subtitle}</p>}
      <p className={`text-xs font-bold mt-2 ${accent.includes('amber') ? 'text-amber-600' : 'text-indigo-600'}`}>
        {(l.steps || []).length} step{(l.steps || []).length !== 1 ? 's' : ''} →
      </p>
    </button>
  );

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-amber-50 to-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-amber-400 flex items-center justify-center shadow">
            <Compass className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-amber-900">🗺️ Quests</h1>
            <p className="text-xs text-amber-700">Extra practice your teacher set up for you.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {/* Guided Practice — available to everyone */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-indigo-500" />
                <h2 className="text-sm font-black text-indigo-700 uppercase tracking-wide">Guided Practice</h2>
              </div>
              {guidedPractice.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
                  <p className="text-sm text-gray-400">No guided practice yet. Your teacher can add some anytime!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {guidedPractice.map((l) => (
                    <QuestCard key={l.id} l={l} accent="border-indigo-100 hover:border-indigo-300" />
                  ))}
                </div>
              )}
            </section>

            {/* Side Quests — assigned to this student */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Compass className="w-5 h-5 text-amber-500" />
                <h2 className="text-sm font-black text-amber-700 uppercase tracking-wide">Just for You</h2>
              </div>
              {myQuests.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
                  <p className="text-sm text-gray-400">No side quests yet. Your teacher will assign some when you join a small group.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {myQuests.map((l) => (
                    <QuestCard key={l.id} l={l} accent="border-amber-100 hover:border-amber-300" />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}