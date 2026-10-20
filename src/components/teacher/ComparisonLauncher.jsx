import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Presentation, BookOpen, ChevronRight, Loader2 } from 'lucide-react';
import { entityItems, selectComprehension } from '@/lib/book/curriculum.mjs';

const MODULES = Array.from({ length: 9 }, (_, i) => `M${i + 1}`);
const LESSONS = Array.from({ length: 20 }, (_, i) => `L${i + 1}`);

// TeacherView "Compare" tab: a compact lesson selector (M + L dropdowns,
// saved to localStorage) that fetches the books and questions for the chosen
// lesson and launches the full-screen ComparisonPresent. A "Next lesson"
// button advances so the teacher can jump to the next lesson quickly.
export default function ComparisonLauncher({ onPresent }) {
  const [subject, setSubject] = useState(() => localStorage.getItem('tv_cmp_subject') === 'lv' ? 'lv' : 'df');
  const [module, setModule] = useState(() => localStorage.getItem(`tv_cmp_${localStorage.getItem('tv_cmp_subject') === 'lv' ? 'lv' : 'df'}_module`) || localStorage.getItem('tv_cmp_module') || 'M1');
  const [lesson, setLesson] = useState(() => localStorage.getItem(`tv_cmp_${localStorage.getItem('tv_cmp_subject') === 'lv' ? 'lv' : 'df'}_lesson`) || localStorage.getItem('tv_cmp_lesson') || 'L1');
  const lessonKey = `${module}.${lesson}`;

  useEffect(() => { localStorage.setItem('tv_cmp_subject', subject); }, [subject]);
  useEffect(() => { localStorage.setItem(`tv_cmp_${subject}_module`, module); }, [subject, module]);
  useEffect(() => { localStorage.setItem(`tv_cmp_${subject}_lesson`, lesson); }, [subject, lesson]);
  const changeSubject = value => {
    setSubject(value);
    setModule(localStorage.getItem(`tv_cmp_${value}_module`) || 'M1');
    setLesson(localStorage.getItem(`tv_cmp_${value}_lesson`) || 'L1');
  };

  const nextLesson = () => {
    const lNum = parseInt(lesson.slice(1));
    const mNum = parseInt(module.slice(1));
    if (lNum < LESSONS.length) setLesson(`L${lNum + 1}`);
    else if (mNum < 9) { setModule(`M${mNum + 1}`); setLesson('L1'); }
  };

  const { data: allQuestions = [], isLoading: questionsLoading, error: questionError } = useQuery({
    queryKey: ['book-comp-questions', lessonKey],
    queryFn: async () => {
      const res = await base44.entities.BookComprehensionQuestion.filter(
        { lesson_key: lessonKey },
        { sort: 'page_number', limit: 1000 }
      );
      return entityItems(res).sort(
        (a, b) => (a.page_number || 0) - (b.page_number || 0) || (a.order || 0) - (b.order || 0)
      );
    },
  });

  const { data: allCatalog = [], isLoading: catalogLoading, error: catalogError } = useQuery({
    queryKey: ['book-catalog', 'curricula'],
    queryFn: async () => {
      return entityItems(await base44.entities.BookCatalog.list({ sort: 'title', limit: 1000 }));
    },
  });

  const { data: associations = [], isLoading: linksLoading, error: linksError } = useQuery({
    queryKey: ['lesson-books', lessonKey],
    queryFn: async () => {
      return entityItems(await base44.entities.LessonBooks.filter({ lesson_key: lessonKey }, { sort: '-updated_date', limit: 100 }));
    },
  });

  const { books, questions } = selectComprehension({ subject, associations, questions: allQuestions, catalog: allCatalog, module });
  const qLoading = questionsLoading || catalogLoading || linksLoading;
  const loadError = questionError || catalogError || linksError;

  const canPresent = books.length > 0 && questions.length > 0;

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-lg rounded-2xl bg-white/10 p-6 backdrop-blur">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-black text-white">
          <BookOpen className="h-5 w-5" />
          Book Comparison Lesson
        </h2>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select aria-label="Curriculum" value={subject} onChange={e => changeSubject(e.target.value)}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-bold text-white">
            <option value="df" className="text-slate-800">DF</option>
            <option value="lv" className="text-slate-800">LV</option>
          </select>
          <select
            value={module}
            onChange={e => setModule(e.target.value)}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-bold text-white"
          >
            {MODULES.map(m => <option key={m} value={m} className="text-slate-800">{m}</option>)}
          </select>
          <select
            value={lesson}
            onChange={e => setLesson(e.target.value)}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-bold text-white"
          >
            {LESSONS.map(l => <option key={l} value={l} className="text-slate-800">{l}</option>)}
          </select>
          <span className="text-sm font-black text-indigo-300">{lessonKey}</span>
          <button
            onClick={nextLesson}
            className="ml-auto flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/20"
          >
            Next lesson
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Book preview */}
        <div className="mb-4 flex flex-wrap gap-2">
          {books.length === 0 ? (
            <p className="text-sm text-white/40">No books assigned yet. Set them up in Book Comprehension.</p>
          ) : (
            books.map((b, i) => (
              <div key={b.id} className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2">
                {b.cover_image_url && <img src={b.cover_image_url} alt="" className="h-10 w-8 rounded object-cover" />}
                <div>
                  <p className="text-sm font-bold text-white">{b.title}</p>
                  {books.length > 1 && (
                    <p className="text-xs font-black text-white/50">{i === 0 ? 'Libro A' : 'Libro B'}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {loadError && <p role="alert" className="mb-3 text-sm font-bold text-red-200">Could not load this lesson. Refresh to retry.</p>}
        {/* Status */}
        <p className="mb-4 text-sm text-white/50">
          {qLoading ? 'Loading…' : `${questions.length} question${questions.length !== 1 ? 's' : ''} ready`}
        </p>

        <button
          onClick={() => canPresent && onPresent(questions, books, lessonKey)}
          disabled={!canPresent || qLoading || !!loadError}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-40"
        >
          {qLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Presentation className="h-5 w-5" />}
          Open Reader
        </button>
        {!canPresent && !qLoading && books.length > 0 && questions.length === 0 && (
          <p className="mt-2 text-center text-xs text-white/40">Add questions in Book Comprehension first.</p>
        )}
      </div>
    </div>
  );
}