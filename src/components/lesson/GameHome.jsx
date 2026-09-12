import React, { useState, useEffect, useMemo } from 'react';
import LevelPath from './LevelPath';
import LevelSideNav from './LevelSideNav';
import LessonMap from './LessonMap';
import LessonStepper from './LessonStepper';
import SideQuests from './SideQuests';
import { useClassColors } from '@/hooks/useClassColors';
import { BookOpen, PlayCircle } from 'lucide-react';
import { fetchLessons } from '@/lib/lessonsLoader';

const LESSON_KEY = 'gamehome_open_lesson';

// The student's home shell: a side nav (Lessons / Books / Games / Videos) plus
// the active section. "Lessons" is the level path; tapping a puck opens that
// lesson's step grid (LessonMap). "Games" launches approved free-play modes,
// "Books" opens the bookshelf, "Videos" is a placeholder for now.
const FREE_MODES = [
  { mode: 'letter_sounds', label: 'Letter Sounds', emoji: '🔊' },
  { mode: 'letter_tracing', label: 'Letter Tracing', emoji: '⬇️✏️' },
  { mode: 'name_tracing', label: 'Name Tracing', emoji: '🧒' },
  { mode: 'sight_words_easy', label: 'Sight Words', emoji: '👁️' },
  { mode: 'missing_letter', label: 'Missing Letter', emoji: '🔤' },
  { mode: 'syllable_count', label: 'Counting Syllables', emoji: '👏' },
];

export default function GameHome({ studentData, selectedStudent, onStartStep, onPlayMode, onLogout, onStudentPatch, onUpdateProgress, onLessonComplete, barcodeLogin }) {
  const { tracingOnlyFor } = useClassColors();
  const isTracingOnly = tracingOnlyFor(studentData?.class_name);

  // Tracing-only classes (e.g. Schwarz) skip the level path and land on the
  // Games tab, which shows only Letter Tracing. Other tabs stay in the nav but
  // render empty (Lessons/Quests/Videos) or the bookshelf (Books, which is
  // empty until the teacher adds that class's own books).
  const [section, setSection] = useState(() => isTracingOnly ? 'games' : 'lessons');
  const [openLesson, setOpenLesson] = useState(null);
  const [openSideQuest, setOpenSideQuest] = useState(null);

  // Parent view toggle — when ON, tapping a lesson puck opens a preview modal
  // (with a scrollable carousel) instead of jumping straight into the lesson.
  // Persisted so a parent's preference survives across sessions at home.
  const [parentView, setParentView] = useState(
    () => localStorage.getItem('parent_view') === '1'
  );
  useEffect(() => { localStorage.setItem('parent_view', parentView ? '1' : '0'); }, [parentView]);

  // Restore the open lesson after a refresh so the student lands back in
  // their lesson instead of the level path.
  useEffect(() => {
    const savedId = sessionStorage.getItem(LESSON_KEY);
    if (!savedId) return;
    let cancelled = false;
    fetchLessons().then((lessons) => {
      if (cancelled) return;
      const found = lessons.find((l) => l.id === savedId);
      if (found) setOpenLesson(found);
      else sessionStorage.removeItem(LESSON_KEY);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Persist the open lesson id so a refresh restores it.
  useEffect(() => {
    if (openLesson) sessionStorage.setItem(LESSON_KEY, openLesson.id);
    else sessionStorage.removeItem(LESSON_KEY);
  }, [openLesson]);

  // Tracing-only classes get a single game: Letter Tracing.
  const modes = useMemo(
    () => isTracingOnly
      ? [
          { mode: 'letter_tracing', label: 'Letter Tracing', emoji: '✏️' },
          { mode: 'name_tracing', label: 'Name Tracing', emoji: '🧒' },
        ]
      : FREE_MODES,
    [isTracingOnly]
  );

  const go = (s) => {
    if (s !== 'lessons') setOpenLesson(null);
    setOpenSideQuest(null);
    setSection(s);
  };

  return (
    <div className="relative h-screen overflow-hidden bg-white">
      <div className="absolute inset-0">
        {section === 'lessons' && !openLesson && (
          <LevelPath
            studentData={studentData}
            selectedStudent={selectedStudent}
            onOpenLesson={setOpenLesson}
            onLogout={onLogout}
            onStudentPatch={onStudentPatch}
            parentView={parentView}
          />
        )}

        {section === 'lessons' && openLesson && (
          <LessonMap
            studentData={studentData}
            selectedStudent={selectedStudent}
            initialLessonId={openLesson.id}
            onBack={() => setOpenLesson(null)}
            onFreePlay={() => go('games')}
            onLogout={onLogout}
            onLessonComplete={onLessonComplete}
            onUpdateProgress={onUpdateProgress}
            onStudentPatch={onStudentPatch}
          />
        )}

        {section === 'sidequests' && !openSideQuest && (
          <SideQuests
            studentData={studentData}
            selectedStudent={selectedStudent}
            onOpen={(l) => setOpenSideQuest(l)}
          />
        )}

        {section === 'sidequests' && openSideQuest && (
          <LessonStepper
            studentData={studentData}
            selectedStudent={selectedStudent}
            lesson={openSideQuest}
            steps={openSideQuest.steps || []}
            lessonId={openSideQuest.id}
            onBack={() => setOpenSideQuest(null)}
            onLessonComplete={onLessonComplete}
            onUpdateProgress={onUpdateProgress}
            onStudentPatch={onStudentPatch}
          />
        )}

        {section === 'games' && (
          <div className="h-full overflow-y-auto p-6">
            <h2 className="text-2xl font-black text-indigo-900 mb-4">Games</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl">
              {modes.map((m) => (
                <button
                  key={m.mode}
                  onClick={() => onPlayMode(m.mode)}
                  className="rounded-3xl bg-indigo-50 border-2 border-indigo-100 p-4 flex flex-col items-center gap-2 hover:bg-indigo-100"
                >
                  <span className="text-4xl">{m.emoji}</span>
                  <span className="text-sm font-bold text-indigo-800">{m.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {section === 'books' && (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <BookOpen className="w-16 h-16 text-indigo-300" />
            <h2 className="text-2xl font-black text-indigo-900">Books</h2>
            <button
              onClick={() => onPlayMode('book_reading')}
              className="px-6 py-3 bg-green-500 text-white font-black rounded-2xl shadow hover:bg-green-600"
            >
              Open Bookshelf
            </button>
          </div>
        )}

        {section === 'videos' && (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <PlayCircle className="w-16 h-16 text-indigo-300" />
            <h2 className="text-2xl font-black text-indigo-900">Videos</h2>
            <p className="text-gray-500">Coming soon!</p>
          </div>
        )}
      </div>

      {!openLesson && !openSideQuest && <LevelSideNav active={section} onSelect={go} onLogout={onLogout} studentData={studentData} selectedStudent={selectedStudent} isTracingOnly={isTracingOnly} barcodeLogin={barcodeLogin} parentView={parentView} onToggleParentView={() => setParentView(v => !v)} />}
    </div>
  );
}