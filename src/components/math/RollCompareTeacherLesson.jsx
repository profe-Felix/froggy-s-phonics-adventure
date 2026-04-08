import { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';

function SlotRoller({ items, onResult, label }) {
  const [spinning, setSpinning] = useState(false);
  const [display, setDisplay] = useState('?');
  const [done, setDone] = useState(false);
  const intervalRef = useRef(null);

  const spin = () => {
    if (spinning || done) return;
    setSpinning(true);
    let count = 0;
    const total = 18 + Math.floor(Math.random() * 8);
    intervalRef.current = setInterval(() => {
      setDisplay(items[Math.floor(Math.random() * items.length)]);
      count++;
      if (count >= total) {
        clearInterval(intervalRef.current);
        const result = items[Math.floor(Math.random() * items.length)];
        setDisplay(result);
        setSpinning(false);
        setDone(true);
        onResult(result);
      }
    }, 80);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm font-bold text-white/70 uppercase tracking-wide">{label}</p>
      <motion.div
        animate={spinning ? { scale: [1, 1.05, 0.97, 1.03, 1] } : {}}
        transition={{ repeat: Infinity, duration: 0.2 }}
        className={`w-36 min-h-[5rem] px-4 py-4 rounded-2xl shadow-2xl border-4 flex items-center justify-center text-2xl font-black text-center transition-colors
          ${done ? 'border-green-400 bg-green-50 text-green-700' : spinning ? 'border-amber-300 bg-amber-50 text-amber-600' : 'border-white/40 bg-white text-indigo-700'}`}
      >
        {display}
      </motion.div>
      {!done && (
        <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.05 }}
          onClick={spin} disabled={spinning}
          className="bg-white text-indigo-700 font-black text-lg px-6 py-3 rounded-2xl shadow-lg disabled:opacity-50">
          {spinning ? '🎰 Spinning…' : '🎰 Spin!'}
        </motion.button>
      )}
    </div>
  );
}

function TenFrameGrid({ filled }) {
  return (
    <div className="inline-grid p-1.5 rounded-lg border-2 border-white/50 bg-white/10" style={{ gridTemplateColumns: 'repeat(5, 24px)', gap: 3 }}>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} style={{ width: 24, height: 24 }}
          className={`rounded border ${i < filled ? 'bg-amber-300 border-amber-500' : 'border-dashed border-white/30 bg-white/10'}`} />
      ))}
    </div>
  );
}

function DoubleTenFrameDisplay({ count }) {
  return (
    <div className="flex gap-3">
      <TenFrameGrid filled={Math.min(count, 10)} />
      <TenFrameGrid filled={Math.max(0, count - 10)} />
    </div>
  );
}

const NUMBER_ITEMS = Array.from({ length: 12 }, (_, i) => i + 9); // 9–20
const COMPARISON_ITEMS = ['is greater than', 'is less than', 'is equal to'];
const COMPARISON_MAP = {
  'is greater than': 'is_greater_than',
  'is less than': 'is_less_than',
  'is equal to': 'is_equal_to',
};

export default function RollCompareTeacherLesson({ className: classProp, onBack }) {
  const [lesson, setLesson] = useState(null);
  const [roundKey, setRoundKey] = useState(0);
  const [numberDone, setNumberDone] = useState(false);
  const [compDone, setCompDone] = useState(false);

  const { data: lessons = [], refetch } = useQuery({
    queryKey: ['rc-lesson', classProp],
    queryFn: () => base44.entities.RollCompareLesson.filter({ class_name: classProp }),
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (lessons.length > 0) setLesson(lessons[0]);
  }, [lessons]);

  const ensureLesson = async () => {
    if (lesson) return lesson;
    const l = await base44.entities.RollCompareLesson.create({ class_name: classProp, status: 'waiting' });
    setLesson(l);
    return l;
  };

  const handleNumberResult = async (num) => {
    setNumberDone(true);
    const l = await ensureLesson();
    const updated = await base44.entities.RollCompareLesson.update(l.id, { teacher_number: num, status: 'number_set', comparison: null });
    setLesson(updated);
  };

  const handleComparisonResult = async (label) => {
    setCompDone(true);
    const value = COMPARISON_MAP[label];
    const updated = await base44.entities.RollCompareLesson.update(lesson.id, { comparison: value, status: 'building' });
    setLesson(updated);
    // play audio
    new Audio(`/audio/${value}.mp3`).play().catch(() => {});
  };

  const handleReset = async () => {
    if (lesson) await base44.entities.RollCompareLesson.update(lesson.id, { teacher_number: null, comparison: null, ready_students: [], status: 'waiting' });
    setNumberDone(false);
    setCompDone(false);
    setRoundKey(k => k + 1);
    refetch();
  };

  const compLabel = lesson?.comparison
    ? COMPARISON_ITEMS.find(i => COMPARISON_MAP[i] === lesson.comparison) || lesson.comparison
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-600 to-purple-700 flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="text-white/70 hover:text-white font-medium">← Back</button>
          <h1 className="text-2xl font-black text-white">🍪 Roll & Compare — Teacher</h1>
          <span className="text-white/50 text-sm">{classProp}</span>
        </div>

        {/* Summary banner when both set */}
        {lesson?.status === 'building' && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white/20 rounded-2xl p-4 mb-6 text-center text-white text-xl font-black">
            Build a number that {compLabel} <span className="bg-white text-indigo-700 px-2 py-0.5 rounded-xl">{lesson.teacher_number}</span>
            <div className="mt-3 flex justify-center gap-4">
              <div className="bg-white/30 rounded-xl px-4 py-2">
                <p className="text-sm text-white/80">Students Ready</p>
                <p className="text-3xl font-black text-white">{lesson.ready_students?.length || 0}</p>
              </div>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Number spinner */}
          <div className="bg-white/10 rounded-3xl p-6 flex flex-col items-center gap-4">
            <SlotRoller
              key={`num-${roundKey}`}
              items={NUMBER_ITEMS}
              label="Spin a Number"
              onResult={handleNumberResult}
            />
            {numberDone && lesson?.teacher_number && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-white/70 text-sm">Number set to <strong className="text-white">{lesson.teacher_number}</strong></p>
                <DoubleTenFrameDisplay count={lesson.teacher_number} />
              </div>
            )}
          </div>

          {/* Comparison spinner */}
          <div className={`bg-white/10 rounded-3xl p-6 flex flex-col items-center gap-4 transition-opacity ${numberDone ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
            <SlotRoller
              key={`comp-${roundKey}`}
              items={COMPARISON_ITEMS}
              label="Spin a Comparison"
              onResult={handleComparisonResult}
            />
            {compDone && compLabel && (
              <p className="text-white/70 text-sm">Students build a set that <strong className="text-white">{compLabel} {lesson.teacher_number}</strong></p>
            )}
          </div>
        </div>

        {/* Status indicator */}
        {lesson?.status === 'building' && (lesson.ready_students?.length || 0) > 0 && (
          <div className="flex justify-center mt-4 gap-3">
            <motion.button whileTap={{ scale: 0.95 }} onClick={handleReset}
              className="bg-green-500 hover:bg-green-600 text-white font-bold text-lg px-8 py-4 rounded-2xl shadow-lg">
              ✓ All Ready - Next
            </motion.button>
          </div>
        )}

        <div className="flex justify-center mt-8">
          <motion.button whileTap={{ scale: 0.95 }} onClick={handleReset}
            className="bg-white/20 hover:bg-white/30 text-white font-bold text-lg px-8 py-4 rounded-2xl border border-white/30">
            🔄 New Round
          </motion.button>
        </div>
      </div>
    </div>
  );
}