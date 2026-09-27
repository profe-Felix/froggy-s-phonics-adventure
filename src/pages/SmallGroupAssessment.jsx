import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { getHomeroomForClass } from '@/lib/classRotation';
import { LETTER_SOUNDS, LETTER_SOUNDS_EN } from '@/components/data/letterSounds';
import { SIGHT_WORDS_EASY as SW_ES, SIGHT_WORDS_EASY_EN as SW_EN } from '@/components/data/sightWords';
import { Loader2, ArrowLeft, Check, X, ChevronRight, ChevronLeft, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseName } from '@/lib/nameNormalize';

const ASSESSMENT_TYPES = [
  { id: 'letter_sounds', label: 'Letter Sounds' },
  { id: 'sight_words', label: 'Sight Words' },
];

function getItemPool(language, assessmentType) {
  if (assessmentType === 'letter_sounds') {
    return language === 'en' ? [...LETTER_SOUNDS_EN] : [...LETTER_SOUNDS];
  }
  return language === 'en' ? [...SW_EN] : [...SW_ES];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function SmallGroupAssessment() {
  const urlParams = new URLSearchParams(window.location.search);
  const teacher = urlParams.get('teacher') || 'Felix';
  const block = urlParams.get('block') || 'A';
  const group = urlParams.get('group') || 'red';

  const [students, setStudents] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [session, setSession] = useState(null);
  const [assessmentType, setAssessmentType] = useState('letter_sounds');
  const [assessingStudentId, setAssessingStudentId] = useState(null);
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastMark, setLastMark] = useState(null); // { item, correct } for flash feedback

  // Load all students
  useEffect(() => {
    base44.entities.Student.filter({ school_year: ACTIVE_SCHOOL_YEAR }, '-created_date', 10000).then(setStudents);
  }, []);

  // Load assignments for this teacher+block+group
  useEffect(() => {
    base44.entities.SmallGroupAssignment.filter({
      teacher_name: teacher,
      block: block,
      color_group: group,
      school_year: ACTIVE_SCHOOL_YEAR,
    }).then(setAssignments).catch(() => {});
  }, [teacher, block, group]);

  // Load or create session
  useEffect(() => {
    if (!students) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const existing = await base44.entities.SmallGroupAssessment.filter({
          teacher_name: teacher,
          block: block,
          color_group: group,
          status: 'active',
          school_year: ACTIVE_SCHOOL_YEAR,
        });
        if (existing.length > 0 && alive) {
          setSession(existing[0]);
          setResults(existing[0].results || {});
        } else if (alive) {
          const created = await base44.entities.SmallGroupAssessment.create({
            teacher_name: teacher,
            block: block,
            color_group: group,
            school_year: ACTIVE_SCHOOL_YEAR,
            status: 'active',
            started_at: new Date().toISOString(),
            results: {},
            broadcast_state: {},
          });
          setSession(created);
        }
      } catch {
        // ignore
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [students, teacher, block, group]);

  const studentMap = useMemo(() => {
    const map = {};
    if (students) for (const s of students) map[s.id] = s;
    return map;
  }, [students]);

  // Students in this color group
  const groupStudents = useMemo(
    () => assignments
      .map((a) => studentMap[a.student_id])
      .filter(Boolean)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [assignments, studentMap]
  );

  // Current student being assessed
  const assessingStudent = assessingStudentId ? studentMap[assessingStudentId] : null;
  const studentResult = assessingStudentId ? results[assessingStudentId]?.[assessmentType] : null;
  const currentItem = studentResult ? studentResult.item_order[studentResult.current_index] : null;
  const isDone = studentResult?.completed || (studentResult && studentResult.current_index >= studentResult.item_order.length);

  // Broadcast current item to student screen
  const broadcastItem = useCallback((result, student, done = false) => {
    if (!session) return;
    const state = done
      ? { show_item: false, student_id: student.id, done: true, assessment_type: assessmentType }
      : {
          current_item: result.item_order[result.current_index],
          student_id: student.id,
          student_number: student.student_number,
          class_name: student.class_name,
          item_index: result.current_index,
          total_items: result.item_order.length,
          show_item: true,
          assessment_type: assessmentType,
        };
    base44.entities.SmallGroupAssessment.update(session.id, { broadcast_state: state }).catch(() => {});
  }, [session, assessmentType]);

  // Update results in entity
  const persistResults = useCallback((newResults) => {
    if (!session) return;
    base44.entities.SmallGroupAssessment.update(session.id, { results: newResults }).catch(() => {});
  }, [session]);

  // Update student's mode_progress with assessment results
  const updateModeProgress = useCallback(async (student, type, result) => {
    if (!student || !result) return;
    const modeKey = type === 'letter_sounds' ? 'letter_sounds' : 'sight_words_easy';
    const current = student.mode_progress?.[modeKey] || {
      mastered_items: [], learning_items: [], item_attempts: {},
      total_correct: 0, total_attempts: 0,
    };
    const masteredSet = new Set(current.mastered_items || []);
    const learningSet = new Set(current.learning_items || []);
    for (const item of result.correct || []) {
      masteredSet.add(item);
      learningSet.delete(item);
    }
    for (const item of result.incorrect || []) {
      learningSet.add(item);
    }
    const itemAttempts = { ...(current.item_attempts || {}) };
    for (const item of result.attempted || []) {
      if (!itemAttempts[item]) itemAttempts[item] = { correct: 0, incorrect: 0 };
      if ((result.correct || []).includes(item)) itemAttempts[item].correct++;
      else itemAttempts[item].incorrect++;
    }
    const newModeProgress = {
      ...(student.mode_progress || {}),
      [modeKey]: {
        mastered_items: [...masteredSet],
        learning_items: [...learningSet],
        item_attempts: itemAttempts,
        total_correct: (current.total_correct || 0) + (result.correct?.length || 0),
        total_attempts: (current.total_attempts || 0) + (result.attempted?.length || 0),
      },
    };
    try {
      await base44.entities.Student.update(student.id, { mode_progress: newModeProgress });
    } catch {
      // ignore — results are still saved in the session
    }
  }, []);

  // Start or continue assessment for a student
  const startAssessment = (student) => {
    const existing = results[student.id]?.[assessmentType];
    if (existing && !existing.completed && existing.current_index < existing.item_order.length) {
      // Continue
      setAssessingStudentId(student.id);
      broadcastItem(existing, student);
    } else {
      // Start new
      const pool = getItemPool(student.language, assessmentType);
      const shuffled = shuffle(pool);
      const newResult = {
        correct: [], incorrect: [], attempted: [],
        item_order: shuffled, current_index: 0, completed: false,
      };
      const newResults = {
        ...results,
        [student.id]: {
          ...(results[student.id] || {}),
          [assessmentType]: newResult,
        },
      };
      setResults(newResults);
      persistResults(newResults);
      setAssessingStudentId(student.id);
      broadcastItem(newResult, student);
    }
  };

  // Mark correct or incorrect
  const handleMark = (mark) => {
    if (!assessingStudentId || !studentResult) return;
    const item = studentResult.item_order[studentResult.current_index];
    if (!item) return;

    const newResult = {
      ...studentResult,
      [mark]: [...studentResult[mark], item],
      attempted: [...studentResult.attempted, item],
      current_index: studentResult.current_index + 1,
    };
    const done = newResult.current_index >= newResult.item_order.length;
    if (done) newResult.completed = true;

    const newResults = {
      ...results,
      [assessingStudentId]: {
        ...results[assessingStudentId],
        [assessmentType]: newResult,
      },
    };
    setResults(newResults);
    setLastMark({ item, correct: mark === 'correct' });

    // Single atomic update — both results and broadcast_state in one call
    // so the student sees the new item immediately (one realtime event, no
    // race between two separate updates).
    const broadcastState = done
      ? { show_item: false, student_id: assessingStudent.id, done: true, assessment_type: assessmentType }
      : {
          current_item: newResult.item_order[newResult.current_index],
          student_id: assessingStudent.id,
          student_number: assessingStudent.student_number,
          class_name: assessingStudent.class_name,
          item_index: newResult.current_index,
          total_items: newResult.item_order.length,
          show_item: true,
          assessment_type: assessmentType,
        };
    if (session) {
      base44.entities.SmallGroupAssessment.update(session.id, {
        results: newResults,
        broadcast_state: broadcastState,
      }).catch(() => {});
    }

    if (done) {
      updateModeProgress(assessingStudent, assessmentType, newResult);
      setTimeout(() => {
        setAssessingStudentId(null);
        setLastMark(null);
      }, 800);
    } else {
      // Clear the flash feedback so it doesn't linger on the next card.
      setTimeout(() => setLastMark(null), 500);
    }
  };

  // End early (press E)
  const handleEndEarly = () => {
    if (!assessingStudentId || !studentResult) return;
    updateModeProgress(assessingStudent, assessmentType, studentResult);
    if (session) {
      base44.entities.SmallGroupAssessment.update(session.id, {
        broadcast_state: { show_item: false, student_id: assessingStudentId, done: true },
      }).catch(() => {});
    }
    setAssessingStudentId(null);
    setLastMark(null);
  };

  // Keyboard handler
  useEffect(() => {
    if (!assessingStudentId) return;
    const handler = (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); handleMark('correct'); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); handleMark('incorrect'); }
      else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); handleEndEarly(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [assessingStudentId, studentResult, results, session, assessmentType]);

  // End session
  const handleEndSession = async () => {
    if (!session) return;
    if (!confirm('End this assessment session? You can start a new one later.')) return;
    await base44.entities.SmallGroupAssessment.update(session.id, {
      status: 'completed',
      ended_at: new Date().toISOString(),
      broadcast_state: {},
    });
    setSession(null);
    setResults({});
    setAssessingStudentId(null);
  };

  const groupLabel = group.charAt(0).toUpperCase() + group.slice(1);

  // ── Loading ──────────────────────────────────────────────────────────
  if (loading || !students) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // ── Assessment view (student selected) ────────────────────────────────
  if (assessingStudent && studentResult) {
    const correctCount = studentResult.correct.length;
    const incorrectCount = studentResult.incorrect.length;
    const progress = studentResult.item_order.length > 0
      ? (studentResult.current_index / studentResult.item_order.length) * 100
      : 0;
    const { first } = parseName(assessingStudent.name);

    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3 bg-slate-800">
          <div className="flex items-center gap-3">
            <button
              onClick={handleEndEarly}
              className="text-slate-400 hover:text-white text-sm font-medium"
            >
              ← Back to list
            </button>
            <span className="text-slate-600">|</span>
            <span className="text-white font-bold">{first || assessingStudent.name}</span>
            {assessingStudent.photo_url && (
              <img src={assessingStudent.photo_url} alt="" className="w-7 h-7 rounded-full object-cover" />
            )}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-green-400 font-bold">✓ {correctCount}</span>
            <span className="text-red-400 font-bold">✗ {incorrectCount}</span>
            <span className="text-slate-400">
              {studentResult.current_index} / {studentResult.item_order.length}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-slate-800">
          <div
            className="h-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Big item display */}
        <div className="flex-1 flex items-center justify-center relative">
          {isDone ? (
            <div className="text-center">
              <div className="text-6xl mb-4">✅</div>
              <p className="text-white text-2xl font-bold">All done!</p>
              <p className="text-slate-400 mt-2">
                {correctCount} correct · {incorrectCount} incorrect
              </p>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  'text-[180px] font-bold leading-none transition-colors',
                  lastMark?.correct ? 'text-green-400' : lastMark ? 'text-red-400' : 'text-white'
                )}
                style={{ fontFamily: assessmentType === 'letter_sounds' ? "'Teachers', sans-serif" : "'Andika', sans-serif" }}
              >
                {currentItem}
              </div>
              {lastMark && (
                <div className={cn(
                  'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-8xl animate-ping',
                  lastMark.correct ? 'text-green-400' : 'text-red-400'
                )}>
                  {lastMark.correct ? '✓' : '✗'}
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom controls */}
        <div className="px-6 py-6 bg-slate-800">
          <div className="max-w-2xl mx-auto flex items-center justify-center gap-8">
            <button
              onClick={() => handleMark('incorrect')}
              className="flex flex-col items-center gap-1 text-red-400 hover:text-red-300 transition-colors"
            >
              <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center">
                <X className="w-8 h-8" />
              </div>
              <span className="text-sm font-medium">Incorrect (←)</span>
            </button>
            <button
              onClick={handleEndEarly}
              className="flex flex-col items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors"
            >
              <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-500 flex items-center justify-center">
                <span className="text-2xl font-bold">E</span>
              </div>
              <span className="text-sm font-medium">End (E)</span>
            </button>
            <button
              onClick={() => handleMark('correct')}
              className="flex flex-col items-center gap-1 text-green-400 hover:text-green-300 transition-colors"
            >
              <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center">
                <Check className="w-8 h-8" />
              </div>
              <span className="text-sm font-medium">Correct (→)</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Student list view ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/SmallGroupManager" className="text-slate-400 hover:text-slate-700">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg font-bold text-slate-800">
              Quick Assessment
            </h1>
            <span className="text-sm text-slate-500">
              {teacher} · Block {block} · {groupLabel} Group
            </span>
            <div className="flex-1" />
            <button
              onClick={handleEndSession}
              className="text-sm font-medium text-red-600 hover:text-red-800 px-3 py-1.5 rounded-lg hover:bg-red-50"
            >
              End Session
            </button>
          </div>

          {/* Assessment type selector */}
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-slate-500">Assessing:</span>
            {ASSESSMENT_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setAssessmentType(t.id)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors',
                  assessmentType === t.id
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white border-slate-300 hover:bg-slate-50'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {groupStudents.length === 0 ? (
          <div className="text-center py-20">
            <AlertCircle className="w-10 h-10 mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-500">
              No students in the {groupLabel} group yet.
            </p>
            <Link
              to={`/SmallGroupManager`}
              className="text-sm text-indigo-600 hover:text-indigo-800 mt-2 inline-block"
            >
              ← Assign students to groups first
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {groupStudents.map((student) => {
              const r = results[student.id]?.[assessmentType];
              const completed = r?.completed;
              const inProgress = r && !r.completed && r.current_index > 0;
              const total = r?.item_order?.length || 0;
              const current = r?.current_index || 0;
              const { first } = parseName(student.name);

              return (
                <div
                  key={student.id}
                  className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3"
                >
                  {student.photo_url ? (
                    <img src={student.photo_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-500">
                      {student.name?.[0] || '?'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 truncate">{first || student.name}</p>
                    {completed ? (
                      <p className="text-xs text-green-600 font-medium">
                        ✓ {r.correct.length}/{total} correct
                      </p>
                    ) : inProgress ? (
                      <p className="text-xs text-amber-600 font-medium">
                        {current}/{total} — in progress
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400">Not started</p>
                    )}
                  </div>
                  <button
                    onClick={() => startAssessment(student)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-bold transition-colors',
                      completed
                        ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        : inProgress
                          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          : 'bg-indigo-500 text-white hover:bg-indigo-600'
                    )}
                  >
                    {completed ? 'Review' : inProgress ? 'Continue' : 'Start'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Student link for testing */}
        {session && groupStudents.length > 0 && (
          <div className="mt-6 bg-indigo-50 rounded-xl border border-indigo-100 p-4 text-sm text-indigo-800">
            <p className="font-bold mb-1">Student iPad link</p>
            <p className="text-xs text-indigo-600">
              Students go to: <code className="bg-white px-1.5 py-0.5 rounded">
                /SmallGroupAssessmentStudent?class={teacher}&number=2
              </code> — using the same class+number URL params they already use to log in.
              The page auto-discovers the active session and locks to it.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}