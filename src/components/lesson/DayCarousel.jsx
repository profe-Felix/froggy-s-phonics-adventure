import React from 'react';
import { Check, Star } from 'lucide-react';

// Horizontal carousel of day cards (Monday–Friday) replacing the old grid.
// Same visual language as StepCarousel: blue-tinted pill container, cards
// inside with status-colored top borders.
const STYLES = `
.day-carousel-nav {
  display: flex;
  align-items: stretch;
  gap: 12px;
  width: max-content;
  max-width: calc(100vw - 32px);
  padding: 14px;
  background: #edf5ff;
  border: 1px solid #c8d9ee;
  border-radius: 22px;
  box-shadow: 0 8px 22px rgba(31,64,105,.13);
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: #c8d9ee transparent;
}
.day-carousel-nav::-webkit-scrollbar { height: 5px; }
.day-carousel-nav::-webkit-scrollbar-track { background: transparent; }
.day-carousel-nav::-webkit-scrollbar-thumb { background: #c8d9ee; border-radius: 5px; }
.day-card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 168px;
  min-height: 150px;
  padding: 14px 12px;
  border: 1px solid #d5e1ef;
  border-top: 4px solid #aab7c6;
  border-radius: 15px;
  background: #fff;
  cursor: pointer;
  position: relative;
  box-shadow: 0 3px 7px rgba(27,55,86,.07);
  transition: background-color .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease;
  flex-shrink: 0;
  text-align: left;
}
.day-card.complete { border-top-color: #38a779; }
.day-card.available { border-top-color: #3978b9; }
.day-card:hover { background: #f1f7ff; box-shadow: 0 5px 12px rgba(27,55,86,.15); }
.day-card:active { transform: scale(.98); }
.day-card:focus-visible { outline: 3px solid #75a9df; outline-offset: 3px; }
.day-card:disabled { opacity: 0.5; cursor: not-allowed; }
.day-card:disabled:hover { background: #fff; box-shadow: 0 3px 7px rgba(27,55,86,.07); }
.day-card .dc-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 6px; }
.day-card .dc-label { font-size: 17px; font-weight: 800; color: #183251; line-height: 1.1; }
.day-card .dc-badge { font-size: 12px; font-weight: 700; color: #3978b9; }
.day-card .dc-emoji { font-size: 28px; line-height: 1; }
.day-card .dc-title { font-size: 12px; font-weight: 700; color: #43556c; line-height: 1.2; }
.day-card .dc-count { font-size: 11px; font-weight: 700; color: #6b7d94; }
.day-card .dc-count.complete { color: #38a779; }
.day-card .dc-star {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.day-card .dc-star.done { color: #f5b921; }
.day-card .dc-star.pending { color: #c8d0db; }
`;

export default function DayCarousel({
  dailyLessons,
  isStepAvailable,
  accessContext,
  weekProgress,
  onSelectDay,
}) {
  return (
    <>
      <style>{STYLES}</style>
      <div className="day-carousel-nav">
        {dailyLessons.map((dl) => {
          const availableSteps = dl.steps.filter(isStepAvailable);
          const activityCount = availableSteps.length;
          const canOpen = dl.active !== false && activityCount > 0;

          // weekdayIndex from the day value
          const weekdayIndex = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
            .indexOf(dl.day);

          const isComplete =
            canOpen &&
            weekdayIndex >= 0 &&
            (weekProgress?.completed_steps || []).includes(weekdayIndex);

          const classes = ['day-card'];
          if (isComplete) classes.push('complete');
          else if (canOpen) classes.push('available');

          return (
            <button
              key={dl.day}
              type="button"
              disabled={!canOpen}
              onClick={() => canOpen && onSelectDay(dl.day)}
              className={classes.join(' ')}
            >
              <div className="dc-top">
                <div>
                  <div className="dc-label">{dl.label}</div>
                  {dl.active !== false ? (
                    <div className="dc-badge">M{dl.module_number}.L{dl.curriculum_lesson_number}</div>
                  ) : (
                    <div className="dc-badge" style={{ color: '#94a3b8' }}>No school</div>
                  )}
                </div>
                <span className="dc-emoji">
                  {dl.active === false ? '🏫' : '📚'}
                </span>
              </div>
              <span className={`dc-star ${isComplete ? 'done' : 'pending'}`}>
                <Star strokeWidth={2.5} fill={isComplete ? '#f5b921' : 'none'} />
              </span>

              {dl.active !== false && dl.title && (
                <div className="dc-title">{dl.title}</div>
              )}

              {dl.active !== false && (
                <div className={`dc-count ${isComplete ? 'complete' : ''}`}>
                  {isComplete
                    ? `Complete • ${activityCount} activit${activityCount === 1 ? 'y' : 'ies'}`
                    : activityCount > 0
                      ? `${activityCount} activit${activityCount === 1 ? 'y' : 'ies'}`
                      : accessContext === 'home' && dl.steps.length > 0
                        ? 'School activities only'
                        : 'No activities yet'}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}