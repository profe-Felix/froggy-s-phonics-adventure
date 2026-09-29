import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { useClassNames } from '@/hooks/useClassNames';
import { useClassColors } from '@/hooks/useClassColors';
import StudentLoginShell from '@/components/game/StudentLoginShell';
import CreandoOraciones from '@/components/sentence/CreandoOraciones';
import { ArrowLeft } from 'lucide-react';

const GRADE_LABELS = { kinder: 'Kinder', first: '1st Grade' };
const CLASS_MAP = {
  'felix': 'Felix', 'f': 'Felix', 'schwarz': 'Schwarz',
  'gutierrez': 'Gutierrez', 'valero': 'Valero', 'v': 'Valero',
  'mendez': 'Mendez', 'campos': 'Campos', 'c': 'Campos', 'aguirre': 'Aguirre',
};

function parseClass(raw, classList) {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (CLASS_MAP[lower]) return CLASS_MAP[lower];
  const match = classList.find(c => c.toLowerCase() === lower);
  return match || raw.charAt(0).toUpperCase() + raw.slice(1);
}

export default function CreandoOracionesPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const rawClass = urlParams.get('class') || urlParams.get('className');
  const numberFromUrl = urlParams.get('number') || urlParams.get('studentNumber');
  const studentNumber = numberFromUrl ? parseInt(numberFromUrl) : null;
  const { classList } = useClassNames();
  const className = parseClass(rawClass, classList || []);
  const [selectedClass, setSelectedClass] = useState(className || null);
  const [selectedNumber, setSelectedNumber] = useState(studentNumber || null);

  // Get student name for the Nombre line
  const { data: students = [] } = useQuery({
    queryKey: ['sentence-students', selectedClass],
    queryFn: () => base44.entities.Student.filter({ class_name: selectedClass, school_year: ACTIVE_SCHOOL_YEAR }),
    enabled: !!selectedClass,
  });
  const student = students.find(s => s.student_number === selectedNumber);
  const studentName = student?.name || '';

  const { colorFor, groupedClasses, loading: colorsLoading } = useClassColors();
  const groups = groupedClasses();

  // If class + number are set, show the activity
  if (selectedClass && selectedNumber) {
    return (
      <CreandoOraciones
        studentNumber={selectedNumber}
        className={selectedClass}
        studentName={studentName}
        onBack={() => {
          setSelectedNumber(null);
          const params = new URLSearchParams(window.location.search);
          params.delete('number');
          window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
        }}
      />
    );
  }

  // Login screen — class picker then number grid
  const subtitle = !selectedClass ? (
    '¡Elige tu clase!'
  ) : (
    <span className="inline-flex items-center gap-2">
      <button onClick={() => setSelectedClass(null)} className="text-slate-400 hover:text-slate-600">
        <ArrowLeft className="w-5 h-5" />
      </button>
      Clase <strong className="text-slate-700">{selectedClass}</strong> — elige tu número
    </span>
  );

  return (
    <StudentLoginShell
      icon="✏️"
      title="Creando oraciones"
      titleFrom="#ec4899"
      titleTo="#14b8a6"
      subtitle={subtitle}
      loading={!selectedClass && colorsLoading}
    >
      {!selectedClass ? (
        <div className="flex flex-col gap-6">
          {['kinder', 'first'].map(grade =>
            groups[grade]?.length ? (
              <div key={grade}>
                <h2 className="text-center text-slate-500 font-extrabold text-lg mb-3">{GRADE_LABELS[grade]}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                  {groups[grade].map((cls) => {
                    const c = colorFor(cls);
                    return (
                      <button
                        key={cls}
                        onClick={() => setSelectedClass(cls)}
                        className="aspect-square rounded-2xl p-4 flex flex-col items-center justify-center gap-2 shadow-md hover:scale-105 transition-transform"
                        style={{ background: `hsl(${c || '200 80% 90%'})` }}
                      >
                        <span className="text-3xl">✏️</span>
                        <span className="font-bold text-slate-700">{cls}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null
          )}
        </div>
      ) : (
        <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-10 gap-2 sm:gap-3">
          {Array.from({ length: 30 }, (_, i) => i + 1).map((num) => (
            <button
              key={num}
              onClick={() => {
                setSelectedNumber(num);
                const params = new URLSearchParams(window.location.search);
                params.set('class', selectedClass);
                params.set('number', String(num));
                window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
              }}
              className="aspect-square rounded-xl text-xl font-black shadow-md hover:scale-110 transition-transform"
              style={{ background: '#fff', border: '3px solid #e2e8f0', color: '#334155' }}
            >
              {num}
            </button>
          ))}
        </div>
      )}
    </StudentLoginShell>
  );
}