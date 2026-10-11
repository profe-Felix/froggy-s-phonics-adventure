import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Sun, Moon, Plus, Pencil, Trash2, X, ChevronLeft, ChevronRight, Presentation, ArrowLeft } from 'lucide-react';

const MODULES = Array.from({ length: 9 }, (_, i) => `M${i + 1}`);
const LESSONS = Array.from({ length: 15 }, (_, i) => `L${i + 1}`);

// ── Present mode ──────────────────────────────────────────────
// Full-screen question bar with a sun/moon partner toggle on the
// left. Teacher reads the question + sentence stem, students
// answer in pairs. Click the toggle to flip Sol↔Luna (whose turn
// to ask). Advance questions with arrows; the toggle auto-flips
// on each advance so partners alternate roles.
function PresentMode({ questions, startIndex, onExit }) {
  const [index, setIndex] = useState(startIndex);
  const [turn, setTurn] = useState(0); // 0 = Sol asks, 1 = Luna asks
  const q = questions[index];

  const advance = (dir) => {
    const next = index + dir;
    if (next < 0 || next >= questions.length) return;
    setIndex(next);
    setTurn(t => (t + 1) % 2); // auto-flip on advance
  };

  if (!q) return null;

  const isSol = turn === 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6" style={{ background: '#1e1b4b' }}>
      <button onClick={onExit} className="absolute top-5 right-5 text-white/70 hover:text-white">
        <X className="h-8 w-8" />
      </button>

      {/* Question counter */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 text-white/50 font-bold text-lg">
        {index + 1} / {questions.length}
      </div>

      {/* The question bar */}
      <motion.div
        key={index}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex w-full max-w-5xl items-stretch gap-5 rounded-3xl bg-white p-8 shadow-2xl"
      >
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
        <div className="flex flex-1 flex-col justify-center gap-3 border-l-2 border-slate-100 pl-6">
          <p className="text-3xl font-black leading-snug text-slate-800">{q.question_text}</p>
          {q.sentence_stem && (
            <p className="text-2xl font-bold leading-snug text-slate-500">{q.sentence_stem}</p>
          )}
        </div>
      </motion.div>

      {/* Navigation */}
      <div className="mt-8 flex items-center gap-6">
        <button
          onClick={() => advance(-1)}
          disabled={index === 0}
          className="rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20 disabled:opacity-30"
        >
          <ChevronLeft className="h-7 w-7" />
        </button>
        <span className="text-white/40 font-bold text-sm">click ☀️/🌙 to flip partners</span>
        <button
          onClick={() => advance(1)}
          disabled={index === questions.length - 1}
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-black text-slate-800">{initial ? 'Edit question' : 'New question'}</h3>
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
            onClick={() => question.trim() && onSave(question.trim(), stem.trim())}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700"
          >
            Save
          </button>
        </div>
      </div>
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

  const saveMutation = useMutation({
    mutationFn: async ({ id, question_text, sentence_stem }) => {
      if (id) {
        await base44.entities.BookComprehensionQuestion.update(id, { question_text, sentence_stem });
      } else {
        await base44.entities.BookComprehensionQuestion.create({
          lesson_key: lessonKey,
          question_text,
          sentence_stem,
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
          onSave={(question_text, sentence_stem) => saveMutation.mutate({ id: editing === 'new' ? null : editing.id, question_text, sentence_stem })}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* Present mode */}
      {presenting && questions.length > 0 && (
        <PresentMode questions={questions} startIndex={0} onExit={() => setPresenting(false)} />
      )}
    </div>
  );
}