import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import TeacherNotebookDashboard from '../components/notebook/TeacherNotebookDashboard';
import StudentNotebookView from '../components/notebook/StudentNotebookView';
import { base44 } from '@/api/base44Client';

const CLASS_NAMES = ['Campos', 'Felix', 'Valero'];
const STUDENT_NUMBERS = Array.from({ length: 30 }, (_, i) => i + 1);

// Map class name aliases to canonical names
const CLASS_MAP = {
  'felix': 'Felix', 'f': 'Felix',
  'valero': 'Valero', 'v': 'Valero',
  'campos': 'Campos', 'c': 'Campos',
};

function parseClassParam(raw) {
  if (!raw) return null;
  return CLASS_MAP[raw.toLowerCase()] || (raw.charAt(0).toUpperCase() + raw.slice(1));
}

function StudentLogin({ onEnter, preselectedClass }) {
  const [className, setClassName] = useState(preselectedClass || null);
  const [studentNumber, setStudentNumber] = useState(null);

  if (!className) {
    return (
      <div className="flex flex-col items-center gap-6 py-10 px-4">
        <h2 className="text-2xl font-black text-white">Select Your Class</h2>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {CLASS_NAMES.map(c => (
            <motion.button key={c} whileTap={{ scale: 0.9 }} onClick={() => setClassName(c)}
              className="w-full py-5 rounded-2xl text-2xl font-black text-white shadow-xl"
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
        {!preselectedClass && (
          <button onClick={() => setClassName(null)} className="text-indigo-300 hover:text-white font-bold">←</button>
        )}
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

  // QR / URL deep-link params
  // e.g. /DigitalNotebook?class=Felix&assignment=Aprende+y+demuestra&number=3
  const urlClass = parseClassParam(params.get('class'));
  const urlAssignment = params.get('assignment') || params.get('Assignment') || null;
  const urlNumber = parseInt(params.get('number') || params.get('student'));

  const [role, setRole] = useState(isTeacherMode ? 'teacher' : null);
  const [studentInfo, setStudentInfo] = useState(null);
  const [autoResolved, setAutoResolved] = useState(false);

  // If class + student number are in URL, skip the login screens entirely
  // If only class (+ optional assignment) is in URL, skip to student number picker
  useEffect(() => {
    if (autoResolved) return;
    if (urlClass && !isNaN(urlNumber) && urlNumber > 0) {
      setStudentInfo({ className: urlClass, number: urlNumber, directAssignment: urlAssignment });
      setRole('student');
      setAutoResolved(true);
    } else if (urlClass && !isTeacherMode) {
      // Has class (and maybe assignment) but no number — go straight to student number picker
      setRole('student');
      setAutoResolved(true);
    }
  }, [urlClass, urlNumber, urlAssignment, autoResolved, isTeacherMode]);

  if (role === 'teacher') {
    return <TeacherNotebookDashboard onBack={() => setRole(null)} />;
  }

  if (role === 'student' && studentInfo) {
    return (
      <StudentNotebookView
        studentNumber={studentInfo.number}
        className={studentInfo.className}
        directAssignmentName={studentInfo.directAssignment || null}
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
        <StudentLogin
          onEnter={(className, number) => setStudentInfo({ className, number, directAssignment: urlAssignment })}
          preselectedClass={urlClass}
        />
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
      {/* QR hint */}
      <p className="text-indigo-400 text-xs text-center max-w-xs">
        Tip: QR codes can include <code className="text-indigo-300">/DigitalNotebook?class=Felix&amp;number=3&amp;assignment=My+Lesson</code>
      </p>
    </div>
  );
}