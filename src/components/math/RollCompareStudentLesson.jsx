import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';

function Cookie({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="18" fill="#c8854a" stroke="#8B5E3C" strokeWidth="1.5"/>
      <ellipse cx="13" cy="14" rx="3.5" ry="2.5" fill="#3b1f09" transform="rotate(-10 13 14)"/>
      <ellipse cx="26" cy="12" rx="3" ry="2" fill="#3b1f09" transform="rotate(5 26 12)"/>
      <ellipse cx="10" cy="26" rx="2.5" ry="2" fill="#3b1f09" transform="rotate(-15 10 26)"/>
      <ellipse cx="24" cy="28" rx="3.5" ry="2.5" fill="#3b1f09" transform="rotate(8 24 28)"/>
      <ellipse cx="19" cy="21" rx="3" ry="2" fill="#3b1f09" transform="rotate(-5 19 21)"/>
    </svg>
  );
}

function DoubleTenFrame({ count, onChange }) {
  const trayRef = useRef(null);

  const handlePointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    const clone = document.createElement('div');
    clone.style.cssText = 'position:fixed;width:32px;height:32px;pointer-events:none;z-index:9999;';
    clone.innerHTML = `<svg width="28" height="28" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#c8854a" stroke="#8B5E3C" stroke-width="1.5"/><ellipse cx="19" cy="21" rx="3" ry="2" fill="#3b1f09"/></svg>`;
    document.body.appendChild(clone);
    const move = (ex, ey) => { clone.style.left = (ex - 16) + 'px'; clone.style.top = (ey - 16) + 'px'; };
    move(e.clientX, e.clientY);
    const onMove = (ev) => {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      if (Math.abs(cx - startX) > 8 || Math.abs(cy - startY) > 8) moved = true;
      move(cx, cy);
    };
    const onUp = (ev) => {
      const cx = ev.changedTouches ? ev.changedTouches[0].clientX : ev.clientX;
      const cy = ev.changedTouches ? ev.changedTouches[0].clientY : ev.clientY;
      clone.remove();
      if (!moved) {
        onChange(Math.min(count + 1, 20));
      } else if (trayRef.current) {
        const rect = trayRef.current.getBoundingClientRect();
        if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) onChange(Math.min(count + 1, 20));
      }
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-center flex-wrap">
        {[1, 5, 10].map(n => (
          <button key={n}
            onPointerDown={n === 1 ? handlePointerDown : undefined}
            onClick={n !== 1 ? () => onChange(Math.min(count + n, 20)) : undefined}
            style={n === 1 ? { touchAction: 'none', userSelect: 'none', cursor: 'grab' } : {}}
            className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100">
            <Cookie size={18} />
            <span className="text-xs font-bold text-amber-700 leading-none">+{n}</span>
          </button>
        ))}
        {count > 0 && (
          <button onClick={() => onChange(0)} className="px-2 py-1 text-xs text-red-400 hover:text-red-600 font-bold">✕ clear</button>
        )}
      </div>
      <div ref={trayRef} className="flex flex-col gap-4 p-2 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50">
        {[0, 1].map(frame => (
          <div key={frame} className="grid gap-1" style={{ gridTemplateColumns: 'repeat(5, 42px)' }}>
            {Array.from({ length: 10 }).map((_, cell) => {
              const idx = frame * 10 + cell;
              const filled = idx < count;
              return filled ? (
                <button key={cell} onClick={() => onChange(count - 1)}
                  style={{ width: 42, height: 42, padding: 0, cursor: 'pointer', background: 'none', border: 'none' }}>
                  <Cookie size={40} />
                </button>
              ) : (
                <div key={cell} style={{ width: 42, height: 42 }}
                  className="rounded border border-dashed border-amber-200 bg-amber-100/30" />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const COMPARISON_LABELS = {
  is_greater_than: 'is greater than',
  is_less_than: 'is less than',
  is_equal_to: 'is equal to',
};

function checkAnswer(count, teacherNumber, comparison) {
  if (comparison === 'is_greater_than') return count > teacherNumber;
  if (comparison === 'is_less_than') return count < teacherNumber;
  if (comparison === 'is_equal_to') return count === teacherNumber;
  return false;
}

export default function RollCompareStudentLesson({ studentNumber, className: classProp, onBack }) {
  const [builtCount, setBuiltCount] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null);
  const [lastRoundKey, setLastRoundKey] = useState(null);

  const { data: lessons = [] } = useQuery({
    queryKey: ['rc-lesson', classProp],
    queryFn: () => base44.entities.RollCompareLesson.filter({ class_name: classProp }),
    refetchInterval: 2000,
  });

  const lesson = lessons[0] || null;

  // Reset when teacher spins a new round
  const roundKey = lesson ? `${lesson.teacher_number}-${lesson.comparison}-${lesson.status}` : null;

  useEffect(() => {
    if (!roundKey || roundKey === lastRoundKey) return;
    setLastRoundKey(roundKey);
    setBuiltCount(0);
    setSubmitted(false);
    setIsCorrect(null);
  }, [roundKey]);

  const handleSubmit = () => {
    if (!lesson || submitted) return;
    const correct = checkAnswer(builtCount, lesson.teacher_number, lesson.comparison);
    setIsCorrect(correct);
    setSubmitted(true);
    new Audio(`/audio/${lesson.comparison}.mp3`).play().catch(() => {});
  };

  const compLabel = lesson?.comparison ? COMPARISON_LABELS[lesson.comparison] : null;

  const playAudioBlob = (src, onDone) => {
    fetch(src)
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = new Audio(url);
        a.onended = () => { URL.revokeObjectURL(url); onDone(); };
        a.onerror = () => { URL.revokeObjectURL(url); onDone(); };
        a.play().catch(onDone);
      })
      .catch(onDone);
  };

  const playFullPrompt = () => {
    if (!lesson?.comparison || !lesson?.teacher_number) return;
    playAudioBlob('/audio/Build_a_set_that.mp3', () => {
      playAudioBlob(`/audio/${lesson.comparison}.mp3`, () => {
        playAudioBlob(`/numbers-audio/${lesson.teacher_number}.mp3`, () => {});
      });
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-200 to-orange-300 flex flex-col items-center py-6 px-3">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="text-amber-900/70 hover:text-amber-900 font-medium">← Back</button>
          <h1 className="text-xl font-black text-amber-900">🍪 Roll & Compare</h1>
          <span className="text-amber-900/50 text-sm">#{studentNumber}</span>
        </div>

        {!lesson || lesson.status === 'waiting' ? (
          <div className="bg-white rounded-3xl p-8 shadow-xl text-center">
            <div className="text-4xl mb-3">⏳</div>
            <p className="text-xl font-bold text-gray-500 animate-pulse">Waiting for teacher…</p>
          </div>
        ) : lesson.status === 'number_set' ? (
          <div className="bg-white rounded-3xl p-8 shadow-xl text-center">
            <p className="text-sm font-bold text-gray-400 uppercase mb-2">Teacher's number</p>
            <div className="text-7xl font-black text-indigo-700 mb-3">{lesson.teacher_number}</div>
            <p className="text-gray-400 animate-pulse mt-3">Waiting for comparison…</p>
          </div>
        ) : (
          <>
            {/* Prompt */}
            <div className="bg-white rounded-3xl p-5 shadow-xl mb-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-3">
                <p className="text-sm font-bold text-gray-400 uppercase">Build a set that…</p>
                <button onClick={playFullPrompt}
                  className="text-indigo-500 hover:text-indigo-700 text-xl" title="Read aloud">🔊</button>
              </div>
              <div className="flex items-center justify-center gap-2 flex-wrap mb-3">
                <button onClick={() => new Audio(`/audio/${lesson.comparison}.mp3`).play().catch(() => {})}
                  className="bg-indigo-600 text-white font-black text-lg px-4 py-2 rounded-2xl shadow hover:bg-indigo-700">
                  🔊 {compLabel}
                </button>
                <span className="bg-amber-100 px-4 py-2 rounded-xl text-2xl font-black text-amber-800">{lesson.teacher_number}</span>
              </div>
            </div>

            {/* Build area */}
            {!submitted && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl p-5 shadow-xl mb-4">
                <p className="text-sm font-bold text-gray-400 uppercase mb-3">Build your cookies</p>
                <DoubleTenFrame count={builtCount} onChange={setBuiltCount} />
                <div className="flex justify-end mt-3">
                  <motion.button whileTap={{ scale: 0.95 }} onClick={handleSubmit}
                    disabled={builtCount === 0}
                    className="bg-indigo-600 text-white font-black text-lg px-6 py-3 rounded-2xl shadow-lg disabled:opacity-40">
                    ✓ Submit
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* Result */}
            <AnimatePresence>
              {submitted && (
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className={`rounded-3xl p-6 shadow-xl text-center ${isCorrect ? 'bg-green-100 border-4 border-green-400' : 'bg-red-100 border-4 border-red-400'}`}>
                  <div className="text-5xl mb-2">{isCorrect ? '🎉' : '🤔'}</div>
                  <p className={`text-2xl font-black ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                    {isCorrect ? 'Correct!' : 'Not quite!'}
                  </p>
                  {!isCorrect && (
                    <p className="text-gray-600 mt-1 font-semibold">
                      Needs to be {compLabel} {lesson.teacher_number}
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}