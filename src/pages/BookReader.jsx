import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useClassNames } from '@/hooks/useClassNames';
import ClassToggle from '@/components/teacher/ClassToggle';
import StudentBookReader from '@/components/book/StudentBookReader';

// Direct-link book reader. Opens a book by its BookCatalog ID from a URL
// query param, so a teacher can drop a link on a Google Slide and jump
// straight into the book lesson. A class selector in the header lets the
// teacher pick which class they're reading as — recordings persist under
// student 30 of the selected class (matching the TeacherView behavior).
//
// URL: /BookReader?bookId=<BookCatalog id>&class=<class name>
export default function BookReader() {
  const params = new URLSearchParams(window.location.search);
  const bookId = params.get('bookId');
  const [book, setBook] = useState(null);
  const [error, setError] = useState(null);

  const { classList, configs } = useClassNames();
  const [activeClass, setActiveClass] = useState(
    () => params.get('class') || localStorage.getItem('tv_class') || ''
  );

  // Pick the first class once the list loads if none was chosen.
  useEffect(() => {
    if (!activeClass && classList.length) setActiveClass(classList[0]);
  }, [classList, activeClass]);

  // Keep ?class= in the URL + localStorage so a refresh remembers it.
  useEffect(() => {
    if (!activeClass) return;
    localStorage.setItem('tv_class', activeClass);
    const p = new URLSearchParams(window.location.search);
    p.set('class', activeClass);
    window.history.replaceState(null, '', `/BookReader?${p.toString()}`);
  }, [activeClass]);

  useEffect(() => {
    if (!bookId) { setError('Missing bookId'); return; }
    let cancelled = false;
    (async () => {
      try {
        const rec = await base44.entities.BookCatalog.get(bookId);
        if (cancelled) return;
        // Synthesize catalog_book_id so the reader's comprehension-question
        // lookup (which keys off catalog_book_id) works for a catalog record.
        setBook({ ...rec, catalog_book_id: rec.id });
      } catch {
        if (!cancelled) setError('Book not found');
      }
    })();
    return () => { cancelled = true; };
  }, [bookId]);

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-center" style={{ background: '#042f2e' }}>
        <span className="text-5xl">📖</span>
        <p className="text-lg font-black text-white">{error}</p>
        <a href="/TeacherView" className="mt-2 rounded-full bg-teal-600 px-4 py-1.5 text-sm font-bold text-white">Back to Teacher View</a>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: '#042f2e' }}>
        <div className="w-8 h-8 border-4 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <StudentBookReader
      book={book}
      studentNumber={30}
      className={activeClass}
      teacherMode
      headerExtra={
        <ClassToggle
          activeClass={activeClass}
          classes={classList}
          configs={configs}
          onSelect={setActiveClass}
        />
      }
      onBack={() => { window.location.href = '/TeacherView'; }}
    />
  );
}