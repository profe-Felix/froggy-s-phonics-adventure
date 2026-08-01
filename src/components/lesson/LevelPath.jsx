import React, { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Lock, Star } from 'lucide-react';

// Level-path homepage: the student's Supabase "Level_Path" background image is
// fit to width and scrolls vertically; 120 level pucks are laid along a gentle
// serpentine over it. A puck is green once its lesson is mastered, the next
// playable lesson is the active (white + pink ring) puck, everything else is
// greyed/locked. The view auto-scrolls to the active puck on load.
const BG_URL = 'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/images/Backgrounds/Level_Path.png';
const TOTAL_LEVELS = 120;
const ROW_H = 108;     // vertical px between pucks
const TOP_PAD = 80;    // top inset for the first puck
const AMP = 0.26;      // serpentine amplitude (fraction of width)
const FREQ = 0.8;      // serpentine frequency per level

// Serpentine position for a 1-indexed level. Tunable constants above let you
// match the pucks to the painted road in the background image.
function levelPos(i) {
  const left = 50 + AMP * 100 * Math.sin((i - 1) * FREQ);
  const top = TOP_PAD + (i - 1) * ROW_H;
  return { left, top };
}

export default function LevelPath({ studentData, selectedStudent, onOpenLesson, onLogout }) {
  const className = selectedStudent?.class_name;
  const studentNumber = selectedStudent?.number;

  const { data: lessons = [] } = useQuery({
    queryKey: ['lessons', className],
    queryFn: () => base44.entities.Lesson.filter({ active: true }),
  });

  const { data: progresses = [] } = useQuery({
    queryKey: ['lesson-progress-all', String(studentNumber), className],
    queryFn: () => base44.entities.LessonProgress.filter({
      student_number: studentNumber,
      class_name: className,
    }),
    enabled: !!studentNumber && !!className,
  });

  // Lessons for this class (or all-classes), ordered by lesson_number.
  const myLessons = useMemo(
    () => lessons
      .filter(l => !l.class_name || l.class_name === className)
      .sort((a, b) => (a.lesson_number || 0) - (b.lesson_number || 0)),
    [lessons, className]
  );

  const byNumber = useMemo(() => {
    const m = new Map();
    for (const l of myLessons) if (l.lesson_number) m.set(l.lesson_number, l);
    return m;
  }, [myLessons]);

  // A level is "done" when its lesson's LessonProgress.completed is true.
  const completedSet = useMemo(() => {
    const s = new Set();
    for (const p of progresses) {
      if (!p.completed) continue;
      const l = myLessons.find(l => l.id === p.lesson_id);
      if (l?.lesson_number) s.add(l.lesson_number);
    }
    return s;
  }, [progresses, myLessons]);

  // Next playable = the lowest existing lesson_number that isn't completed yet.
  const nextNumber = useMemo(() => {
    for (const l of myLessons) {
      if (!completedSet.has(l.lesson_number)) return l.lesson_number;
    }
    return null;
  }, [myLessons, completedSet]);

  const scrollRef = useRef(null);
  const activeRef = useRef(null);
  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      activeRef.current.scrollIntoView({ block: 'center' });
    }
  }, [nextNumber]);

  const levels = Array.from({ length: TOTAL_LEVELS }, (_, i) => i + 1);

  return (
    <div ref={scrollRef} className="relative h-screen overflow-y-auto bg-[#a932d5]">
      <div
        className="relative w-full"
        style={{
          height: TOP_PAD + TOTAL_LEVELS * ROW_H,
          backgroundImage: `url(${BG_URL})`,
          backgroundSize: '100% auto',
          backgroundRepeat: 'repeat-y',
          backgroundPosition: 'top center',
        }}
      >
        {/* Top bar (sticky within the scroll) */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-3">
          <button
            onClick={onLogout}
            className="px-4 py-1.5 rounded-full bg-white text-indigo-900 text-sm font-bold shadow"
          >
            Grownups
          </button>
          <div className="px-4 py-1.5 rounded-full bg-white/90 text-indigo-900 text-sm font-black shadow">
            {studentData?.name || `Student ${studentNumber}`} · {className}
          </div>
        </div>

        {levels.map((n) => {
          const lesson = byNumber.get(n);
          const done = completedSet.has(n);
          const active = n === nextNumber;
          const locked = !lesson || (!done && !active);
          const pos = levelPos(n);
          return (
            <button
              key={n}
              ref={active ? activeRef : null}
              disabled={locked}
              onClick={() => lesson && !locked && onOpenLesson(lesson)}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center rounded-full shadow-lg select-none"
              style={{
                left: `${pos.left}%`,
                top: pos.top,
                width: 56,
                height: 56,
                background: done ? '#4ade80' : active ? '#ffffff' : '#c5d8ff',
                border: active ? '4px solid #F48FB1' : '3px solid #ffffff',
                opacity: locked ? 0.55 : 1,
                cursor: locked ? 'default' : 'pointer',
              }}
            >
              {locked ? (
                <Lock className="w-5 h-5 text-gray-500" />
              ) : (
                <span className="text-lg font-black" style={{ color: done ? '#ffffff' : '#311B92' }}>
                  {n}
                </span>
              )}
              {done && (
                <Star className="absolute -top-1 -right-1 w-4 h-4 text-yellow-400 fill-yellow-400 drop-shadow" />
              )}
              {active && (
                <span className="absolute -bottom-5 text-[10px] font-black text-white bg-pink-500 rounded-full px-2 py-0.5 shadow">
                  ▶ HERE
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}