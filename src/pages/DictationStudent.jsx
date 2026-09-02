import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import DictationCanvas from '@/components/dictation/DictationCanvas';
import BackButton from '@/components/ui/BackButton';

export default function DictationStudent() {
  const params = new URLSearchParams(window.location.search);
  const [assignmentId, setAssignmentId] = useState(params.get('assignment') || '');
  const [className, setClassName] = useState(params.get('class') || '');
  const [studentNumber, setStudentNumber] = useState(params.get('student') || '');
  const [schoolYear, setSchoolYear] = useState(ACTIVE_SCHOOL_YEAR);
  const [started, setStarted] = useState(!!(params.get('assignment') && params.get('class') && params.get('student')));

  const { data: classConfigs = [] } = useQuery({
    queryKey: ['class-configs'],
    queryFn: () => base44.entities.ClassConfig.list(),
  });
  const classNames = classConfigs.map((c) => c.class_name).filter(Boolean);

  const { data: assignments = [] } = useQuery({
    queryKey: ['dictation-assignments', className],
    queryFn: () =>
      base44.entities.DictationAssignment.filter({
        class_name: className,
        school_year: ACTIVE_SCHOOL_YEAR,
        status: 'active',
      }),
    enabled: !!className,
  });

  const { data: assignment } = useQuery({
    queryKey: ['dictation-assignment', assignmentId],
    queryFn: () => base44.entities.DictationAssignment.get(assignmentId),
    enabled: !!assignmentId,
  });

  // Fetch student's school year
  useEffect(() => {
    if (!className || !studentNumber) return;
    base44.entities.Student
      .filter({ class_name: className, student_number: parseInt(studentNumber), school_year: ACTIVE_SCHOOL_YEAR })
      .then((students) => {
        if (students.length > 0) setSchoolYear(students[0].school_year || ACTIVE_SCHOOL_YEAR);
      })
      .catch(() => {});
  }, [className, studentNumber]);

  if (started && assignmentId && className && studentNumber) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-200 bg-white">
          <BackButton tone="indigo" onClick={() => setStarted(false)} />
          <h1 className="text-lg font-black text-slate-800 flex-1">
            📝 {assignment?.title || 'Dictation'}
          </h1>
          <span className="text-sm font-bold text-slate-500">
            {className} · #{studentNumber}
          </span>
        </div>
        <div className="flex-1 overflow-auto">
          <DictationCanvas
            assignmentId={assignmentId}
            studentNumber={parseInt(studentNumber)}
            className={className}
            schoolYear={schoolYear}
            promptText={assignment?.prompt_text}
          />
        </div>
      </div>
    );
  }

  // Login / picker screen
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 bg-slate-50">
      <div className="text-center">
        <div className="text-5xl mb-3">📝</div>
        <h1 className="text-2xl font-black text-slate-800 mb-1">Dictation</h1>
        <p className="text-slate-500 text-sm">Pick your class and number to start writing</p>
      </div>
      <div className="flex flex-col gap-4 w-full max-w-xs">
        <select
          value={className}
          onChange={(e) => setClassName(e.target.value)}
          className="px-4 py-3 rounded-2xl font-bold text-slate-700 border-2 border-slate-200 bg-white"
        >
          <option value="">Select class…</option>
          {classNames.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-500">#</span>
          <input
            type="number"
            min={1}
            max={30}
            value={studentNumber}
            onChange={(e) => setStudentNumber(e.target.value)}
            placeholder="Student number"
            className="flex-1 px-4 py-3 rounded-2xl font-bold text-slate-700 border-2 border-slate-200 bg-white text-center text-lg"
          />
        </div>

        {className && assignments.length > 0 && (
          <select
            value={assignmentId}
            onChange={(e) => setAssignmentId(e.target.value)}
            className="px-4 py-3 rounded-2xl font-bold text-slate-700 border-2 border-slate-200 bg-white"
          >
            <option value="">Select assignment…</option>
            {assignments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        )}

        <button
          onClick={() => {
            if (!className || !studentNumber || !assignmentId) return;
            setStarted(true);
          }}
          disabled={!className || !studentNumber || !assignmentId}
          className="w-full py-4 rounded-2xl text-xl font-black text-white shadow-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ✏️ Start Writing
        </button>
      </div>
    </div>
  );
}