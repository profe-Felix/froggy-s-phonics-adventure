import React, { useEffect, useRef } from 'react';
import { X, Play, Check, Info, Star } from 'lucide-react';

// Parent-facing lesson preview. Shown when the "parent view" toggle is ON and
// a level puck is tapped, so grown-ups can see what a lesson covers before the
// child jumps in. A horizontal carousel below the card lets them browse every
// lesson in the class. Matches the supplied mockups (white card, navy ink,
// green completed badge, fox "play again" pill, pastel carousel cards).
const NAVY = '#2D2650';
const MUTED = '#7A758D';

// Pastel card palette — rotates across lessons so each card reads distinct.
const CARD_COLORS = [
  { bg: '#80E5FF', num: 'rgba(255,255,255,0.75)' },
  { bg: '#F06292', num: 'rgba(255,255,255,0.75)' },
  { bg: '#FFE082', num: 'rgba(255,255,255,0.7)' },
  { bg: '#7DFDC4', num: 'rgba(255,255,255,0.7)' },
  { bg: '#FFB885', num: 'rgba(255,255,255,0.7)' },
  { bg: '#B39DDB', num: 'rgba(255,255,255,0.7)' },
];

export default function LessonPreviewModal({ lesson, isCompleted, allLessons, studentName, onPlay, onClose, onSelectLesson }) {
  const scrollRef = useRef(null);

  // Center the selected lesson's card in the carousel whenever it changes.
  useEffect(() => {
    const el = scrollRef.current?.querySelector(`[data-lesson="${lesson?.id}"]`);
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [lesson?.id]);

  if (!lesson) return null;

  const num = lesson.lesson_number || 1;
  const subtitle = lesson.subtitle || lesson.title || '';
  // Personalize: "Luke will learn the letter M..." when we know the student.
  const body = studentName
    ? `${studentName} will ${subtitle.charAt(0).toLowerCase()}${subtitle.slice(1)}`
    : subtitle;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #a78bfa 0%, #60a5fa 50%, #6ee7b7 100%)' }}
    >
      {/* Decorative pale-yellow stars (top-right cluster) */}
      <div className="absolute top-8 right-10 text-yellow-100/70 text-5xl select-none pointer-events-none">✦</div>
      <div className="absolute top-20 right-24 text-yellow-100/50 text-3xl select-none pointer-events-none">✦</div>
      <div className="absolute top-32 right-12 text-yellow-100/40 text-2xl select-none pointer-events-none">✦</div>

      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-5 left-5 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition"
      >
        <X className="w-6 h-6" />
      </button>

      <div className="relative w-full max-w-lg">
        {/* --- Modal card --- */}
        <div className="bg-white rounded-3xl shadow-2xl px-8 py-7">
          <h2 className="text-3xl font-black leading-tight" style={{ color: NAVY }}>
            Lesson {num}
          </h2>

          {/* Status badge */}
          <div className="flex items-center gap-2 mt-2">
            {isCompleted ? (
              <>
                <span className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" strokeWidth={3} />
                </span>
                <span className="text-sm font-semibold" style={{ color: MUTED }}>Completed</span>
              </>
            ) : (
              <>
                <span className="w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center">
                  <Play className="w-3 h-3 text-white" />
                </span>
                <span className="text-sm font-semibold" style={{ color: MUTED }}>Up next</span>
              </>
            )}
          </div>

          {/* Body */}
          <p className="mt-4 text-base leading-relaxed" style={{ color: NAVY }}>{body}</p>

          {/* Play / Play-again pill */}
          <button
            onClick={onPlay}
            className="mt-6 w-full flex items-center gap-3 rounded-full px-4 py-2.5 transition hover:bg-gray-50"
            style={{ border: '2px solid #BDB8C7' }}
          >
            <span className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-2xl shrink-0">🦊</span>
            <span className="flex-1 text-left font-bold text-lg" style={{ color: NAVY }}>
              {isCompleted ? 'Play again' : 'Start lesson'}
            </span>
            <Play className="w-5 h-5 shrink-0" style={{ color: '#C6C3D0' }} />
          </button>

          {/* Footer note */}
          <div className="mt-4 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
              <Info className="w-3 h-3 text-gray-400" />
            </span>
            <p className="text-xs" style={{ color: '#9CA3AF' }}>
              {isCompleted
                ? 'Your child can do completed lessons alone.'
                : 'Sit with your child and follow along for this one.'}
            </p>
          </div>
        </div>

        {/* --- Scrollable carousel of all lessons --- */}
        {allLessons?.length > 0 && (
          <div className="mt-6">
            <div
              ref={scrollRef}
              className="flex gap-4 overflow-x-auto pb-2 px-1 snap-x"
              style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}
            >
              {allLessons.map((l) => {
                const c = CARD_COLORS[((l.lesson_number || 1) - 1) % CARD_COLORS.length];
                const selected = l.id === lesson.id;
                return (
                  <button
                    key={l.id}
                    data-lesson={l.id}
                    onClick={() => onSelectLesson?.(l)}
                    className="snap-center shrink-0 flex flex-col items-center"
                  >
                    <div
                      className="relative w-28 h-32 rounded-2xl shadow-lg flex items-center justify-center overflow-hidden transition"
                      style={{ background: c.bg, outline: selected ? `3px solid ${NAVY}` : 'none', outlineOffset: '2px' }}
                    >
                      {/* faded big number */}
                      <span
                        className="absolute top-1 left-1/2 -translate-x-1/2 text-5xl font-black select-none pointer-events-none"
                        style={{ color: c.num }}
                      >
                        {l.lesson_number}
                      </span>
                      {/* illustration emoji */}
                      <span className="text-4xl mt-5 drop-shadow-sm">
                        {l.steps?.[0]?.emoji || '⭐'}
                      </span>
                      {/* star badge */}
                      <span className="absolute top-2 right-2">
                        <Star className="w-6 h-6 text-yellow-300 fill-yellow-300 drop-shadow" />
                      </span>
                      {/* completed check */}
                      {l.done && (
                        <span className="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    <span
                      className="mt-2 text-xs font-bold text-center max-w-[7rem] leading-tight"
                      style={{ color: NAVY }}
                    >
                      {l.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}