import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, X, ChevronLeft, ChevronRight, HelpCircle, BookOpen, Image as ImageIcon } from 'lucide-react';
import BookPageThumbnail from '@/components/book/BookPageThumbnail';
import MovableImage from '@/components/book/MovableImage';

// Full-screen presentation for book comprehension questions.
// SOLO: page-by-page reading with ? badges on pages that have questions.
//   Tap ? to reveal the question bar; navigate pages while the question
//   stays visible (locked). Anchor charts float as a movable overlay.
// COMPARISON (2 books): read Book A all the way through, then Book B,
//   then all questions back-to-back. In the questions phase both books
//   are shown side-by-side and pages are navigable (to reference back)
//   while the current question stays intact. Anchor charts float as a
//   movable overlay. Click Sol or Luna to set who asks the question.
export default function ComparisonPresent({ questions, books, onExit }) {
  const isComparison = books.length > 1;
  const totalPages = books.reduce((max, b) => Math.max(max, b.pdf_page_count || 1), 1);

  // Solo: page list (0 = general ★, 1..N = book pages)
  const hasGeneral = questions.some(q => !q.page_number);
  const pageNumbers = isComparison
    ? []
    : [...(hasGeneral ? [0] : []), ...Array.from({ length: totalPages }, (_, i) => i + 1)];

  const [phase, setPhase] = useState('reading'); // comparison: 'reading' | 'questions'
  const [solFirst, setSolFirst] = useState(true);
  const [currentPage, setCurrentPage] = useState(isComparison ? 1 : (pageNumbers[0] ?? 1));
  const [showQ, setShowQ] = useState(false);
  const [qIdx, setQIdx] = useState(0);

  // Comparison reading: which book (0=A, 1=B)
  const [readingBookIndex, setReadingBookIndex] = useState(0);

  // Questions phase: navigable view page + anchor chart toggle
  const [viewPage, setViewPage] = useState(1);
  const [showAnchor, setShowAnchor] = useState(true);

  // Solo: locked questions (the questions from the page where ? was
  // clicked, kept visible while navigating other pages).
  const [lockedQuestions, setLockedQuestions] = useState([]);

  const inQuestionsPhase = isComparison && phase === 'questions';
  const readingBook = isComparison ? books[readingBookIndex] : null;
  const readingBookPages = readingBook?.pdf_page_count || 1;

  // Current page's questions (solo, for ? badge detection)
  const pageQuestions = questions.filter(q => (q.page_number || 0) === currentPage);
  const hasQ = pageQuestions.length > 0;

  // The question currently displayed
  const q = inQuestionsPhase
    ? questions[qIdx]
    : showQ
      ? lockedQuestions[qIdx]
      : pageQuestions[qIdx];

  const currentIdx = pageNumbers.indexOf(currentPage);
  const displayPage = inQuestionsPhase ? viewPage : currentPage;
  const showBadge = !isComparison && hasQ && !showQ;
  const showAnchorChart = showQ && q?.anchor_chart_url;

  // Reset view page when question changes (comparison questions phase)
  useEffect(() => {
    if (inQuestionsPhase && q) {
      setViewPage(q.page_number || 1);
      setShowAnchor(true);
    }
  }, [qIdx, inQuestionsPhase]);

  // ── Navigation ──

  const advanceReadingPage = (dir) => {
    const newPage = currentPage + dir;
    if (newPage > readingBookPages) {
      if (readingBookIndex < books.length - 1) {
        setReadingBookIndex(readingBookIndex + 1);
        setCurrentPage(1);
      } else if (questions.length > 0) {
        setPhase('questions');
        setQIdx(0);
        setViewPage(questions[0]?.page_number || 1);
        setShowAnchor(true);
        setShowQ(true);
      }
      return;
    }
    if (newPage < 1) {
      if (readingBookIndex > 0) {
        const prevBook = books[readingBookIndex - 1];
        setReadingBookIndex(readingBookIndex - 1);
        setCurrentPage(prevBook?.pdf_page_count || 1);
      }
      return;
    }
    setCurrentPage(newPage);
  };

  const advanceQuestion = (dir) => {
    const next = qIdx + dir;
    if (next >= questions.length) return;
    if (next < 0) {
      setPhase('reading');
      setReadingBookIndex(books.length - 1);
      setCurrentPage(books[books.length - 1]?.pdf_page_count || 1);
      setShowQ(false);
      return;
    }
    setQIdx(next);
  };

  const advanceViewPage = (dir) => {
    const maxPage = Math.max(...books.map(b => b.pdf_page_count || 1));
    setViewPage(Math.max(1, Math.min(maxPage, viewPage + dir)));
  };

  const advanceSoloPage = (dir) => {
    const next = currentIdx + dir;
    if (next < 0 || next >= pageNumbers.length) return;
    setCurrentPage(pageNumbers[next]);
    if (!showQ) setQIdx(0);
  };

  const advanceLockedQ = (dir) => {
    const next = qIdx + dir;
    if (next < 0 || next >= lockedQuestions.length) return;
    setQIdx(next);
  };

  const revealQ = () => {
    setLockedQuestions(pageQuestions);
    setShowQ(true);
    setQIdx(0);
  };

  const closeQ = () => {
    setShowQ(false);
    setLockedQuestions([]);
    setQIdx(0);
  };

  // Which books to show in the center
  const centerBooks = isComparison && !inQuestionsPhase
    ? [readingBook].filter(Boolean)
    : books;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#1e1b4b' }}>
      <button onClick={onExit} className="absolute right-5 top-5 z-20 text-white/70 hover:text-white">
        <X className="h-8 w-8" />
      </button>

      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-center gap-3 px-6 pt-4">
        <span className="text-white/50 font-bold text-sm">
          {inQuestionsPhase
            ? `Question ${qIdx + 1} / ${questions.length}`
            : isComparison
              ? `Libro ${readingBookIndex === 0 ? 'A' : 'B'} — Page ${currentPage} / ${readingBookPages}`
              : (currentPage === 0 ? '★ General' : `Page ${currentPage} / ${totalPages}`)}
        </span>
        {isComparison && !inQuestionsPhase && (
          <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm font-bold text-white">
            <BookOpen className="h-4 w-4 text-white/60" />
            {readingBook?.title}
          </span>
        )}
        {(!isComparison || inQuestionsPhase) && books.map((b, i) => (
          <span key={b.id} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm font-bold text-white">
            <BookOpen className="h-4 w-4 text-white/60" />
            {b.title}
            {isComparison && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black text-white ${i === 0 ? 'bg-indigo-500' : 'bg-amber-500'}`}>
                {i === 0 ? 'A' : 'B'}
              </span>
            )}
          </span>
        ))}
        {/* Anchor chart toggle */}
        {showAnchorChart && (
          <button
            onClick={() => setShowAnchor(v => !v)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold transition ${
              showAnchor ? 'bg-amber-500 text-white' : 'bg-white/10 text-white/60'
            }`}
          >
            <ImageIcon className="h-4 w-4" />
            Anchor chart
          </button>
        )}
      </div>

      {/* Center: book page(s) + optional movable anchor chart */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
        {/* Page navigation arrows */}
        {displayPage > 0 && (
          <>
            <button
              onClick={() => inQuestionsPhase ? advanceViewPage(-1) : isComparison ? advanceReadingPage(-1) : advanceSoloPage(-1)}
              disabled={!isComparison && !inQuestionsPhase && currentIdx <= 0}
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 disabled:opacity-20"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={() => inQuestionsPhase ? advanceViewPage(1) : isComparison ? advanceReadingPage(1) : advanceSoloPage(1)}
              disabled={!isComparison && !inQuestionsPhase && currentIdx >= pageNumbers.length - 1}
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 disabled:opacity-20"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}

        {/* Book pages */}
        {displayPage > 0 && books.length > 0 ? (
          <div className="relative flex h-full max-h-full items-center justify-center gap-4">
            {centerBooks.map((b, i) => {
              const bookIndex = isComparison && !inQuestionsPhase ? readingBookIndex : i;
              return (
                <div key={b.id} className="relative flex h-full max-h-full items-stretch justify-center overflow-hidden rounded-xl bg-white shadow-2xl">
                  <BookPageThumbnail book={b} pageNumber={displayPage} width={isComparison && inQuestionsPhase ? 420 : 820} />
                  {isComparison && (
                    <span className={`absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-xs font-black text-white ${bookIndex === 0 ? 'bg-indigo-500' : 'bg-amber-500'}`}>
                      {bookIndex === 0 ? 'Libro A' : 'Libro B'}
                    </span>
                  )}
                </div>
              );
            })}
            {/* ? badge (solo) */}
            {showBadge && (
              <button
                onClick={revealQ}
                className="absolute right-3 top-3 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-white shadow-xl transition hover:scale-110"
              >
                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
                  <HelpCircle className="h-7 w-7" />
                </motion.div>
              </button>
            )}
          </div>
        ) : (
          <div className="text-center text-white/30">
            <p className="text-2xl font-black">★ General questions</p>
          </div>
        )}

        {/* Movable anchor chart overlay */}
        {showAnchorChart && showAnchor && (
          <MovableImage src={q.anchor_chart_url} alt="Anchor chart" />
        )}
      </div>

      {/* Question bar */}
      <AnimatePresence>
        {showQ && q && (
          <motion.div
            key={inQuestionsPhase ? `q${qIdx}` : `locked-q${qIdx}`}
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-2"
          >
            <div className="relative grid grid-cols-2 gap-4 rounded-2xl bg-white p-5 shadow-2xl">
              <button
                onClick={closeQ}
                className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>

              <div
                onClick={() => setSolFirst(true)}
                className={`flex cursor-pointer items-start gap-3 pr-2 transition ${solFirst ? '' : 'opacity-60'}`}
              >
                <div className="flex flex-shrink-0 flex-col items-center gap-0.5">
                  <Sun className={`h-10 w-10 transition-transform ${solFirst ? 'scale-110' : ''}`} style={{ color: '#f59e0b' }} strokeWidth={2.5} />
                  <span className="text-xs font-black" style={{ color: '#f59e0b' }}>Sol</span>
                </div>
                <p className={`pt-1 text-lg leading-snug ${solFirst ? 'font-black text-slate-800' : 'font-bold text-slate-500'}`}>
                  {solFirst ? q.question_text : (q.sentence_stem || '—')}
                </p>
              </div>

              <div
                onClick={() => setSolFirst(false)}
                className={`flex cursor-pointer items-start gap-3 border-l-2 border-slate-100 pl-4 pr-6 transition ${!solFirst ? '' : 'opacity-60'}`}
              >
                <div className="flex flex-shrink-0 flex-col items-center gap-0.5">
                  <Moon className={`h-10 w-10 transition-transform ${!solFirst ? 'scale-110' : ''}`} style={{ color: '#6366f1' }} strokeWidth={2.5} />
                  <span className="text-xs font-black" style={{ color: '#6366f1' }}>Luna</span>
                </div>
                <p className={`pt-1 text-lg leading-snug ${!solFirst ? 'font-black text-slate-800' : 'font-bold text-slate-500'}`}>
                  {!solFirst ? q.question_text : (q.sentence_stem || '—')}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom navigation */}
      <div className="flex items-center justify-center gap-6 px-6 pb-6 pt-2">
        {inQuestionsPhase ? (
          <>
            <button
              onClick={() => advanceQuestion(-1)}
              className="rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
            <span className="text-white/60 font-bold text-sm">
              Q {qIdx + 1} / {questions.length}
            </span>
            <button
              onClick={() => advanceQuestion(1)}
              disabled={qIdx >= questions.length - 1}
              className="rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20 disabled:opacity-30"
            >
              <ChevronRight className="h-7 w-7" />
            </button>
          </>
        ) : isComparison ? (
          <>
            <button
              onClick={() => advanceReadingPage(-1)}
              disabled={readingBookIndex === 0 && currentPage <= 1}
              className="rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20 disabled:opacity-30"
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
            <span className="text-white/40 font-bold text-sm">
              {currentPage >= readingBookPages
                ? (readingBookIndex < books.length - 1
                  ? `next → Libro ${String.fromCharCode(65 + readingBookIndex + 1)}`
                  : (questions.length > 0 ? 'next → questions' : 'end'))
                : `Libro ${String.fromCharCode(65 + readingBookIndex)}`}
            </span>
            <button
              onClick={() => advanceReadingPage(1)}
              className="rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
            >
              <ChevronRight className="h-7 w-7" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => advanceSoloPage(-1)}
              disabled={currentIdx <= 0}
              className="rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20 disabled:opacity-30"
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
            {showQ && lockedQuestions.length > 1 ? (
              <>
                <button onClick={() => advanceLockedQ(-1)} disabled={qIdx === 0} className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 disabled:opacity-30">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-white/50 font-bold text-sm">Q {qIdx + 1} / {lockedQuestions.length}</span>
                <button onClick={() => advanceLockedQ(1)} disabled={qIdx === lockedQuestions.length - 1} className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 disabled:opacity-30">
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            ) : (
              <span className="text-white/40 font-bold text-sm">
                {hasQ ? (showQ ? 'use ◀ ▶ to flip pages' : 'tap ? to ask') : 'no questions — continue'}
              </span>
            )}
            <button
              onClick={() => advanceSoloPage(1)}
              disabled={currentIdx >= pageNumbers.length - 1}
              className="rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20 disabled:opacity-30"
            >
              <ChevronRight className="h-7 w-7" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}