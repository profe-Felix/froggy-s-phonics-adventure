import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import BackButton from '@/components/ui/BackButton';
import DictationThumbnail from '@/components/dictation/DictationThumbnail';
import DictationReplay from '@/components/dictation/DictationReplay';

export default function DictationDashboard({ onBack }) {
  const qc = useQueryClient();
  const [className, setClassName] = useState(null);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [replaySubmission, setReplaySubmission] = useState(null);

  const { data: classConfigs = [] } = useQuery({
    queryKey: ['class-configs'],
    queryFn: () => base44.entities.ClassConfig.list(),
  });
  const classNames = classConfigs.map((c) => c.class_name).filter(Boolean);

  const { data: assignments = [] } = useQuery({
    queryKey: ['dictation-assignments', className],
    queryFn: () =>
      base44.entities.DictationAssignment.filter({
        class_name: className,
        school_year: ACTIVE_SCHOOL_YEAR,
      }),
    enabled: !!className,
    refetchInterval: 10000,
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students', className],
    queryFn: () =>
      base44.entities.Student.filter({
        class_name: className,
        school_year: ACTIVE_SCHOOL_YEAR,
      }),
    enabled: !!className && !!selectedAssignment,
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ['dictation-submissions', selectedAssignment?.id],
    queryFn: () =>
      base44.entities.DictationSubmission.filter({
        assignment_id: selectedAssignment.id,
        school_year: ACTIVE_SCHOOL_YEAR,
      }),
    enabled: !!selectedAssignment,
    refetchInterval: 3000,
  });

  const createAssignment = useMutation({
    mutationFn: (data) => base44.entities.DictationAssignment.create(data),
    onSuccess: () => {
      qc.invalidateQueries(['dictation-assignments', className]);
      setNewTitle('');
      setNewPrompt('');
    },
  });

  const updateAssignment = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DictationAssignment.update(id, data),
    onSuccess: () => qc.invalidateQueries(['dictation-assignments', className]),
  });

  const submissionByNumber = {};
  for (const s of submissions) {
    submissionByNumber[s.student_number] = s;
  }

  // Class picker gate
  if (!className) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 bg-slate-50">
        <div className="text-center">
          <div className="text-5xl mb-3">📝</div>
          <h1 className="text-2xl font-black text-slate-800 mb-1">Dictation</h1>
          <p className="text-slate-500 text-sm">Select your class to continue</p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {classNames.map((c) => (
            <button
              key={c}
              onClick={() => setClassName(c)}
              className="w-full py-5 rounded-2xl text-2xl font-black text-white shadow-xl bg-indigo-600 hover:bg-indigo-700 border-2 border-indigo-400"
            >
              {c}
            </button>
          ))}
        </div>
        {onBack && (
          <button onClick={onBack} className="text-slate-500 hover:text-slate-800 font-bold text-sm">
            ← Back
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white">
        {onBack && <BackButton tone="indigo" onClick={onBack} />}
        <h1 className="text-lg font-black text-slate-800 flex-1">📝 Dictation</h1>
        <select
          value={className}
          onChange={(e) => {
            setClassName(e.target.value);
            setSelectedAssignment(null);
          }}
          className="px-3 py-1.5 rounded-xl font-bold text-slate-700 border border-slate-200 bg-white"
        >
          {classNames.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        {/* Create new assignment */}
        <div className="max-w-2xl mx-auto mb-6">
          <div className="bg-white rounded-2xl border-2 border-slate-200 p-4 flex flex-col gap-3">
            <p className="font-bold text-slate-700 text-sm">Create New Dictation</p>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Assignment title (e.g. 'Tuesday Dictation')"
              className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm"
            />
            <input
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder="Optional prompt text (e.g. 'e, a, o') — shown to students"
              className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm"
            />
            <button
              onClick={() => {
                if (!newTitle.trim()) return alert('Please enter a title');
                createAssignment.mutate({
                  title: newTitle.trim(),
                  class_name: className,
                  school_year: ACTIVE_SCHOOL_YEAR,
                  status: 'draft',
                  prompt_text: newPrompt.trim(),
                });
              }}
              className="py-2 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 text-sm"
            >
              + Create
            </button>
          </div>
        </div>

        {/* Assignment list */}
        <div className="max-w-2xl mx-auto mb-6 flex flex-col gap-2">
          {assignments.map((a) => (
            <div
              key={a.id}
              className={`rounded-2xl p-4 flex items-center justify-between cursor-pointer border-2 transition-all ${
                selectedAssignment?.id === a.id
                  ? 'border-indigo-400 bg-indigo-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
              onClick={() => setSelectedAssignment(a)}
            >
              <div>
                <p className="font-black text-slate-800">{a.title}</p>
                {a.prompt_text && (
                  <p className="text-xs text-slate-500">Prompt: {a.prompt_text}</p>
                )}
                <p className="text-xs text-slate-400 mt-0.5">
                  {a.status} · {submissions.length} student{submissions.length !== 1 ? 's' : ''} started
                </p>
              </div>
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {['draft', 'active', 'closed'].map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      updateAssignment.mutate({ id: a.id, data: { status: s } });
                      setSelectedAssignment((cur) => (cur?.id === a.id ? { ...cur, status: s } : cur));
                    }}
                    className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      a.status === s
                        ? s === 'active'
                          ? 'bg-green-600 text-white'
                          : s === 'closed'
                          ? 'bg-slate-500 text-white'
                          : 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {s}
                  </button>
                ))}
                <button
                  onClick={async () => {
                    if (!confirm(`Delete "${a.title}"?`)) return;
                    await base44.entities.DictationAssignment.delete(a.id);
                    if (selectedAssignment?.id === a.id) setSelectedAssignment(null);
                    qc.invalidateQueries(['dictation-assignments', className]);
                  }}
                  className="px-2 py-1 rounded-full text-xs font-bold text-red-500 border border-red-200 hover:bg-red-50"
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
          {assignments.length === 0 && (
            <p className="text-slate-400 text-center text-sm py-4">No dictations yet — create one above!</p>
          )}
        </div>

        {/* Student work grid */}
        {selectedAssignment && (
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <p className="text-slate-600 text-sm font-bold">
                {selectedAssignment.title} — {submissions.length} student{submissions.length !== 1 ? 's' : ''} with work
              </p>
              <span className="text-xs text-slate-400">
                {selectedAssignment.status === 'active'
                  ? '🟢 Live — student work appears here in real-time'
                  : `Status: ${selectedAssignment.status}`}
              </span>
              <a
                href={`/DictationStudent?assignment=${selectedAssignment.id}&class=${encodeURIComponent(className)}`}
                target="_blank"
                className="ml-auto text-xs font-bold text-indigo-600 hover:text-indigo-800"
              >
                🔗 Open student page
              </a>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {students.map((st) => (
                <DictationThumbnail
                  key={st.id}
                  submission={submissionByNumber[st.student_number]}
                  studentNumber={st.student_number}
                  onOpen={(sub) => sub && setReplaySubmission(sub)}
                />
              ))}
              {students.length === 0 && (
                <p className="text-slate-400 text-sm col-span-full text-center py-4">
                  No students in this class yet.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {replaySubmission && (
        <DictationReplay submission={replaySubmission} onClose={() => setReplaySubmission(null)} />
      )}
    </div>
  );
}