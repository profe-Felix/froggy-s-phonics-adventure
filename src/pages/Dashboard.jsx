import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import StudentCard from '../components/dashboard/StudentCard';
import StudentDetail from '../components/dashboard/StudentDetail';

export default function Dashboard() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState('All');
  const [selectedStudent, setSelectedStudent] = useState(null);

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    setLoading(true);
    const data = await base44.entities.Student.list('-updated_date', 200);
    setStudents(data);
    setLoading(false);
  };

  const classes = ['All', ...Array.from(new Set(students.map(s => s.class_name).filter(Boolean))).sort()];

  const filtered = selectedClass === 'All'
    ? students
    : students.filter(s => s.class_name === selectedClass);

  // Sort by student_number
  const sorted = [...filtered].sort((a, b) => a.student_number - b.student_number);

  const handleStudentUpdate = (updated) => {
    setStudents(prev => prev.map(s => s.id === updated.id ? updated : s));
    setSelectedStudent(updated);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 to-blue-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">📊 Progress Dashboard</h1>
            <p className="text-gray-500 mt-1">Click any student to see their detailed progress</p>
          </div>
          <button
            onClick={loadStudents}
            className="text-sm text-blue-600 border border-blue-200 rounded-lg px-4 py-2 hover:bg-blue-50"
          >
            Refresh
          </button>
        </div>

        {/* Class tabs */}
        <div className="flex gap-2 flex-wrap mb-6">
          {classes.map(cls => (
            <button
              key={cls}
              onClick={() => setSelectedClass(cls)}
              className={`px-4 py-2 rounded-full font-medium text-sm transition ${
                selectedClass === cls
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-white text-gray-600 border hover:bg-gray-50'
              }`}
            >
              {cls === 'All' ? 'All Classes' : `Class ${cls}`}
              <span className="ml-1.5 opacity-60 text-xs">
                ({cls === 'All' ? students.length : students.filter(s => s.class_name === cls).length})
              </span>
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex gap-4 mb-4 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200 inline-block"></span> ≥80% mastered</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-200 inline-block"></span> 40–79% mastered</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 inline-block"></span> &lt;40% mastered</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-200 inline-block"></span> No activity</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">No students found</p>
            <p className="text-sm mt-1">Students appear here once they log in and play</p>
          </div>
        ) : (
          <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
            {sorted.map(student => (
              <StudentCard key={student.id} student={student} onClick={setSelectedStudent} />
            ))}
          </div>
        )}
      </div>

      {selectedStudent && (
        <StudentDetail
          student={selectedStudent}
          onClose={() => setSelectedStudent(null)}
          onUpdate={handleStudentUpdate}
        />
      )}
    </div>
  );
}