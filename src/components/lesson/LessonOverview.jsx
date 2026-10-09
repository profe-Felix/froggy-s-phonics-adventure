import React from 'react';
import { ArrowLeft, Star, Play, Check } from 'lucide-react';
import { colorOf, MODE_BY_VALUE } from '@/lib/lessonColors';

// Lesson overview — the carousel IS the main view. Large colorful cards
// show every activity at a glance. The first incomplete card pulsates to
// show where to start. Completed cards have a yellow star; the rest are
// greyed-out stars. Click a card to open that activity.

const OVERVIEW_STYLES = `
@keyframes lesson-card-pulse {
  0%, 100% { transform: scale(1); box-shadow: 0 4px 14px rgba(0,0,0,.18); }
  50% { transform: scale(1.06); box-shadow: 0 10px 28px rgba(0,0,0,.25); }
}
.lesson-card-pulse {
  animation: lesson-card-pulse 1.8s ease-in-out infinite;
}
`;

export default function LessonOverview({
  lesson,
  steps,
  completedSteps,
  onStepClick,
  onBack,
  allDone,
  onLessonComplete,
}) {
  const firstIncomplete = steps.findIndex(
    ({ originalIndex }) => !completedSteps.includes(originalIndex)
  );

  return (
    <>
      <style>{OVERVIEW_STYLES}</style>
      <div className="min-h-screen bg-[#dae2f3] flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-4 shrink-0">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center hover:bg-white/90"
            style={{ color: '#26264d' }}
          >
            <ArrowLeft className="w-5 h-5" strokeWidth={2.5} />
          </button>
          <div className="text-center">
            <h1 className="text-xl font-black" style={{ color: '#26264d' }}>
              {lesson?.title || `Lesson ${lesson?.lesson_number || ''}`}
            </h1>
            {lesson?.subtitle && (
              <p className="text-sm text-gray-500 mt-0.5">{lesson.subtitle}</p>
            )}
          </div>
          <div className="w-10" />
        </div>

        {/* Cards */}
        <div className="flex-1 flex items-center justify-center px-4 pb-6">
          {allDone ? (
            <div className="text-center flex flex-col items-center gap-4">
              <div className="text-6xl">🎉</div>
              <h2 className="text-2xl font-black text-green-600">Lesson Complete!</h2>
              <button
                onClick={onLessonComplete}
                className="px-6 py-3 bg-green-500 text-white font-black rounded-2xl shadow-lg hover:bg-green-600 inline-flex items-center gap-2"
              >
                <Check className="w-5 h-5" /> Return to Path
              </button>
            </div>
          ) : (
            <div className="flex gap-4 flex-wrap justify-center max-w-4xl">
              {steps.map(({ step, originalIndex }, i) => {
                const done = completedSteps.includes(originalIndex);
                const isNext = i === firstIncomplete;
                const c = colorOf(step?.color);

                return (
                  <button
                    key={i}
                    onClick={() => onStepClick(i)}
                    className={`relative rounded-3xl p-5 flex flex-col items-center justify-center aspect-square w-36 sm:w-44 transition-all shadow-lg border-4 border-white/70 ${c.solid} ${isNext ? 'lesson-card-pulse' : 'hover:scale-[1.03] hover:shadow-xl'}`}
                  >
                    {/* number */}
                    <span className="absolute top-2 left-3 text-5xl font-black text-white/55 select-none pointer-events-none">
                      {i + 1}
                    </span>
                    {/* star badge */}
                    <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 border-2 border-white shadow flex items-center justify-center">
                      <Star
                        className={`w-4 h-4 ${done ? 'text-yellow-500 fill-yellow-400' : 'text-gray-300'}`}
                        strokeWidth={2.5}
                      />
                    </span>
                    {/* play icon on next card */}
                    {isNext && (
                      <span className="absolute top-2 right-10 w-7 h-7 rounded-full bg-white/90 border-2 border-white shadow flex items-center justify-center">
                        <Play className="w-3.5 h-3.5 text-gray-700 fill-gray-700" />
                      </span>
                    )}
                    {/* emoji */}
                    {step?.emojiImage ? (
                      <img src={step.emojiImage} alt="" className="w-14 h-14 mt-4 mb-2 object-contain drop-shadow-sm" />
                    ) : (
                      <span className="text-5xl mt-4 mb-2 drop-shadow-sm">
                        {step?.emoji || MODE_BY_VALUE[step?.mode]?.emoji || '⭐'}
                      </span>
                    )}
                    {/* title */}
                    <span className="text-sm font-black text-white text-center leading-tight px-1 drop-shadow">
                      {step?.title || `Step ${i + 1}`}
                    </span>
                    {done && (
                      <span className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-green-500 border-2 border-white shadow flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}