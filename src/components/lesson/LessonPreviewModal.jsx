import React from 'react';
import { X, Play, Check, Info, Star, ChevronLeft } from 'lucide-react';

// Lesson preview shown when a level puck is tapped (both parent view and
// student view). Compact header + horizontally scrolling carousel of step
// tiles. Filled stars for completed lessons, outlined stars for incomplete.
// Tapping a tile launches that step directly; "Start lesson" opens the full
// dot-progression from step 1.
const NAVY = '#2D2650';
const MUTED = '#7A758D';

// Map step.color enum → pastel card background + faded-number color.
const STEP_COLORS = {
  sky:     { bg: '#80E5FF', num: 'rgba(255,255,255,0.75)' },
  pink:    { bg: '#F06292', num: 'rgba(255,255,255,0.75)' },
  yellow:  { bg: '#FFE082', num: 'rgba(255,255,255,0.7)' },
  green:   { bg: '#7DFDC4', num: 'rgba(255,255,255,0.7)' },
  orange:  { bg: '#FFB885', num: 'rgba(255,255,255,0.7)' },
  purple:  { bg: '#B39DDB', num: 'rgba(255,255,255,0.7)' },
  blue:    { bg: '#7CB9FF', num: 'rgba(255,255,255,0.75)' },
  teal:    { bg: '#80DEEA', num: 'rgba(255,255,255,0.7)' },
  rose:    { bg: '#FF9AA2', num: 'rgba(255,255,255,0.7)' },
  indigo:  { bg: '#9FA8DA', num: 'rgba(255,255,255,0.7)' },
};
const FALLBACK = { bg: '#80E5FF', num: 'rgba(255,255,255,0.75)' };

export default function LessonPreviewModal({ lesson, isCompleted, studentName, onPlay, onClose, onStartStep }) {
  if (!lesson) return null;

  const num = lesson.lesson_number || 1;
  const subtitle = lesson.subtitle || lesson.title || '';
  const body = studentName
    ? `${studentName} will ${subtitle.charAt(0).toLowerCase()}${subtitle.slice(1)}`
    : subtitle;
  const steps = lesson.steps || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      style={{ background: 'linear-gradient(135deg, #a5b4fc 0%, #6ee7b7 100%)' }}
    >
      {/* Decorative pale stars */}
      <div className="absolute top-6 right-10 text-white/40 text-5xl select-none pointer-events-none">✦</div>
      <div className="absolute top-16 right-24 text-white/25 text-3xl select-none pointer-events-none">✦</div>
      <div className="absolute top-28 right-14 text-white/20 text-2xl select-none pointer-events-none">✦</div>

      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-5 left-5 w-10 h-10 rounded-full bg-white/25 flex items-center justify-center text-white hover:bg-white/40 transition"
      >
        <X className="w-6 h-6" />
      </button>

      <div className="relative w-full max-w-2xl flex flex-col gap-4">
        {/* --- Compact header bar --- */}
        <div className="flex items-start gap-3">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/25 flex items-center justify-center text-white shrink-0 hover:bg-white/40 transition"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {isCompleted ? (
                <span className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                  <Check className="w-5 h-5 text-white" strokeWidth={3} />
                </span>
              ) : (
                <span className="w-7 h-7 rounded-full bg-amber-400 flex items-center justify-center shrink-0">
                  <Play className="w-3.5 h-3.5 text-white" />
                </span>
              )}
              <h2 className="text-2xl font-black leading-tight truncate" style={{ color: 'white' }}>
                Lesson {num}{isCompleted ? ' Complete!' : ''}
              </h2>
            </div>
            <p className="mt-1 text-sm font-medium text-white/80 line-clamp-2">{body}</p>
          </div>

          <button className="shrink-0 px-4 py-1.5 rounded-full bg-white/20 text-white text-sm font-bold border border-white/30 hover:bg-white/30 transition">
            Info
          </button>
        </div>

        {/* --- Horizontal scrolling tile carousel --- */}
        {steps.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-2 text-white/80">
              {steps.length} part{steps.length !== 1 ? 's' : ''} in this lesson
            </p>
            <div
              className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1"
              style={{ scrollbarWidth: 'thin', scrollSnapType: 'x mandatory' }}
            >
              {steps.map((step, i) => {
                const c = STEP_COLORS[step.color] || FALLBACK;
                return (
                  <button
                    key={i}
                    onClick={() => onStartStep?.(step, i, lesson)}
                    className="flex flex-col items-center group shrink-0"
                    style={{ width: '9rem', scrollSnapAlign: 'start' }}
                  >
                    <div
                      className="relative w-full rounded-2xl shadow-lg flex items-center justify-center overflow-hidden transition group-hover:scale-[1.03] group-active:scale-95"
                      style={{ background: c.bg, aspectRatio: '3 / 4' }}
                    >
                      {/* faded big number */}
                      <span
                        className="absolute top-1 left-1/2 -translate-x-1/2 text-6xl font-black select-none pointer-events-none leading-none"
                        style={{ color: c.num }}
                      >
                        {i + 1}
                      </span>
                      {/* illustration emoji */}
                      <span className="text-5xl drop-shadow-sm relative z-10">
                        {step.emoji || '⭐'}
                      </span>
                      {/* star badge — filled when completed, outlined when not */}
                      <span className="absolute top-2 right-2">
                        {isCompleted ? (
                          <Star className="w-7 h-7 text-yellow-300 fill-yellow-300 drop-shadow" />
                        ) : (
                          <Star className="w-7 h-7 text-white/70 drop-shadow" strokeWidth={2} />
                        )}
                      </span>
                    </div>
                    <span
                      className="mt-2 text-xs font-bold text-center leading-tight text-white"
                      style={{ maxWidth: '100%' }}
                    >
                      {step.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* --- Start / Play-again pill --- */}
        <button
          onClick={onPlay}
          className="w-full flex items-center gap-3 rounded-full px-5 py-3 bg-white shadow-lg transition hover:bg-gray-50 active:scale-[0.98]"
        >
          <span className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-2xl shrink-0">🦊</span>
          <span className="flex-1 text-left font-bold text-lg" style={{ color: NAVY }}>
            {isCompleted ? 'Play again' : 'Start lesson'}
          </span>
          <Play className="w-5 h-5 shrink-0" style={{ color: MUTED }} />
        </button>

        {/* Footer note */}
        <div className="flex items-center gap-2 justify-center">
          <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <Info className="w-3 h-3 text-white/70" />
          </span>
          <p className="text-xs text-white/70">
            {isCompleted
              ? 'Your child can do completed lessons alone.'
              : 'Sit with your child and follow along for this one.'}
          </p>
        </div>
      </div>
    </div>
  );
}