import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { ArrowLeft } from 'lucide-react';
import StudentLoginShell from './StudentLoginShell';
import { useClassColors } from '@/hooks/useClassColors';

export default function StudentLogin({ onSelectStudent, preselectedClass = null }) {
  const numbers = Array.from({ length: 30 }, (_, i) => i + 1);
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(preselectedClass);
  const [loadingClasses, setLoadingClasses] = useState(!preselectedClass);
  const { colorFor } = useClassColors();

  useEffect(() => {
    const CANONICAL_CLASSES = ['Felix', 'Valero', 'Campos'];
    base44.entities.Student.filter({ school_year: ACTIVE_SCHOOL_YEAR }, '-updated_date', 200).then(students => {
      const unique = [...new Set([...CANONICAL_CLASSES, ...students.map(s => s.class_name).filter(Boolean)])].sort();
      setClasses(unique);
      setLoadingClasses(false);
    });
  }, []);

  const subtitle = !selectedClass ? (
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
  );

  return (
    <StudentLoginShell
      icon="🐸"
      title="Froggy's Letter Sounds"
      titleFrom="#16a34a"
      titleTo="#10b981"
      subtitle={subtitle}
      toggleTo="/MathGames"
      toggleLabel="Math Games"
      toggleEmoji="🧮"
      toggleTextClass="text-indigo-700"
      toggleBorderClass="border-indigo-200"
      loading={!selectedClass && loadingClasses}
    >
      {!selectedClass ? (
        classes.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <p className="text-lg font-semibold">No classes set up yet.</p>
            <p className="text-sm mt-1">Ask your teacher to set up classes in the dashboard first.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:gap-5">
            {classes.map((cls, i) => {
              const c = colorFor(cls);
              return (
                <motion.button
                  key={cls}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.06 }}
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedClass(cls)}
                  className="group relative aspect-square sm:aspect-[4/3] rounded-3xl text-white font-extrabold text-xl sm:text-3xl shadow-xl ring-2 ring-white/40 transition"
                  style={{ backgroundImage: `linear-gradient(to bottom right, ${c.from}, ${c.to})` }}
                >
                  <span className="absolute top-2 left-3 text-xl sm:text-2xl opacity-70 group-hover:opacity-100 transition">🌿</span>
                  <span className="relative z-10">{cls}</span>
                </motion.button>
              );
            })}
          </div>
        )
      ) : (
        <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-10 gap-2.5 sm:gap-3">
          {numbers.map((num, i) => {
            const c = colorFor(selectedClass);
            return (
              <motion.button
                key={num}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(i * 0.015, 0.4) }}
                whileHover={{ scale: 1.12, y: -2 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => onSelectStudent({ number: num, class_name: selectedClass })}
                className="aspect-square rounded-2xl text-white font-extrabold text-xl sm:text-2xl shadow-lg ring-1 ring-white/30"
                style={{ backgroundImage: `linear-gradient(to bottom right, ${c.from}, ${c.to})` }}
              >
                {num}
              </motion.button>
            );
          })}
        </div>
      )}
    </StudentLoginShell>
  );
}