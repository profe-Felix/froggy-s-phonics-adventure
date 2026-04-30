import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';
import PdfPageRenderer from '@/components/notebook/PdfPageRenderer';
import LaserReplayOverlay from '@/components/notebook/LaserReplayOverlay';

function StudentSessionCard({ session, book, onReview }) {
  const pages = session.pages_completed || [];
  const totalPages = book.pdf_page_count || 1;
  const recs = session.recordings || [];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-3 flex flex-col gap-2"
      style={{ background: '#0f3d3a', border: '1px solid #0d9488' }}>
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-white text-lg"
          style={{ background: '#0d9488' }}>
          {session.student_number}
        </div>
        <div className="flex-1">
          <p className="text-white font-bold text-sm">Student #{session.student_number}</p>
          <p className="text-teal-400 text-xs">{pages.length} / {totalPages} pages</p>
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

function ReviewModal({ session, initialRecording, book, onClose }) {
  const audioRef = useRef(null);
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const totalPages = book.pdf_page_count || 1;

  // All recordings for this session, sorted by page
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

  // Reset audio when recording changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.load();
    }
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
        ? <img src={img.image_url} alt={`Page ${pageNum}`} style={{ width: '100%', display: 'block' }} />
        : <div className="flex items-center justify-center w-full h-40 text-gray-400">No image</div>;
    }
    // Use width mode so PDF fills full width with no black bars — matches student reader recording layout
    return <PdfPageRenderer pdfUrl={book.pdf_url} pageNumber={pageNum} fitMode="width" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
        className="rounded-2xl overflow-hidden flex flex-col w-full max-w-4xl"
        style={{ background: '#0f3d3a', border: '2px solid #0d9488', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ background: '#042f2e', borderBottom: '1px solid #0d9488' }}>
          <p className="font-black text-white">
            Student #{session.student_number} — {isSpread && recording.page + 1 <= totalPages ? `Pages ${recording.page}–${recording.page + 1}` : `Page ${recording.page}`}
          </p>
          <button onClick={onClose} className="text-teal-300 font-bold text-lg">✕</button>
        </div>

        {/* Page display — use relative positioning so laser overlay matches rendered page size */}
        <div className="relative overflow-auto" ref={containerRef} style={{ background: '#1a1a1a' }}>
          <div style={{ display: 'flex', gap: isSpread ? 4 : 0 }}>
            {isSpread ? (
              <>
                <div style={{ flex: 1, minWidth: 0 }}>{renderPage(recording.page)}</div>
                {recording.page + 1 <= totalPages && (
                  <div style={{ flex: 1, minWidth: 0 }}>{renderPage(recording.page + 1)}</div>
                )}
              </>
            ) : (
              <div style={{ flex: 1 }}>{renderPage(recording.page)}</div>
            )}
          </div>
          {/* Laser overlay spans the full container, matching how it was recorded */}
          {laserData.length > 0 && containerSize.w > 0 && (
            <LaserReplayOverlay
              laserData={laserData}
              audioRef={audioRef}
              containerWidth={containerSize.w}
              containerHeight={containerSize.h}
            />
          )}
        </div>

        <div className="p-3 shrink-0 flex flex-col gap-2" style={{ background: '#042f2e', borderTop: '1px solid #0d9488' }}>
          <audio ref={audioRef} controls src={recording.audio_url} className="w-full" />
          {laserData.length > 0 && (
            <p className="text-teal-400 text-xs">🔴 Laser replays in sync with audio{isSpread ? ' — recorded in 2-page spread view' : ''}</p>
          )}
          {allRecs.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRecIdx(i => Math.max(0, i - 1))}
                disabled={recIdx === 0}
                className="px-4 py-1.5 rounded-xl font-bold text-white disabled:opacity-30 text-sm"
                style={{ background: '#0d9488' }}
              >‹ Prev</button>
              <span className="flex-1 text-center text-teal-300 text-xs font-bold">
                Recording {recIdx + 1} of {allRecs.length}
              </span>
              <button
                onClick={() => setRecIdx(i => Math.min(allRecs.length - 1, i + 1))}
                disabled={recIdx === allRecs.length - 1}
                className="px-4 py-1.5 rounded-xl font-bold text-white disabled:opacity-30 text-sm"
                style={{ background: '#0d9488' }}
              >Next ›</button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function BookStudentGrid({ book, className, reviewDate }) {
  const [filterPage, setFilterPage] = useState(null);
  const [reviewing, setReviewing] = useState(null); // {session, recording}

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['book-sessions-all', book.id, reviewDate],
    queryFn: () => base44.entities.BookReadingSession.filter({
      book_id: book.id,
      class_name: className,
      session_date: reviewDate,
    }),
    refetchInterval: 10000,
  });

  const totalPages = book.pdf_page_count || 1;

  const filtered = filterPage
    ? sessions.filter(s => (s.pages_completed || []).includes(filterPage))
    : sessions;

  if (isLoading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-4 border-teal-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Page filter */}
      <div className="flex gap-2 flex-wrap">
        <span className="text-teal-300 text-xs font-bold self-center">Filter by page:</span>
        <button onClick={() => setFilterPage(null)}
          className={`px-3 py-1 rounded-full font-bold text-xs ${!filterPage ? 'bg-teal-600 text-white' : 'text-teal-400 border border-teal-700'}`}>
          All
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map(pg => (
          <button key={pg} onClick={() => setFilterPage(pg)}
            className={`w-8 h-8 rounded-xl font-bold text-xs ${filterPage === pg ? 'bg-teal-600 text-white' : 'text-teal-400 border border-teal-700'}`}>
            {pg}
          </button>
        ))}
      </div>

      <p className="text-teal-400 text-sm">{filtered.length} student{filtered.length !== 1 ? 's' : ''} with recordings</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {filtered.map(s => (
          <StudentSessionCard
            key={s.id}
            session={s}
            book={book}
            onReview={(sess, rec) => setReviewing({ session: sess, recording: rec })}
          />
        ))}
      </div>

      {reviewing && (
        <ReviewModal
          session={reviewing.session}
          initialRecording={reviewing.recording}
          book={book}
          onClose={() => setReviewing(null)}
        />
      )}
    </div>
  );
}