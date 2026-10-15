import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus, Pencil, Trash2, Presentation, ArrowLeft, BookOpen, XCircle, Upload, Loader2, GripVertical } from 'lucide-react';
import MarkEditor from '@/components/book/MarkEditor';
import ComparisonReader from '@/components/book/ComparisonReader';

const MODULES = Array.from({ length: 9 }, (_, i) => `M${i + 1}`);
const LESSONS = Array.from({ length: 20 }, (_, i) => `L${i + 1}`);

// ── Authoring row ─────────────────────────────────────────────
function QuestionRow({ q, onEdit, onDelete, dragHandleProps }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div {...dragHandleProps} className="flex h-9 w-6 flex-shrink-0 cursor-grab items-center justify-center text-slate-300 hover:text-slate-500 active:cursor-grabbing">
        <GripVertical className="h-5 w-5" />
      </div>
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
function QuestionEditor({ initial, onSave, onCancel, onSaveAndContinue, maxPages, books }) {
  const [question, setQuestion] = useState(initial?.question_text || '');
  const [stem, setStem] = useState(initial?.sentence_stem || '');
  const [page, setPage] = useState(initial?.page_number || 0);
  const [mark, setMark] = useState(initial?.mark?.shape ? initial.mark : null);
  const [anchorChartUrl, setAnchorChartUrl] = useState(initial?.anchor_chart_url || '');
  const [uploading, setUploading] = useState(false);
  const max = maxPages || 999;
  const isQuestionSlide = page > 0 && page > max;

  // Reset the form for the next question, keeping the same page so a teacher
  // can add several questions in sequence for one page without re-typing it.
  const resetForNext = () => {
    setQuestion('');
    setStem('');
    setMark(null);
    setAnchorChartUrl('');
  };

  const handleUpload = async (file) => {
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadPublicFile({ file });
      setAnchorChartUrl(res.file_url);
    } catch (e) {
      console.error('Upload failed', e);
    }
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="flex w-full max-w-3xl gap-4 rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Left: live page thumbnail */}
        <div className="flex max-h-[80vh] w-64 flex-shrink-0 flex-col overflow-y-auto">
          <div className="mb-2 text-center text-xs font-black text-slate-500">
            {page === 0 ? '★ General' : isQuestionSlide ? `Question slide ${page}` : `Page ${page}`}
          </div>
          {page === 0 ? (
            <div className="flex h-72 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-4xl">★</div>
          ) : isQuestionSlide ? (
            <div className="flex h-72 flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 gap-2">
              {anchorChartUrl ? (
                <img src={anchorChartUrl} alt="Anchor chart" className="h-48 rounded-lg object-contain" />
              ) : (
                <span className="text-4xl text-slate-300">?</span>
              )}
              <span className="text-xs font-bold text-slate-400">Question slide (no book page)</span>
            </div>
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
            Slide number (0 = general ★{maxPages ? `, books 1–${max}, questions ${max + 1}+` : ''})
          </label>
          <input
            type="number"
            min={0}
            value={page}
            onChange={e => { setPage(Math.max(0, parseInt(e.target.value) || 0)); setMark(null); }}
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
            className="mb-3 w-full resize-y rounded-lg border border-slate-200 p-3 text-sm font-semibold text-slate-700 focus:border-indigo-400 focus:outline-none"
            placeholder="Los personajes del cuento son _______."
          />
          <label className="mb-1 block text-sm font-bold text-slate-600">Anchor chart (optional)</label>
          {anchorChartUrl ? (
            <div className="relative mb-4">
              <img src={anchorChartUrl} alt="Anchor chart" className="h-32 rounded-lg border border-slate-200 object-contain" />
              <button onClick={() => setAnchorChartUrl('')} className="absolute right-1 top-1 rounded-lg bg-white/80 p-1 text-red-500 hover:bg-white">
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className="mb-4 flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 py-3 text-sm font-bold text-slate-400 hover:border-indigo-300 hover:text-indigo-500">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'Uploading...' : 'Upload anchor chart'}
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files[0]; if (f) handleUpload(f); }} />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
            {onSaveAndContinue && !initial && (
              <button
                onClick={() => {
                  if (!question.trim()) return;
                  onSaveAndContinue(question.trim(), stem.trim(), page, page > 0 ? mark : null, anchorChartUrl);
                  resetForNext();
                }}
                className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-300"
              >
                Save & add next
              </button>
            )}
            <button
              onClick={() => question.trim() && onSave(question.trim(), stem.trim(), page, page > 0 ? mark : null, anchorChartUrl)}
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
function BookPicker({ lessonKey, module, books, catalog, onSave, onDeleteCatalog }) {
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
                <div key={b.id} className="group flex items-center gap-3 rounded-lg p-2 hover:bg-white">
                  <button
                    onClick={() => addBook(b.id)}
                    className="flex flex-1 items-center gap-3 text-left"
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
                  {onDeleteCatalog && (
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${b.title}" from the book catalog?\n\nThis removes it for every class and lesson.`)) {
                          onDeleteCatalog(b.id);
                        }
                      }}
                      className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500 opacity-0 group-hover:opacity-100"
                      title="Delete from catalog"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
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

  // Delete a book from the catalog entirely (removes it from every lesson)
  const deleteCatalogMutation = useMutation({
    mutationFn: async (bookId) => {
      await base44.entities.BookCatalog.delete(bookId);
      // Clean up any LessonBooks associations referencing this book
      try {
        const res = await base44.entities.LessonBooks.filter({ book_ids: bookId }, { limit: 100 });
        await Promise.all((res.items || []).map(lb =>
          base44.entities.LessonBooks.update(lb.id, {
            book_ids: (lb.book_ids || []).filter(id => id !== bookId),
          })
        ));
      } catch (e) { /* best-effort cleanup */ }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['book-catalog'] });
      qc.invalidateQueries({ queryKey: ['lesson-books'] });
    },
  });

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
    mutationFn: async ({ id, question_text, sentence_stem, page_number, mark, anchor_chart_url, keepOpen }) => {
      if (id) {
        await base44.entities.BookComprehensionQuestion.update(id, { question_text, sentence_stem, page_number, mark: mark || {}, anchor_chart_url: anchor_chart_url || '' });
      } else {
        await base44.entities.BookComprehensionQuestion.create({
          lesson_key: lessonKey,
          question_text,
          sentence_stem,
          page_number,
          mark: mark || {},
          anchor_chart_url: anchor_chart_url || '',
          order: questions.length,
        });
      }
      return { keepOpen };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['book-comp-questions', lessonKey] });
      if (!vars?.keepOpen) setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.BookComprehensionQuestion.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['book-comp-questions', lessonKey] }); },
  });

  const reorderMutation = useMutation({
    mutationFn: async (reordered) => {
      const updates = reordered.map((q, i) => ({ id: q.id, order: i }));
      await base44.entities.BookComprehensionQuestion.bulkUpdate(updates);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['book-comp-questions', lessonKey] }); },
  });

  const onDragEnd = (result) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const reordered = [...questions];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    reorderMutation.mutate(reordered);
  };

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
          onDeleteCatalog={(id) => deleteCatalogMutation.mutate(id)}
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
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="questions">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col gap-2">
                  {questions.map((q, i) => (
                    <Draggable key={q.id} draggableId={q.id} index={i}>
                      {(dragProvided) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          style={dragProvided.draggableProps.style}
                        >
                          <QuestionRow
                            q={q}
                            onEdit={() => setEditing(q)}
                            onDelete={() => { if (confirm('Delete this question?')) deleteMutation.mutate(q.id); }}
                            dragHandleProps={dragProvided.dragHandleProps}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>

      {/* Editor dialog */}
      {editing && (
        <QuestionEditor
          initial={editing === 'new' ? null : editing}
          maxPages={books.reduce((sum, b) => sum + (b.pdf_page_count || 0), 0) || null}
          books={books}
          onSave={(question_text, sentence_stem, page_number, mark, anchor_chart_url) => saveMutation.mutate({ id: editing === 'new' ? null : editing.id, question_text, sentence_stem, page_number, mark, anchor_chart_url })}
          onSaveAndContinue={(question_text, sentence_stem, page_number, mark, anchor_chart_url) => saveMutation.mutate({ id: null, question_text, sentence_stem, page_number, mark, anchor_chart_url, keepOpen: true })}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* Present mode */}
      {presenting && questions.length > 0 && (
        <ComparisonReader questions={questions} books={books} lessonKey={lessonKey} onExit={() => setPresenting(false)} />
      )}
    </div>
  );
}