import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import StudentLoginShell from './StudentLoginShell';
import { useClassColors } from '@/hooks/useClassColors';

const GRADE_LABELS = { kinder: 'Kinder', first: '1st Grade' };

export default function StudentLogin({ onSelectStudent, preselectedClass = null }) {
  const numbers = Array.from({ length: 30 }, (_, i) => i + 1);
  const [selectedClass, setSelectedClass] = useState(preselectedClass);
  const { colorFor, groupedClasses, loading } = useClassColors();
  const groups = groupedClasses();
  const noClasses = Object.values(groups).every((g) => g.length === 0);

  // Fetch student records for the selected class so we can show login photos
  // (set by teachers via PrintPro URL paste or direct upload) instead of numbers.
  const { data: classStudents = [] } = useQuery({
    queryKey: ['login-students', selectedClass],
    queryFn: () => base44.entities.Student.filter({ class_name: selectedClass, school_year: ACTIVE_SCHOOL_YEAR }),
    enabled: !!selectedClass,
  });
  const photoByNumber = new Map(
    classStudents.filter(s => s.photo_url).map(s => [s.student_number, s.photo_url])
  );

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
      loading={!selectedClass && loading}
    >
      {!selectedClass ? (
        noClasses ? (
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
                          <span className="absolute top-2 left-3 text-lg sm:text-xl opacity-70 group-hover:opacity-100 transition">🌿</span>
                          <span className="relative z-10">{cls}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              ) : null
            )}
          </div>
        )
      ) : (
        <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-10 gap-2.5 sm:gap-3">
          {numbers.map((num, i) => {
            const c = colorFor(selectedClass);
            const photo = photoByNumber.get(num);
            return (
              <motion.button
                key={num}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(i * 0.015, 0.4) }}
                whileHover={{ scale: 1.12, y: -2 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => onSelectStudent({ number: num, class_name: selectedClass })}
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
      )}
    </StudentLoginShell>
  );
}