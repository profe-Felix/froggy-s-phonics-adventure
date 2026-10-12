import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Sun, Moon, Plus, Pencil, Trash2, X, ChevronLeft, ChevronRight, Presentation, ArrowLeft, BookOpen, XCircle, HelpCircle } from 'lucide-react';
import BookPageThumbnail from '@/components/book/BookPageThumbnail';
import MarkEditor from '@/components/book/MarkEditor';

const MODULES = Array.from({ length: 9 }, (_, i) => `M${i + 1}`);
const LESSONS = Array.from({ length: 15 }, (_, i) => `L${i + 1}`);

// ── Present mode ──────────────────────────────────────────────
// Page-by-page presentation. The teacher reads through the book
// one page at a time. Pages that have questions show a pulsing ?
// badge — click it to reveal the question bar (with the sun/moon
// partner toggle), or skip it and continue to the next page.
// Page 0 (★) = general questions not tied to a specific page.
function PresentMode({ questions, books, onExit }) {
  const isComparison = books.length > 1;

  // Total pages: the book's actual page count (don't let question page numbers extend past it)
  const bookPageCount = books.reduce((max, b) => Math.max(max, b.pdf_page_count || 1), 1);
  const totalPages = bookPageCount;

  const hasGeneral = questions.some(q => !q.page_number);
  // Comparison lessons: no ★ general page during reading — all questions go at the end
  const pageNumbers = isComparison
    ? Array.from({ length: totalPages }, (_, i) => i + 1)
    : [...(hasGeneral ? [0] : []), ...Array.from({ length: totalPages }, (_, i) => i + 1)];

  const [phase, setPhase] = useState('reading'); // comparison only: 'reading' | 'questions'
  const [solFirst, setSolFirst] = useState(true); // who asks the question
  const [currentPage, setCurrentPage] = useState(pageNumbers[0] ?? 1);
  const [showQ, setShowQ] = useState(false);
  const [qIdx, setQIdx] = useState(0);

  const inQuestionsPhase = isComparison && phase === 'questions';
  // All questions in questions phase; page-filtered otherwise
  const pageQuestions = inQuestionsPhase
    ? questions
    : questions.filter(q => (q.page_number || 0) === currentPage);
  const hasQ = pageQuestions.length > 0;
  const q = pageQuestions[qIdx];
  const currentIdx = pageNumbers.indexOf(currentPage);
  // In questions phase, the displayed page follows the current question
  const displayPage = inQuestionsPhase ? (q?.page_number || 1) : currentPage;
  // ? badge: solo always; comparison only in questions phase (to reopen after closing)
  const showBadge = hasQ && !showQ && (!isComparison || inQuestionsPhase);

  const changePage = (p) => {
    setCurrentPage(p);
    setShowQ(false);
    setQIdx(0);
  };

  const advancePage = (dir) => {
    if (inQuestionsPhase) {
      const next = qIdx + dir;
      if (next >= pageQuestions.length) return;
      if (next < 0) {
        setPhase('reading');
        setShowQ(false);
        setQIdx(0);
        setCurrentPage(pageNumbers[pageNumbers.length - 1]);
        return;
      }
      setQIdx(next);
      return;
    }
    if (isComparison) {
      const next = currentIdx + dir;
      if (next >= pageNumbers.length) {
        if (questions.length > 0) { setPhase('questions'); setQIdx(0); setShowQ(true); }
        return;
      }
      if (next < 0) return;
      changePage(pageNumbers[next]);
      return;
    }
    const next = currentIdx + dir;
    if (next < 0 || next >= pageNumbers.length) return;
    changePage(pageNumbers[next]);
  };

  const advanceQ = (dir) => {
    const next = qIdx + dir;
    if (next < 0 || next >= pageQuestions.length) return;
    setQIdx(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#1e1b4b' }}>
      <button onClick={onExit} className="absolute right-5 top-5 z-20 text-white/70 hover:text-white">
        <X className="h-8 w-8" />
      </button>

      {/* Compact top bar: page counter + book titles */}
      <div className="flex flex-wrap items-center justify-center gap-3 px-6 pt-4">
        <span className="text-white/50 font-bold text-sm">
          {inQuestionsPhase ? `Question ${qIdx + 1} / ${pageQuestions.length}` : (currentPage === 0 ? '★ General' : `Page ${currentPage} / ${totalPages}`)}
        </span>
        {books.map((b, i) => (
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
      </div>

      {/* Center: book page fills the screen like reading */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
        {displayPage > 0 && books.length > 0 ? (
          <div className="relative flex h-full max-h-full items-center justify-center gap-4">
            {books.map((b, i) => (
              <div key={b.id} className="relative flex h-full max-h-full items-stretch justify-center overflow-hidden rounded-xl bg-white shadow-2xl">
                <BookPageThumbnail book={b} pageNumber={displayPage} width={isComparison ? 420 : 820} />
                {isComparison && (
                  <span className={`absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-xs font-black text-white ${i === 0 ? 'bg-indigo-500' : 'bg-amber-500'}`}>
                    {i === 0 ? 'Libro A' : 'Libro B'}
                  </span>
                )}
              </div>
            ))}
            {/* ? badge to reveal questions */}
            {showBadge && (
              <button
                onClick={() => { setShowQ(true); setQIdx(0); }}
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
      </div>

      {/* Question bar — slides up from the bottom; Sol asks, Luna answers */}
      <AnimatePresence>
        {showQ && q && (
          <motion.div
            key={inQuestionsPhase ? `q${qIdx}` : `p${currentPage}-q${qIdx}`}
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-2"
          >
            <div className="relative grid grid-cols-2 gap-4 rounded-2xl bg-white p-5 shadow-2xl">
              <button
                onClick={() => setShowQ(false)}
                className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Sol — click to make Sol ask the question */}
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

              {/* Luna — click to make Luna ask the question */}
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
              onClick={() => advancePage(-1)}
              className="rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
            <span className="text-white/60 font-bold text-sm">
              Q {qIdx + 1} / {pageQuestions.length}
            </span>
            <button
              onClick={() => advancePage(1)}
              disabled={qIdx >= pageQuestions.length - 1}
              className="rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20 disabled:opacity-30"
            >
              <ChevronRight className="h-7 w-7" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => advancePage(-1)}
              disabled={currentIdx <= 0}
              className="rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20 disabled:opacity-30"
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
            {showQ && pageQuestions.length > 1 ? (
              <>
                <button onClick={() => advanceQ(-1)} disabled={qIdx === 0} className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 disabled:opacity-30">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-white/50 font-bold text-sm">Q {qIdx + 1} / {pageQuestions.length}</span>
                <button onClick={() => advanceQ(1)} disabled={qIdx === pageQuestions.length - 1} className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 disabled:opacity-30">
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            ) : (
              <span className="text-white/40 font-bold text-sm">
                {isComparison
                  ? (currentIdx >= pageNumbers.length - 1
                      ? (questions.length > 0 ? 'next → questions' : 'no questions')
                      : 'read both books')
                  : (hasQ ? (showQ ? 'close ✕ to keep reading' : 'tap ? to ask') : 'no questions — continue')}
              </span>
            )}
            <button
              onClick={() => advancePage(1)}
              disabled={currentIdx >= pageNumbers.length - 1 && (!isComparison || questions.length === 0)}
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

// ── Authoring row ─────────────────────────────────────────────
function QuestionRow({ q, onEdit, onDelete }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm font-black text-indigo-600">
        {q.page_number ? `p${q.page_number}` : '★'}
      </div>
      <div className="flex-1">
        <p className="font-black text-slate-800">{q.question_text}</p>
        {q.sentence_stem && <p className="mt-1 text-sm font-semibold text-slate-500">{q.sentence_stem}</p>}
      </div>
      <button onClick={onEdit} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600">
        <Pencil className="h-4 w-4" />
      </button>
      <button onClick={onDelete} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Edit dialog ───────────────────────────────────────────────
function QuestionEditor({ initial, onSave, onCancel, maxPages, books }) {
  const [question, setQuestion] = useState(initial?.question_text || '');
  const [stem, setStem] = useState(initial?.sentence_stem || '');
  const [page, setPage] = useState(initial?.page_number || 0);
  const [mark, setMark] = useState(initial?.mark?.shape ? initial.mark : null);
  const max = maxPages || 999;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="flex w-full max-w-3xl gap-4 rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Left: live page thumbnail */}
        <div className="flex max-h-[80vh] w-64 flex-shrink-0 flex-col overflow-y-auto">
          <div className="mb-2 text-center text-xs font-black text-slate-500">
            {page === 0 ? '★ General' : `Page ${page}`}
          </div>
          {page === 0 ? (
            <div className="flex h-72 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-4xl">★</div>
          ) : books.length > 0 ? (
            <MarkEditor key={page} books={books} page={page} mark={mark} onChange={setMark} />
          ) : (
            <div className="flex h-72 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-300">No book selected</div>
          )}
        </div>

        {/* Right: form fields */}
        <div className="flex flex-1 flex-col">
          <h3 className="mb-4 text-lg font-black text-slate-800">{initial ? 'Edit question' : 'New question'}</h3>
          <label className="mb-1 block text-sm font-bold text-slate-600">
            Page number (0 = general ★{maxPages ? `, max ${max}` : ''})
          </label>
          <input
            type="number"
            min={0}
            max={max}
            value={page}
            onChange={e => { setPage(Math.max(0, Math.min(max, parseInt(e.target.value) || 0))); setMark(null); }}
            className="mb-3 w-full rounded-lg border border-slate-200 p-3 text-sm font-semibold text-slate-700 focus:border-indigo-400 focus:outline-none"
          />
          <label className="mb-1 block text-sm font-bold text-slate-600">Question</label>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            autoFocus
            rows={2}
            className="mb-3 w-full resize-y rounded-lg border border-slate-200 p-3 text-sm font-semibold text-slate-700 focus:border-indigo-400 focus:outline-none"
            placeholder="¿Quiénes son los personajes del cuento?"
          />
          <label className="mb-1 block text-sm font-bold text-slate-600">Sentence stem (optional)</label>
          <textarea
            value={stem}
            onChange={e => setStem(e.target.value)}
            rows={2}
            className="mb-4 w-full resize-y rounded-lg border border-slate-200 p-3 text-sm font-semibold text-slate-700 focus:border-indigo-400 focus:outline-none"
            placeholder="Los personajes del cuento son _______."
          />
          <div className="flex justify-end gap-2">
            <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
            <button
              onClick={() => question.trim() && onSave(question.trim(), stem.trim(), page, page > 0 ? mark : null)}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Book picker ───────────────────────────────────────────────
// Shows the book(s) assigned to this lesson and lets the teacher
// pick from the BookCatalog (filtered by module). Solo lessons
// get 1 book; comparison lessons get 2 (Libro A + Libro B).
function BookPicker({ lessonKey, module, books, catalog, onSave }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const isComparison = books.length > 1;

  const available = catalog.filter(b => !books.find(bb => bb.id === b.id));

  const removeBook = (id) => {
    onSave(books.filter(b => b.id !== id).map(b => b.id));
  };

  const addBook = (id) => {
    if (books.length >= 2) return;
    const newIds = [...books.map(b => b.id), id];
    onSave(newIds);
    setPickerOpen(false);
  };

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-indigo-600" />
        <span className="text-sm font-black text-slate-700">
          {isComparison ? 'Comparison books (2)' : 'Book for this lesson'}
        </span>
        {books.length > 0 && (
          <button
            onClick={() => setPickerOpen(v => !v)}
            className="ml-auto rounded-lg border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            {pickerOpen ? 'Done' : 'Change'}
          </button>
        )}
      </div>

      {/* Selected books */}
      {books.length === 0 ? (
        <button
          onClick={() => setPickerOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 py-4 text-sm font-bold text-slate-400 hover:border-indigo-300 hover:text-indigo-500"
        >
          <Plus className="h-4 w-4" />
          {isComparison ? 'Pick 2 books to compare' : 'Pick a book'}
        </button>
      ) : (
        <div className="flex flex-wrap gap-3">
          {books.map((b, i) => (
            <div key={b.id} className="relative flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              {b.cover_image_url && (
                <img src={b.cover_image_url} alt="" className="h-10 w-8 rounded object-cover" />
              )}
              <div>
                <p className="text-sm font-bold text-slate-700">{b.title}</p>
                {isComparison && (
                  <p className="text-xs font-black text-slate-400">{i === 0 ? 'Libro A' : 'Libro B'}</p>
                )}
              </div>
              <button onClick={() => removeBook(b.id)} className="ml-1 text-slate-300 hover:text-red-500">
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          ))}
          {books.length === 1 && !pickerOpen && (
            <button
              onClick={() => setPickerOpen(true)}
              className="flex items-center justify-center rounded-lg border-2 border-dashed border-slate-200 px-4 text-sm font-bold text-slate-400 hover:border-indigo-300 hover:text-indigo-500"
            >
              <Plus className="h-4 w-4" /> Add 2nd book
            </button>
          )}
        </div>
      )}

      {/* Catalog picker */}
      {pickerOpen && (
        <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
          {available.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-400">No more books in module {module}.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {available.map(b => (
                <button
                  key={b.id}
                  onClick={() => addBook(b.id)}
                  className="flex items-center gap-3 rounded-lg p-2 text-left hover:bg-white"
                >
                  {b.cover_image_url ? (
                    <img src={b.cover_image_url} alt="" className="h-12 w-9 rounded object-cover" />
                  ) : (
                    <div className="flex h-12 w-9 items-center justify-center rounded bg-slate-200">
                      <BookOpen className="h-5 w-5 text-slate-400" />
                    </div>
                  )}
                  <span className="text-sm font-bold text-slate-700">{b.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function BookComprehension() {
  const qc = useQueryClient();
  const [module, setModule] = useState(() => localStorage.getItem('bcq_module') || 'M1');
  const [lesson, setLesson] = useState(() => localStorage.getItem('bcq_lesson') || 'L1');
  const [editing, setEditing] = useState(null); // null | 'new' | record
  const [presenting, setPresenting] = useState(false);
  const lessonKey = `${module}.${lesson}`;

  useEffect(() => { localStorage.setItem('bcq_module', module); }, [module]);
  useEffect(() => { localStorage.setItem('bcq_lesson', lesson); }, [lesson]);

  // Questions for this lesson
  const { data: questions = [], isLoading } = useQuery({
    queryKey: ['book-comp-questions', lessonKey],
    queryFn: async () => {
      const res = await base44.entities.BookComprehensionQuestion.filter(
        { lesson_key: lessonKey },
        { sort: 'page_number', limit: 100 }
      );
      return res.items.sort(
        (a, b) => (a.page_number || 0) - (b.page_number || 0) || (a.order || 0) - (b.order || 0)
      );
    },
  });

  // BookCatalog books for this module
  const { data: catalog = [] } = useQuery({
    queryKey: ['book-catalog', module],
    queryFn: async () => {
      const res = await base44.entities.BookCatalog.filter(
        { module },
        { sort: 'title', limit: 100 }
      );
      return res.items;
    },
  });

  // LessonBooks association for this lesson
  const { data: lessonBooks } = useQuery({
    queryKey: ['lesson-books', lessonKey],
    queryFn: async () => {
      const res = await base44.entities.LessonBooks.filter(
        { lesson_key: lessonKey },
        { limit: 1 }
      );
      return res.items[0] || null;
    },
  });

  // Resolve book objects from catalog
  const books = (lessonBooks?.book_ids || [])
    .map(id => catalog.find(b => b.id === id))
    .filter(Boolean);

  // Save book association
  const bookMutation = useMutation({
    mutationFn: async (book_ids) => {
      if (lessonBooks?.id) {
        await base44.entities.LessonBooks.update(lessonBooks.id, { book_ids });
      } else {
        await base44.entities.LessonBooks.create({ lesson_key: lessonKey, book_ids });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lesson-books', lessonKey] }); },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, question_text, sentence_stem, page_number, mark }) => {
      if (id) {
        await base44.entities.BookComprehensionQuestion.update(id, { question_text, sentence_stem, page_number, mark: mark || {} });
      } else {
        await base44.entities.BookComprehensionQuestion.create({
          lesson_key: lessonKey,
          question_text,
          sentence_stem,
          page_number,
          mark: mark || {},
          order: questions.length,
        });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['book-comp-questions', lessonKey] }); setEditing(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.BookComprehensionQuestion.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['book-comp-questions', lessonKey] }); },
  });

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center gap-3">
          <Link to="/BookReading" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <h1 className="text-xl font-black text-slate-800">Book Comprehension Questions</h1>
        </div>

        {/* Lesson picker */}
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-sm font-bold text-slate-600">Lesson</span>
          <select value={module} onChange={e => setModule(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
            {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={lesson} onChange={e => setLesson(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
            {LESSONS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <span className="text-sm font-black text-indigo-600">{lessonKey}</span>
          <div className="ml-auto flex items-center gap-2">
            {questions.length > 0 && (
              <button
                onClick={() => setPresenting(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-md hover:bg-indigo-700"
              >
                <Presentation className="h-4 w-4" />
                Present
              </button>
            )}
            <button
              onClick={() => setEditing('new')}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white shadow-md hover:bg-green-700"
            >
              <Plus className="h-4 w-4" />
              Add question
            </button>
          </div>
        </div>

        {/* Book picker */}
        <BookPicker
          lessonKey={lessonKey}
          module={module}
          books={books}
          catalog={catalog}
          onSave={(book_ids) => bookMutation.mutate(book_ids)}
        />

        {/* Question list */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
          </div>
        ) : questions.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
            <p className="text-slate-400 font-bold">No questions yet for {lessonKey}.</p>
            <p className="mt-1 text-sm text-slate-400">Click "Add question" to create one.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {questions.map((q, i) => (
              <QuestionRow
                key={q.id}
                q={q}
                onEdit={() => setEditing(q)}
                onDelete={() => { if (confirm('Delete this question?')) deleteMutation.mutate(q.id); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Editor dialog */}
      {editing && (
        <QuestionEditor
          initial={editing === 'new' ? null : editing}
          maxPages={books.reduce((mx, b) => Math.max(mx, b.pdf_page_count || 0), 0) || null}
          books={books}
          onSave={(question_text, sentence_stem, page_number, mark) => saveMutation.mutate({ id: editing === 'new' ? null : editing.id, question_text, sentence_stem, page_number, mark })}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* Present mode */}
      {presenting && questions.length > 0 && (
        <PresentMode questions={questions} books={books} onExit={() => setPresenting(false)} />
      )}
    </div>
  );
}