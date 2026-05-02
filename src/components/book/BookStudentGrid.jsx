import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import PdfPageRenderer from '@/components/notebook/PdfPageRenderer';
import LaserReplayOverlay from '@/components/notebook/LaserReplayOverlay';

// ── Review Modal ──────────────────────────────────────────────────────────────
function ReviewModal({ session, initialRecording, book, onClose }) {
  const audioRef = useRef(null);
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const totalPages = book.pdf_page_count || 1;

  const allRecs = [...(session.recordings || [])].sort((a, b) => a.page - b.page);
  const [recIdx, setRecIdx] = useState(() => {
    const i = allRecs.findIndex(r => r.page === initialRecording.page);
    return i >= 0 ? i : 0;
  });
  const recording = allRecs[recIdx] || initialRecording;
  const isSpread = !!recording.is_spread;

  const laserData = recording.laser_data
    ? (typeof recording.laser_data === 'string' ? JSON.parse(recording.laser_data) : recording.laser_data)
    : [];

  useEffect(() => {
    if (audioRef.current) audioRef.current.load();
  }, [recIdx]);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(e => {
      const { width, height } = e[0].contentRect;
      setContainerSize({ w: Math.round(width), h: Math.round(height) });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const renderPage = (pageNum) => {
    if (book.book_type === 'images') {
      const img = (book.pages || []).find(p => p.page_number === pageNum);
      return img
        ? <img src={img.image_url} alt={`Page ${pageNum}`} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
        : <div className="flex items-center justify-center w-full h-full text-gray-400">No image</div>;
    }
    return <PdfPageRenderer pdfUrl={book.pdf_url} pageNumber={pageNum} fitMode="contain" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" style={{ background: 'rgba(0,0,0,0.88)' }} onClick={onClose}>
      <motion.div initial={{ scale: 0.92 }} animate={{ scale: 1 }}
        className="rounded-2xl overflow-hidden flex flex-col w-full max-w-3xl"
        style={{ background: '#0f3d3a', border: '2px solid #0d9488', maxHeight: '95vh', height: '90vh' }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{ background: '#042f2e', borderBottom: '1px solid #0d9488' }}>
          <p className="font-black text-white text-sm">
            Student #{session.student_number} — {book.title} — {isSpread && recording.page + 1 <= totalPages ? `Pgs ${recording.page}–${recording.page + 1}` : `Pg ${recording.page}`}
          </p>
          <button onClick={onClose} className="text-teal-300 font-bold text-lg ml-4">✕</button>
        </div>

        {/* Page display — contain-fit, fills remaining modal height */}
        <div className="flex-1 overflow-hidden relative" ref={containerRef} style={{ background: '#fff' }}>
          <div style={{ position: 'relative', display: 'flex', width: '100%', height: '100%' }}>
            {isSpread ? (
              <>
                <div style={{ flex: 1, minWidth: 0, height: '100%' }}>{renderPage(recording.page)}</div>
                {recording.page + 1 <= totalPages && (
                  <div style={{ flex: 1, minWidth: 0, height: '100%' }}>{renderPage(recording.page + 1)}</div>
                )}
              </>
            ) : (
              <div style={{ flex: 1, height: '100%' }}>{renderPage(recording.page)}</div>
            )}
            {laserData.length > 0 && containerSize.w > 0 && (
              <LaserReplayOverlay
                laserData={laserData}
                audioRef={audioRef}
                containerWidth={containerSize.w}
                containerHeight={containerSize.h}
              />
            )}
          </div>
        </div>

        <div className="p-3 shrink-0 flex flex-col gap-2" style={{ background: '#042f2e', borderTop: '1px solid #0d9488' }}>
          <audio ref={audioRef} controls src={recording.audio_url} className="w-full" style={{ height: 36 }} />
          {laserData.length > 0 && (
            <p className="text-teal-400 text-xs">🔴 Laser replays with audio{isSpread ? ' (2-page spread)' : ''}</p>
          )}
          {allRecs.length > 1 && (
            <div className="flex items-center gap-2">
              <button onClick={() => setRecIdx(i => Math.max(0, i - 1))} disabled={recIdx === 0}
                className="px-4 py-1 rounded-xl font-bold text-white disabled:opacity-30 text-sm"
                style={{ background: '#0d9488' }}>‹</button>
              <span className="flex-1 text-center text-teal-300 text-xs font-bold">
                Recording {recIdx + 1} / {allRecs.length}
              </span>
              <button onClick={() => setRecIdx(i => Math.min(allRecs.length - 1, i + 1))} disabled={recIdx === allRecs.length - 1}
                className="px-4 py-1 rounded-xl font-bold text-white disabled:opacity-30 text-sm"
                style={{ background: '#0d9488' }}>›</button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ── Student row in grid ───────────────────────────────────────────────────────
function StudentSessionCard({ session, book, onReview }) {
  const pages = session.pages_completed || [];
  const totalPages = book.pdf_page_count || 1;
  const recs = session.recordings || [];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-3 flex flex-col gap-2"
      style={{ background: '#0f3d3a', border: '1px solid #0d9488' }}>
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-white text-base shrink-0"
          style={{ background: '#0d9488' }}>
          {session.student_number}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm">Student #{session.student_number}</p>
          <p className="text-teal-400 text-xs">{pages.length}/{totalPages} pages · {recs.length} recording{recs.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          {recs.map(r => (
            <button key={r.page} onClick={() => onReview(session, r)}
              className="w-7 h-7 rounded-lg font-bold text-xs text-white"
              style={{ background: '#16a34a' }}>
              {r.page}
            </button>
          ))}
        </div>
      </div>
      {recs.length === 0 && <p className="text-teal-600 text-xs italic">No recordings today</p>}
    </motion.div>
  );
}

// ── Main export — now supports student-centric view (no book required) ────────
export default function BookStudentGrid({ book, books, className, reviewDate }) {
  const [filterStudent, setFilterStudent] = useState(null);
  const [filterBook, setFilterBook] = useState(book?.id || null);
  const [reviewing, setReviewing] = useState(null);

  // When a single book is passed (legacy), use it; when books[] passed use filterBook
  const activeBook = book || (books || []).find(b => b.id === filterBook) || null;

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['book-sessions-all', filterBook || 'all', className, reviewDate],
    queryFn: () => {
      const query = { class_name: className, session_date: reviewDate };
      if (filterBook) query.book_id = filterBook;
      return base44.entities.BookReadingSession.filter(query);
    },
    refetchInterval: 10000,
    enabled: !!className,
  });

  // Resolve book for each session when browsing all books
  const getBook = (session) => {
    if (book) return book;
    return (books || []).find(b => b.id === session.book_id) || null;
  };

  const filtered = filterStudent
    ? sessions.filter(s => s.student_number === filterStudent)
    : sessions;

  if (isLoading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-4 border-teal-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Filters row */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Book filter (only when multiple books available) */}
        {books && books.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-teal-300 text-xs font-bold">Book:</span>
            <button onClick={() => setFilterBook(null)}
              className={`px-2 py-1 rounded-full font-bold text-xs ${!filterBook ? 'bg-teal-600 text-white' : 'text-teal-400 border border-teal-700'}`}>
              All
            </button>
            {books.map(b => (
              <button key={b.id} onClick={() => setFilterBook(b.id)}
                className={`px-2 py-1 rounded-full font-bold text-xs max-w-[140px] truncate ${filterBook === b.id ? 'bg-teal-600 text-white' : 'text-teal-400 border border-teal-700'}`}>
                {b.title}
              </button>
            ))}
          </div>
        )}

        {/* Student number filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-teal-300 text-xs font-bold">Student:</span>
          <button onClick={() => setFilterStudent(null)}
            className={`px-2 py-1 rounded-full font-bold text-xs ${!filterStudent ? 'bg-teal-600 text-white' : 'text-teal-400 border border-teal-700'}`}>
            All
          </button>
          {Array.from({ length: 30 }, (_, i) => i + 1).map(n => (
            <button key={n} onClick={() => setFilterStudent(filterStudent === n ? null : n)}
              className={`w-7 h-7 rounded-lg font-bold text-xs ${filterStudent === n ? 'bg-teal-500 text-white' : 'text-teal-400 border border-teal-700'}`}>
              {n}
            </button>
          ))}
        </div>
      </div>

      <p className="text-teal-400 text-xs">{filtered.length} session{filtered.length !== 1 ? 's' : ''}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {filtered.map(s => {
          const sessionBook = getBook(s);
          if (!sessionBook) return null;
          return (
            <StudentSessionCard
              key={s.id}
              session={s}
              book={sessionBook}
              onReview={(sess, rec) => setReviewing({ session: sess, recording: rec, book: sessionBook })}
            />
          );
        })}
      </div>

      {reviewing && (
        <ReviewModal
          session={reviewing.session}
          initialRecording={reviewing.recording}
          book={reviewing.book}
          onClose={() => setReviewing(null)}
        />
      )}
    </div>
  );
}