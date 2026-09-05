import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useClassNames } from '@/hooks/useClassNames';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { LETTER_WAYPOINTS } from '@/components/data/letterWaypoints';
import NameTracingReplayModal from '@/components/tracing/NameTracingReplayModal';
import { Link } from 'react-router-dom';
import { ArrowLeft, Eye, User } from 'lucide-react';

// Teacher dashboard for Name Tracing:
//  - Toggle first-only vs first+last name per class (saved to ClassConfig)
//  - View each student's dot-only attempts with animated playback
export default function NameTracingReview() {
  const { classList } = useClassNames();
  const queryClient = useQueryClient();
  const [selectedClass, setSelectedClass] = useState('');
  const [nameMode, setNameMode] = useState('first_only');
  const [replayStudent, setReplayStudent] = useState(null);

  useEffect(() => {
    if (!selectedClass && classList.length) setSelectedClass(classList[0]);
  }, [classList]);

  // Load class config for the toggle
  const { data: classConfigs = [] } = useQuery({
    queryKey: ['class-config', selectedClass],
    queryFn: () => base44.entities.ClassConfig.filter({ class_name: selectedClass }),
    enabled: !!selectedClass,
  });

  useEffect(() => {
    if (classConfigs?.length) {
      setNameMode(classConfigs[0].name_tracing_mode || 'first_only');
    }
  }, [classConfigs]);

  const { data: students = [] } = useQuery({
    queryKey: ['students', selectedClass],
    queryFn: () => base44.entities.Student.filter({ class_name: selectedClass, school_year: ACTIVE_SCHOOL_YEAR }),
    enabled: !!selectedClass,
  });

  // Load all name-tracing samples for this class to count attempts per student
  const { data: samples = [] } = useQuery({
    queryKey: ['name-tracing-samples', selectedClass],
    queryFn: () => base44.entities.TracingSample.filter(
      { class_name: selectedClass, mode: 'dot_only', size_label: 'Name' },
      '-created_date', 500
    ),
    enabled: !!selectedClass,
  });

  const samplesByStudent = {};
  for (const s of samples || []) {
    if (!samplesByStudent[s.student_number]) samplesByStudent[s.student_number] = [];
    samplesByStudent[s.student_number].push(s);
  }

  const handleToggleMode = async (mode) => {
    setNameMode(mode);
    if (classConfigs?.length) {
      await base44.entities.ClassConfig.update(classConfigs[0].id, { name_tracing_mode: mode });
    } else if (selectedClass) {
      await base44.entities.ClassConfig.create({ class_name: selectedClass, name_tracing_mode: mode });
    }
    queryClient.invalidateQueries({ queryKey: ['class-config', selectedClass] });
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-black text-slate-800">✏️ Name Tracing Review</h1>
          <Link to="/TracingReview" className="text-indigo-600 hover:underline text-sm font-bold flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Letter Tracing Review
          </Link>
        </div>

        {/* Class selector + name mode toggle */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Class</label>
              <select
                value={selectedClass}
                onChange={e => setSelectedClass(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm font-bold"
              >
                {classList.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Name scope</label>
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                <button
                  onClick={() => handleToggleMode('first_only')}
                  className={`px-4 py-1.5 rounded-md text-sm font-bold transition ${nameMode === 'first_only' ? 'bg-white text-indigo-600 shadow' : 'text-slate-500'}`}
                >
                  First name only
                </button>
                <button
                  onClick={() => handleToggleMode('first_last')}
                  className={`px-4 py-1.5 rounded-md text-sm font-bold transition ${nameMode === 'first_last' ? 'bg-white text-indigo-600 shadow' : 'text-slate-500'}`}
                >
                  First + Last name
                </button>
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {nameMode === 'first_only'
              ? 'Students trace just their first name.'
              : 'Students trace their first name and last name on separate lines.'}
          </p>
        </div>

        {/* Student grid */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-100 border-b font-bold text-xs text-slate-500 uppercase">
            <div className="col-span-1">#</div>
            <div className="col-span-4">Name</div>
            <div className="col-span-3">Name part(s)</div>
            <div className="col-span-2">Attempts</div>
            <div className="col-span-2">View</div>
          </div>
          {students.length === 0 ? (
            <div className="px-3 py-6 text-center text-slate-400 text-sm">No students in this class.</div>
          ) : students.map(s => {
            const studentSamples = samplesByStudent[s.student_number] || [];
            const nameParts = s.name ? s.name.trim().split(/\s+/) : [];
            const partsLabel = nameMode === 'first_last' && nameParts.length >= 2
              ? `${nameParts[0]} · ${nameParts.slice(1).join(' ')}`
              : nameParts[0] || '—';
            return (
              <div key={s.id} className="grid grid-cols-12 gap-2 px-3 py-2 border-b last:border-0 items-center text-sm">
                <div className="col-span-1 font-bold text-slate-600">{s.student_number}</div>
                <div className="col-span-4 font-bold text-slate-700 truncate">{s.name || `Student ${s.student_number}`}</div>
                <div className="col-span-3 text-slate-500 text-xs font-bold truncate">{partsLabel}</div>
                <div className="col-span-2 text-slate-500 font-bold">
                  {studentSamples.length > 0 ? `${studentSamples.length} saved` : '—'}
                </div>
                <div className="col-span-2">
                  <button
                    onClick={() => setReplayStudent(s)}
                    disabled={studentSamples.length === 0}
                    className={`text-xs font-bold flex items-center gap-1 disabled:opacity-30 ${studentSamples.length > 0 ? 'text-indigo-600 hover:text-indigo-800' : 'text-slate-400'}`}
                  >
                    <Eye className="w-3.5 h-3.5" /> {studentSamples.length > 0 ? 'View' : 'None'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {replayStudent && (
        <NameTracingReplayModal
          studentNumber={replayStudent.student_number}
          className={selectedClass}
          studentName={replayStudent.name}
          waypoints={LETTER_WAYPOINTS}
          onClose={() => setReplayStudent(null)}
        />
      )}
    </div>
  );
}