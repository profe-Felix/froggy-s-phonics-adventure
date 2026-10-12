import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import StudentBookReader from '@/components/book/StudentBookReader';

// Direct-link book reader. Opens a book by its BookCatalog ID from a URL
// query param, so a teacher can drop a link on a Google Slide and jump
// straight into the book lesson. Loads the permanent catalog record and
// opens the teacher-mode reader (with comprehension questions).
//
// URL: /BookReader?bookId=<BookCatalog id>
export default function BookReader() {
  const params = new URLSearchParams(window.location.search);
  const bookId = params.get('bookId');
  const [book, setBook] = useState(null);
  const [error, setError] = useState(null);

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
      className=""
      teacherMode
      onBack={() => { window.location.href = '/TeacherView'; }}
    />
  );
}