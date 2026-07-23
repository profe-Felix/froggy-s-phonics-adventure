import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function StudentLogin({ onSelectStudent, preselectedClass = null }) {
  const numbers = Array.from({ length: 30 }, (_, i) => i + 1);
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(preselectedClass);
  const [loadingClasses, setLoadingClasses] = useState(!preselectedClass);
  const navigate = useNavigate();

  useEffect(() => {
    const CANONICAL_CLASSES = ['Felix', 'Valero', 'Campos'];
    base44.entities.Student.filter({ school_year: ACTIVE_SCHOOL_YEAR }, '-updated_date', 200).then(students => {
      const unique = [...new Set([...CANONICAL_CLASSES, ...students.map(s => s.class_name).filter(Boolean)])].sort();
      setClasses(unique);
      setLoadingClasses(false);
    });
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-sky-400 via-sky-200 to-green-300 flex items-center justify-center p-4 sm:p-6">
      {/* decorative floating bubbles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {[
          { pos: 'top-10 left-8', s: 56 },
          { pos: 'top-1/4 right-12', s: 84 },
          { pos: 'bottom-20 left-16', s: 70 },
          { pos: 'bottom-1/3 right-10', s: 48 },
          { pos: 'top-1/2 left-1/4', s: 40 },
        ].map((b, i) => (
          <motion.div
            key={i}
            className={`absolute ${b.pos} rounded-full bg-white/25 blur-[1px]`}
            style={{ width: `${b.s}px`, height: `${b.s}px` }}
            animate={{ y: [0, -14, 0] }}
            transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>

      {/* Math Games toggle */}
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => navigate('/MathGames')}
          className="bg-white/90 hover:bg-white text-indigo-700 font-bold text-sm px-5 py-2.5 rounded-full shadow-lg border border-indigo-200 transition-all hover:scale-105"
        >
          🧮 Math Games →
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 16 }}
        className="relative z-10 w-full max-w-3xl"
      >
        <div className="bg-white/90 backdrop-blur rounded-[2.5rem] shadow-2xl ring-1 ring-white/60 px-6 py-8 sm:px-12 sm:py-12">
          {/* Hero */}
          <div className="text-center mb-8">
            <motion.div
              animate={{ y: [0, -12, 0], rotate: [0, -3, 3, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="text-7xl sm:text-8xl mb-3 drop-shadow-md"
            >
              🐸
            </motion.div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-none">
              <span className="bg-gradient-to-r from-green-600 to-emerald-500 bg-clip-text text-transparent">
                Froggy's Letter Sounds
              </span>
            </h1>
            <p className="mt-3 text-base sm:text-xl text-slate-500 font-medium">
              {!selectedClass ? (
                'Choose your class!'
              ) : (
                <span className="inline-flex items-center gap-2">
                  {!preselectedClass && (
                    <button onClick={() => setSelectedClass(null)} className="text-slate-400 hover:text-slate-600 transition" aria-label="back">
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                  )}
                  Class <strong className="text-slate-700">{selectedClass}</strong> — pick your number!
                </span>
              )}
            </p>
          </div>

          {!selectedClass ? (
            loadingClasses ? (
              <div className="flex justify-center py-10">
                <div className="w-10 h-10 border-4 border-green-200 border-t-green-500 rounded-full animate-spin"></div>
              </div>
            ) : classes.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <p className="text-lg font-semibold">No classes set up yet.</p>
                <p className="text-sm mt-1">Ask your teacher to set up classes in the dashboard first.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:gap-5">
                {classes.map((cls, i) => (
                  <motion.button
                    key={cls}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.06 }}
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedClass(cls)}
                    className="group relative aspect-square sm:aspect-[4/3] rounded-3xl bg-gradient-to-br from-green-400 to-emerald-600 text-white font-extrabold text-xl sm:text-3xl shadow-xl ring-2 ring-white/40 hover:from-green-500 hover:to-emerald-700 transition-colors"
                  >
                    <span className="absolute top-2 left-3 text-xl sm:text-2xl opacity-70 group-hover:opacity-100 transition">🌿</span>
                    <span className="relative z-10">{cls}</span>
                  </motion.button>
                ))}
              </div>
            )
          ) : (
            <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-10 gap-2.5 sm:gap-3">
              {numbers.map((num, i) => (
                <motion.button
                  key={num}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: Math.min(i * 0.015, 0.4) }}
                  whileHover={{ scale: 1.12, y: -2 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => onSelectStudent({ number: num, class_name: selectedClass })}
                  className="aspect-square rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 text-white font-extrabold text-xl sm:text-2xl shadow-lg ring-1 ring-white/30 hover:from-green-600 hover:to-emerald-600 transition-colors"
                >
                  {num}
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}