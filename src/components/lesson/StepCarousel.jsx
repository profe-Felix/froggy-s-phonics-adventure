import React, { useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, Star } from 'lucide-react';

// Scoped styles matching the approved design snippet exactly.
// The navigator is a blue-tinted pill containing a horizontal strip of
// step cards (emoji + title) and up/down arrows for sequential navigation.
const STYLES = `
.step-carousel-nav {
  display: flex;
  align-items: center;
  gap: 14px;
  width: max-content;
  max-width: calc(100vw - 32px);
  padding: 12px 14px;
  background: #edf5ff;
  border: 1px solid #c8d9ee;
  border-radius: 22px;
  box-shadow: 0 8px 22px rgba(31,64,105,.13);
  color: #183251;
}
.step-carousel-cards {
  display: flex;
  align-items: stretch;
  gap: 9px;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: #c8d9ee transparent;
}
.step-carousel-cards::-webkit-scrollbar { height: 4px; }
.step-carousel-cards::-webkit-scrollbar-track { background: transparent; }
.step-carousel-cards::-webkit-scrollbar-thumb { background: #c8d9ee; border-radius: 4px; }
.step-card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 126px;
  min-height: 88px;
  padding: 10px 9px 9px;
  border: 1px solid #d5e1ef;
  border-top: 4px solid #aab7c6;
  border-radius: 15px;
  background: #fff;
  color: #43556c;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.15;
  text-align: center;
  cursor: pointer;
  position: relative;
  box-shadow: 0 3px 7px rgba(27,55,86,.07);
  transition: background-color .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease;
  flex-shrink: 0;
}
.step-card.done { border-top-color: #38a779; }
.step-card.tried { border-top-color: #e9ad42; }
.step-card.current {
  transform: scale(1.045);
  border: 2px solid #3978b9;
  border-top: 4px solid #e9ad42;
  background: #f7fbff;
  color: #193b61;
  box-shadow: 0 5px 13px rgba(38,99,158,.19);
}
.step-card .sc-emoji { font-size: 21px; line-height: 1.1; }
.step-card .sc-title { white-space: nowrap; }
.step-card .sc-star {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.step-card .sc-star.done { color: #f5b921; fill: #f5b921; }
.step-card .sc-star.pending { color: #c8d0db; fill: none; }
.step-card:hover { background: #f1f7ff; box-shadow: 0 5px 12px rgba(27,55,86,.15); }
.step-card:active { transform: scale(.98); }
.step-card.current:active { transform: scale(1.02); }
.step-card:focus-visible { outline: 3px solid #75a9df; outline-offset: 3px; }
.step-carousel-arrows { display: flex; flex-direction: column; gap: 9px; padding-left: 2px; }
.step-arrow {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid #cedbea;
  border-radius: 12px;
  background: #fff;
  color: #294d74;
  cursor: pointer;
  box-shadow: 0 3px 7px rgba(27,55,86,.09);
  transition: background-color .18s ease, box-shadow .18s ease, transform .18s ease;
}
.step-arrow:hover { background: #e7f1fc; box-shadow: 0 5px 11px rgba(27,55,86,.16); }
.step-arrow:active { transform: scale(.94); }
.step-arrow:focus-visible { outline: 3px solid #75a9df; outline-offset: 3px; }
.step-arrow:disabled { opacity: 0.3; cursor: not-allowed; }
.step-arrow:disabled:hover { background: #fff; box-shadow: 0 3px 7px rgba(27,55,86,.09); }
.step-arrow svg { width: 19px; height: 19px; }
.step-card.current .sc-emoji { animation: sc-soft-bounce 2.8s ease-in-out infinite; }
@keyframes sc-soft-bounce {
  0%, 84%, 100% { transform: translateY(0); }
  90% { transform: translateY(-3px); }
  95% { transform: translateY(0); }
}
`;

export default function StepCarousel({
  steps,
  currentIdx,
  completedSteps,
  studentData,
  onStepClick,
  onPrev,
  onNext,
  canPrev,
  canNext,
}) {
  const cardsRef = useRef(null);

  // Scroll the current card into view when the step changes.
  useEffect(() => {
    const container = cardsRef.current;
    if (!container) return;
    const card = container.children[currentIdx];
    if (!card) return;
    const left = card.offsetLeft - container.offsetLeft;
    const right = left + card.offsetWidth;
    if (left < container.scrollLeft) {
      container.scrollTo({ left: left - 20, behavior: 'smooth' });
    } else if (right > container.scrollLeft + container.clientWidth) {
      container.scrollTo({ left: right - container.clientWidth + 20, behavior: 'smooth' });
    }
  }, [currentIdx]);

  return (
    <>
      <style>{STYLES}</style>
      <div className="step-carousel-nav">
        {/* Cards */}
        <div className="step-carousel-cards" ref={cardsRef}>
          {steps.map(({ step, originalIndex }, i) => {
            const done = completedSteps.includes(originalIndex);
            const current = i === currentIdx;
            const mp = studentData?.mode_progress?.[step?.mode];
            const attempted = !done && !!mp && (
              (mp.total_attempts || 0) > 0 ||
              (mp.mastered_items?.length || 0) > 0 ||
              (mp.learning_items?.length || 0) > 0
            );

            const classes = ['step-card'];
            if (done) classes.push('done');
            if (attempted) classes.push('tried');
            if (current) classes.push('current');

            return (
              <button
                key={i}
                type="button"
                aria-current={current ? 'step' : undefined}
                onClick={() => onStepClick(i)}
                className={classes.join(' ')}
                title={step?.title || `Step ${i + 1}`}
              >
                <span className={`sc-star ${done ? 'done' : 'pending'}`}>
                  <Star strokeWidth={2.5} fill={done ? '#f5b921' : 'none'} />
                </span>
                <span className="sc-emoji">{step?.emoji || '⭐'}</span>
                <span className="sc-title">{step?.title || `Step ${i + 1}`}</span>
              </button>
            );
          })}
        </div>

        {/* Arrows */}
        <div className="step-carousel-arrows">
          <button
            type="button"
            aria-label="Previous step"
            onClick={onPrev}
            disabled={!canPrev}
            className="step-arrow"
          >
            <ChevronUp strokeWidth={2.6} />
          </button>
          <button
            type="button"
            aria-label="Next step"
            onClick={onNext}
            disabled={!canNext}
            className="step-arrow"
          >
            <ChevronDown strokeWidth={2.6} />
          </button>
        </div>
      </div>
    </>
  );
}