import React, { useState } from 'react';
import { ArrowLeft, Check, Info, Play } from 'lucide-react';

// Lesson preview shown when a level puck is tapped (both parent and student
// view). Matches the Replit reference design: warm-white full-screen overlay,
// horizontal scrolling carousel on desktop, 2-col grid on mobile, colored
// cards with bottom shadow, faded number, rotated star badge.
// Filled stars for completed lessons, outlined stars for incomplete.
// Tapping a tile launches that step; "Start lesson" opens from step 1.

// Map step.color enum → card background.
const STEP_COLORS = {
  sky:    '#52d5e8',
  pink:   '#ed5484',
  yellow: '#ffd77b',
  green:  '#43c897',
  orange: '#ff9a52',
  purple: '#5544df',
  blue:   '#4ab0e8',
  teal:   '#3ec4b8',
  rose:   '#f06292',
  indigo: '#7c6fe0',
};
const FALLBACK_COLOR = '#52d5e8';

// Rotated star badge — filled (completed) or outlined (incomplete).
function StarBadge({ filled }) {
  return (
    <svg
      className="lp-star"
      viewBox="0 0 100 100"
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: '-22px',
        right: '-20px',
        zIndex: 3,
        width: '76px',
        height: '76px',
        transform: 'rotate(-8deg)',
        filter: 'drop-shadow(0 4px 0 rgba(23,19,79,0.12))',
        pointerEvents: 'none',
      }}
    >
      <path
        d="M50 6 61 34l30 2-23 19 7 30-25-15-25 15 7-30L9 36l30-2L50 6Z"
        fill={filled ? '#fff' : 'transparent'}
        stroke={filled ? '#f18981' : '#c8c6d6'}
        strokeWidth="8"
        strokeLinejoin="round"
      />
      {filled && (
        <path
          d="M50 18 58 39l22 2-17 14 5 22-18-11-18 11 5-22-17-14 22-2 8-21Z"
          fill="#ffd86e"
        />
      )}
    </svg>
  );
}

const STYLES = `
  .lp-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    overflow-y: auto;
    overflow-x: hidden;
    color: #17134f;
    background: #fffdfa;
    font-family: 'Teachers', 'Nunito', 'Trebuchet MS', ui-rounded, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .lp-overlay *, .lp-overlay *::before, .lp-overlay *::after {
    box-sizing: border-box;
  }

  .lp-header {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr) 104px;
    align-items: start;
    gap: 18px;
    width: min(1160px, calc(100% - 56px));
    margin: 0 auto;
    padding: 31px 0 0;
  }
  .lp-back {
    display: grid;
    width: 52px;
    height: 52px;
    place-items: center;
    margin-top: 1px;
    color: #17134f;
    cursor: pointer;
    border: 0;
    background: transparent;
    transition: transform .18s ease;
  }
  .lp-back:hover { transform: translateX(-4px); }

  .lp-heading { min-width: 0; text-align: center; }
  .lp-title {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin: 0;
    color: #17134f;
    font-size: clamp(1.7rem, 3vw, 2.35rem);
    font-weight: 900;
    letter-spacing: -.045em;
    line-height: 1.05;
  }
  .lp-complete {
    display: inline-grid;
    width: 35px;
    height: 35px;
    place-items: center;
    color: #fff;
    border-radius: 50%;
    background: #43c897;
    flex-shrink: 0;
  }
  .lp-play-icon {
    display: inline-grid;
    width: 35px;
    height: 35px;
    place-items: center;
    color: #fff;
    border-radius: 50%;
    background: #f5a623;
    flex-shrink: 0;
  }
  .lp-subtitle {
    margin: 9px 0 0;
    color: #727391;
    font-size: clamp(.95rem, 1.8vw, 1.22rem);
    font-weight: 700;
    letter-spacing: -.015em;
  }

  .lp-info {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 45px;
    padding: 0 20px;
    margin-top: 1px;
    color: #727391;
    cursor: pointer;
    border: 2px solid #d9d9e3;
    border-radius: 999px;
    background: #fff;
    font-size: 1.03rem;
    font-weight: 800;
    transition: background-color .18s ease, border-color .18s ease, transform .18s ease;
  }
  .lp-info:hover { border-color: #aaa9c1; background: #fafaff; transform: translateY(-2px); }
  .lp-info svg { color: #85849e; }

  .lp-steps-wrap {
    width: min(1160px, calc(100% - 56px));
    margin: 46px auto 0;
  }
  .lp-steps-label {
    font-size: .8rem;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: #727391;
    margin-bottom: 18px;
  }
  .lp-steps {
    display: flex;
    gap: 40px;
    overflow-x: auto;
    padding: 22px 14px 22px 0;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
    overscroll-behavior-inline: contain;
  }
  .lp-steps::-webkit-scrollbar { display: none; }

  .lp-step {
    position: relative;
    display: flex;
    flex: 0 0 220px;
    flex-direction: column;
    align-items: center;
    padding: 0;
    scroll-snap-align: start;
    color: #17134f;
    text-align: center;
    cursor: pointer;
    border: 0;
    background: transparent;
  }
  .lp-step-card {
    position: relative;
    width: 220px;
    height: 276px;
    overflow: visible;
    border: 0;
    border-radius: 31px;
    transition: transform .2s ease, box-shadow .2s ease;
    box-shadow: 0 5px 0 rgba(18,16,68,0.24);
  }
  .lp-step:hover .lp-step-card {
    transform: translateY(-6px);
    box-shadow: 0 11px 0 rgba(18,16,68,0.24);
  }
  .lp-number {
    position: absolute;
    top: 21px;
    left: 30px;
    z-index: 1;
    color: rgba(255,255,255,.42);
    font-size: 4.9rem;
    font-weight: 950;
    letter-spacing: -.13em;
    line-height: .8;
    pointer-events: none;
  }
  .lp-emoji {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 205px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    font-size: 5.5rem;
    line-height: 1;
    pointer-events: none;
    z-index: 2;
  }
  .lp-step-label {
    display: block;
    margin-top: 20px;
    color: #17134f;
    font-size: 1.13rem;
    font-weight: 900;
    letter-spacing: -.03em;
  }

  .lp-start {
    display: flex;
    align-items: center;
    gap: 14px;
    width: min(420px, calc(100% - 56px));
    margin: 40px auto 0;
    padding: 14px 24px;
    border: 2px solid #d9d9e3;
    border-radius: 999px;
    background: #fff;
    cursor: pointer;
    transition: transform .18s ease, box-shadow .18s ease;
  }
  .lp-start:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(23,19,79,0.1); }
  .lp-start-icon {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: #fef0e0;
    display: grid;
    place-items: center;
    font-size: 1.6rem;
    flex-shrink: 0;
  }
  .lp-start-text {
    flex: 1;
    text-align: left;
    font-size: 1.15rem;
    font-weight: 900;
    color: #17134f;
  }
  .lp-start-arrow { color: #727391; flex-shrink: 0; }

  .lp-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 28px auto 40px;
    color: #9e9eae;
    font-size: .82rem;
    font-weight: 700;
  }

  .lp-dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    padding: 22px;
    background: rgba(23,19,79,.19);
    backdrop-filter: blur(3px);
  }
  .lp-dialog {
    width: min(380px, 100%);
    padding: 28px;
    color: #17134f;
    border-radius: 24px;
    background: #fffdfa;
    box-shadow: 0 18px 50px rgba(23,19,79,.18);
  }
  .lp-dialog h2 { margin: 0; font-size: 1.45rem; font-weight: 950; }
  .lp-dialog p { margin: 10px 0 0; color: #727391; font-size: .95rem; font-weight: 700; line-height: 1.5; }
  .lp-dialog-close {
    width: 100%;
    margin-top: 20px;
    padding: 12px;
    color: #fff;
    cursor: pointer;
    border: 0;
    border-radius: 13px;
    background: #17134f;
    font-weight: 900;
  }

  /* Tablet: 4-column grid */
  @media (min-width: 701px) and (max-width: 1100px) {
    .lp-header, .lp-steps-wrap { width: calc(100% - 40px); }
    .lp-steps-wrap { margin-top: 32px; }
    .lp-steps {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 28px 18px;
      overflow-x: visible;
      padding: 18px 10px 16px;
      scroll-snap-type: none;
    }
    .lp-step { width: 100%; min-width: 0; flex: none; }
    .lp-step-card { width: 100%; height: auto; aspect-ratio: 220 / 276; border-radius: 27px; }
    .lp-number { left: 10%; font-size: clamp(3.4rem, 7vw, 4.9rem); }
    .lp-emoji { height: 74%; font-size: clamp(3rem, 7vw, 5.5rem); }
    .lp-step-label { margin-top: 15px; font-size: clamp(.9rem, 1.8vw, 1.13rem); }
  }

  /* Mobile: 2-column grid */
  @media (max-width: 700px) {
    .lp-header {
      grid-template-columns: 44px minmax(0, 1fr) 44px;
      gap: 6px;
      width: calc(100% - 28px);
      padding-top: 20px;
    }
    .lp-back { width: 44px; height: 44px; }
    .lp-info { width: 44px; height: 44px; min-height: 44px; padding: 0; }
    .lp-info span { display: none; }
    .lp-title { gap: 8px; font-size: clamp(1.08rem, 5vw, 1.25rem); }
    .lp-complete, .lp-play-icon { width: 26px; height: 26px; }
    .lp-complete svg, .lp-play-icon svg { width: 16px; height: 16px; }
    .lp-subtitle { margin-top: 7px; font-size: .82rem; line-height: 1.3; }
    .lp-steps-wrap { width: calc(100% - 28px); margin-top: 32px; }
    .lp-steps {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 26px 14px;
      overflow-x: visible;
      padding: 18px 4px 12px;
      scroll-snap-type: none;
    }
    .lp-step { width: 100%; min-width: 0; flex: none; }
    .lp-step-card { width: 100%; height: auto; aspect-ratio: 178 / 224; border-radius: 25px; }
    .lp-number { top: 17px; left: 23px; font-size: 4rem; }
    .lp-emoji { height: 74%; font-size: clamp(2.5rem, 9vw, 4rem); }
    .lp-step-label { margin-top: 15px; font-size: .98rem; }
    .lp-start { width: calc(100% - 28px); }
  }

  /* Very small phones */
  @media (max-width: 360px) {
    .lp-header {
      grid-template-columns: 38px minmax(0, 1fr) 38px;
      gap: 4px;
      width: calc(100% - 20px);
    }
    .lp-back, .lp-info { width: 38px; height: 38px; min-height: 38px; }
    .lp-back svg { width: 34px; height: 34px; }
    .lp-title { gap: 5px; font-size: 1rem; }
    .lp-complete, .lp-play-icon { width: 22px; height: 22px; }
    .lp-complete svg, .lp-play-icon svg { width: 14px; height: 14px; }
    .lp-subtitle { font-size: .74rem; }
    .lp-steps-wrap { width: calc(100% - 20px); }
    .lp-step-label { font-size: .88rem; }
    .lp-start { width: calc(100% - 20px); }
  }
`;

export default function LessonPreviewModal({ lesson, isCompleted, studentName, onPlay, onClose, onStartStep }) {
  const [showInfo, setShowInfo] = useState(false);
  if (!lesson) return null;

  const num = lesson.lesson_number || 1;
  const subtitle = lesson.subtitle || lesson.title || '';
  const body = studentName
    ? `${studentName} will ${subtitle.charAt(0).toLowerCase()}${subtitle.slice(1)}`
    : subtitle;
  const steps = lesson.steps || [];

  return (
    <div className="lp-overlay">
      <style>{STYLES}</style>

      {/* Header */}
      <header className="lp-header">
        <button className="lp-back" type="button" aria-label="Go back" onClick={onClose}>
          <ArrowLeft size={42} strokeWidth={3.2} />
        </button>

        <div className="lp-heading">
          <h1 className="lp-title">
            {isCompleted ? (
              <span className="lp-complete"><Check size={22} strokeWidth={3.5} /></span>
            ) : (
              <span className="lp-play-icon"><Play size={16} strokeWidth={0} fill="white" /></span>
            )}
            Lesson {num}{isCompleted ? ' Complete!' : ''}
          </h1>
          <p className="lp-subtitle">{body}</p>
        </div>

        <button className="lp-info" type="button" onClick={() => setShowInfo(true)}>
          <Info size={18} strokeWidth={2.2} />
          <span>Info</span>
        </button>
      </header>

      {/* Steps carousel */}
      {steps.length > 0 && (
        <main>
          <section className="lp-steps-wrap" aria-label="Lesson steps">
            <p className="lp-steps-label">
              {steps.length} part{steps.length !== 1 ? 's' : ''} in this lesson
            </p>
            <div className="lp-steps">
              {steps.map((step, i) => {
                const color = STEP_COLORS[step.color] || FALLBACK_COLOR;
                return (
                  <button
                    key={i}
                    className="lp-step"
                    type="button"
                    aria-label={`${step.title}, lesson step ${i + 1}`}
                    onClick={() => onStartStep?.(step, i, lesson)}
                  >
                    <div className="lp-step-card" style={{ background: color }}>
                      <span className="lp-number">{i + 1}</span>
                      <StarBadge filled={isCompleted} />
                      <div className="lp-emoji">
                        {step.emoji || '⭐'}
                      </div>
                    </div>
                    <span className="lp-step-label">{step.title}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </main>
      )}

      {/* Start / Play again button */}
      <button className="lp-start" type="button" onClick={onPlay}>
        <span className="lp-start-icon">🦊</span>
        <span className="lp-start-text">{isCompleted ? 'Play again' : 'Start lesson'}</span>
        <Play className="lp-start-arrow" size={20} strokeWidth={2.5} />
      </button>

      {/* Footer note */}
      <div className="lp-footer">
        <Info size={14} strokeWidth={2.2} />
        {isCompleted
          ? 'Your child can do completed lessons alone.'
          : 'Sit with your child and follow along for this one.'}
      </div>

      {/* Info dialog */}
      {showInfo && (
        <div className="lp-dialog-backdrop" role="presentation" onClick={() => setShowInfo(false)}>
          <div className="lp-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Lesson {num}</h2>
            <p>
              Each picture is one part of {studentName || 'your child'}'s reading adventure.
              Tap a card to jump to that step, or press {isCompleted ? 'Play again' : 'Start lesson'} to do the whole lesson.
            </p>
            <button className="lp-dialog-close" type="button" onClick={() => setShowInfo(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}