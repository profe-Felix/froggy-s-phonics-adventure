import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import TeacherNotebookDashboard from '../components/notebook/TeacherNotebookDashboard';
import StudentNotebookView from '../components/notebook/StudentNotebookView';
import { base44 } from '@/api/base44Client';
import { QRCodeSVG } from 'qrcode.react';

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

// Class picker shown when assignment link has no class pre-selected
function ClassPicker({ onSelect, title }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6" style={{ background: '#0f0f1a' }}>
      <div className="text-center">
        <div className="text-5xl mb-3">📓</div>
        <h1 className="text-2xl font-black text-white mb-1">{title}</h1>
        <p className="text-indigo-300 text-sm">Select your class to continue</p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {CLASS_NAMES.map(c => (
          <motion.button key={c} whileTap={{ scale: 0.92 }} onClick={() => onSelect(c)}
            className="w-full py-5 rounded-2xl text-2xl font-black text-white shadow-xl"
            style={{ background: '#4338ca', border: '3px solid #9333ea' }}>
            {c}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export default function DigitalNotebook() {
  const params = new URLSearchParams(window.location.search);
  const isTeacherMode = params.get('mode') === 'teacher';

  const urlClass = parseClassParam(params.get('class'));
  const urlAssignment = params.get('assignment') || params.get('Assignment') || null;
  const urlNumber = parseInt(params.get('number') || params.get('student'));
  const urlPage = parseInt(params.get('page')) || null;

  // If an assignment link is shared (no class, no number), we show class picker first
  const isAssignmentLink = !!urlAssignment && !urlClass && !urlNumber;

  const [role, setRole] = useState(isTeacherMode ? 'teacher' : null);
  const [studentInfo, setStudentInfo] = useState(null);
  const [pickedClass, setPickedClass] = useState(urlClass || null);
  const [autoResolved, setAutoResolved] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [qrClass, setQrClass] = useState('');

  useEffect(() => {
    if (autoResolved) return;
    if (urlClass && !isNaN(urlNumber) && urlNumber > 0) {
      setStudentInfo({ className: urlClass, number: urlNumber, directAssignment: urlAssignment, directPage: urlPage });
      setRole('student');
      setAutoResolved(true);
    } else if (urlClass && !isTeacherMode) {
      setRole('student');
      setAutoResolved(true);
    }
  }, [urlClass, urlNumber, urlAssignment, autoResolved, isTeacherMode]);

  // If assignment link: show class picker, then student number picker, then go straight to notebook
  if (isAssignmentLink && !pickedClass) {
    return <ClassPicker title={urlAssignment} onSelect={(c) => { setPickedClass(c); setRole('student'); }} />;
  }

  if (isAssignmentLink && pickedClass && !studentInfo) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#0f0f1a' }}>
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: '#4338ca', background: '#1a1a2e' }}>
          <button onClick={() => setPickedClass(null)} className="text-indigo-300 hover:text-white font-bold">← Back</button>
          <h1 className="text-lg font-black text-white">📓 {urlAssignment}</h1>
        </div>
        <StudentLogin
          onEnter={(className, number) => setStudentInfo({ className, number, directAssignment: urlAssignment, directPage: urlPage })}
          preselectedClass={pickedClass}
        />
      </div>
    );
  }

  if (role === 'teacher') {
    return <TeacherNotebookDashboard onBack={() => setRole(null)} />;
  }

  if (role === 'student' && studentInfo) {
    const qrUrl = `${window.location.origin}/DigitalNotebook?assignment=${encodeURIComponent(urlAssignment || studentInfo.directAssignment || '')}&class=${qrClass || studentInfo.className}&page=${urlPage || 1}`;
    return (
      <>
        <StudentNotebookView
          studentNumber={studentInfo.number}
          className={studentInfo.className}
          directAssignmentName={studentInfo.directAssignment || null}
          directPage={studentInfo.directPage || null}
          onBack={() => { setStudentInfo(null); setRole(null); setPickedClass(urlClass || null); }}
          extraHeaderContent={
            urlAssignment ? (
              <button onClick={() => setShowQR(true)}
                className="px-2 py-1 rounded-lg text-xs font-bold border border-indigo-500 text-indigo-300 hover:bg-indigo-900 shrink-0">
                📱 QR
              </button>
            ) : null
          }
        />
        {showQR && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]" onClick={() => setShowQR(false)}>
            <div className="bg-white rounded-2xl p-6 text-center shadow-2xl w-80" onClick={e => e.stopPropagation()}>
              <p className="font-black text-lg mb-1">📱 Share Assignment QR</p>
              <p className="text-xs text-gray-500 mb-3">{urlAssignment}</p>
              <div className="flex items-center gap-2 mb-3 justify-center">
                <span className="text-sm font-bold text-gray-600">Class:</span>
                <select value={qrClass || studentInfo.className}
                  onChange={e => setQrClass(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-sm font-bold">
                  <option value="">All classes</option>
                  {CLASS_NAMES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex justify-center mb-3">
                <QRCodeSVG value={qrUrl} size={220} level="M" />
              </div>
              <p className="text-xs text-gray-400 mb-4 break-all">{qrUrl}</p>
              <button onClick={() => setShowQR(false)} className="border border-gray-300 bg-white rounded-xl px-4 py-2 text-sm font-bold hover:bg-gray-50">Close</button>
            </div>
          </div>
        )}
      </>
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
          onEnter={(className, number) => setStudentInfo({ className, number, directAssignment: urlAssignment, directPage: urlPage })}
          preselectedClass={urlClass}
        />
      </div>
    );
  }

  // Landing
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-6" style={{ background: '#0f0f1a' }}>
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
            <span className="text-3xl">👩‍🏫</span>Teacher
          </motion.button>
        )}
        <motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.03 }} onClick={() => setRole('student')}
          className="flex-1 py-6 rounded-3xl font-black text-white text-xl shadow-2xl flex flex-col items-center gap-2"
          style={{ background: '#2563eb', border: '3px solid #0d9488' }}>
          <span className="text-3xl">🎒</span>Student
        </motion.button>
      </div>
    </div>
  );
}