import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import PdfPageRenderer from '@/components/notebook/PdfPageRenderer';
import LaserReplayOverlay from '@/components/notebook/LaserReplayOverlay';

// ── Review Modal ──────────────────────────────────────────────────────────────
function ReviewModal({ session, initialRecording, book, onClose }) {
  const qc = useQueryClient();
  const audioRef = useRef(null);
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [reviewStatus, setReviewStatus] = useState('practicing');
  const [teacherFeedback, setTeacherFeedback] = useState('');
  const [savingReview, setSavingReview] = useState(false);
  const [reviewMessage, setReviewMessage] = useState('');
  const totalPages = book.pdf_page_count || 1;

  const {
    data: reviews = [],
    isLoading: isReviewLoading,
  } = useQuery({
    queryKey: [
      'book-mastery-review',
      book.id,
      session.class_name,
      session.student_number,
      ACTIVE_SCHOOL_YEAR,
    ],
    queryFn: () =>
      base44.entities.BookMasteryReview.filter({
        book_assignment_id: book.id,
        class_name: session.class_name,
        school_year: ACTIVE_SCHOOL_YEAR,
        student_number: session.student_number,
      }),
  });

  const existingReview = reviews[0] || null;

  useEffect(() => {
    if (!existingReview) return;

    setReviewStatus(
      existingReview.status || 'practicing'
    );

    setTeacherFeedback(
      existingReview.teacher_feedback || ''
    );
  }, [existingReview?.id]);

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

  const recordedWidth = Number(recording.laser_viewport_width);
  const recordedHeight = Number(recording.laser_viewport_height);

  const hasRecordedViewport =
    recording.laser_coordinate_space === 'book-reader-viewport-v1' &&
    Number.isFinite(recordedWidth) &&
    Number.isFinite(recordedHeight) &&
    recordedWidth > 0 &&
    recordedHeight > 0;

  const playbackSurfaceSize = (() => {
    // Older recordings do not have viewport metadata. Keep their legacy
    // full-container playback behavior rather than guessing a conversion.
    if (
      !hasRecordedViewport ||
      containerSize.w <= 0 ||
      containerSize.h <= 0
    ) {
      return {
        width: '100%',
        height: '100%',
      };
    }

    const recordedAspect = recordedWidth / recordedHeight;
    const availableAspect = containerSize.w / containerSize.h;

    if (availableAspect > recordedAspect) {
      const height = containerSize.h;

      return {
        width: Math.round(height * recordedAspect),
        height,
      };
    }

    const width = containerSize.w;

    return {
      width,
      height: Math.round(width / recordedAspect),
    };
  })();

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

  const saveReview = async () => {
    if (
      reviewStatus !== 'needs_practice' &&
      reviewStatus !== 'mastered'
    ) {
      alert(
        'Choose Keep practicing or Mastered first.'
      );
      return;
    }

    setSavingReview(true);
    setReviewMessage('');

    try {
      const alreadyRewarded =
        existingReview?.reward_issued === true ||
        Number(existingReview?.coins_awarded || 0) >= 50;

      const reviewData = {
        book_assignment_id: book.id,
        catalog_book_id:
          book.catalog_book_id || '',
        class_name: session.class_name,
        school_year: ACTIVE_SCHOOL_YEAR,
        student_number:
          session.student_number,
        reading_session_id: session.id,
        status: reviewStatus,
        teacher_feedback:
          teacherFeedback.trim(),
        reviewed_at: new Date().toISOString(),
        coins_awarded:
          existingReview?.coins_awarded || 0,
        reward_issued:
          existingReview?.reward_issued || false,
      };

      let savedReview;

      if (existingReview) {
        savedReview =
          await base44.entities.BookMasteryReview.update(
            existingReview.id,
            reviewData
          );
      } else {
        savedReview =
          await base44.entities.BookMasteryReview.create(
            reviewData
          );
      }

      const settingsMatches =
        await base44.entities.BookClassSettings.filter({
          book_assignment_id: book.id,
          class_name: session.class_name,
          school_year: ACTIVE_SCHOOL_YEAR,
        });

      const existingSettings =
        settingsMatches[0] || null;

      const currentMastered =
        existingSettings?.mastered_students || [];

      const nextMastered =
        reviewStatus === 'mastered'
          ? Array.from(
              new Set([
                ...currentMastered,
                session.student_number,
              ])
            )
          : currentMastered.filter(
              studentNumber =>
                studentNumber !==
                session.student_number
            );

      if (existingSettings) {
        await base44.entities.BookClassSettings.update(
          existingSettings.id,
          {
            mastered_students: nextMastered,
          }
        );
      } else {
        await base44.entities.BookClassSettings.create({
          book_assignment_id: book.id,
          catalog_book_id:
            book.catalog_book_id || '',
          class_name: session.class_name,
          school_year: ACTIVE_SCHOOL_YEAR,
          queue_order: 0,
          mastered_students: nextMastered,
          assigned_students: [],
        });
      }

      let coinsAdded = false;

      if (
        reviewStatus === 'mastered' &&
        !alreadyRewarded
      ) {
        const students =
          await base44.entities.Student.filter({
            class_name: session.class_name,
            school_year: ACTIVE_SCHOOL_YEAR,
          });

        const student = students.find(
          candidate =>
            candidate.student_number ===
            session.student_number
        );

        if (!student) {
          throw new Error(
            `Student #${session.student_number} was not found in class ${session.class_name}.`
          );
        }

        await base44.entities.Student.update(
          student.id,
          {
            coins:
              Number(student.coins || 0) + 50,
          }
        );

        await base44.entities.BookMasteryReview.update(
          savedReview.id,
          {
            coins_awarded: 50,
            reward_issued: true,
          }
        );

        coinsAdded = true;
      }

      qc.invalidateQueries([
        'book-mastery-review',
        book.id,
        session.class_name,
        session.student_number,
        ACTIVE_SCHOOL_YEAR,
      ]);

      qc.invalidateQueries([
        'book-class-settings',
        session.class_name,
        ACTIVE_SCHOOL_YEAR,
      ]);

      setReviewMessage(
        reviewStatus === 'mastered'
          ? coinsAdded
            ? 'Mastered — 50 coins awarded!'
            : 'Mastered — reward was already awarded.'
          : 'Saved — the student should keep practicing.'
      );
    } catch (error) {
      console.error(
        'Could not save book review',
        error
      );

      alert(
        error?.message ||
          'The review could not be saved.'
      );
    } finally {
      setSavingReview(false);
    }
  };

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
        style={{ background: '#0f3d3a', border: '2px solid #0d9488', maxHeight: '95vh', height: '95vh' }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{ background: '#042f2e', borderBottom: '1px solid #0d9488' }}>
          <p className="font-black text-white text-sm">
            Student #{session.student_number} — {book.title} — {isSpread && recording.page + 1 <= totalPages ? `Pgs ${recording.page}–${recording.page + 1}` : `Pg ${recording.page}`}
          </p>
          <button onClick={onClose} className="text-teal-300 font-bold text-lg ml-4">✕</button>
        </div>

        {/* Page display — recreate the student's recorded viewport shape so the
            PDF/image letterboxing and laser coordinate system remain identical. */}
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden relative flex items-center justify-center"
          style={{ background: '#fff' }}
        >
          <div
            style={{
              position: 'relative',
              display: 'flex',
              width: playbackSurfaceSize.width,
              height: playbackSurfaceSize.height,
              maxWidth: '100%',
              maxHeight: '100%',
              flexShrink: 0,
              overflow: 'hidden',
              background: '#fff',
            }}
          >
            {isSpread ? (
              <>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: '100%',
                    position: 'relative',
                  }}
                >
                  {renderPage(recording.page)}
                </div>

                {recording.page + 1 <= totalPages && (
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      height: '100%',
                      position: 'relative',
                    }}
                  >
                    {renderPage(recording.page + 1)}
                  </div>
                )}
              </>
            ) : (
              <div
                style={{
                  position: 'relative',
                  flex: 1,
                  height: '100%',
                  minWidth: 0,
                }}
              >
                {renderPage(recording.page)}
              </div>
            )}

            {laserData.length > 0 && containerSize.w > 0 && (
              <LaserReplayOverlay
                laserData={laserData}
                audioRef={audioRef}
                containerWidth={playbackSurfaceSize.width}
                containerHeight={playbackSurfaceSize.height}
              />
            )}
          </div>
        </div>

        <div
          className="p-3 shrink-0 flex flex-col gap-2"
          style={{
            background: '#042f2e',
            borderTop: '1px solid #0d9488',
          }}
        >
          <audio
            ref={audioRef}
            controls
            src={recording.audio_url}
            className="w-full"
            style={{ height: 36 }}
          />

          {laserData.length > 0 && (
            <p className="text-teal-400 text-xs">
              🔴 Laser replays with audio
              {isSpread ? ' (2-page spread)' : ''}
            </p>
          )}

          {allRecs.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setRecIdx(i =>
                    Math.max(0, i - 1)
                  )
                }
                disabled={recIdx === 0}
                className="px-4 py-1 rounded-xl font-bold text-white disabled:opacity-30 text-sm"
                style={{ background: '#0d9488' }}
              >
                ‹
              </button>

              <span className="flex-1 text-center text-teal-300 text-xs font-bold">
                Recording {recIdx + 1} /{' '}
                {allRecs.length}
              </span>

              <button
                onClick={() =>
                  setRecIdx(i =>
                    Math.min(
                      allRecs.length - 1,
                      i + 1
                    )
                  )
                }
                disabled={
                  recIdx === allRecs.length - 1
                }
                className="px-4 py-1 rounded-xl font-bold text-white disabled:opacity-30 text-sm"
                style={{ background: '#0d9488' }}
              >
                ›
              </button>
            </div>
          )}

          <div
            className="rounded-xl p-3 flex flex-col gap-2"
            style={{
              background: '#0f3d3a',
              border: '1px solid #0d9488',
            }}
          >
            <p className="text-white text-sm font-black">
              Teacher review
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={
                  isReviewLoading ||
                  savingReview
                }
                onClick={() =>
                  setReviewStatus(
                    'needs_practice'
                  )
                }
                className={`py-2 rounded-xl text-sm font-bold disabled:opacity-50 ${
                  reviewStatus ===
                  'needs_practice'
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-700 text-gray-200'
                }`}
              >
                🔁 Keep practicing
              </button>

              <button
                type="button"
                disabled={
                  isReviewLoading ||
                  savingReview
                }
                onClick={() =>
                  setReviewStatus('mastered')
                }
                className={`py-2 rounded-xl text-sm font-bold disabled:opacity-50 ${
                  reviewStatus === 'mastered'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-200'
                }`}
              >
                ✅ Mastered
              </button>
            </div>

            <textarea
              value={teacherFeedback}
              onChange={event =>
                setTeacherFeedback(
                  event.target.value
                )
              }
              disabled={
                isReviewLoading ||
                savingReview
              }
              rows={2}
              maxLength={500}
              placeholder="Optional feedback for the student…"
              className="w-full rounded-xl px-3 py-2 text-sm text-white border border-teal-700 disabled:opacity-50"
              style={{
                background: '#042f2e',
              }}
            />

            <button
              type="button"
              onClick={saveReview}
              disabled={
                isReviewLoading ||
                savingReview
              }
              className="w-full py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-black disabled:opacity-50"
            >
              {savingReview
                ? 'Saving…'
                : 'Save review'}
            </button>

            {reviewMessage && (
              <p
                className={`text-xs font-bold text-center ${
                  reviewStatus === 'mastered'
                    ? 'text-green-300'
                    : 'text-orange-300'
                }`}
              >
                {reviewMessage}
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Student row in grid ───────────────────────────────────────────────────────
function StudentSessionCard({ session, book, onReview }) {
  const pages = session.pages_completed || [];
  const totalPages = book.pdf_page_count || (book.pages || []).length || 1;
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
      const query = { class_name: className, school_year: ACTIVE_SCHOOL_YEAR, session_date: reviewDate };
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