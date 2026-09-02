import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useClassNames } from '@/hooks/useClassNames';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import FreehandReplayModal from '@/components/tracing/FreehandReplayModal';
import { Lock, Unlock, Eye, RotateCcw } from 'lucide-react';

export default function TracingReview() {
  const { classList } = useClassNames();
  const queryClient = useQueryClient();
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedLetter, setSelectedLetter] = useState('');
  const [enabledLetters, setEnabledLetters] = useState([]);
  const [replayStudent, setReplayStudent] = useState(null);
  const [lockLetter, setLockLetter] = useState('');

  useEffect(() => {
    if (!selectedClass && classList.length) setSelectedClass(classList[0]);
  }, [classList]);

  useEffect(() => {
    if (!selectedClass) return;
    let cancelled = false;
    const load = async () => {
      try {
        const perClass = await base44.entities.TracingSettings.filter({ scope: selectedClass });
        if (cancelled) return;
        if (perClass?.length && Array.isArray(perClass[0].enabled_letters)) {
          setEnabledLetters(perClass[0].enabled_letters);
          if (!selectedLetter) setSelectedLetter(perClass[0].enabled_letters[0]);
          return;
        }
        const def = await base44.entities.TracingSettings.filter({ scope: 'default' });
        if (cancelled) return;
        if (def?.length && Array.isArray(def[0].enabled_letters)) {
          setEnabledLetters(def[0].enabled_letters);
          if (!selectedLetter) setSelectedLetter(def[0].enabled_letters[0]);
        }
      } catch {}
    };
    load();
    return () => { cancelled = true; };
  }, [selectedClass]);

  const { data: students = [] } = useQuery({
    queryKey: ['students', selectedClass],
    queryFn: () => base44.entities.Student.filter({ class_name: selectedClass, school_year: ACTIVE_SCHOOL_YEAR }),
    enabled: !!selectedClass,
  });

  const { data: locks = [] } = useQuery({
    queryKey: ['tracing-lock', selectedClass],
    queryFn: () => base44.entities.TracingLock.filter({ class_name: selectedClass, active: true }),
    enabled: !!selectedClass,
    refetchInterval: 5000,
  });
  const activeLock = locks[0];

  const { data: samples = [] } = useQuery({
    queryKey: ['tracing-samples', selectedClass, selectedLetter],
    queryFn: () => base44.entities.TracingSample.filter(
      { class_name: selectedClass, letter: selectedLetter }, '-created_date', 200
    ),
    enabled: !!selectedClass && !!selectedLetter,
  });

  const samplesByStudent = {};
  for (const s of samples) {
    if (!samplesByStudent[s.student_number]) samplesByStudent[s.student_number] = [];
    samplesByStudent[s.student_number].push(s);
  }

  const handleMakeRedo = async (student) => {
    const stageState = { ...(student.mode_progress?.letter_tracing?.stage_state || {}) };
    delete stageState[selectedLetter];
    const masteredItems = (student.mode_progress?.letter_tracing?.mastered_items || []).filter(l => l !== selectedLetter);
    const updatedModeProgress = {
      ...student.mode_progress,
      letter_tracing: {
        ...student.mode_progress?.letter_tracing,
        stage_state: stageState,
        mastered_items: masteredItems,
      },
    };
    await base44.entities.Student.update(student.id, { mode_progress: updatedModeProgress });
    queryClient.invalidateQueries({ queryKey: ['students', selectedClass] });
  };

  const handleSetLock = async () => {
    if (!selectedClass || !lockLetter) return;
    for (const lock of locks) {
      await base44.entities.TracingLock.update(lock.id, { active: false });
    }
    await base44.entities.TracingLock.create({
      class_name: selectedClass, letter: lockLetter, school_year: ACTIVE_SCHOOL_YEAR, active: true,
    });
    setLockLetter('');
    queryClient.invalidateQueries({ queryKey: ['tracing-lock', selectedClass] });
  };

  const handleClearLock = async () => {
    for (const lock of locks) {
      await base44.entities.TracingLock.update(lock.id, { active: false });
    }
    queryClient.invalidateQueries({ queryKey: ['tracing-lock', selectedClass] });
  };

  const getProgressInfo = (student, letter) => {
    const state = student.mode_progress?.letter_tracing?.stage_state?.[letter];
    if (!state) return { status: 'not_started', label: '—', color: 'bg-slate-100 text-slate-400' };
    if (state.fullyMastered) return { status: 'mastered', label: '✓ Mastered', color: 'bg-green-100 text-green-700 border-green-300' };
    if (state.pendingReview) return { status: 'pending', label: '⏳ Pending Review', color: 'bg-violet-100 text-violet-700 border-violet-300' };
    if (state.doneAtSize) return { status: 'done_size', label: '✓ Done', color: 'bg-sky-100 text-sky-700 border-sky-300' };
    if (state.phase === 'guided') return { status: 'guided', label: 'Guided', color: 'bg-amber-100 text-amber-700 border-amber-300' };
    if (state.phase === 'practice') return { status: 'practice', label: 'Practice', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' };
    return { status: 'started', label: 'Started', color: 'bg-indigo-100 text-indigo-700 border-indigo-300' };
  };

  // Teacher approves a pending-review letter → grants mastery. If the
  // approval completes the letter set (e.g. both 'a' and 'A' mastered),
  // banks a wheel roll so the student can claim it from the home screen.
  const handleApprove = async (student) => {
    const stageState = { ...(student.mode_progress?.letter_tracing?.stage_state || {}) };
    const letterState = stageState[selectedLetter];
    if (!letterState?.pendingReview) return;

    stageState[selectedLetter] = {
      ...letterState,
      pendingReview: false,
      fullyMastered: true,
    };

    let masteredItems = (student.mode_progress?.letter_tracing?.mastered_items || []).filter(l => l !== selectedLetter);
    masteredItems.push(selectedLetter);

    // Check if this approval completes the letter set (lower + upper).
    const lower = selectedLetter.toLowerCase();
    const setLetters = enabledLetters.filter(l => l.toLowerCase() === lower);
    let setComplete = false;
    if (setLetters.length >= 2) {
      setComplete = setLetters.every(l =>
        l === selectedLetter || stageState[l]?.fullyMastered
      );
    }

    const setSpinsAwarded = (student.mode_progress?.letter_tracing?.set_spins_awarded || []).filter(s => s !== lower);

    const updates = {
      mode_progress: {
        ...student.mode_progress,
        letter_tracing: {
          ...student.mode_progress?.letter_tracing,
          stage_state: stageState,
          mastered_items: masteredItems,
          set_spins_awarded: setComplete ? [...setSpinsAwarded, lower] : setSpinsAwarded,
        },
      },
    };

    // Bank a spin only when the set is newly complete.
    if (setComplete && !setSpinsAwarded.includes(lower)) {
      updates.banked_spins = (student.banked_spins || 0) + 1;
    }

    await base44.entities.Student.update(student.id, updates);
    queryClient.invalidateQueries({ queryKey: ['students', selectedClass] });
  };

  // Teacher rejects a pending-review letter → resets to practice phase
  // at the current size so the student tries again.
  const handleReject = async (student) => {
    const stageState = { ...(student.mode_progress?.letter_tracing?.stage_state || {}) };
    const letterState = stageState[selectedLetter];
    if (!letterState) return;

    stageState[selectedLetter] = {
      ...letterState,
      pendingReview: false,
      fullyMastered: false,
      doneAtSize: false,
      phase: 'practice',
      phaseSuccesses: 0,
      cleanStreak: 0,
      repairReps: 0,
    };

    const masteredItems = (student.mode_progress?.letter_tracing?.mastered_items || []).filter(l => l !== selectedLetter);

    await base44.entities.Student.update(student.id, {
      mode_progress: {
        ...student.mode_progress,
        letter_tracing: {
          ...student.mode_progress?.letter_tracing,
          stage_state: stageState,
          mastered_items: masteredItems,
        },
      },
    });
    queryClient.invalidateQueries({ queryKey: ['students', selectedClass] });
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-black text-slate-800 mb-4">✏️ Tracing Review</h1>

        {/* Class + Letter selectors */}
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Class</label>
            <select
              value={selectedClass}
              onChange={e => { setSelectedClass(e.target.value); setSelectedLetter(''); }}
              className="border rounded-lg px-3 py-1.5 text-sm font-bold"
            >
              {classList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Letter</label>
            <select
              value={selectedLetter}
              onChange={e => setSelectedLetter(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm font-bold"
            >
              {enabledLetters.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>

        {/* Lock controls */}
        <div className="bg-white rounded-xl border-2 border-violet-200 p-3 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-violet-600" />
              <span className="text-sm font-bold text-slate-700">
                {activeLock
                  ? `Locked to "${activeLock.letter}" — students are forced into this letter`
                  : 'No active lock — students can pick any activity'}
              </span>
            </div>
            {activeLock && (
              <button
                onClick={handleClearLock}
                className="bg-red-500 hover:bg-red-600 text-white text-sm font-bold px-3 py-1.5 rounded-lg flex items-center gap-1"
              >
                <Unlock className="w-3.5 h-3.5" /> Unlock
              </button>
            )}
          </div>
          {!activeLock && (
            <div className="flex items-center gap-2 mt-2">
              <select
                value={lockLetter}
                onChange={e => setLockLetter(e.target.value)}
                className="border rounded-lg px-2 py-1 text-sm font-bold"
              >
                <option value="">Pick a letter…</option>
                {enabledLetters.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <button
                onClick={handleSetLock}
                disabled={!lockLetter}
                className="bg-violet-500 hover:bg-violet-600 disabled:opacity-40 text-white text-sm font-bold px-3 py-1.5 rounded-lg flex items-center gap-1"
              >
                <Lock className="w-3.5 h-3.5" /> Lock to this letter
              </button>
            </div>
          )}
        </div>

        {/* Student grid */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-100 border-b font-bold text-xs text-slate-500 uppercase">
            <div className="col-span-1">#</div>
            <div className="col-span-3">Name</div>
            <div className="col-span-2">Progress</div>
            <div className="col-span-2">Dot-only attempts</div>
            <div className="col-span-2">View</div>
            <div className="col-span-2">Make redo</div>
          </div>
          {students.length === 0 ? (
            <div className="px-3 py-6 text-center text-slate-400 text-sm">No students in this class.</div>
          ) : students.map(s => {
            const info = getProgressInfo(s, selectedLetter);
            const studentSamples = samplesByStudent[s.student_number] || [];
            const dotOnlyCount = studentSamples.filter(x => x.mode === 'dot_only').length;
            const hasProgress = info.status !== 'not_started';
            return (
              <div key={s.id} className="grid grid-cols-12 gap-2 px-3 py-2 border-b last:border-0 items-center text-sm">
                <div className="col-span-1 font-bold text-slate-600">{s.student_number}</div>
                <div className="col-span-3 font-bold text-slate-700 truncate">{s.name || `Student ${s.student_number}`}</div>
                <div className="col-span-2">
                  <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 border ${info.color}`}>{info.label}</span>
                </div>
                <div className="col-span-2 text-slate-500 font-bold">
                  {dotOnlyCount > 0 ? `${dotOnlyCount} saved` : '—'}
                </div>
                <div className="col-span-2">
                  <button
                    onClick={() => setReplayStudent(s.student_number)}
                    disabled={dotOnlyCount === 0}
                    className={`text-xs font-bold flex items-center gap-1 disabled:opacity-30 ${
                      info.status === 'pending'
                        ? 'bg-violet-500 hover:bg-violet-600 text-white px-2 py-1 rounded-lg'
                        : 'text-indigo-600 hover:text-indigo-800'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" /> {info.status === 'pending' ? 'Review' : dotOnlyCount > 0 ? 'View' : 'None'}
                  </button>
                </div>
                <div className="col-span-2">
                  <button
                    onClick={() => handleMakeRedo(s)}
                    disabled={!hasProgress}
                    className="bg-amber-500 hover:bg-amber-600 disabled:opacity-30 text-white text-xs font-bold px-2 py-1 rounded-lg flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Redo
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {replayStudent && (
        <FreehandReplayModal
          studentNumber={replayStudent}
          className={selectedClass}
          letter={selectedLetter}
          pendingReview={(() => {
            const s = students.find(x => x.student_number === replayStudent);
            return !!s?.mode_progress?.letter_tracing?.stage_state?.[selectedLetter]?.pendingReview;
          })()}
          onApprove={() => {
            const s = students.find(x => x.student_number === replayStudent);
            if (s) handleApprove(s);
            setReplayStudent(null);
          }}
          onReject={() => {
            const s = students.find(x => x.student_number === replayStudent);
            if (s) handleReject(s);
            setReplayStudent(null);
          }}
          onClose={() => setReplayStudent(null)}
        />
      )}
    </div>
  );
}