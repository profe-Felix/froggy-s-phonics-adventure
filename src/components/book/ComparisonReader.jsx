import { useState, useMemo, useRef, useEffect } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import PdfPageRenderer from '@/components/notebook/PdfPageRenderer';
import BackButton from '@/components/ui/BackButton';
import ToggleableQuestionBar from '@/components/book/ToggleableQuestionBar';

// ComparisonReader — opens multiple books in the familiar StudentBookReader
// shell, concatenating all book pages into one continuous page range, then
// appending question slides at the end. Each question slide shows the
// anchor chart image (if any) as the page content and the Sol/Luna question
// bar below — just like a page in the reader with a question active.
//
// Example: Book A (8 pp) + Book B (8 pp) + 2 questions = 18 pages total.
// Pages 1-8 = Book A, 9-16 = Book B, 17-18 = question slides.
export default function ComparisonReader({ books, questions, onExit }) {
  // Build a flat virtual page list: book pages first, then question slides.
  const pageList = useMemo(() => {
    const pages = [];
    books.forEach((book, bookIndex) => {
      const pageCount = book.pdf_page_count || (book.pages || []).length || 1;
      for (let p = 1; p <= pageCount; p++) {
        pages.push({ type: 'book', bookIndex, pageNumber: p, book });
      }
    });
    questions.forEach((q, qIdx) => {
      pages.push({ type: 'question', qIdx, question: q });
    });
    return pages;
  }, [books, questions]);

  const totalPages = pageList.length;
  const [currentPage, setCurrentPage] = useState(1);
  const [solFirst, setSolFirst] = useState(true);
  const [showAnchor, setShowAnchor] = useState(true);

  const page = pageList[currentPage - 1];
  const isQuestion = page?.type === 'question';
  const currentBook = page?.type === 'book' ? page.book : null;

  // Reset anchor chart visibility when entering a question page.
  useEffect(() => {
    if (isQuestion) setShowAnchor(true);
  }, [currentPage, isQuestion]);

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
  const renderBookPage = (book, pageNum) => {
    if (book.book_type === 'images') {
      const img = (book.pages || []).find(p => p.page_number === pageNum);
      return img ? (
        <img
          src={img.image_url}
          alt={`Page ${pageNum}`}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
      ) : (
        <div className="flex items-center justify-center w-full h-full text-gray-400">No image</div>
      );
    }
    return (
      <PdfPageRenderer
        pdfUrl={book.pdf_url}
        pageNumber={pageNum}
        fitMode="contain"
      />
    );
  };

  const pageTitle = isQuestion
    ? `Pregunta ${page.qIdx + 1}`
    : (currentBook?.title || '');

  const hasAnchor = isQuestion && !!page.question.anchor_chart_url;

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
            Chart
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
          Pg {currentPage} / {totalPages}
        </span>
      </div>

      {/* Page display — same white area as StudentBookReader */}
      <div
        className="flex-1 relative overflow-hidden no-select-text"
        style={{ background: '#fff' }}
      >
        {isQuestion ? (
          <div className="relative w-full h-full flex items-center justify-center">
            {hasAnchor && showAnchor ? (
              <img
                src={page.question.anchor_chart_url}
                alt="Anchor chart"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center">
                <span className="text-8xl font-black text-slate-200">?</span>
                <p className="mt-2 text-lg font-bold text-slate-300">Pregunta {page.qIdx + 1}</p>
              </div>
            )}
          </div>
        ) : currentBook ? (
          <div className="relative w-full h-full">
            {renderBookPage(currentBook, page.pageNumber)}
            {books.length > 1 && (
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

      {/* Question bar — only on question slides, positioned like ReaderQuestions */}
      {isQuestion && (
        <div className="shrink-0 mx-auto w-full max-w-4xl px-3 py-2">
          <ToggleableQuestionBar
            question={page.question}
            solFirst={solFirst}
            setSolFirst={setSolFirst}
          />
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
            {isQuestion
              ? `Pregunta ${page.qIdx + 1} de ${questions.length}`
              : (currentBook?.title || '')}
          </span>
        </div>
        <span className="text-teal-400 text-xs font-bold shrink-0 px-1">
          Pg {currentPage} / {totalPages}
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