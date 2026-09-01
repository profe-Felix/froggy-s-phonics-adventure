import { useState, useEffect, useRef, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { Sparkles } from 'lucide-react';
import { LETTER_WAYPOINTS } from '../../data/letterWaypoints';
import { NUMBER_WAYPOINTS } from '../../data/numberWaypoints';
import LetterTracingCanvas from '../LetterTracingCanvas';
import PrizeWheel from '../PrizeWheel';
import { base44 } from '@/api/base44Client';
import { getLanguage } from '@/lib/language';
import { useCoinAward } from '@/hooks/useCoinAward';

const BASE_LETTERS = 'abcdefghijklmnopqrstuvwxyz'
  .split('')
  .filter(l => LETTER_WAYPOINTS[l]);

// ñ is a Spanish-only letter; English students never see it.
// Uppercase/lowercase remain distinct when separate waypoint records exist.
const SPANISH_EXTRA = ['ñ', 'Ñ'];

// Default letters enabled for free-play Letter Tracing. Teachers toggle this
// set on/off from the Letter Tracing Authoring page as letters are learned.
const DEFAULT_ENABLED_LETTERS = ['o', 'O', 'i', 'I', 'a', 'A', 'u', 'U', 'e', 'E'];

// -----------------------------------------------------------------------------
// TRACING MASTERY SEQUENCE
//
// Three stages, three traces each = 9 successful traces per mastered letter.
// Support fades: guided first, then independent at two smaller sizes.
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
// Base total = 9 successful traces per mastered letter.
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
    key: 'independent_big',
    label: 'Independent Big',
    shortLabel: 'Big',
    sizeLevel: 1,
    repetitions: 3,
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
];

const SIZE_LEVELS = [
  { w: 1000, label: 'Huge' },
  { w: 760, label: 'Big' },
  { w: 640, label: 'Medium' },
  { w: 540, label: 'Small' },
  { w: 460, label: 'Muscle Memory' },
];

// Visual scale applied to the canvas in fillHeight mode so each size level
// renders visibly smaller (Huge fills the area, Big ~82%, Medium ~68%).
// Without this, fillHeight ignored renderWidth and every size looked identical.
const SIZE_SCALES = [1.0, 0.82, 0.68, 0.56, 0.48];

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
    stageDone: false,
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
  silent = false,
}) {
  const [currentLetter, setCurrentLetter] = useState(null);

  // GLOBAL SIZE PROGRESSION
  // All letters practice at the same size level (Huge → Big → Medium). The
  // size only advances once EVERY letter is mastered at the current size, so
  // the whole class moves down through the sizes together instead of each
  // letter shrinking independently.
  const [globalStageIndex, setGlobalStageIndex] = useState(0);

  // Teacher-managed progression: which letters are enabled for free play.
  // Lesson steps pass their own `targets` and bypass this.
  const [enabledLetters, setEnabledLetters] = useState(
    DEFAULT_ENABLED_LETTERS
  );

  // Green letters only. A letter enters this set after completing every stage.
  const [completedLetters, setCompletedLetters] = useState(new Set());

  const [streak, setStreak] = useState(0);
  const [waypoints, setWaypoints] = useState({
    ...LETTER_WAYPOINTS,
    ...NUMBER_WAYPOINTS,
  });

  // Kept for compatibility with the previous tracing system and persisted
  // per-device size data. The staged system now controls the actual size.
  const [letterLevels, setLetterLevels] = useState({});

  // Per-letter mastery state for this tracing section.
  const [letterProgress, setLetterProgress] = useState({});

  const [lastAccuracy, setLastAccuracy] = useState(null);
  const [celebrate, setCelebrate] = useState(null);
  const [page, setPage] = useState(0);
  const [redoMode, setRedoMode] = useState(false);

  // Character-wheel roll, shown when a letter set (e.g. {a, A}) is mastered.
  const [showWheel, setShowWheel] = useState(false);
  const [freeSpinReady, setFreeSpinReady] = useState(false);

  const [redeemedPrizes, setRedeemedPrizes] = useState(
    () => studentData?.redeemed_prizes || []
  );

  // Awards coins mid-game (perfect-stage bonus) without stale-balance races.
  const awardCoins = useCoinAward(studentData, onStudentPatch);

  // Tracks which letter sets (e.g. "a" = {a, A}) have already earned a wheel
  // roll this session, so each set pays out exactly once.
  const setSpinAwardedRef = useRef(new Set());

  // Counts actual successful traces for analytics.
  const successfulTraceCountRef = useRef(0);

  // Counts every completed/rejected attempt locally.
  const attemptCountRef = useRef(0);

  // Force-remount the tracing canvas for a fresh copy/stage.
  const [traceKey, setTraceKey] = useState(0);

  const studentKey = studentData?.id || 'guest';

  // Ensures the saved per-letter stage state is loaded from the student record
  // only once, so a refresh restores tracing progress instead of resetting it.
  const loadedStageStateRef = useRef(false);

  // ---------------------------------------------------------------------------
  // BLOCK PINCH-TO-ZOOM ON iOS
  //
  // The viewport meta sets user-scalable=no, but iOS Safari ignores that for
  // accessibility and still allows a two-finger pinch to zoom the page. While
  // the student is in Letter Tracing we cancel the gesture events (and any
  // multi-touch move) at the document level so an accidental two-finger
  // touch on the canvas can't zoom or pan the screen mid-stroke.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const prevent = (e) => e.preventDefault();
    const blockMultiTouch = (e) => {
      if (e.touches && e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener('gesturestart', prevent);
    document.addEventListener('gesturechange', prevent);
    document.addEventListener('gestureend', prevent);
    document.addEventListener('touchmove', blockMultiTouch, { passive: false });
    return () => {
      document.removeEventListener('gesturestart', prevent);
      document.removeEventListener('gesturechange', prevent);
      document.removeEventListener('gestureend', prevent);
      document.removeEventListener('touchmove', blockMultiTouch);
    };
  }, []);

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
  // LOAD TEACHER-ENABLED LETTERS
  //
  // Free-play Letter Tracing only shows the letters the teacher has toggled on
  // (progression). Lesson steps pass their own `targets` and skip this.
  // ---------------------------------------------------------------------------
  // Load the enabled letters for this student's class. A per-class override
  // (scope = class name) takes precedence; if none exists, fall back to the
  // global default (scope = 'default'). This lets Schwarz have her own letter
  // progression separate from the Spanish classes.
  useEffect(() => {
    let cancelled = false;
    const cls = studentData?.class_name;

    const loadSettings = async () => {
      try {
        if (cls) {
          const perClass = await base44.entities.TracingSettings.filter({ scope: cls });
          if (cancelled) return;
          if (perClass && perClass.length && Array.isArray(perClass[0].enabled_letters)) {
            setEnabledLetters(perClass[0].enabled_letters);
            return;
          }
        }
        const def = await base44.entities.TracingSettings.filter({ scope: 'default' });
        if (cancelled) return;
        if (def && def.length && Array.isArray(def[0].enabled_letters)) {
          setEnabledLetters(def[0].enabled_letters);
        }
      } catch {}
    };

    loadSettings();
    return () => { cancelled = true; };
  }, [studentData?.class_name]);

  // ---------------------------------------------------------------------------
  // RESTORE SAVED STAGE STATE
  //
  // Per-letter tracing progress (stage index, successes, clean streak, repair
  // reps, mastery) is persisted to mode_progress.letter_tracing.stage_state.
  // Reload it on mount so a refresh keeps the student where they left off
  // instead of resetting every letter to "NOT STARTED".
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (loadedStageStateRef.current) return;

    const saved =
      studentData?.mode_progress?.letter_tracing
        ?.stage_state;

    if (!saved || typeof saved !== 'object') {
      return;
    }

    loadedStageStateRef.current = true;

    const restored = {};
    const restoredCompleted = new Set();

    for (const [letter, state] of Object.entries(
      saved
    )) {
      if (!state || typeof state !== 'object')
        continue;

      restored[letter] = {
        ...makeStageState(),
        ...state,
      };

      if (state.mastered) {
        restoredCompleted.add(letter);
      }
    }

    if (Object.keys(restored).length) {
      setLetterProgress(restored);
      setCompletedLetters(restoredCompleted);

      // MIGRATION: students who mastered letters under the old per-letter
      // stage system have mastered:true but no saved global_stage_index. If
      // every restored letter is mastered, place them at the final size level
      // so the progress bar reads 100% and redo uses the small size.
      const allOldMastered = Object.values(
        restored
      ).every(p => p.mastered);

      if (allOldMastered) {
        setGlobalStageIndex(
          TRACING_STAGES.length - 1
        );
      }
    }

    // Restore the global size level so a refresh keeps the student at the
    // size they reached instead of dropping back to Huge.
    const savedStage =
      studentData?.mode_progress?.letter_tracing?.global_stage_index;
    if (typeof savedStage === 'number' && savedStage > 0) {
      setGlobalStageIndex(
        Math.min(savedStage, TRACING_STAGES.length - 1)
      );
    }
  }, [studentData?.id, studentData?.mode_progress]);

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
        : enabledLetters;

    return Array.from(
      new Set(
        raw
          .map(l => String(l).trim())
          .filter(Boolean)
      )
    ).filter(l => waypoints[l]);
  }, [targets, lang, waypoints, enabledLetters]);

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

  // The whole section shares one stage (size level). All letters practice at
  // this size until every letter is mastered at it, then it advances.
  const globalStage =
    TRACING_STAGES[
      Math.min(globalStageIndex, TRACING_STAGES.length - 1)
    ];

  const stageFor = (letter) => globalStage;

  const sizeLevelFor = (letter) =>
    globalStage.sizeLevel;

  const renderWidthFor = (letter, sizeLevelOverride) => {
    const lvl =
      sizeLevelOverride != null
        ? sizeLevelOverride
        : globalStage.sizeLevel;
    const targetWidth =
      SIZE_LEVELS[lvl]?.w || SIZE_LEVELS[0].w;

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
      p.stageSuccesses > 0 ||
      p.totalSuccesses > 0 ||
      p.mistakes > 0 ||
      p.stageDone
    );
  };

  // ---------------------------------------------------------------------------
  // SECTION PROGRESS BAR
  // ---------------------------------------------------------------------------
  // Whole-section progress: each global size level is worth an equal slice of
  // the bar; within the current level, the fraction of letters done at this
  // size fills the rest. All letters advance through the sizes together.
  const sectionProgress = useMemo(() => {
    if (!LETTERS.length) return 0;

    const stageFraction =
      globalStageIndex / TRACING_STAGES.length;

    const doneAtStage = LETTERS.filter(
      letter => {
        const p =
          letterProgress[letter] ||
          makeStageState();

        return p.mastered || p.stageDone;
      }
    ).length;

    const stagePortion =
      doneAtStage /
      LETTERS.length /
      TRACING_STAGES.length;

    return Math.max(
      0,
      Math.min(
        100,
        Math.round(
          (stageFraction + stagePortion) *
            100
        )
      )
    );
  }, [LETTERS, letterProgress, globalStageIndex]);

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
    nextCompletedLetters,
    stageIndex = globalStageIndex
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
            : stageIndex,
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

        // Full per-letter stage state so a refresh restores progress.
        stage_state: nextProgress,

        // Global size level all letters are currently practicing at.
        global_stage_index: stageIndex,
      }
    );
  };

  // ---------------------------------------------------------------------------
  // RE-REPORT MASTERY ON RE-ENTRY
  //
  // When a student re-enters the lesson with all target letters already
  // mastered from a previous session, the pre-existing-mastery check in
  // LessonModeRouter uses saved mode_progress data — which can have stale
  // learning_items (letters whose waypoints were removed or whose config
  // changed). That inflates the "total" and the check fails, leaving the
  // student stuck: all green, no Next button, and no way to re-trace.
  //
  // Re-report progress here using the actual LETTERS set (only traceable
  // letters) so maybeComplete gets correct data and the step completes.
  // ---------------------------------------------------------------------------
  const reportedAllMasteredRef = useRef(false);

  useEffect(() => {
    if (!LETTERS.length || reportedAllMasteredRef.current) return;

    const allMastered = LETTERS.every(
      letter =>
        completedLetters.has(letter) ||
        letterProgress[letter]?.mastered
    );

    if (!allMastered) return;

    reportedAllMasteredRef.current = true;
    reportProgress(letterProgress, completedLetters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [LETTERS, completedLetters, letterProgress]);

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
    // Redo is free practice — no repair tracking.
    if (
      redoMode &&
      (completedLetters.has(letter) ||
        progressFor(letter).mastered)
    ) {
      return;
    }
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
        completedLetters,
        globalStageIndex
      );

      return next;
    });
  };

  // ---------------------------------------------------------------------------
  // SUCCESSFUL COPY
  // ---------------------------------------------------------------------------
  const handleComplete = (letter) => {
    const acc = lastAccuracy;

    // Redo mode: free practice at a smaller size. No mastery/progress
    // changes, no wheel — just celebrate and offer another trace.
    if (
      redoMode &&
      (completedLetters.has(letter) ||
        progressFor(letter).mastered ||
        progressFor(letter).stageDone)
    ) {
      const isMastered =
        completedLetters.has(letter) ||
        progressFor(letter).mastered;

      setCelebrate({
        type: 'repair',
        letter,
        message: isMastered
          ? '✏️ Nice! Trace it again, smaller.'
          : '✏️ Nice! Free practice.',
      });
      setTimeout(() => setCelebrate(null), 1200);
      setLastAccuracy(null);
      setTraceKey(k => k + 1);
      return;
    }

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

    // GLOBAL SIZE PROGRESSION
    // All letters share one size level. A letter that passes the required
    // traces + clean streak is "done at this size" (stageDone). Only when
    // EVERY letter is stageDone does the global size advance — and every
    // letter resets to practice at the new, smaller size together.
    const current = progressFor(letter);

    if (current.mastered) {
      // Already mastered (e.g. a late duplicate auto-advance). Nothing to do.
      return;
    }

    const stage = globalStage;

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

    let nextLetter;

    if (stagePassed) {
      // Letter completed the current global size. Mark it done at this size.
      // It's only fully mastered if this is the final size level.
      nextLetter = {
        ...current,
        stageSuccesses: nextSuccesses,
        cleanStreak: nextClean,
        totalSuccesses: nextTotalSuccesses,
        totalAttempts:
          (current.totalAttempts || 0) + 1,
        stageDone: true,
        mastered:
          globalStageIndex >=
          TRACING_STAGES.length - 1,
      };
    } else {
      nextLetter = {
        ...current,
        stageSuccesses: nextSuccesses,
        cleanStreak: nextClean,
        totalSuccesses: nextTotalSuccesses,
        totalAttempts:
          (current.totalAttempts || 0) + 1,
      };
    }

    const nextProgress = {
      ...letterProgress,
      [letter]: nextLetter,
    };

    // Check if EVERY letter is now done at the current global size.
    const allStageDone = LETTERS.every(
      l => nextProgress[l]?.stageDone
    );

    let nextGlobalStage = globalStageIndex;
    let advancedGlobal = false;
    let allMastered = false;
    let finalProgress = nextProgress;

    if (allStageDone) {
      if (
        globalStageIndex <
        TRACING_STAGES.length - 1
      ) {
        // Advance the global size level. Every letter resets its stage
        // progress to practice at the new, smaller size.
        nextGlobalStage = globalStageIndex + 1;
        advancedGlobal = true;
        finalProgress = {};

        for (const l of LETTERS) {
          finalProgress[l] = {
            ...nextProgress[l],
            stageSuccesses: 0,
            cleanStreak: 0,
            repairReps: 0,
            stageDone: false,
          };
        }
      } else {
        // Final size level complete for every letter — all mastered.
        allMastered = true;
        finalProgress = {};

        for (const l of LETTERS) {
          finalProgress[l] = {
            ...nextProgress[l],
            mastered: true,
          };
        }
      }
    }

    setLetterProgress(finalProgress);
    setGlobalStageIndex(nextGlobalStage);

    const nextCompleted = new Set(completedLetters);

    if (allMastered) {
      for (const l of LETTERS) {
        nextCompleted.add(l);
      }

      setCompletedLetters(nextCompleted);
    }

    reportProgress(
      finalProgress,
      nextCompleted,
      nextGlobalStage
    );

    // Perfect-stage bonus: completing a size level with zero mistakes (no
    // repair practice added) earns 4 coins.
    if (
      stagePassed &&
      (current.repairReps || 0) === 0
    ) {
      awardCoins(4);
    }

    if (allMastered) {
      setCelebrate({
        type: 'mastered',
        letter,
        message: 'All letters mastered!',
      });

      confetti({
        particleCount: 100,
        spread: 75,
        origin: { y: 0.6 },
      });

      // A "letter set" is the uppercase + lowercase pair (e.g. {a, A}).
      // Each time a set becomes fully mastered the student earns a wheel roll.
      const setKey = letter.toLowerCase();
      const setTargets = LETTERS.filter(
        l => l.toLowerCase() === setKey
      );
      const setComplete =
        setTargets.length > 0 &&
        setTargets.every(
          l => nextCompleted.has(l) || l === letter
        );

      if (
        setComplete &&
        freeSpinEnabled &&
        !setSpinAwardedRef.current.has(setKey)
      ) {
        setSpinAwardedRef.current.add(setKey);

        setFreeSpinReady(true);

        setTimeout(() => {
          setCelebrate(null);
          setShowWheel(true);
          setCurrentLetter(null);
          setLastAccuracy(null);
        }, 1500);

        return;
      }

      setTimeout(() => {
        setCelebrate(null);
        setCurrentLetter(null);
        setLastAccuracy(null);
      }, 1500);

      return;
    }

    if (advancedGlobal) {
      const nextStage =
        TRACING_STAGES[nextGlobalStage];

      setCelebrate({
        type: 'stage',
        letter,
        message:
          nextStage?.showGuide
            ? nextStage.label
            : `${nextStage.label} — no dots`,
      });

      confetti({
        particleCount: 60,
        spread: 60,
        origin: { y: 0.6 },
      });

      setTimeout(() => {
        setCelebrate(null);
        setLastAccuracy(null);
        // Return to the grid so the student sees all letters reset at the
        // new smaller size.
        setCurrentLetter(null);
      }, 1200);

      return;
    }

    if (stagePassed) {
      // Letter done at this size, but other letters still need work. Go back
      // to the grid so the student picks the next unfinished letter.
      setCelebrate({
        type: 'stage',
        letter,
        message: `${letter} done at ${stage.label}!`,
      });

      setTimeout(() => {
        setCelebrate(null);
        setLastAccuracy(null);
        setCurrentLetter(null);
      }, 1000);

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
                ? '🎉 All letters mastered!'
                : 'Earn a roll for each letter set!'}
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

            const stage = globalStage;

            // Fully mastered = completed every size level (green, redo smaller).
            const done =
              completedLetters.has(letter) ||
              p.mastered;

            // Done at the current size but waiting for the rest of the
            // letters to finish before the size advances (blue checkmark).
            const doneAtSize =
              !done && p.stageDone;

            const started =
              hasStarted(letter);

            const required =
              getRequiredForStage(p);

            return (
              <button
                key={letter}
                onClick={() => {
                  if (done) {
                    // Mastered letters reopen as free "redo" practice at a
                    // smaller size — no mastery/wheel changes, just writing
                    // smaller to build muscle memory.
                    setRedoMode(true);
                    setCurrentLetter(letter);
                    setLastAccuracy(null);
                    setTraceKey(k => k + 1);
                    return;
                  }

                  if (doneAtSize) {
                    // Done at this size but waiting for the rest — free
                    // practice at the current size, no progress changes.
                    setRedoMode(true);
                    setCurrentLetter(letter);
                    setLastAccuracy(null);
                    setTraceKey(k => k + 1);
                    return;
                  }

                  setRedoMode(false);
                  setCurrentLetter(letter);
                  setLastAccuracy(null);
                  setTraceKey(k => k + 1);
                }}
                className={`h-16 rounded-xl font-bold shadow-sm transition-transform active:scale-95 flex flex-col items-center justify-center border ${
                  done
                    ? 'bg-green-500 border-green-600 text-white'
                    : doneAtSize
                      ? 'bg-sky-100 border-sky-300 text-sky-900 hover:bg-sky-200'
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
                    ✓ REDO
                  </span>
                ) : doneAtSize ? (
                  <span className="text-[9px] font-black">
                    ✓ Done
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

  const letterMastered =
    completedLetters.has(currentLetter) ||
    currentProgress.mastered;

  // Redo applies to both fully-mastered letters (practice smaller) and
  // letters done at the current size (free practice at the current size
  // while waiting for the rest to finish).
  const redoing =
    redoMode &&
    (letterMastered || currentProgress.stageDone);

  const currentStage = redoing
    ? letterMastered
      ? {
          key: 'redo',
          label: 'Redo — Small',
          shortLabel: 'Redo',
          sizeLevel: 3,
          repetitions: 1,
          showGuide: false,
        }
      : {
          ...globalStage,
          label: `${globalStage.label} — Practice`,
        }
    : globalStage;

  const currentRequired = redoing
    ? 1
    : getRequiredForStage(currentProgress);

  // Number of copies shown on the current handwriting line.
  //
  // Mistakes can expand the row by up to 2 repair copies.
  const practiceCopies =
    currentRequired;

  const activeCopy = redoing
    ? 0
    : Math.min(
        currentProgress.stageSuccesses || 0,
        Math.max(0, practiceCopies - 1)
      );

  const sizeLabel =
    SIZE_LEVELS[
      currentStage.sizeLevel
    ]?.label || currentStage.label;

  // Visual canvas scale per size level so Huge/Big/Medium render visibly
  // different. Mastered-redo shrinks further (sizeLevel 3).
  const sizeScale =
    SIZE_SCALES[currentStage.sizeLevel] ?? 1;

  return (
    <div className="h-full bg-slate-50 flex flex-col items-center py-1.5 px-3 gap-1">
      {/* Compact header — back, letter+stage, guided badge, and mission progress
          all on one row so the canvas gets maximum vertical space. */}
      <div className="flex items-center justify-between w-full max-w-3xl gap-2 shrink-0">
        <button
          onClick={() => {
            setRedoMode(false);
            setCurrentLetter(null);
          }}
          className="text-slate-500 hover:text-slate-800 text-xs font-bold whitespace-nowrap"
        >
          ← All letters
        </button>

        <div className="flex items-center gap-2">
          <div className="text-slate-800 font-black text-xl leading-none">
            {currentLetter}
          </div>
          <div className="text-[11px] text-slate-400 font-bold leading-none">
            {currentStage.label}
          </div>
          <div
            className={`text-[11px] font-bold rounded-full px-2 py-0.5 border ${
              currentStage.showGuide
                ? 'text-amber-700 bg-amber-50 border-amber-200'
                : 'text-indigo-700 bg-indigo-50 border-indigo-100'
            }`}
          >
            {currentStage.showGuide ? '● Guided' : '✍️ Your turn'}
          </div>
        </div>

        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-20 h-2.5 rounded-full bg-violet-100 overflow-hidden border border-violet-200">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-500"
              style={{ width: `${sectionProgress}%` }}
            />
          </div>
          <span className="text-[11px] font-black text-violet-600 whitespace-nowrap">
            {sectionProgress}%
          </span>
        </div>
      </div>

      {/* Compact stage status — single tight row of small pills */}
      <div className="flex items-center gap-1.5 flex-wrap justify-center shrink-0">
        <div className="bg-white border border-slate-200 rounded-full px-2 py-0.5 text-[11px] font-bold text-slate-600">
          {sizeLabel}
        </div>

        {redoing ? (
          <div className="bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5 text-[11px] font-bold text-violet-700">
            ↻ Redo
          </div>
        ) : (
          <>
            <div className="bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5 text-[11px] font-bold text-indigo-700">
              Trace {Math.min(currentProgress.stageSuccesses + 1, currentRequired)}/{currentRequired}
            </div>

            <div
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold border ${
                currentProgress.cleanStreak >= REQUIRED_CLEAN_STREAK
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
            >
              Streak {Math.min(currentProgress.cleanStreak, REQUIRED_CLEAN_STREAK)}/{REQUIRED_CLEAN_STREAK}
            </div>

            {currentProgress.repairReps > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 text-[11px] font-bold text-amber-700">
                +{currentProgress.repairReps} repair
              </div>
            )}
          </>
        )}
      </div>

      {letterData.hint && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1 text-indigo-700 text-xs text-center max-w-lg shrink-0">
          {letterData.hint}
        </div>
      )}

      <div className="flex-1 min-h-0 w-full overflow-x-auto overflow-y-hidden flex items-center justify-center">
        <LetterTracingCanvas
          key={`${traceKey}-${currentLetter}-${globalStageIndex}-${activeCopy}-${practiceCopies}-${redoing}`}
          letter={currentLetter}
          lang={lang}
          strokes={letterData.strokes}
          renderWidth={renderWidthFor(
            currentLetter,
            redoing && letterMastered ? 3 : undefined
          )}
          practiceCopies={practiceCopies}
          activeCopy={activeCopy}
          showGuide={currentStage.showGuide}
          silent={silent}
          fillHeight
          sizeScale={sizeScale}
          onMistake={() =>
            handleMistake(currentLetter)
          }
          onComplete={() =>
            handleComplete(currentLetter)
          }
          onAccuracy={handleAccuracy}
          onReset={() => {}}
        />
      </div>

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
              🎉 Letter set complete — FREE ROLL! 🎡
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
          🎡 Free roll earned!
        </div>
      )}
    </div>
  );
}