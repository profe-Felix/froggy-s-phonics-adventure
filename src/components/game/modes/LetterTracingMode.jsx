import { useState, useEffect, useRef, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { Sparkles } from 'lucide-react';
import { LETTER_WAYPOINTS } from '../../data/letterWaypoints';
import LetterTracingCanvas from '../LetterTracingCanvas';
import PrizeWheel from '../PrizeWheel';
import { base44 } from '@/api/base44Client';
import { getLanguage } from '@/lib/language';

const BASE_LETTERS = 'abcdefghijklmnopqrstuvwxyz'
  .split('')
  .filter(l => LETTER_WAYPOINTS[l]);

// ñ is a Spanish-only letter; English students never see it.
// Uppercase/lowercase remain distinct when separate waypoint records exist.
const SPANISH_EXTRA = ['ñ'];

// -----------------------------------------------------------------------------
// TRACING MASTERY SEQUENCE
//
// Support fades gradually while size decreases.
//
// A stage does NOT advance simply because the student eventually gets enough
// isolated successes. They must also finish with at least 2 clean traces in a
// row.
//
// Each mistake:
//   • resets the clean streak
//   • adds one repair repetition to the current stage
//   • repair repetitions are capped at +2 per stage
//
// Base repetitions:
//   Guided Huge       3
//   Independent Huge  4
//   Independent Big   4
//   Independent Med   3
//   Independent Small 2
//
// Base total = 16 successful traces per mastered letter.
// -----------------------------------------------------------------------------
const TRACING_STAGES = [
  {
    key: 'guided_huge',
    label: 'Guided Huge',
    shortLabel: 'Guided',
    sizeLevel: 0,
    repetitions: 3,
    showGuide: true,
  },
  {
    key: 'independent_huge',
    label: 'Independent Huge',
    shortLabel: 'Huge',
    sizeLevel: 0,
    repetitions: 4,
    showGuide: false,
  },
  {
    key: 'independent_big',
    label: 'Independent Big',
    shortLabel: 'Big',
    sizeLevel: 1,
    repetitions: 4,
    showGuide: false,
  },
  {
    key: 'independent_medium',
    label: 'Independent Medium',
    shortLabel: 'Medium',
    sizeLevel: 2,
    repetitions: 3,
    showGuide: false,
  },
  {
    key: 'independent_small',
    label: 'Independent Small',
    shortLabel: 'Small',
    sizeLevel: 3,
    repetitions: 2,
    showGuide: false,
  },
];

const SIZE_LEVELS = [
  { w: 760, label: 'Huge' },
  { w: 720, label: 'Big' },
  { w: 680, label: 'Medium' },
  { w: 640, label: 'Small' },
  { w: 600, label: 'Muscle Memory' },
];

const BASE_TRACES_PER_LETTER = TRACING_STAGES.reduce(
  (sum, stage) => sum + stage.repetitions,
  0
);

const REQUIRED_CLEAN_STREAK = 2;
const MAX_REPAIR_REPS = 2;
const PAGE_SIZE = 10;

function makeStageState() {
  return {
    stageIndex: 0,
    stageSuccesses: 0,
    cleanStreak: 0,
    repairReps: 0,
    mistakes: 0,
    totalSuccesses: 0,
    totalAttempts: 0,
    mastered: false,
  };
}

function getStage(progress) {
  return TRACING_STAGES[
    Math.min(
      Math.max(progress?.stageIndex || 0, 0),
      TRACING_STAGES.length - 1
    )
  ];
}

function getRequiredForStage(progress) {
  const stage = getStage(progress);

  return (
    stage.repetitions +
    Math.min(progress?.repairReps || 0, MAX_REPAIR_REPS)
  );
}

export default function LetterTracingMode({
  studentData,
  onUpdateProgress,
  onStudentPatch,
  targets,
  freeSpinEnabled = true,
}) {
  const [currentLetter, setCurrentLetter] = useState(null);

  // Green letters only. A letter enters this set after completing every stage.
  const [completedLetters, setCompletedLetters] = useState(new Set());

  const [streak, setStreak] = useState(0);
  const [waypoints, setWaypoints] = useState(LETTER_WAYPOINTS);

  // Kept for compatibility with the previous tracing system and persisted
  // per-device size data. The staged system now controls the actual size.
  const [letterLevels, setLetterLevels] = useState({});

  // Per-letter mastery state for this tracing section.
  const [letterProgress, setLetterProgress] = useState({});

  const [lastAccuracy, setLastAccuracy] = useState(null);
  const [celebrate, setCelebrate] = useState(null);
  const [page, setPage] = useState(0);

  // Free wheel spin after the whole tracing section is mastered.
  const [showWheel, setShowWheel] = useState(false);
  const [freeSpinReady, setFreeSpinReady] = useState(false);

  const [redeemedPrizes, setRedeemedPrizes] = useState(
    () => studentData?.redeemed_prizes || []
  );

  const freeSpinAwardedRef = useRef(false);

  // Counts actual successful traces for analytics.
  const successfulTraceCountRef = useRef(0);

  // Counts every completed/rejected attempt locally.
  const attemptCountRef = useRef(0);

  // Force-remount the tracing canvas for a fresh copy/stage.
  const [traceKey, setTraceKey] = useState(0);

  const studentKey = studentData?.id || 'guest';

  // ---------------------------------------------------------------------------
  // LOAD WAYPOINTS
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    base44.entities.LetterWaypoint.list()
      .then((records) => {
        if (
          cancelled ||
          !Array.isArray(records) ||
          records.length === 0
        ) {
          return;
        }

        setWaypoints((prev) => {
          const merged = { ...prev };

          for (const r of records) {
            if (!r.letter || !r.strokes_data) continue;

            try {
              const strokes = JSON.parse(r.strokes_data);

              if (
                Array.isArray(strokes) &&
                strokes.length
              ) {
                merged[r.letter] = {
                  strokes,
                  hint:
                    r.hint ||
                    prev[r.letter]?.hint ||
                    '',
                };
              }
            } catch {
              // Ignore malformed authoring records.
            }
          }

          return merged;
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // PRESERVE OLD PER-LETTER SCALE STORAGE
  // ---------------------------------------------------------------------------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(
        `tracing-scale-${studentKey}`
      );

      if (raw) {
        setLetterLevels(JSON.parse(raw));
      }
    } catch {}
  }, [studentKey]);

  const persistLevels = (next) => {
    setLetterLevels(next);

    try {
      localStorage.setItem(
        `tracing-scale-${studentKey}`,
        JSON.stringify(next)
      );
    } catch {}
  };

  const lang = getLanguage(studentData);

  // IMPORTANT:
  // Do NOT lowercase here.
  //
  // O and o, I and i, etc. remain separate targets when both have their own
  // waypoint records.
  const LETTERS = useMemo(() => {
    const raw =
      targets && targets.length > 0
        ? targets
        : [
            ...BASE_LETTERS,
            ...(lang === 'es'
              ? SPANISH_EXTRA
              : []),
          ];

    return Array.from(
      new Set(
        raw
          .map(l => String(l).trim())
          .filter(Boolean)
      )
    ).filter(l => waypoints[l]);
  }, [targets, lang, waypoints]);

  const pageCount = Math.max(
    1,
    Math.ceil(LETTERS.length / PAGE_SIZE)
  );

  const safePage = Math.min(
    page,
    pageCount - 1
  );

  const paged = LETTERS.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE
  );

  // ---------------------------------------------------------------------------
  // LETTER PROGRESS HELPERS
  // ---------------------------------------------------------------------------
  const progressFor = (letter) =>
    letterProgress[letter] || makeStageState();

  const stageFor = (letter) =>
    getStage(progressFor(letter));

  const sizeLevelFor = (letter) =>
    stageFor(letter).sizeLevel;

  const renderWidthFor = (letter) => {
    const targetWidth =
      SIZE_LEVELS[sizeLevelFor(letter)]?.w ||
      SIZE_LEVELS[0].w;

    const viewportWidth =
      typeof window !== 'undefined'
        ? window.innerWidth
        : 800;

    const availableWidth =
      viewportWidth * 0.96;

    return Math.min(
      targetWidth,
      Math.max(320, availableWidth)
    );
  };

  const letterRequiredTotal = (letter) => {
    const progress = progressFor(letter);

    if (progress.mastered) {
      // Preserve the real number of reps the student needed.
      return (
        BASE_TRACES_PER_LETTER +
        (progress.mistakes > 0
          ? Math.min(
              progress.mistakes,
              MAX_REPAIR_REPS *
                TRACING_STAGES.length
            )
          : 0)
      );
    }

    let total = 0;

    TRACING_STAGES.forEach(
      (stage, index) => {
        total += stage.repetitions;

        if (index < progress.stageIndex) {
          // Completed repair reps are represented in totalSuccesses.
          return;
        }

        if (index === progress.stageIndex) {
          total += Math.min(
            progress.repairReps || 0,
            MAX_REPAIR_REPS
          );
        }
      }
    );

    return total;
  };

  const hasStarted = (letter) => {
    const p = progressFor(letter);

    return (
      p.stageIndex > 0 ||
      p.stageSuccesses > 0 ||
      p.totalSuccesses > 0 ||
      p.mistakes > 0
    );
  };

  // ---------------------------------------------------------------------------
  // SECTION PROGRESS BAR
  // ---------------------------------------------------------------------------
  const sectionProgress = useMemo(() => {
    if (!LETTERS.length) return 0;

    let earned = 0;
    let possible = 0;

    for (const letter of LETTERS) {
      const p =
        letterProgress[letter] ||
        makeStageState();

      if (p.mastered) {
        earned += TRACING_STAGES.length;
        possible += TRACING_STAGES.length;
        continue;
      }

      possible += TRACING_STAGES.length;

      earned += p.stageIndex;

      const stage =
        TRACING_STAGES[p.stageIndex];

      if (stage) {
        const need =
          stage.repetitions +
          Math.min(
            p.repairReps || 0,
            MAX_REPAIR_REPS
          );

        earned += Math.min(
          1,
          (p.stageSuccesses || 0) /
            Math.max(1, need)
        );
      }
    }

    return Math.max(
      0,
      Math.min(
        100,
        Math.round(
          (earned / Math.max(1, possible)) *
            100
        )
      )
    );
  }, [LETTERS, letterProgress]);

  const masteredCount = LETTERS.filter(
    letter =>
      completedLetters.has(letter) ||
      letterProgress[letter]?.mastered
  ).length;

  // ---------------------------------------------------------------------------
  // REPORT REAL MASTERY
  //
  // LessonModeRouter currently treats total_attempts as its tracing completion
  // number. To preserve compatibility, total_attempts here intentionally equals
  // the number of TARGET LETTERS MASTERED, not raw pen strokes.
  //
  // That means a lesson configured:
  //   Targets: O, o, I, i
  //   Items to master: 4
  //
  // completes after all four letters finish the full staged sequence.
  // ---------------------------------------------------------------------------
  const reportProgress = (
    nextProgress,
    nextCompletedLetters
  ) => {
    if (!onUpdateProgress) return;

    const masteredItems =
      LETTERS.filter(
        letter =>
          nextCompletedLetters.has(letter) ||
          nextProgress[letter]?.mastered
      );

    const itemAttempts = {};

    for (const letter of LETTERS) {
      const p =
        nextProgress[letter] ||
        makeStageState();

      itemAttempts[letter] = {
        correct: p.totalSuccesses || 0,
        total: p.totalAttempts || 0,
        stage:
          p.mastered
            ? TRACING_STAGES.length
            : p.stageIndex || 0,
        clean_streak:
          p.cleanStreak || 0,
        mistakes:
          p.mistakes || 0,
        mastered: !!p.mastered,
      };
    }

    onUpdateProgress(
      'letter_tracing',
      {
        mastered_items: masteredItems,

        // Compatibility with the current LessonModeRouter:
        // 4 mastered letters = total_attempts 4.
        total_attempts:
          masteredItems.length,

        // Actual tracing analytics remain available separately.
        total_correct:
          successfulTraceCountRef.current,

        raw_trace_attempts:
          attemptCountRef.current,

        learning_items:
          LETTERS.filter(
            letter =>
              !masteredItems.includes(letter)
          ),

        item_attempts: itemAttempts,
      }
    );
  };

  // ---------------------------------------------------------------------------
  // ACCURACY
  // ---------------------------------------------------------------------------
  const handleAccuracy = (acc) => {
    setLastAccuracy(acc);
  };

  // ---------------------------------------------------------------------------
  // MISTAKE / REPAIR PRACTICE
  //
  // LetterTracingCanvas calls this whenever formation is rejected:
  // wrong start, direction error, excessive drift, incomplete lift, etc.
  // ---------------------------------------------------------------------------
  const handleMistake = (letter) => {
    attemptCountRef.current += 1;
    setStreak(0);

    setLetterProgress(prev => {
      const current =
        prev[letter] ||
        makeStageState();

      if (current.mastered) {
        return prev;
      }

      const nextLetter = {
        ...current,

        // Student must rebuild a clean streak.
        cleanStreak: 0,

        mistakes:
          (current.mistakes || 0) + 1,

        totalAttempts:
          (current.totalAttempts || 0) + 1,

        // Add repair practice, but do not create an endless task.
        repairReps: Math.min(
          MAX_REPAIR_REPS,
          (current.repairReps || 0) + 1
        ),
      };

      const next = {
        ...prev,
        [letter]: nextLetter,
      };

      reportProgress(
        next,
        completedLetters
      );

      return next;
    });
  };

  // ---------------------------------------------------------------------------
  // SUCCESSFUL COPY
  // ---------------------------------------------------------------------------
  const handleComplete = (letter) => {
    const acc = lastAccuracy;

    attemptCountRef.current += 1;

    // A completed pathway below 80% is accepted by the canvas as a trace,
    // but it is NOT clean enough to count toward mastery.
    //
    // Treat it like repair practice instead of letting a rough formation
    // eventually produce mastery.
    if (acc != null && acc < 80) {
      setStreak(0);

      setLetterProgress(prev => {
        const current =
          prev[letter] ||
          makeStageState();

        const nextLetter = {
          ...current,
          cleanStreak: 0,
          mistakes:
            (current.mistakes || 0) + 1,
          totalAttempts:
            (current.totalAttempts || 0) + 1,
          repairReps: Math.min(
            MAX_REPAIR_REPS,
            (current.repairReps || 0) + 1
          ),
        };

        const next = {
          ...prev,
          [letter]: nextLetter,
        };

        reportProgress(
          next,
          completedLetters
        );

        return next;
      });

      setCelebrate({
        type: 'repair',
        letter,
        message:
          'Almost! One more practice trace.',
      });

      setTimeout(
        () => setCelebrate(null),
        1000
      );

      setLastAccuracy(null);
      setTraceKey(k => k + 1);
      return;
    }

    successfulTraceCountRef.current += 1;
    setStreak(s => s + 1);

    // Decide mastery / stage-advance SYNCHRONOUSLY from the current state.
    // The previous version set masteredThisTurn / advancedStage inside the
    // setLetterProgress updater, which React runs lazily during render — so
    // the side-effect checks below always saw false. The state update itself
    // still landed (mastered: true), so the canvas remounted into a
    // mastered-but-not-advanced state and the student got stuck on the final
    // stage forever. Compute the decision up front so the side effects fire.
    const current =
      progressFor(letter);

    if (current.mastered) {
      // Already mastered (e.g. a late duplicate auto-advance). Nothing to do.
      return;
    }

    const stage =
      TRACING_STAGES[current.stageIndex];

    const required =
      stage.repetitions +
      Math.min(
        current.repairReps || 0,
        MAX_REPAIR_REPS
      );

    const nextSuccesses =
      (current.stageSuccesses || 0) + 1;

    const nextClean =
      (current.cleanStreak || 0) + 1;

    const nextTotalSuccesses =
      (current.totalSuccesses || 0) + 1;

    const stagePassed =
      nextSuccesses >= required &&
      nextClean >= REQUIRED_CLEAN_STREAK;

    let masteredThisTurn = false;
    let advancedStage = false;
    let nextStageIndex = current.stageIndex;

    let nextLetter;

    if (!stagePassed) {
      nextLetter = {
        ...current,
        stageSuccesses: nextSuccesses,
        cleanStreak: nextClean,
        totalSuccesses: nextTotalSuccesses,
        totalAttempts:
          (current.totalAttempts || 0) + 1,
      };
    } else if (
      current.stageIndex <
      TRACING_STAGES.length - 1
    ) {
      advancedStage = true;
      nextStageIndex = current.stageIndex + 1;

      nextLetter = {
        ...current,
        stageIndex: current.stageIndex + 1,
        // New support/size stage starts fresh.
        stageSuccesses: 0,
        cleanStreak: 0,
        repairReps: 0,
        totalSuccesses: nextTotalSuccesses,
        totalAttempts:
          (current.totalAttempts || 0) + 1,
      };
    } else {
      masteredThisTurn = true;
      nextStageIndex = TRACING_STAGES.length;

      nextLetter = {
        ...current,
        stageSuccesses: nextSuccesses,
        cleanStreak: nextClean,
        totalSuccesses: nextTotalSuccesses,
        totalAttempts:
          (current.totalAttempts || 0) + 1,
        mastered: true,
      };
    }

    const nextCompleted = new Set(completedLetters);

    if (masteredThisTurn) {
      nextCompleted.add(letter);
    }

    setLetterProgress(prev => {
      const prevLetter =
        prev[letter] || makeStageState();

      if (prevLetter.mastered) {
        return prev;
      }

      return {
        ...prev,
        [letter]: nextLetter,
      };
    });

    reportProgress(
      { ...letterProgress, [letter]: nextLetter },
      nextCompleted
    );

    if (masteredThisTurn) {
      const nextCompleted =
        new Set(completedLetters);

      nextCompleted.add(letter);

      setCompletedLetters(
        nextCompleted
      );

      persistLevels({
        ...letterLevels,
        [letter]:
          TRACING_STAGES.length,
      });

      setCelebrate({
        type: 'mastered',
        letter,
        message: 'Letter mastered!',
      });

      confetti({
        particleCount: 100,
        spread: 75,
        origin: { y: 0.6 },
      });

      const allNowMastered =
        LETTERS.length > 0 &&
        LETTERS.every(
          l =>
            nextCompleted.has(l) ||
            l === letter
        );

      if (
        allNowMastered &&
        freeSpinEnabled &&
        !freeSpinAwardedRef.current
      ) {
        freeSpinAwardedRef.current = true;

        setFreeSpinReady(true);

        setTimeout(() => {
          setCelebrate(null);
          setShowWheel(true);
          // Return to the letter grid so the student isn't left on the
          // already-mastered final letter after the wheel closes.
          setCurrentLetter(null);
          setLastAccuracy(null);
        }, 1800);

        return;
      }

      // Move to the next unfinished target.
      const currentIndex =
        LETTERS.indexOf(letter);

      let nextLetter = null;

      for (
        let offset = 1;
        offset <= LETTERS.length;
        offset++
      ) {
        const candidate =
          LETTERS[
            (currentIndex + offset) %
              LETTERS.length
          ];

        if (
          !nextCompleted.has(candidate)
        ) {
          nextLetter = candidate;
          break;
        }
      }

      setTimeout(() => {
        setCelebrate(null);

        if (nextLetter) {
          setCurrentLetter(nextLetter);
          setLastAccuracy(null);
          setTraceKey(k => k + 1);
        } else {
          setCurrentLetter(null);
        }
      }, 1500);

      return;
    }

    if (advancedStage) {
      const nextStage =
        TRACING_STAGES[nextStageIndex];

      persistLevels({
        ...letterLevels,
        [letter]:
          nextStage?.sizeLevel || 0,
      });

      setCelebrate({
        type: 'stage',
        letter,
        message:
          nextStage?.showGuide
            ? nextStage.label
            : `${nextStage.label} — no dots`,
      });

      setTimeout(() => {
        setCelebrate(null);
        setLastAccuracy(null);
        setTraceKey(k => k + 1);
      }, 900);

      return;
    }

    // Same stage, next copy.
    setTimeout(() => {
      setLastAccuracy(null);
      setTraceKey(k => k + 1);
    }, 450);
  };

  // ---------------------------------------------------------------------------
  // WHEEL CLAIM
  //
  // This is a FREE tracing spin, so it deliberately does NOT increment the
  // normal 100-point claimed-spin counter.
  //
  // Existing one-time prize handling is preserved.
  // Prize weighting/physical-prize definitions live in PrizeWheel.jsx.
  // ---------------------------------------------------------------------------
  const handleClaimPrize = (prize) => {
    setShowWheel(false);
    setFreeSpinReady(false);

    if (
      prize?.oneTime &&
      !redeemedPrizes.includes(prize.id)
    ) {
      const updated = [
        ...redeemedPrizes,
        prize.id,
      ];

      setRedeemedPrizes(updated);

      if (studentData?.id) {
        base44.entities.Student.update(
          studentData.id,
          {
            redeemed_prizes:
              updated,
          }
        ).catch(() => {});
      }
    }
  };

  const handleCloseWheel = () => {
    setShowWheel(false);
    setFreeSpinReady(false);
  };

  // ---------------------------------------------------------------------------
  // NO TARGETS
  // ---------------------------------------------------------------------------
  if (!LETTERS.length) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-2">
            ✏️
          </div>

          <p className="text-slate-500">
            No tracing letters are available yet.
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // LETTER GRID
  // ---------------------------------------------------------------------------
  if (!currentLetter) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center py-6 px-4 gap-4">
        <div className="text-center">
          <div className="text-4xl mb-1">
            ✏️
          </div>

          <h1 className="text-2xl font-bold text-slate-800">
            Letter Tracing
          </h1>

          <p className="text-slate-500 text-sm mt-1">
            Practice big, then get smaller and more independent.
          </p>
        </div>

        {/* Whole-section progress toward the free roulette spin */}
        <div className="w-full max-w-md bg-white rounded-2xl border-2 border-violet-200 shadow-sm px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black uppercase tracking-wide text-violet-700">
              ✏️ Tracing Mission
            </span>

            <span className="text-xs font-black text-violet-700">
              🎡 {sectionProgress}%
            </span>
          </div>

          <div className="w-full h-4 rounded-full bg-violet-100 overflow-hidden border border-violet-200">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-500"
              style={{
                width: `${sectionProgress}%`,
              }}
            />
          </div>

          <div className="flex justify-between mt-1.5">
            <span className="text-[11px] font-bold text-slate-400">
              {masteredCount}/{LETTERS.length} letters mastered
            </span>

            <span className="text-[11px] font-bold text-violet-500">
              {sectionProgress >= 100
                ? '🎉 FREE SPIN!'
                : 'Finish to earn a free spin'}
            </span>
          </div>
        </div>

        {streak > 0 && (
          <div className="bg-amber-100 border border-amber-300 rounded-full px-4 py-1 text-amber-800 font-bold text-sm">
            🔥 {streak} clean in a row!
          </div>
        )}

        <div className="grid grid-cols-5 gap-2 w-full max-w-md">
          {paged.map(letter => {
            const p =
              progressFor(letter);

            const stage =
              getStage(p);

            const done =
              completedLetters.has(letter) ||
              p.mastered;

            const started =
              hasStarted(letter);

            const required =
              getRequiredForStage(p);

            return (
              <button
                key={letter}
                onClick={() => {
                  if (done) return;

                  setCurrentLetter(letter);
                  setLastAccuracy(null);
                  setTraceKey(k => k + 1);
                }}
                className={`h-16 rounded-xl font-bold shadow-sm transition-transform active:scale-95 flex flex-col items-center justify-center border ${
                  done
                    ? 'bg-green-500 border-green-600 text-white'
                    : started
                      ? 'bg-yellow-100 border-yellow-400 text-yellow-900 hover:bg-yellow-200'
                      : 'bg-white text-indigo-700 border-indigo-100 hover:bg-indigo-50'
                }`}
              >
                <span className="text-xl">
                  {letter}
                </span>

                {done ? (
                  <span className="text-[9px] font-black">
                    ✓ MASTERED
                  </span>
                ) : started ? (
                  <span className="text-[9px] font-black">
                    {stage.shortLabel}{' '}
                    {Math.min(
                      p.stageSuccesses,
                      required
                    )}
                    /{required}
                  </span>
                ) : (
                  <span className="text-[9px] font-bold opacity-60">
                    NOT STARTED
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {pageCount > 1 && (
          <div className="flex items-center gap-3">
            <button
              disabled={safePage === 0}
              onClick={() =>
                setPage(p =>
                  Math.max(0, p - 1)
                )
              }
              className="px-3 py-1 rounded-lg bg-white border disabled:opacity-40 text-sm font-bold text-slate-600"
            >
              ← Prev
            </button>

            <span className="text-xs text-slate-400 font-bold">
              {safePage + 1}/{pageCount}
            </span>

            <button
              disabled={
                safePage >= pageCount - 1
              }
              onClick={() =>
                setPage(p =>
                  Math.min(
                    pageCount - 1,
                    p + 1
                  )
                )
              }
              className="px-3 py-1 rounded-lg bg-white border disabled:opacity-40 text-sm font-bold text-slate-600"
            >
              Next →
            </button>
          </div>
        )}

        <p className="text-slate-400 text-xs">
          Yellow = practicing · Green = mastered
        </p>

        {showWheel && (
          <PrizeWheel
            key={`tracing-wheel-${studentKey}`}
            studentData={studentData}
            onStudentPatch={onStudentPatch}
            redeemedPrizes={redeemedPrizes}
            onClaim={handleClaimPrize}
            onClose={handleCloseWheel}
            freeSpin={true}
            source="tracing"
          />
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // ACTIVE LETTER
  // ---------------------------------------------------------------------------
  const letterData =
    waypoints[currentLetter];

  if (!letterData?.strokes?.length) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <div className="text-4xl">
          ✏️
        </div>

        <p className="text-slate-500">
          No tracing path is available for {currentLetter}.
        </p>

        <button
          onClick={() =>
            setCurrentLetter(null)
          }
          className="px-4 py-2 bg-indigo-500 text-white rounded-xl font-bold"
        >
          ← Back
        </button>
      </div>
    );
  }

  const currentProgress =
    progressFor(currentLetter);

  const currentStage =
    getStage(currentProgress);

  const currentRequired =
    getRequiredForStage(
      currentProgress
    );

  // Number of copies shown on the current handwriting line.
  //
  // Mistakes can expand the row by up to 2 repair copies.
  const practiceCopies =
    currentRequired;

  const activeCopy = Math.min(
    currentProgress.stageSuccesses || 0,
    Math.max(0, practiceCopies - 1)
  );

  const sizeLabel =
    SIZE_LEVELS[
      currentStage.sizeLevel
    ]?.label || currentStage.label;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-3 px-3 gap-2">
      {/* Header */}
      <div className="flex items-center justify-between w-full max-w-3xl">
        <button
          onClick={() =>
            setCurrentLetter(null)
          }
          className="text-slate-500 hover:text-slate-800 text-sm font-bold"
        >
          ← All letters
        </button>

        <div className="flex flex-col items-center leading-tight">
          <div className="text-slate-800 font-black text-2xl">
            {currentLetter}
          </div>

          <div className="text-[11px] text-slate-400 font-bold">
            {currentStage.label}
          </div>
        </div>

        <div
          className={`text-xs font-bold rounded-full px-3 py-1 border ${
            currentStage.showGuide
              ? 'text-amber-700 bg-amber-50 border-amber-200'
              : 'text-indigo-700 bg-indigo-50 border-indigo-100'
          }`}
        >
          {currentStage.showGuide
            ? '● Guided'
            : '✍️ Your turn'}
        </div>
      </div>

      {/* Whole mission progress */}
      <div className="w-full max-w-3xl">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-3 rounded-full bg-violet-100 overflow-hidden border border-violet-200">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-500"
              style={{
                width: `${sectionProgress}%`,
              }}
            />
          </div>

          <span className="text-xs font-black text-violet-600 whitespace-nowrap">
            {sectionProgress}% → 🎡
          </span>
        </div>
      </div>

      {/* Current stage status */}
      <div className="flex items-center gap-2 flex-wrap justify-center">
        <div className="bg-white border border-slate-200 rounded-full px-3 py-1 text-xs font-bold text-slate-600">
          {sizeLabel}
        </div>

        <div className="bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1 text-xs font-bold text-indigo-700">
          Trace{' '}
          {Math.min(
            currentProgress.stageSuccesses + 1,
            currentRequired
          )}{' '}
          of {currentRequired}
        </div>

        <div
          className={`rounded-full px-3 py-1 text-xs font-bold border ${
            currentProgress.cleanStreak >=
            REQUIRED_CLEAN_STREAK
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-slate-50 border-slate-200 text-slate-500'
          }`}
        >
          Clean streak:{' '}
          {Math.min(
            currentProgress.cleanStreak,
            REQUIRED_CLEAN_STREAK
          )}
          /{REQUIRED_CLEAN_STREAK}
        </div>

        {currentProgress.repairReps > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-full px-3 py-1 text-xs font-bold text-amber-700">
            +{currentProgress.repairReps} repair practice
          </div>
        )}
      </div>

      {letterData.hint && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-1.5 text-indigo-700 text-sm text-center max-w-lg">
          {letterData.hint}
        </div>
      )}

      <LetterTracingCanvas
        key={`${traceKey}-${currentLetter}-${currentProgress.stageIndex}-${activeCopy}-${practiceCopies}`}
        letter={currentLetter}
        lang={lang}
        strokes={letterData.strokes}
        renderWidth={renderWidthFor(currentLetter)}
        practiceCopies={practiceCopies}
        activeCopy={activeCopy}
        showGuide={currentStage.showGuide}
        onMistake={() =>
          handleMistake(currentLetter)
        }
        onComplete={() =>
          handleComplete(currentLetter)
        }
        onAccuracy={handleAccuracy}
        onReset={() => {}}
      />

      {/* Stage/mastery celebration */}
      {celebrate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div
            className={`rounded-3xl shadow-2xl px-8 py-6 flex flex-col items-center gap-2 ${
              celebrate.type ===
              'repair'
                ? 'bg-amber-50 border-4 border-amber-300'
                : 'bg-white'
            }`}
          >
            {celebrate.type ===
            'repair' ? (
              <div className="text-4xl">
                ✏️
              </div>
            ) : (
              <Sparkles className="w-10 h-10 text-amber-400" />
            )}

            <div className="text-2xl font-black text-slate-800">
              {celebrate.type ===
              'mastered'
                ? `${celebrate.letter} mastered!`
                : celebrate.type ===
                    'stage'
                  ? 'Level Up!'
                  : 'Keep practicing!'}
            </div>

            <div className="text-slate-500 text-sm font-bold">
              {celebrate.message}
            </div>
          </div>
        </div>
      )}

      {/* Free spin wheel after the entire tracing section */}
      {showWheel && (
        <div className="fixed inset-0 z-[150]">
          <div className="absolute top-4 inset-x-0 z-[151] flex justify-center pointer-events-none">
            <div className="bg-violet-600 text-white rounded-full px-6 py-2 font-black shadow-xl">
              🎉 Tracing complete — FREE SPIN! 🎡
            </div>
          </div>

          <PrizeWheel
            key={`tracing-wheel-${studentKey}`}
            studentData={studentData}
            onStudentPatch={onStudentPatch}
            redeemedPrizes={redeemedPrizes}
            onClaim={handleClaimPrize}
            onClose={handleCloseWheel}
            freeSpin={true}
            source="tracing"
          />
        </div>
      )}

      {freeSpinReady && !showWheel && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-violet-600 text-white rounded-full px-5 py-2 font-black shadow-xl z-40">
          🎡 Free spin earned!
        </div>
      )}
    </div>
  );
}