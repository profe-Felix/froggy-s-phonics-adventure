import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import TeacherNotebookDashboard from '../components/notebook/TeacherNotebookDashboard';
import StudentNotebookView from '../components/notebook/StudentNotebookView';
import StudentLoginShell from '@/components/game/StudentLoginShell';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { QRCodeSVG } from 'qrcode.react';
import { useClassNames } from '@/hooks/useClassNames';
import { useClassColors } from '@/hooks/useClassColors';

const STUDENT_NUMBERS = Array.from({ length: 30 }, (_, i) => i + 1);
const GRADE_LABELS = { kinder: 'Kinder', first: '1st Grade' };

// Map class name aliases to canonical names
const CLASS_MAP = {
  'felix': 'Felix', 'f': 'Felix',
  'valero': 'Valero', 'v': 'Valero',
  'campos': 'Campos', 'c': 'Campos',
};

function parseClassParam(raw, classList) {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  // Check alias map first
  if (CLASS_MAP[lower]) return CLASS_MAP[lower];
  // Match against actual class names (case-insensitive)
  const match = classList.find(c => c.toLowerCase() === lower);
  if (match) return match;
  // Fallback: capitalize
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function StudentLogin({ onEnter, preselectedClass, classList, onBack }) {
  const { colorFor, groupedClasses, loading } = useClassColors();
  const [className, setClassName] = useState(preselectedClass || null);
  const groups = groupedClasses();

  const { data: classStudents = [] } = useQuery({
    queryKey: ['notebook-login-students', className],
    queryFn: () => base44.entities.Student.filter({ class_name: className, school_year: ACTIVE_SCHOOL_YEAR }),
    enabled: !!className,
  });
  const photoByNumber = new Map(
    classStudents.filter(s => s.photo_url).map(s => [s.student_number, s.photo_url])
  );

  const subtitle = !className ? (
    'Choose your class!'
  ) : (
    <span className="inline-flex items-center gap-2">
      {!preselectedClass && (
        <button onClick={() => setClassName(null)} className="text-slate-400 hover:text-slate-600 transition" aria-label="back">
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}
      Class <strong className="text-slate-700">{className}</strong> — pick your number!
    </span>
  );

  return (
    <StudentLoginShell
      icon="📓"
      title="Digital Notebook"
      titleFrom="#4f46e5"
      titleTo="#7c3aed"
      subtitle={subtitle}
      loading={!className && loading}
    >
      {!className ? (
        <div className="flex flex-col gap-6">
          {['kinder', 'first'].map(grade =>
            groups[grade]?.length ? (
              <div key={grade}>
                <h2 className="text-center text-slate-500 font-extrabold text-lg mb-3">{GRADE_LABELS[grade]}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                  {groups[grade].map((cls, i) => {
                    const c = colorFor(cls);
                    return (
                      <motion.button
                        key={cls}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                        whileHover={{ scale: 1.06 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setClassName(cls)}
                        className="group relative aspect-square sm:aspect-[4/3] rounded-3xl text-white font-extrabold text-lg sm:text-2xl shadow-xl ring-2 ring-white/40"
                        style={{ backgroundImage: `linear-gradient(to bottom right, ${c.from}, ${c.to})` }}
                      >
                        <span className="absolute top-2 left-3 text-lg sm:text-xl opacity-70 group-hover:opacity-100 transition">🌿</span>
                        <span className="relative z-10">{cls}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            ) : null
          )}
        </div>
      ) : (
        <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-10 gap-2.5 sm:gap-3">
          {STUDENT_NUMBERS.map((num, i) => {
            const c = colorFor(className);
            const photo = photoByNumber.get(num);
            return (
              <motion.button
                key={num}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(i * 0.015, 0.4) }}
                whileHover={{ scale: 1.12, y: -2 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => onEnter(className, num)}
                className="relative aspect-square rounded-2xl text-white font-extrabold text-xl sm:text-2xl shadow-lg ring-1 ring-white/30 overflow-hidden"
                style={{ backgroundImage: `linear-gradient(to bottom right, ${c.from}, ${c.to})` }}
              >
                {photo ? (
                  <>
                    <img src={photo} alt={`${num}`} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                    <span className="absolute bottom-0.5 right-1 text-[10px] sm:text-xs font-black bg-black/45 px-1.5 py-0.5 rounded-md leading-none">{num}</span>
                  </>
                ) : (
                  <span className="relative z-10">{num}</span>
                )}
              </motion.button>
            );
          })}
        </div>
      )}
    </StudentLoginShell>
  );
}

// Class picker shown when assignment link has no class pre-selected
function ClassPicker({ onSelect, title, classList }) {
  const { colorFor, groupedClasses, loading } = useClassColors();
  const groups = groupedClasses();
  return (
    <StudentLoginShell
      icon="📓"
      title="Digital Notebook"
      titleFrom="#4f46e5"
      titleTo="#7c3aed"
      subtitle={title || 'Select your class to continue'}
      loading={loading}
    >
      <div className="flex flex-col gap-6">
        {['kinder', 'first'].map(grade =>
          groups[grade]?.length ? (
            <div key={grade}>
              <h2 className="text-center text-slate-500 font-extrabold text-lg mb-3">{GRADE_LABELS[grade]}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                {groups[grade].map((cls, i) => {
                  const c = colorFor(cls);
                  return (
                    <motion.button
                      key={cls}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      whileHover={{ scale: 1.06 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => onSelect(cls)}
                      className="group relative aspect-square sm:aspect-[4/3] rounded-3xl text-white font-extrabold text-lg sm:text-2xl shadow-xl ring-2 ring-white/40"
                      style={{ backgroundImage: `linear-gradient(to bottom right, ${c.from}, ${c.to})` }}
                    >
                      <span className="absolute top-2 left-3 text-lg sm:text-xl opacity-70 group-hover:opacity-100 transition">🌿</span>
                      <span className="relative z-10">{cls}</span>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          ) : null
        )}
      </div>
    </StudentLoginShell>
  );
}

export default function DigitalNotebook() {
  const params = new URLSearchParams(window.location.search);
  const isTeacherMode = params.get('mode') === 'teacher';
  const { classList } = useClassNames();

  const urlClass = parseClassParam(params.get('class'), classList);
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

  // Auto-resolve from URL params so refresh keeps the student on their page
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

  // Persist student state to URL so refresh stays on the same page
  useEffect(() => {
    if (role === 'student' && studentInfo) {
      const sp = new URLSearchParams(window.location.search);
      sp.set('class', studentInfo.className);
      sp.set('number', studentInfo.number);
      if (studentInfo.directAssignment) sp.set('assignment', studentInfo.directAssignment);
      if (studentInfo.directPage) sp.set('page', studentInfo.directPage);
      const newUrl = `${window.location.pathname}?${sp.toString()}`;
      window.history.replaceState(null, '', newUrl);
    }
  }, [role, studentInfo]);

  // If assignment link: show class picker, then student number picker, then go straight to notebook
  if (isAssignmentLink && !pickedClass) {
    return <ClassPicker title={urlAssignment} classList={classList} onSelect={(c) => { setPickedClass(c); setRole('student'); }} />;
  }

  if (isAssignmentLink && pickedClass && !studentInfo) {
    return (
      <div className="relative">
        <button
          onClick={() => setPickedClass(null)}
          className="fixed top-4 left-4 z-50 w-10 h-10 rounded-full bg-white/90 hover:bg-white shadow-lg flex items-center justify-center text-slate-700"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <StudentLogin
          onEnter={(className, number) => setStudentInfo({ className, number, directAssignment: urlAssignment, directPage: urlPage })}
          preselectedClass={pickedClass}
          classList={classList}
        />
      </div>
    );
  }

  if (role === 'teacher') {
    return <TeacherNotebookDashboard onBack={() => setRole(null)} />;
  }

  if (role === 'student' && studentInfo) {
    const qrUrl = `${window.location.origin}/DigitalNotebook?assignment=${encodeURIComponent(urlAssignment || studentInfo.directAssignment || '')}&class=${qrClass || studentInfo.className}&page=${urlPage || 1}&SY=${ACTIVE_SCHOOL_YEAR}`;
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
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[200] p-6" onClick={() => setShowQR(false)}>
            <div className="bg-white rounded-3xl p-8 text-center shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
              <p className="font-black text-2xl mb-1">📓 Share Assignment QR</p>
              <p className="text-sm text-gray-500 mb-4">{urlAssignment}</p>
              <div className="flex items-center gap-3 mb-5 justify-center">
                <span className="text-base font-bold text-gray-700">Class:</span>
                <select value={qrClass || studentInfo.className}
                  onChange={e => setQrClass(e.target.value)}
                  className="border-2 border-gray-300 rounded-xl px-3 py-2 text-base font-bold">
                  <option value="">All classes</option>
                  {classList.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex justify-center mb-4">
                <QRCodeSVG value={qrUrl} size={320} level="M" />
              </div>
              <p className="text-xs text-gray-400 mb-5 break-all">{qrUrl}</p>
              <button onClick={() => setShowQR(false)} className="border-2 border-gray-300 bg-white rounded-2xl px-8 py-3 text-base font-bold hover:bg-gray-50">Close</button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (role === 'student' && !studentInfo) {
    return (
      <div className="relative">
        <button
          onClick={() => setRole(null)}
          className="fixed top-4 left-4 z-50 w-10 h-10 rounded-full bg-white/90 hover:bg-white shadow-lg flex items-center justify-center text-slate-700"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <StudentLogin
          onEnter={(className, number) => setStudentInfo({ className, number, directAssignment: urlAssignment, directPage: urlPage })}
          preselectedClass={urlClass}
          classList={classList}
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