import { useState } from 'react';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

/**
 * Shows a grid of students for an assessment template.
 * Clicking a student opens their record.
 */
export default function AssessmentStudentGrid({ template, className, students, onSelectStudent, onBack }) {
  const [tagFilter, setTagFilter] = useState('all');

  // Fetch all records for this template
  const { data: records = [] } = useQuery({
    queryKey: ['assessment-records', template.id],
    queryFn: () => base44.entities.AssessmentRecord.filter({ template_id: template.id, class_name: className }),
    refetchInterval: 10000,
  });

  // Collect all tags from students in this class
  const allTags = ['all', ...new Set(students.flatMap(s => s.tags || []))];

  const filteredStudents = tagFilter === 'all'
    ? students
    : students.filter(s => (s.tags || []).includes(tagFilter));

  const getStudentRecord = (studentNumber) =>
    records.find(r => r.student_number === studentNumber);

  const getOrCreateRecord = async (studentNumber) => {
    const existing = getStudentRecord(studentNumber);
    if (existing) return existing;
    const newRec = await base44.entities.AssessmentRecord.create({
      template_id: template.id,
      student_number: studentNumber,
      class_name: className,
      strokes_by_page: {},
      session_number: 1,
    });
    return newRec;
  };

  return (
    <div className="flex flex-col h-full" style={{ background: '#0f0f1a', color: 'white' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ background: '#1a1a2e', borderBottom: '2px solid #4338ca' }}>
        <button onClick={onBack} className="text-indigo-300 hover:text-white font-bold text-sm">← Back</button>
        <div className="flex-1">
          <p className="font-black text-white text-base">{template.title}</p>
          <p className="text-indigo-400 text-xs">Class {className} · {filteredStudents.length} students</p>
        </div>
      </div>

      {/* Tag filter */}
      {allTags.length > 1 && (
        <div className="flex gap-2 px-4 py-2 overflow-x-auto shrink-0" style={{ borderBottom: '1px solid #2d2d5e' }}>
          {allTags.map(tag => (
            <button key={tag} onClick={() => setTagFilter(tag)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all
                ${tagFilter === tag ? 'bg-indigo-600 text-white' : 'text-indigo-400 border border-indigo-700 hover:border-indigo-500'}`}>
              {tag === 'all' ? '👥 All' : tag}
            </button>
          ))}
        </div>
      )}

      {/* Student grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {filteredStudents.map(student => {
            const rec = getStudentRecord(student.student_number);
            const hasWork = rec && rec.strokes_by_page && Object.keys(rec.strokes_by_page).length > 0;
            const snapCount = rec?.snapshots?.length || 0;

            return (
              <motion.button
                key={student.student_number}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileTap={{ scale: 0.95 }}
                onClick={async () => {
                  const r = await getOrCreateRecord(student.student_number);
                  onSelectStudent(student, r);
                }}
                className="rounded-2xl p-3 flex flex-col items-center gap-2 transition-all hover:scale-105"
                style={{ background: '#1a1a2e', border: `2px solid ${hasWork ? '#4338ca' : '#2d2d5e'}` }}>
                <div className="w-12 h-12 rounded-full flex items-center justify-center font-black text-white text-xl"
                  style={{ background: hasWork ? '#4338ca' : '#374151' }}>
                  {student.student_number}
                </div>
                {student.name && <p className="text-white text-xs font-bold text-center truncate w-full">{student.name}</p>}
                <div className="flex flex-col items-center gap-0.5">
                  {snapCount > 0 && (
                    <span className="text-green-400 text-xs font-bold">✅ {snapCount} saved</span>
                  )}
                  {hasWork && !snapCount && (
                    <span className="text-indigo-400 text-xs">In progress</span>
                  )}
                  {!hasWork && !snapCount && (
                    <span className="text-gray-600 text-xs">Not started</span>
                  )}
                  {(student.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-0.5 justify-center mt-0.5">
                      {(student.tags || []).slice(0, 2).map(tag => (
                        <span key={tag} className="text-indigo-400 text-xs px-1 rounded"
                          style={{ background: '#1e1b4b', fontSize: 9 }}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}