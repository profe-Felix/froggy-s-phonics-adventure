import { useState } from 'react';
import { motion } from 'framer-motion';
import TeacherNotebookDashboard from '../components/notebook/TeacherNotebookDashboard';
import StudentNotebookView from '../components/notebook/StudentNotebookView';

const CLASS_NAMES = ['F', 'V', 'C', 'A', 'B', 'D'];
const STUDENT_NUMBERS = Array.from({ length: 30 }, (_, i) => i + 1);

function StudentLogin({ onEnter }) {
  const [className, setClassName] = useState(null);
  const [studentNumber, setStudentNumber] = useState(null);

  if (!className) {
    return (
      <div className="flex flex-col items-center gap-6 py-10 px-4">
        <h2 className="text-2xl font-black text-white">Select Your Class</h2>
        <div className="grid grid-cols-3 gap-3">
          {CLASS_NAMES.map(c => (
            <motion.button key={c} whileTap={{ scale: 0.9 }} onClick={() => setClassName(c)}
              className="w-20 h-20 rounded-2xl text-3xl font-black text-white shadow-xl"
              style={{ background: '#4338ca', border: '3px solid #9333ea' }}>
              {c}
            </motion.button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 py-10 px-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setClassName(null)} className="text-indigo-300 hover:text-white font-bold">←</button>
        <h2 className="text-2xl font-black text-white">Class {className} — Your Number</h2>
      </div>
      <div className="grid grid-cols-5 gap-2 max-w-sm">
        {STUDENT_NUMBERS.map(n => (
          <motion.button key={n} whileTap={{ scale: 0.85 }}
            onClick={() => onEnter(className, n)}
            className="w-14 h-14 rounded-2xl font-black text-white text-xl shadow-lg"
            style={{ background: '#2563eb', border: '2px solid #4338ca' }}>
            {n}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export default function DigitalNotebook() {
  const params = new URLSearchParams(window.location.search);
  const isTeacherMode = params.get('mode') === 'teacher';
  const [role, setRole] = useState(isTeacherMode ? 'teacher' : null);
  const [studentInfo, setStudentInfo] = useState(null);

  if (role === 'teacher') {
    return <TeacherNotebookDashboard onBack={() => setRole(null)} />;
  }

  if (role === 'student' && studentInfo) {
    return (
      <StudentNotebookView
        studentNumber={studentInfo.number}
        className={studentInfo.className}
        onBack={() => { setStudentInfo(null); setRole(null); }}
      />
    );
  }

  if (role === 'student' && !studentInfo) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#0f0f1a' }}>
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: '#4338ca', background: '#1a1a2e' }}>
          <button onClick={() => setRole(null)} className="text-indigo-300 hover:text-white font-bold">← Back</button>
          <h1 className="text-lg font-black text-white">📓 Digital Notebook</h1>
        </div>
        <StudentLogin onEnter={(className, number) => setStudentInfo({ className, number })} />
      </div>
    );
  }

  // Landing
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-6"
      style={{ background: '#0f0f1a' }}>
      <div className="text-center">
        <div className="text-6xl mb-4">📓</div>
        <h1 className="text-4xl font-black text-white mb-2">Digital Notebook</h1>
        <p className="text-indigo-300">Annotate PDFs, record instructions, review student work</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">
        {isTeacherMode && (
          <motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.03 }} onClick={() => setRole('teacher')}
            className="flex-1 py-6 rounded-3xl font-black text-white text-xl shadow-2xl flex flex-col items-center gap-2"
            style={{ background: '#4338ca', border: '3px solid #9333ea' }}>
            <span className="text-3xl">👩‍🏫</span>
            Teacher
          </motion.button>
        )}
        <motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.03 }} onClick={() => setRole('student')}
          className="flex-1 py-6 rounded-3xl font-black text-white text-xl shadow-2xl flex flex-col items-center gap-2"
          style={{ background: '#2563eb', border: '3px solid #0d9488' }}>
          <span className="text-3xl">🎒</span>
          Student
        </motion.button>
      </div>
    </div>
  );
}