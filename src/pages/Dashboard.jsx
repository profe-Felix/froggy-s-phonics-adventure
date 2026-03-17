import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import StudentCard from '../components/dashboard/StudentCard';
import StudentDetail from '../components/dashboard/StudentDetail';

export default function Dashboard() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState('All');
  const [selectedMode, setSelectedMode] = useState('All');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [assignMode, setAssignMode] = useState(false);
  const [selectedNumbers, setSelectedNumbers] = useState([]);
  const [assignClass, setAssignClass] = useState('');
  const [renamingClass, setRenamingClass] = useState(null);
  const [renameValue, setRenameValue] = useState('');

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
  const MODE_FILTER_LABELS = {
    All: 'All Modes',
    letter_sounds: 'Letter Sounds',
    sight_words_easy: 'Sight Words (Easy)',
    sight_words_spelling: 'SW Spelling',
    spelling: 'Spelling',
    case_matching: 'Case Matching'
  };

  const toggleSelect = (num) => {
    setSelectedNumbers(prev => prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]);
  };

  const handleBulkAssign = async () => {
    if (!assignClass.trim()) return;
    const cls = assignClass.trim().toUpperCase();
    const toUpdate = students.filter(s => selectedNumbers.includes(s.student_number) && !s._placeholder);
    await Promise.all(toUpdate.map(s => base44.entities.Student.update(s.id, { class_name: cls })));
    setStudents(prev => prev.map(s => selectedNumbers.includes(s.student_number) ? { ...s, class_name: cls } : s));
    setSelectedNumbers([]);
    setAssignClass('');
    setAssignMode(false);
  };

  // For a specific class, fill all 30 slots; for All, show real records only
  const getDisplayStudents = () => {
    let base = students;
    if (selectedMode !== 'All') {
      base = base.filter(s => (s.current_mode || 'letter_sounds') === selectedMode);
    }
    if (selectedClass === 'All') {
      return [...base].sort((a, b) => {
        if (a.class_name < b.class_name) return -1;
        if (a.class_name > b.class_name) return 1;
        return a.student_number - b.student_number;
      });
    }
    const classStudents = base.filter(s => s.class_name === selectedClass);
    const byNumber = {};
    classStudents.forEach(s => { byNumber[s.student_number] = s; });
    return Array.from({ length: 30 }, (_, i) => byNumber[i + 1] || { student_number: i + 1, class_name: selectedClass, _placeholder: true });
  };

  const sorted = getDisplayStudents();

  const handleRenameClass = async () => {
    const newName = renameValue.trim();
    if (!newName || newName === renamingClass) { setRenamingClass(null); return; }
    const toUpdate = students.filter(s => s.class_name === renamingClass);
    await Promise.all(toUpdate.map(s => base44.entities.Student.update(s.id, { class_name: newName })));
    setStudents(prev => prev.map(s => s.class_name === renamingClass ? { ...s, class_name: newName } : s));
    if (selectedClass === renamingClass) setSelectedClass(newName);
    setRenamingClass(null);
    setRenameValue('');
  };

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
          <div className="flex gap-2">
            {assignMode ? (
              <>
                <input
                  value={assignClass}
                  onChange={e => setAssignClass(e.target.value)}
                  placeholder="Class letter (e.g. F)"
                  className="border rounded-lg px-3 py-2 text-sm w-44"
                />
                <button
                  onClick={handleBulkAssign}
                  disabled={!assignClass.trim() || selectedNumbers.length === 0}
                  className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-40"
                >
                  Assign {selectedNumbers.length > 0 ? `(${selectedNumbers.length})` : ''}
                </button>
                <button
                  onClick={() => { setAssignMode(false); setSelectedNumbers([]); }}
                  className="border rounded-lg px-4 py-2 text-sm"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setAssignMode(true)}
                  className="text-sm bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700"
                >
                  Assign Classes
                </button>
                <button
                  onClick={loadStudents}
                  className="text-sm text-blue-600 border border-blue-200 rounded-lg px-4 py-2 hover:bg-blue-50"
                >
                  Refresh
                </button>
              </>
            )}
          </div>
        </div>

        {assignMode && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-sm text-blue-700">
            Select students below, enter a class letter, then click <strong>Assign</strong>.
          </div>
        )}

        {/* Class tabs */}
        <div className="flex gap-2 flex-wrap mb-3">
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
              {cls === 'All' ? 'All Classes' : (
                renamingClass === cls ? (
                  <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRenameClass(); if (e.key === 'Escape') setRenamingClass(null); }}
                      className="w-20 border rounded px-1 py-0 text-gray-800 text-sm"
                    />
                    <button onClick={handleRenameClass} className="text-green-600 font-bold">✓</button>
                    <button onClick={() => setRenamingClass(null)} className="text-red-400">✕</button>
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    Class {cls}
                    <span
                      onClick={e => { e.stopPropagation(); setRenamingClass(cls); setRenameValue(cls); }}
                      className="ml-1 opacity-50 hover:opacity-100 text-xs cursor-pointer"
                      title="Rename class"
                    >✏️</span>
                  </span>
                )
              )}
              <span className="ml-1.5 opacity-60 text-xs">
                ({cls === 'All' ? students.length : students.filter(s => s.class_name === cls).length})
              </span>
            </button>
          ))}
        </div>

        {/* Mode filter */}
        <div className="flex gap-2 flex-wrap mb-5">
          {Object.entries(MODE_FILTER_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSelectedMode(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                selectedMode === key
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-white text-gray-500 border hover:bg-gray-50'
              }`}
            >
              {label}
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
              assignMode ? (
                <button
                  key={student.student_number}
                  onClick={() => toggleSelect(student.student_number)}
                  className={`border-2 rounded-xl p-3 text-left transition ${
                    selectedNumbers.includes(student.student_number)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-blue-300'
                  }`}
                >
                  <div className="font-bold text-lg leading-none">{student.student_number}</div>
                  {student.class_name && <div className="text-xs text-gray-400 mt-0.5">Class {student.class_name}</div>}
                </button>
              ) : (
                <StudentCard key={student.id || student.student_number} student={student} onClick={s => !s._placeholder && setSelectedStudent(s)} />
              )
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