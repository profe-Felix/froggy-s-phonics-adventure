import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import TeacherBookDashboard from '@/components/book/TeacherBookDashboard';
import StudentBookReader from '@/components/book/StudentBookReader';
import PdfThumbnail from '@/components/book/PdfThumbnail';

const MODULES = ['All', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9'];

const CLASS_NAMES = ['Campos', 'Felix', 'Valero'];
const STUDENT_NUMBERS = Array.from({ length: 30 }, (_, i) => i + 1);

function StudentLogin({ onEnter, preselectedClass }) {
  const [className, setClassName] = useState(preselectedClass || null);

  if (!className) {
    return (
      <div className="flex flex-col items-center gap-6 py-10 px-4">
        <h2 className="text-2xl font-black text-white">📚 Select Your Class</h2>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {CLASS_NAMES.map(c => (
            <motion.button key={c} whileTap={{ scale: 0.9 }} onClick={() => setClassName(c)}
              className="w-full py-5 rounded-2xl text-2xl font-black text-white shadow-xl"
              style={{ background: '#0d9488', border: '3px solid #14b8a6' }}>
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
          <button onClick={() => setClassName(null)} className="text-teal-300 hover:text-white font-bold">←</button>
        )}
        <h2 className="text-2xl font-black text-white">Class {className} — Your Number</h2>
      </div>
      <div className="grid grid-cols-5 gap-2 max-w-sm">
        {STUDENT_NUMBERS.map(n => (
          <motion.button key={n} whileTap={{ scale: 0.85 }}
            onClick={() => onEnter(className, n)}
            className="w-14 h-14 rounded-2xl font-black text-white text-xl shadow-lg"
            style={{ background: '#0f766e', border: '2px solid #0d9488' }}>
            {n}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function BookShelf({ className, studentNumber, onSelectBook }) {
  const [selectedModule, setSelectedModule] = useState('All');

  const { data: books = [], isLoading } = useQuery({
    queryKey: ['books', className],
    queryFn: () => base44.entities.BookAssignment.filter({ class_name: className, status: 'active' }),
    refetchInterval: 10000,
  });

  const availableModules = ['All', ...Array.from(new Set(books.map(b => b.module).filter(Boolean))).sort()];
  const filtered = selectedModule === 'All' ? books : books.filter(b => b.module === selectedModule);

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-teal-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (books.length === 0) return (
    <div className="text-center py-16">
      <div className="text-5xl mb-4">📚</div>
      <p className="text-teal-300 text-lg font-bold">No books available right now.</p>
      <p className="text-teal-500 text-sm mt-1">Ask your teacher to assign a book!</p>
    </div>
  );

  return (
    <div className="p-4">
      <h2 className="text-xl font-black text-white mb-4">📚 Your Books — Class {className} · #{studentNumber}</h2>

      {/* Module filter */}
      {availableModules.length > 1 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {availableModules.map(m => (
            <button key={m} onClick={() => setSelectedModule(m)}
              className={`px-4 py-1.5 rounded-full font-bold text-sm transition-all ${selectedModule === m ? 'bg-teal-500 text-white' : 'text-teal-300 border border-teal-700 hover:bg-teal-900'}`}>
              {m === 'All' ? '📚 All' : `📁 ${m}`}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {filtered.map(book => (
          <motion.button
            key={book.id}
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.03 }}
            onClick={() => onSelectBook(book)}
            className="rounded-2xl overflow-hidden flex flex-col text-left shadow-xl"
            style={{ background: '#134e4a', border: '2px solid #0d9488' }}
          >
            <div className="w-full h-40 overflow-hidden">
              {book.cover_image_url ? (
                <img src={book.cover_image_url} alt={book.title} className="w-full h-full object-cover" />
              ) : book.pdf_url ? (
                <PdfThumbnail pdfUrl={book.pdf_url} pageNumber={2} width={300} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-5xl" style={{ background: '#0f766e' }}>📖</div>
              )}
            </div>
            <div className="p-3">
              <p className="font-black text-white text-sm">{book.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-teal-400 text-xs">{book.pdf_page_count || (book.pages || []).length || '?'} pages</p>
                {book.module && <span className="text-xs text-teal-300 bg-teal-900 px-2 py-0.5 rounded-full">{book.module}</span>}
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export default function BookReading() {
  const params = new URLSearchParams(window.location.search);
  const isTeacher = params.get('mode') === 'teacher';
  const urlClass = params.get('class');
  const urlNumber = parseInt(params.get('number') || params.get('student'));

  const [role, setRole] = useState(isTeacher ? 'teacher' : null);
  const [studentInfo, setStudentInfo] = useState(null);
  const [selectedBook, setSelectedBook] = useState(null);
  const [autoResolved, setAutoResolved] = useState(false);

  useEffect(() => {
    if (autoResolved) return;
    if (urlClass && !isNaN(urlNumber) && urlNumber > 0) {
      setStudentInfo({ className: urlClass, number: urlNumber });
      setRole('student');
      setAutoResolved(true);
    } else if (urlClass && !isTeacher) {
      setRole('student');
      setAutoResolved(true);
    }
  }, [urlClass, urlNumber, autoResolved, isTeacher]);

  if (role === 'teacher') {
    return <TeacherBookDashboard onBack={() => setRole(null)} />;
  }

  if (role === 'student' && studentInfo && selectedBook) {
    return (
      <StudentBookReader
        book={selectedBook}
        studentNumber={studentInfo.number}
        className={studentInfo.className}
        onBack={() => setSelectedBook(null)}
      />
    );
  }

  if (role === 'student' && studentInfo) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#042f2e' }}>
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: '#0d9488', background: '#0f3d3a' }}>
          <button onClick={() => { setStudentInfo(null); }} className="text-teal-300 hover:text-white font-bold">← Back</button>
          <h1 className="text-lg font-black text-white">📚 Book Reading</h1>
        </div>
        <BookShelf className={studentInfo.className} studentNumber={studentInfo.number} onSelectBook={setSelectedBook} />
      </div>
    );
  }

  if (role === 'student' && !studentInfo) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#042f2e' }}>
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: '#0d9488', background: '#0f3d3a' }}>
          <button onClick={() => setRole(null)} className="text-teal-300 hover:text-white font-bold">← Back</button>
          <h1 className="text-lg font-black text-white">📚 Book Reading</h1>
        </div>
        <StudentLogin
          onEnter={(className, number) => setStudentInfo({ className, number })}
          preselectedClass={urlClass}
        />
      </div>
    );
  }

  // Landing
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-6"
      style={{ background: '#042f2e' }}>
      <div className="text-center">
        <div className="text-6xl mb-4">📚</div>
        <h1 className="text-4xl font-black text-white mb-2">Book Reading</h1>
        <p className="text-teal-300">Record yourself reading — your teacher reviews your progress</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">
        {isTeacher && (
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => setRole('teacher')}
            className="flex-1 py-6 rounded-3xl font-black text-white text-xl shadow-2xl flex flex-col items-center gap-2"
            style={{ background: '#0f766e', border: '3px solid #14b8a6' }}>
            <span className="text-3xl">👩‍🏫</span>Teacher
          </motion.button>
        )}
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setRole('student')}
          className="flex-1 py-6 rounded-3xl font-black text-white text-xl shadow-2xl flex flex-col items-center gap-2"
          style={{ background: '#0d9488', border: '3px solid #2dd4bf' }}>
          <span className="text-3xl">🎒</span>Student
        </motion.button>
      </div>
    </div>
  );
}