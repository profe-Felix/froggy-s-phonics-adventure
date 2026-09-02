import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, Pencil } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { useClassColors } from '@/hooks/useClassColors';

const GRADE_LABELS = { kinder: 'Kinder', first: '1st Grade' };
const NUMBERS = Array.from({ length: 30 }, (_, i) => i + 1);

const BUBBLES = [
  { pos: 'top-10 left-8', s: 56 },
  { pos: 'top-1/4 right-12', s: 84 },
  { pos: 'bottom-20 left-16', s: 70 },
  { pos: 'bottom-1/3 right-10', s: 48 },
];

function Shell({ subtitle, children, loading }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-violet-400 via-violet-200 to-fuchsia-200 flex items-center justify-center p-4 sm:p-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {BUBBLES.map((b, i) => (
          <motion.div
            key={i}
            className={`absolute ${b.pos} rounded-full bg-white/25 blur-[1px]`}
            style={{ width: `${b.s}px`, height: `${b.s}px` }}
            animate={{ y: [0, -14, 0] }}
            transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 16 }}
        className="relative z-10 w-full max-w-3xl"
      >
        <div className="bg-white/90 backdrop-blur rounded-[2.5rem] shadow-2xl ring-1 ring-white/60 px-6 py-8 sm:px-12 sm:py-12">
          <div className="text-center mb-5 sm:mb-6">
            <motion.div
              animate={{ y: [0, -12, 0], rotate: [0, -3, 3, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="text-7xl sm:text-8xl mb-3 drop-shadow-md"
            >
              📝
            </motion.div>
            <h1 className="text-xl sm:text-4xl font-extrabold tracking-tight leading-none">
              <span
                style={{
                  backgroundImage: 'linear-gradient(to right, #7c3aed, #c026d3)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Dictation
              </span>
            </h1>
            <p className="mt-1.5 sm:mt-2 text-base sm:text-xl text-slate-500 font-medium">
              {subtitle}
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-10 h-10 border-4 border-violet-200 border-t-violet-500 rounded-full animate-spin" />
            </div>
          ) : (
            children
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function DictationLogin({ onStart }) {
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedNumber, setSelectedNumber] = useState(null);
  const { colorFor, groupedClasses, loading } = useClassColors();
  const groups = groupedClasses();
  const noClasses = Object.values(groups).every((g) => g.length === 0);

  const { data: classStudents = [] } = useQuery({
    queryKey: ['login-students', selectedClass],
    queryFn: () => base44.entities.Student.filter({ class_name: selectedClass, school_year: ACTIVE_SCHOOL_YEAR }),
    enabled: !!selectedClass,
  });
  const photoByNumber = new Map(
    classStudents.filter((s) => s.photo_url).map((s) => [s.student_number, s.photo_url])
  );

  const { data: assignments = [] } = useQuery({
    queryKey: ['dictation-assignments', selectedClass],
    queryFn: () =>
      base44.entities.DictationAssignment.filter({
        class_name: selectedClass,
        school_year: ACTIVE_SCHOOL_YEAR,
        status: 'active',
      }),
    enabled: !!selectedClass,
  });

  // ── Step 3: Assignment cards ──
  if (selectedClass && selectedNumber) {
    return (
      <Shell
        subtitle={
          <span className="inline-flex items-center gap-2">
            <button
              onClick={() => setSelectedNumber(null)}
              className="text-slate-400 hover:text-slate-600 transition"
              aria-label="back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            Class <strong className="text-slate-700">{selectedClass}</strong> · #{selectedNumber} — pick your assignment!
          </span>
        }
      >
        {assignments.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <p className="text-lg font-semibold">No active assignments yet.</p>
            <p className="text-sm mt-1">Ask your teacher to post a dictation assignment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {assignments.map((a, i) => (
              <motion.button
                key={a.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => onStart({ class_name: selectedClass, studentNumber: selectedNumber, assignmentId: a.id, assignmentTitle: a.title, promptText: a.prompt_text })}
                className="group relative rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white p-5 shadow-xl ring-2 ring-white/40 text-left flex items-center gap-4"
              >
                <div className="text-4xl">✏️</div>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-lg truncate">{a.title}</div>
                  {a.prompt_text && (
                    <div className="text-sm text-white/80 truncate">{a.prompt_text}</div>
                  )}
                </div>
                <Pencil className="w-5 h-5 opacity-60 group-hover:opacity-100 transition" />
              </motion.button>
            ))}
          </div>
        )}
      </Shell>
    );
  }

  // ── Step 2: Student number photo tiles ──
  if (selectedClass) {
    const c = colorFor(selectedClass);
    return (
      <Shell
        subtitle={
          <span className="inline-flex items-center gap-2">
            <button
              onClick={() => setSelectedClass(null)}
              className="text-slate-400 hover:text-slate-600 transition"
              aria-label="back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            Class <strong className="text-slate-700">{selectedClass}</strong> — pick your number!
          </span>
        }
      >
        <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-10 gap-2.5 sm:gap-3">
          {NUMBERS.map((num, i) => {
            const photo = photoByNumber.get(num);
            return (
              <motion.button
                key={num}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(i * 0.015, 0.4) }}
                whileHover={{ scale: 1.12, y: -2 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => setSelectedNumber(num)}
                className="relative aspect-square rounded-2xl text-white font-extrabold text-xl sm:text-2xl shadow-lg ring-1 ring-white/30 overflow-hidden"
                style={{ backgroundImage: `linear-gradient(to bottom right, ${c.from}, ${c.to})` }}
              >
                {photo ? (
                  <>
                    <img src={photo} alt={`${num}`} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                    <span className="absolute bottom-0.5 right-1 text-[10px] sm:text-xs font-black bg-black/45 px-1.5 py-0.5 rounded-md leading-none">{num}</span>
                  </>
                ) : (
                  <span className="relative z-10">{num}</span>
                )}
              </motion.button>
            );
          })}
        </div>
      </Shell>
    );
  }

  // ── Step 1: Class tiles ──
  return (
    <Shell subtitle="Choose your class!" loading={!selectedClass && loading}>
      {noClasses ? (
        <div className="text-center py-10 text-slate-400">
          <p className="text-lg font-semibold">No classes set up yet.</p>
          <p className="text-sm mt-1">Ask your teacher to set up classes in the dashboard first.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {['kinder', 'first'].map((grade) =>
            groups[grade]?.length ? (
              <div key={grade}>
                <h2 className="text-center text-slate-500 font-extrabold text-lg mb-3">{GRADE_LABELS[grade]}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                  {groups[grade].map((cls, i) => {
                    const c = colorFor(cls);
                    return (
                      <motion.button
                        key={cls}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                        whileHover={{ scale: 1.06 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setSelectedClass(cls)}
                        className="group relative aspect-square sm:aspect-[4/3] rounded-3xl text-white font-extrabold text-lg sm:text-2xl shadow-xl ring-2 ring-white/40"
                        style={{ backgroundImage: `linear-gradient(to bottom right, ${c.from}, ${c.to})` }}
                      >
                        <span className="absolute top-2 left-3 text-lg sm:text-xl opacity-70 group-hover:opacity-100 transition">📝</span>
                        <span className="relative z-10">{cls}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            ) : null
          )}
        </div>
      )}
    </Shell>
  );
}