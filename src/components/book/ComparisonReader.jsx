import { useState, useMemo, useRef, useEffect } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import BookPageRenderer from '@/components/book/BookPageRenderer';
import BackButton from '@/components/ui/BackButton';
import ToggleableQuestionBar from '@/components/book/ToggleableQuestionBar';
import { useKnownSightWords } from '@/hooks/useKnownSightWords';
import { buildReadingPages, bookPageCount, resolveQuestionTarget } from '@/lib/book/comprehension.mjs';
import PageMarkOverlay from '@/components/book/PageMarkOverlay';

// ComparisonReader - reads books sequentially (Book A, then Book B), never
// side by side. Book-specific questions appear on their actual book page;
// comparison/extra and general questions follow as their own slides.
export default function ComparisonReader({ books, questions, onExit, lessonKey }) {
  const safeBooks = useMemo(() => (Array.isArray(books) ? books : []), [books]);
  const safeQuestions = useMemo(() => (Array.isArray(questions) ? questions.filter(Boolean) : []), [questions]);

  const pageList = useMemo(() => buildReadingPages(safeBooks, safeQuestions) || [], [safeBooks, safeQuestions]);

  const totalPages = pageList.length;
  const [currentPage, setCurrentPage] = useState(1);
  const [solFirst, setSolFirst] = useState(true);
  const [showAnchor, setShowAnchor] = useState(true);
  const [activeQ, setActiveQ] = useState(0);
  const [barOpen, setBarOpen] = useState(true);

  const { data: knownWords } = useKnownSightWords(lessonKey);
  const safeKnownWords = knownWords instanceof Set ? knownWords : new Set();

  const page = pageList[currentPage - 1];
  const isQuestion = page?.type === 'question';
  const currentBook = page?.type === 'book' ? page.book : null;
  const extraCount = pageList.filter(p => p.type === 'question').length;
  const extraIndex = isQuestion ? pageList.slice(0, currentPage).filter(p => p.type === 'question').length : 0;

  const pageQuestions = page?.questions || [];
  const shownQuestion = pageQuestions[Math.min(activeQ, pageQuestions.length - 1)] || null;

  useEffect(() => {
    setShowAnchor(true);
    setActiveQ(0);
    setBarOpen(true);
  }, [currentPage]);

  const jumpTo = (pred) => {
    const idx = pageList.findIndex(pred);
    if (idx >= 0) setCurrentPage(idx + 1);
  };
  const sectionKey = isQuestion ? 'extra' : page ? `b${page.bookIndex}` : '';

  // ── Fullscreen (same as StudentBookReader) ──
  const readerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => {
      const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFullscreen(fs);
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const handleFullscreen = () => {
    const el = readerRef.current;
    if (!el) return;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      setIsFullscreen(false);
      return;
    }
    const requestFull = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitEnterFullscreen;
    if (requestFull) {
      try {
        const result = requestFull.call(el);
        if (result?.catch) result.catch(() => setIsFullscreen(true));
        else setIsFullscreen(true);
      } catch {
        setIsFullscreen(true);
      }
    } else {
      setIsFullscreen(v => !v);
    }
  };

  // ── Navigation ──
  const goNext = () => setCurrentPage(p => Math.min(totalPages, p + 1));
  const goPrev = () => setCurrentPage(p => Math.max(1, p - 1));
  const canGoNext = currentPage < totalPages;
  const canGoPrev = currentPage > 1;

  // ── Page rendering ──
  const renderBookPage = (book, pageNum) => (
    <BookPageRenderer
      book={book}
      pageNumber={pageNum}
      fitMode="contain"
      highlightWords={safeKnownWords}
    />
  );

  const bookLetter = (i) => (i === 0 ? 'Libro A' : 'Libro B');
  const pageTitle = isQuestion
    ? `Pregunta ${extraIndex}`
    : (currentBook ? `${safeBooks.length > 1 ? bookLetter(page.bookIndex) + ': ' : ''}${currentBook.title || ''}` : '');
  const localLabel = isQuestion
    ? `Pregunta ${extraIndex} / ${extraCount}`
    : currentBook ? `p ${page.pageNumber} / ${bookPageCount(currentBook)}` : '';

  const hasAnchor = !!shownQuestion?.anchor_chart_url;

  // An extra question may point at one book page; show it one at a time
  // (chart OR book page), never as a 2-up spread.
  const extraTarget = isQuestion ? resolveQuestionTarget(shownQuestion, safeBooks) : null;
  const refBook = extraTarget && extraTarget.bookIndex != null && extraTarget.bookIndex >= 0 && extraTarget.pageNumber >= 1
    ? safeBooks[extraTarget.bookIndex] : null;
  const refPage = refBook ? extraTarget.pageNumber : 0;

  return (
    <div
      ref={readerRef}
      className="flex flex-col"
      style={{
        background: '#042f2e',
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        zIndex: isFullscreen ? 9999 : 'auto',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Header — same style as StudentBookReader */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 shrink-0"
        style={{
          background: '#0f3d3a',
          borderBottom: '1px solid #0d9488',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <BackButton tone="teal" onClick={onExit} />
        <p className="flex-1 text-white font-black text-sm truncate min-w-0">{pageTitle}</p>
        {(safeBooks.length > 1 || extraCount > 0) && (
          <div className="flex shrink-0 overflow-hidden rounded border border-teal-700">
            {safeBooks.map((b, i) => (
              <button
                key={b.id || i}
                onClick={() => jumpTo(p => p.type === 'book' && p.bookIndex === i)}
                title={b.title}
                className={`px-2 py-0.5 text-xs font-bold ${sectionKey === `b${i}` ? 'bg-teal-600 text-white' : 'text-teal-300'}`}
              >
                {safeBooks.length > 1 ? (i === 0 ? 'A' : 'B') : 'Libro'}
              </button>
            ))}
            {extraCount > 0 && (
              <button
                onClick={() => jumpTo(p => p.type === 'question')}
                className={`px-2 py-0.5 text-xs font-bold ${sectionKey === 'extra' ? 'bg-teal-600 text-white' : 'text-teal-300'}`}
              >
                Preguntas
              </button>
            )}
          </div>
        )}
        {hasAnchor && (
          <button
            onClick={() => setShowAnchor(v => !v)}
            className={`px-2 py-0.5 rounded text-xs font-bold border transition-all shrink-0 ${
              showAnchor
                ? 'bg-amber-500 text-white border-amber-400'
                : 'text-amber-300 border-amber-700'
            }`}
          >
            <ImageIcon className="inline h-3 w-3 mr-0.5" />
            {refBook ? (showAnchor ? 'Chart' : 'Page') : 'Chart'}
          </button>
        )}
        <button
          onClick={handleFullscreen}
          className={`px-2 py-0.5 rounded text-xs font-bold border shrink-0 ${
            isFullscreen ? 'bg-teal-600 text-white border-teal-400' : 'text-teal-300 border-teal-700'
          }`}
          title="Fullscreen"
        >
          {isFullscreen ? '⊡' : '⛶'}
        </button>
        <span className="text-teal-300 text-xs font-bold shrink-0">
          {localLabel} <span className="text-teal-500">({currentPage}/{totalPages})</span>
        </span>
      </div>

      {/* Page display — same white area as StudentBookReader */}
      <div
        className="flex-1 relative overflow-hidden no-select-text"
        style={{ background: '#fff' }}
      >
        {hasAnchor && showAnchor ? (
          <div className="relative flex h-full w-full items-center justify-center">
            <img src={shownQuestion.anchor_chart_url} alt="Anchor chart" className="h-full w-full object-contain" />
          </div>
        ) : isQuestion ? (
          hasAnchor && (showAnchor || !refBook) ? (
            <div className="relative flex h-full w-full items-center justify-center">
              <img
                src={shownQuestion.anchor_chart_url}
                alt="Anchor chart"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            </div>
          ) : refBook ? (
            <div className="relative w-full h-full">
              {renderBookPage(refBook, refPage)}
              <span className="absolute bottom-2 left-2 rounded-full bg-slate-700 px-2 py-0.5 text-xs font-black text-white">
                {safeBooks.length > 1 ? `${bookLetter(extraTarget.bookIndex)} · ` : ''}p {refPage}
              </span>
            </div>
          ) : (
            <div className="relative flex h-full w-full items-center justify-center">
              <div className="flex flex-col items-center justify-center">
                <span className="text-8xl font-black text-slate-200">?</span>
                <p className="mt-2 text-lg font-bold text-slate-300">Pregunta {extraIndex}</p>
              </div>
            </div>
          )
        ) : currentBook ? (
          <div className="relative w-full h-full">
            {renderBookPage(currentBook, page.pageNumber)}
            {barOpen && shownQuestion?.mark?.shape && (
              <PageMarkOverlay mark={shownQuestion.mark} />
            )}
            {safeBooks.length > 1 && (
              <span
                className={`absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-xs font-black text-white ${
                  page.bookIndex === 0 ? 'bg-indigo-500' : 'bg-amber-500'
                }`}
              >
                {page.bookIndex === 0 ? 'Libro A' : 'Libro B'}
              </span>
            )}
          </div>
        ) : null}
      </div>

      {/* Question bar - extra slides, or book pages that have questions */}
      {shownQuestion && (
        <div className="shrink-0 mx-auto w-full max-w-4xl px-3 py-2">
          {pageQuestions.length > 1 && barOpen && (
            <div className="mb-1.5 flex flex-wrap gap-1">
              {pageQuestions.map((q, i) => (
                <button
                  key={q.id || i}
                  onClick={() => setActiveQ(i)}
                  className={`rounded-full px-3 py-0.5 text-xs font-black ${i === activeQ ? 'bg-teal-500 text-white' : 'bg-teal-900 text-teal-300'}`}
                >
                  Pregunta {i + 1}
                </button>
              ))}
            </div>
          )}
          {isQuestion || barOpen ? (
            <ToggleableQuestionBar
              question={shownQuestion}
              solFirst={solFirst}
              setSolFirst={setSolFirst}
              knownWords={safeKnownWords}
              onClose={isQuestion ? undefined : () => setBarOpen(false)}
            />
          ) : (
            <button
              onClick={() => setBarOpen(true)}
              className="rounded-full bg-amber-500 px-3 py-1 text-xs font-black text-white"
            >
              {pageQuestions.length > 1 ? `${pageQuestions.length} preguntas` : 'Pregunta'}
            </button>
          )}
        </div>
      )}

      {/* Bottom bar — same style as StudentBookReader, no recording controls */}
      <div
        className="shrink-0 flex items-center gap-1.5 px-2 py-1.5"
        style={{ background: '#0f3d3a', borderTop: '1px solid #0d9488' }}
      >
        <button
          onClick={goPrev}
          disabled={!canGoPrev}
          className="shrink-0 w-16 h-12 rounded-2xl flex items-center justify-center font-bold text-white text-3xl leading-none disabled:opacity-30 active:scale-95 transition-transform"
          style={{ background: '#0f766e' }}
        >
          ‹
        </button>
        <div className="flex-1 min-w-0 text-center">
          <span className="text-teal-300 text-xs font-bold">
            {isQuestion ? `Pregunta ${extraIndex} de ${extraCount}` : pageTitle}
          </span>
        </div>
        <span className="text-teal-400 text-xs font-bold shrink-0 px-1">
          {localLabel} ({currentPage}/{totalPages})
        </span>
        <button
          onClick={goNext}
          disabled={!canGoNext}
          className="shrink-0 w-16 h-12 rounded-2xl flex items-center justify-center font-bold text-white text-3xl leading-none disabled:opacity-30 active:scale-95 transition-transform"
          style={{ background: '#0f766e' }}
        >
          ›
        </button>
      </div>
    </div>
  );
}