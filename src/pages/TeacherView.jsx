import { useState, useEffect } from 'react';
import { useClassNames } from '@/hooks/useClassNames';
import ClassToggle from '@/components/teacher/ClassToggle';
import TeacherLevelPath from '@/components/teacher/TeacherLevelPath';
import LiveLessonLauncher from '@/components/teacher/LiveLessonLauncher';
import TeacherBookShelf from '@/components/teacher/TeacherBookShelf';
import StudentBookReader from '@/components/book/StudentBookReader';

// Teacher view — mirrors the student home (level path + bookshelf) but with
// teacher-only behavior: tapping a level opens a pre-filled live-lesson
// launcher, and the book reader shows comprehension questions. A class-toggle
// avatar in the header switches the active class (refilling the launcher +
// bookshelf). Reached via /?role=teacher → /TeacherView.
export default function TeacherView() {
  const params = new URLSearchParams(window.location.search);
  const { classList, configs } = useClassNames();

  const [activeClass, setActiveClass] = useState(
    () => params.get('class') || localStorage.getItem('tv_class') || ''
  );
  const [section, setSection] = useState('lessons'); // 'lessons' | 'books'
  const [launcherLesson, setLauncherLesson] = useState(null);
  const [readerBook, setReaderBook] = useState(null);

  // Pick the first class once the class list loads if none was chosen.
  useEffect(() => {
    if (!activeClass && classList.length) setActiveClass(classList[0]);
  }, [classList, activeClass]);

  useEffect(() => {
    if (activeClass) localStorage.setItem('tv_class', activeClass);
  }, [activeClass]);

  // Keep ?class= in the URL in sync so a refresh remembers the active class.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (activeClass) p.set('class', activeClass);
    else p.delete('class');
    const qs = p.toString();
    window.history.replaceState(null, '', `/TeacherView${qs ? `?${qs}` : ''}`);
  }, [activeClass]);

  // Enhanced book reader (teacher mode = comprehension questions on).
  if (readerBook) {
    return (
      <StudentBookReader
        book={readerBook}
        studentNumber={30}
        className={activeClass}
        teacherMode
        onBack={() => setReaderBook(null)}
      />
    );
  }

  return (
    <div className="relative h-screen overflow-hidden" style={{ background: '#1a1a2e' }}>
      {/* Floating top controls — sit over the path / bookshelf like the
          student home's floating controls. */}
      <div className="pointer-events-none fixed top-0 inset-x-0 z-50 flex items-center justify-between px-4 py-3">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/40 p-1 backdrop-blur">
          {[
            { id: 'lessons', label: 'Lessons' },
            { id: 'books', label: 'Books' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSection(t.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                section === t.id ? 'bg-white text-slate-900' : 'text-white/80 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="pointer-events-auto">
          <ClassToggle activeClass={activeClass} classes={classList} configs={configs} onSelect={setActiveClass} />
        </div>
      </div>

      <div className="h-full">
        {section === 'lessons' && activeClass && (
          <TeacherLevelPath
            className={activeClass}
            onOpenLesson={(lesson) => setLauncherLesson(lesson)}
          />
        )}
        {section === 'books' && activeClass && (
          <TeacherBookShelf className={activeClass} onSelectBook={setReaderBook} />
        )}
      </div>

      {launcherLesson && (
        <LiveLessonLauncher
          lesson={launcherLesson}
          className={activeClass}
          classes={classList}
          onClose={() => setLauncherLesson(null)}
          onStarted={(session) => {
            window.location.href = `/LiveLesson?session=${session.id}`;
          }}
        />
      )}
    </div>
  );
}