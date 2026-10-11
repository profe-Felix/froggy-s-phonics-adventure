import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Sun, Moon, Plus, Pencil, Trash2, X, ChevronLeft, ChevronRight, Presentation, ArrowLeft, BookOpen, XCircle, HelpCircle } from 'lucide-react';

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

  // Total pages: max of book page counts and question page numbers
  const bookPageCount = books.reduce((max, b) => Math.max(max, b.pdf_page_count || 1), 1);
  const maxQuestionPage = questions.reduce((max, q) => Math.max(max, q.page_number || 0), 0);
  const totalPages = Math.max(bookPageCount, maxQuestionPage, 1);

  // Page 0 (★) = general; 1..N = book pages
  const hasGeneral = questions.some(q => !q.page_number);
  const pageNumbers = [...(hasGeneral ? [0] : []), ...Array.from({ length: totalPages }, (_, i) => i + 1)];

  const [currentPage, setCurrentPage] = useState(pageNumbers[0] ?? 1);
  const [showQ, setShowQ] = useState(false);
  const [qIdx, setQIdx] = useState(0);
  const [turn, setTurn] = useState(0);

  const pageQuestions = questions.filter(q => (q.page_number || 0) === currentPage);
  const hasQ = pageQuestions.length > 0;
  const q = pageQuestions[qIdx];
  const isSol = turn === 0;
  const currentIdx = pageNumbers.indexOf(currentPage);

  const changePage = (p) => {
    setCurrentPage(p);
    setShowQ(false);
    setQIdx(0);
    setTurn(0);
  };

  const advancePage = (dir) => {
    const next = currentIdx + dir;
    if (next < 0 || next >= pageNumbers.length) return;
    changePage(pageNumbers[next]);
  };

  const advanceQ = (dir) => {
    const next = qIdx + dir;
    if (next < 0 || next >= pageQuestions.length) return;
    setQIdx(next);
    setTurn(t => (t + 1) % 2);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col px-6 py-10" style={{ background: '#1e1b4b' }}>
      <button onClick={onExit} className="absolute top-5 right-5 text-white/70 hover:text-white">
        <X className="h-8 w-8" />
      </button>

      {/* Page counter */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 text-white/50 font-bold text-lg">
        {currentPage === 0 ? '★ General' : `Page ${currentPage} / ${totalPages}`}
      </div>

      {/* Book title(s) */}
      {books.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-center gap-3">
          {books.map((b, i) => (
            <div key={b.id} className="flex items-center gap-2 rounded-full bg-white/10 px-5 py-2">
              <BookOpen className="h-5 w-5 text-white/60" />
              <span className="text-lg font-bold text-white">{b.title}</span>
              {isComparison && i === 0 && (
                <span className="ml-1 rounded-full bg-indigo-500 px-2 py-0.5 text-xs font-black text-white">Libro A</span>
              )}
              {isComparison && i === 1 && (
                <span className="ml-1 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-black text-white">Libro B</span>
              )}
            </div>
          ))}
          {isComparison && (
            <span className="text-white/40 font-bold text-sm">↔ comparing both books</span>
          )}
        </div>
      )}

      {/* Page strip — each page with questions has a ? badge */}
      <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
        {pageNumbers.map(p => {
          const pQs = questions.filter(qq => (qq.page_number || 0) === p);
          const isActive = p === currentPage;
          return (
            <button
              key={p}
              onClick={() => changePage(p)}
              className={`relative flex h-12 w-12 items-center justify-center rounded-xl text-lg font-black transition ${
                isActive ? 'scale-110 bg-white text-indigo-900' : 'bg-white/10 text-white/60 hover:bg-white/20'
              }`}
            >
              {p === 0 ? '★' : p}
              {pQs.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg">
                  <HelpCircle className="h-5 w-5" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Center: question prompt or question bar */}
      <div className="flex flex-1 items-center justify-center">
        {hasQ && !showQ ? (
          <button
            onClick={() => { setShowQ(true); setQIdx(0); }}
            className="flex flex-col items-center gap-3 text-white/70 transition hover:text-white"
          >
            <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
              <HelpCircle className="h-24 w-24" style={{ color: '#f59e0b' }} strokeWidth={2} />
            </motion.div>
            <span className="text-xl font-black">
              {pageQuestions.length} question{pageQuestions.length > 1 ? 's' : ''} for this page — click to show
            </span>
          </button>
        ) : showQ && q ? (
          <motion.div
            key={qIdx}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="relative flex w-full max-w-5xl items-stretch gap-5 rounded-3xl bg-white p-8 shadow-2xl"
          >
            {/* Close questions */}
            <button
              onClick={() => setShowQ(false)}
              className="absolute right-4 top-4 rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Sun/moon partner toggle */}
            <button
              onClick={() => setTurn(t => (t + 1) % 2)}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl px-5 transition hover:bg-slate-50"
            >
              <AnimatePresence mode="wait">
                {isSol ? (
                  <motion.div key="sol" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.25 }}>
                    <Sun className="h-20 w-20" style={{ color: '#f59e0b' }} strokeWidth={2.5} />
                  </motion.div>
                ) : (
                  <motion.div key="luna" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.25 }}>
                    <Moon className="h-20 w-20" style={{ color: '#6366f1' }} strokeWidth={2.5} />
                  </motion.div>
                )}
              </AnimatePresence>
              <span className="text-2xl font-black" style={{ color: isSol ? '#f59e0b' : '#6366f1' }}>
                {isSol ? 'Sol' : 'Luna'}
              </span>
              <span className="text-xs font-bold text-slate-400">pregunta</span>
            </button>

            {/* Question + sentence stem */}
            <div className="flex flex-1 flex-col justify-center gap-3 border-l-2 border-slate-100 pl-6 pr-10">
              <p className="text-3xl font-black leading-snug text-slate-800">{q.question_text}</p>
              {q.sentence_stem && (
                <p className="text-2xl font-bold leading-snug text-slate-500">{q.sentence_stem}</p>
              )}
            </div>
          </motion.div>
        ) : (
          <div className="text-center text-white/30">
            <p className="text-2xl font-black">No questions for this page</p>
            <p className="mt-2 text-sm font-bold">Continue reading →</p>
          </div>
        )}
      </div>

      {/* Bottom navigation */}
      <div className="mt-6 flex items-center justify-center gap-6">
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
            {hasQ ? 'click ☀️/🌙 to flip partners' : 'no questions — continue'}
          </span>
        )}
        <button
          onClick={() => advancePage(1)}
          disabled={currentIdx >= pageNumbers.length - 1}
          className="rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20 disabled:opacity-30"
        >
          <ChevronRight className="h-7 w-7" />
        </button>
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
function QuestionEditor({ initial, onSave, onCancel }) {
  const [question, setQuestion] = useState(initial?.question_text || '');
  const [stem, setStem] = useState(initial?.sentence_stem || '');
  const [page, setPage] = useState(initial?.page_number || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-black text-slate-800">{initial ? 'Edit question' : 'New question'}</h3>
        <label className="mb-1 block text-sm font-bold text-slate-600">Page number (0 = general ★)</label>
        <input
          type="number"
          min={0}
          value={page}
          onChange={e => setPage(Math.max(0, parseInt(e.target.value) || 0))}
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
            onClick={() => question.trim() && onSave(question.trim(), stem.trim(), page)}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700"
          >
            Save
          </button>
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
  const isComparison = lessonKey.endsWith('.L3') || lessonKey.endsWith('.L6') || lessonKey.endsWith('.L9') || lessonKey.endsWith('.L12') || lessonKey.endsWith('.L15');

  const available = catalog.filter(b => !books.find(bb => bb.id === b.id));

  const removeBook = (id) => {
    onSave(books.filter(b => b.id !== id).map(b => b.id));
  };

  const addBook = (id) => {
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
          {isComparison && books.length < 2 && !pickerOpen && (
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
        { sort: 'order', limit: 100 }
      );
      return res.items;
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
    onMutate: () => { qc.invalidateQueries({ queryKey: ['lesson-books', lessonKey] }); },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, question_text, sentence_stem, page_number }) => {
      if (id) {
        await base44.entities.BookComprehensionQuestion.update(id, { question_text, sentence_stem, page_number });
      } else {
        await base44.entities.BookComprehensionQuestion.create({
          lesson_key: lessonKey,
          question_text,
          sentence_stem,
          page_number,
          order: questions.length,
        });
      }
    },
    onMutate: () => { qc.invalidateQueries({ queryKey: ['book-comp-questions', lessonKey] }); },
    onSuccess: () => { setEditing(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.BookComprehensionQuestion.delete(id),
    onMutate: () => { qc.invalidateQueries({ queryKey: ['book-comp-questions', lessonKey] }); },
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
          onSave={(question_text, sentence_stem, page_number) => saveMutation.mutate({ id: editing === 'new' ? null : editing.id, question_text, sentence_stem, page_number })}
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