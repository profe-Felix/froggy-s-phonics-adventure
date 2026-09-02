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
import FreehandReplayModal from '@/components/tracing/FreehandReplayModal';

const DEFAULT_ENABLED_LETTERS = ['o', 'O', 'i', 'I', 'a', 'A', 'u', 'U', 'e', 'E'];

// -----------------------------------------------------------------------------
// SIZES — all letters share one size. The size advances only when EVERY letter
// has mastered (guided + practice) at the current size. New letters (enabled
// after the cohort already advanced) start at Huge and progress independently
// until they catch up to the cohort.
// -----------------------------------------------------------------------------
const SIZES = [
  { key: 'huge', label: 'Huge', sizeLevel: 0 },
  { key: 'big', label: 'Big', sizeLevel: 1 },
  { key: 'medium', label: 'Medium', sizeLevel: 2 },
  { key: 'small', label: 'Small', sizeLevel: 3 },
  { key: 'tiny', label: 'Tiny', sizeLevel: 4 },
  { key: 'paper', label: 'Paper', sizeLevel: 5 },
];

// PHASES — at each size, letters first trace with guide dots (guided), then
// without (practice). Both phases must be completed to master the size.
// 3 guided + 2 practice = 5 traces per size · 3 sizes = 15 total to master.
// PHASES moved inside the component — reps depend on whether this is the test
// student (student 30), who gets 1 rep per phase for fast progression testing.

const SIZE_LEVELS = [
  { w: 1000, label: 'Huge' },
  { w: 740, label: 'Big' },
  { w: 550, label: 'Medium' },
  { w: 400, label: 'Small' },
  { w: 300, label: 'Tiny' },
  { w: 220, label: 'Paper' },
];

// Visual scale applied to the canvas in fillHeight mode so each size level
// renders visibly smaller. Geometric progression from 1.0 → 0.22 (each tier
// ~74% of the previous), easing kids down to real lined-paper size on iPad.
const SIZE_SCALES = [1.0, 0.74, 0.55, 0.40, 0.30, 0.22];

const REQUIRED_CLEAN_STREAK = 2;
const MAX_REPAIR_REPS = 2;
const PAGE_SIZE = 10;

// New students start at Medium (index 2) instead of Huge (index 0) — gets
// them writing at a smaller, more practical size right from the start.
const STARTING_SIZE_INDEX = 2;

function makeLetterState() {
  return {
    sizeLevel: STARTING_SIZE_INDEX,  // 0=Huge, 1=Big, 2=Medium, 3=Small, 4=Tiny, 5=Paper
    phase: 'guided',    // 'guided' | 'practice' | 'more'
    phaseSuccesses: 0,
    cleanStreak: 0,
    repairReps: 0,
    mistakes: 0,
    totalSuccesses: 0,
    totalAttempts: 0,
    doneAtSize: false,  // completed all phases at the current size
    fullyMastered: false,
    isNew: false,
    sizesCompleted: 0,  // how many sizes finished (drives per-set-per-size spins)
  };
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

  // Cohort size — shared by all non-new letters. Advances only when every
  // non-new letter has mastered (guided + practice) at the current size.
  const [globalSizeIndex, setGlobalSizeIndex] = useState(STARTING_SIZE_INDEX);

  const [enabledLetters, setEnabledLetters] = useState(DEFAULT_ENABLED_LETTERS);
  const [completedLetters, setCompletedLetters] = useState(new Set());
  const [streak, setStreak] = useState(0);
  const [waypoints, setWaypoints] = useState({ ...LETTER_WAYPOINTS, ...NUMBER_WAYPOINTS });
  const [letterProgress, setLetterProgress] = useState({});
  const [lastAccuracy, setLastAccuracy] = useState(null);
  const [celebrate, setCelebrate] = useState(null);
  const [page, setPage] = useState(0);
  const [redoMode, setRedoMode] = useState(false);
  const [showWheel, setShowWheel] = useState(false);
  const [freeSpinReady, setFreeSpinReady] = useState(false);
  const [redeemedPrizes, setRedeemedPrizes] = useState(() => studentData?.redeemed_prizes || []);
  const [traceKey, setTraceKey] = useState(0);
  const [replayLetter, setReplayLetter] = useState(null);

  const awardCoins = useCoinAward(studentData, onStudentPatch);
  const spinEarnedRef = useRef(false);
  const setSpinAwardedRef = useRef(new Set());
  const setSizeSpinAwardedRef = useRef(new Set()); // per-set-per-size: "a:0", "a:1", ...
  const successfulTraceCountRef = useRef(0);
  const attemptCountRef = useRef(0);
  const loadedStateRef = useRef(false);
  const reportedAllMasteredRef = useRef(false);
  const studentKey = studentData?.id || 'guest';

  // Student 30 is the teacher's test account — 1 rep per phase so they can zip
  // through guided → practice → more at each size. Everyone else gets 5.
  const isTestStudent = studentData?.student_number === 30;
  const PHASES = useMemo(() => [
    { key: 'guided', label: 'Guided', reps: isTestStudent ? 1 : 6, showGuide: true },
    { key: 'practice', label: 'Practice', reps: isTestStudent ? 1 : 6, showGuide: false },
    { key: 'more', label: 'More', reps: isTestStudent ? 1 : 6, showGuide: true },
  ], [isTestStudent]);

  // Size override for visual testing (e.g. checking sizes on iPad as student
  // 30). When set, every letter opens at that size with guided dots and no
  // progress is saved. Initialized from ?traceSize=0|1|2 if present; toggled
  // via the preview buttons on the grid screen.
  const [forcedSize, setForcedSize] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const v = parseInt(params.get('traceSize'), 10);
      return v >= 0 && v < SIZES.length ? v : null;
    } catch { return null; }
  });

  // Block pinch-to-zoom on iOS.
  useEffect(() => {
    const prevent = (e) => e.preventDefault();
    const blockMultiTouch = (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); };
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

  // Load waypoints from DB (overrides built-in defaults).
  useEffect(() => {
    let cancelled = false;
    base44.entities.LetterWaypoint.list().then((records) => {
      if (cancelled || !Array.isArray(records) || records.length === 0) return;
      setWaypoints((prev) => {
        const merged = { ...prev };
        for (const r of records) {
          if (!r.letter || !r.strokes_data) continue;
          try {
            const strokes = JSON.parse(r.strokes_data);
            if (Array.isArray(strokes) && strokes.length) {
              merged[r.letter] = { strokes, hint: r.hint || prev[r.letter]?.hint || '' };
            }
          } catch {}
        }
        return merged;
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Load teacher-enabled letters for this student's class.
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

  const lang = getLanguage(studentData);

  const LETTERS = useMemo(() => {
    const raw = targets && targets.length > 0 ? targets : enabledLetters;
    return Array.from(new Set(raw.map(l => String(l).trim()).filter(Boolean))).filter(l => waypoints[l]);
  }, [targets, lang, waypoints, enabledLetters]);

  const pageCount = Math.max(1, Math.ceil(LETTERS.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = LETTERS.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // Restore saved state (with migration from the old per-letter stage model).
  useEffect(() => {
    if (loadedStateRef.current) return;
    // Don't lock the loaded flag until the real student record is present.
    // If this component mounts before studentData is fetched, returning here
    // (without setting the flag) lets the effect re-run once the data arrives,
    // so the saved size is restored instead of silently reverting to Huge.
    if (!studentData?.id) return;
    const saved = studentData?.mode_progress?.letter_tracing?.stage_state;
    const savedGlobal = studentData?.mode_progress?.letter_tracing?.global_size_index
      ?? studentData?.mode_progress?.letter_tracing?.global_stage_index;

    loadedStateRef.current = true;

    if (!saved || typeof saved !== 'object') return;

    const restored = {};
    const restoredCompleted = new Set();

    for (const [letter, s] of Object.entries(saved)) {
      if (!s || typeof s !== 'object') continue;

      if (s.fullyMastered || s.mastered) {
        // Old mastery from a previous (5-tier) system is no longer valid under
        // the new 6-tier system — nobody could have completed all 6 sizes yet.
        // Only keep mastery if sizesCompleted actually covers all current tiers;
        // otherwise demote to Big (second size) and restart guided tracing.
        const completed = s.sizesCompleted || 0;
        if (completed >= SIZES.length) {
          restored[letter] = { ...makeLetterState(), fullyMastered: true, sizeLevel: SIZES.length - 1, sizesCompleted: SIZES.length };
          restoredCompleted.add(letter);
        } else {
          restored[letter] = { ...makeLetterState(), sizeLevel: 1, phase: 'guided', sizesCompleted: completed };
        }
      } else if (s.phase || s.sizeLevel != null) {
        // Already new format — restore as-is.
        restored[letter] = { ...makeLetterState(), ...s, sizesCompleted: s.sizesCompleted || 0 };
      } else {
        // Old per-letter stage format → migrate.
        const oldStage = Math.min(s.stageIndex || 0, SIZES.length - 1);
        restored[letter] = { ...makeLetterState(), sizeLevel: oldStage, phase: 'guided' };
      }
    }

    if (Object.keys(restored).length) {
      setLetterProgress(restored);
      setCompletedLetters(restoredCompleted);

      // If every restored letter is fully mastered, the cohort has finished
      // all sizes — place the global size at the final level so the progress
      // bar reads 100% and redo uses the small size.
      const allMastered = Object.values(restored).every(p => p.fullyMastered);
      if (allMastered) {
        setGlobalSizeIndex(SIZES.length - 1);
      }
    }

    if (typeof savedGlobal === 'number' && savedGlobal > 0) {
      setGlobalSizeIndex(Math.min(SIZES.length - 1, savedGlobal));
    } else if (Object.keys(restored).length) {
      // Fallback: derive global size from the minimum sizesCompleted across
      // non-new, non-mastered letters. Fixes data saved before
      // global_size_index was added to the schema — the cohort size equals
      // the fewest sizes any letter has completed.
      const nonNew = Object.values(restored).filter(p => !p.isNew && !p.fullyMastered);
      if (nonNew.length) {
        const minCompleted = Math.min(...nonNew.map(p => p.sizesCompleted || 0));
        if (minCompleted > 0 && minCompleted < SIZES.length) {
          setGlobalSizeIndex(minCompleted);
        }
      }
    }
  }, [studentData?.id, studentData?.mode_progress]);

  // Ensure every letter in LETTERS has a state. Letters with no saved state
  // when the cohort has already advanced past Huge are "new" — they start at
  // Huge (sizeLevel 0) and progress independently until they catch up.
  useEffect(() => {
    if (!LETTERS.length) return;
    setLetterProgress(prev => {
      let changed = false;
      const next = { ...prev };
      for (const l of LETTERS) {
        if (!next[l]) {
          next[l] = { ...makeLetterState(), isNew: globalSizeIndex > STARTING_SIZE_INDEX };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [LETTERS, globalSizeIndex]);

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------
  const progressFor = (letter) => letterProgress[letter] || makeLetterState();

  const effectiveSize = (letter) => {
    if (forcedSize != null) return forcedSize;
    const p = progressFor(letter);
    return p.isNew ? p.sizeLevel : globalSizeIndex;
  };

  const currentPhaseInfo = (letter) => {
    if (forcedSize != null) return PHASES[0];
    const p = progressFor(letter);
    return PHASES.find(ph => ph.key === p.phase) || PHASES[0];
  };

  const getRequired = (letter) => {
    const p = progressFor(letter);
    const phase = PHASES.find(ph => ph.key === p.phase) || PHASES[0];
    return phase.reps;
  };

  const renderWidthFor = (sizeLevel) => {
    const targetWidth = SIZE_LEVELS[sizeLevel]?.w || SIZE_LEVELS[0].w;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 800;
    return Math.min(targetWidth, Math.max(320, viewportWidth * 0.96));
  };

  const hasStarted = (letter) => {
    const p = progressFor(letter);
    return p.phaseSuccesses > 0 || p.totalSuccesses > 0 || p.mistakes > 0 || p.doneAtSize;
  };

  // ---------------------------------------------------------------------------
  // SECTION PROGRESS BAR
  // ---------------------------------------------------------------------------
  const sectionProgress = useMemo(() => {
    if (!LETTERS.length) return 0;
    const sizeFraction = globalSizeIndex / SIZES.length;
    const doneAtSize = LETTERS.filter(l => {
      const p = letterProgress[l] || makeLetterState();
      return p.fullyMastered || p.doneAtSize;
    }).length;
    const stagePortion = doneAtSize / LETTERS.length / SIZES.length;
    return Math.max(0, Math.min(100, Math.round((sizeFraction + stagePortion) * 100)));
  }, [LETTERS, letterProgress, globalSizeIndex]);

  const masteredCount = LETTERS.filter(l =>
    completedLetters.has(l) || letterProgress[l]?.fullyMastered
  ).length;

  // ---------------------------------------------------------------------------
  // REPORT PROGRESS (LessonModeRouter compatibility)
  // ---------------------------------------------------------------------------
  const reportProgress = (nextProgress, nextCompleted, sizeIdx = globalSizeIndex) => {
    if (!onUpdateProgress) return;
    const masteredItems = LETTERS.filter(l =>
      nextCompleted.has(l) || nextProgress[l]?.fullyMastered
    );
    const itemAttempts = {};
    for (const letter of LETTERS) {
      const p = nextProgress[letter] || makeLetterState();
      itemAttempts[letter] = {
        correct: p.totalSuccesses || 0,
        total: p.totalAttempts || 0,
        size: p.fullyMastered ? SIZES.length : (p.isNew ? p.sizeLevel : sizeIdx),
        phase: p.phase,
        clean_streak: p.cleanStreak || 0,
        mistakes: p.mistakes || 0,
        mastered: !!p.fullyMastered,
      };
    }
    onUpdateProgress('letter_tracing', {
      mastered_items: masteredItems,
      total_attempts: masteredItems.length,
      total_correct: successfulTraceCountRef.current,
      raw_trace_attempts: attemptCountRef.current,
      learning_items: LETTERS.filter(l => !masteredItems.includes(l)),
      item_attempts: itemAttempts,
      stage_state: nextProgress,
      global_stage_index: sizeIdx,
      global_size_index: sizeIdx,
    });
  };

  // Re-report mastery on re-entry (fixes stale learning_items).
  useEffect(() => {
    if (!LETTERS.length || reportedAllMasteredRef.current) return;
    const allMastered = LETTERS.every(l =>
      completedLetters.has(l) || letterProgress[l]?.fullyMastered
    );
    if (!allMastered) return;
    reportedAllMasteredRef.current = true;
    reportProgress(letterProgress, completedLetters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [LETTERS, completedLetters, letterProgress]);

  // Initialize set+size spin tracking — mark already-completed set+size
  // combos as awarded so existing mastered students don't get retroactive spins.
  const spinInitRef = useRef(false);
  useEffect(() => {
    if (spinInitRef.current || !loadedStateRef.current || !LETTERS.length) return;
    spinInitRef.current = true;
    const sets = {};
    for (const l of LETTERS) {
      const lower = l.toLowerCase();
      if (!sets[lower]) sets[lower] = [];
      sets[lower].push(l);
    }
    for (const [lower, setLetters] of Object.entries(sets)) {
      if (setLetters.length < 2) continue;
      for (let si = 0; si < SIZES.length; si++) {
        const allDone = setLetters.every(l => {
          const p = letterProgress[l] || makeLetterState();
          return (p.sizesCompleted || 0) > si || p.fullyMastered;
        });
        if (allDone) setSizeSpinAwardedRef.current.add(`${lower}:${si}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [LETTERS, letterProgress]);

  const handleAccuracy = (acc) => setLastAccuracy(acc);

  // ---------------------------------------------------------------------------
  // MISTAKE / REPAIR PRACTICE
  // ---------------------------------------------------------------------------
  const handleMistake = (letter) => {
    if (forcedSize != null) return;
    if (redoMode && (completedLetters.has(letter) || progressFor(letter).fullyMastered || progressFor(letter).doneAtSize)) return;
    attemptCountRef.current += 1;
    setStreak(0);
    setLetterProgress(prev => {
      const current = prev[letter] || makeLetterState();
      if (current.fullyMastered) return prev;
      const nextLetter = {
        ...current,
        cleanStreak: 0,
        mistakes: current.mistakes + 1,
        totalAttempts: current.totalAttempts + 1,
        repairReps: Math.min(MAX_REPAIR_REPS, current.repairReps + 1),
      };
      const next = { ...prev, [letter]: nextLetter };
      reportProgress(next, completedLetters, globalSizeIndex);
      return next;
    });
  };

  // ---------------------------------------------------------------------------
  // SUCCESSFUL COPY — advance phase / size / cohort
  // ---------------------------------------------------------------------------
  const handleComplete = (letter) => {
    const acc = lastAccuracy;

    // Forced-size preview: just remount, no progress.
    if (forcedSize != null) {
      setCelebrate({ type: 'repair', letter, message: `Preview — ${SIZES[forcedSize].label}` });
      setTimeout(() => setCelebrate(null), 800);
      setLastAccuracy(null);
      setTraceKey(k => k + 1);
      return;
    }

    // Redo mode: free practice, no progress changes.
    if (redoMode && (completedLetters.has(letter) || progressFor(letter).fullyMastered || progressFor(letter).doneAtSize)) {
      const isMastered = completedLetters.has(letter) || progressFor(letter).fullyMastered;
      setCelebrate({
        type: 'repair', letter,
        message: isMastered ? '✏️ Nice! Trace it again, smaller.' : '✏️ Nice! Free practice.',
      });
      setTimeout(() => setCelebrate(null), 1200);
      setLastAccuracy(null);
      setTraceKey(k => k + 1);
      return;
    }

    attemptCountRef.current += 1;

    // Freehand reps (dot-only / freehand) have no accuracy gate — any
    // attempt is accepted. Only trace reps can be "rough" (amber < 80%).
    const comp = progressFor(letter);
    const wasFreehand = comp.phase !== 'guided' && (comp.phaseSuccesses % 2 === 1);

    // Rough trace (< 80%): repair practice, don't advance.
    if (!wasFreehand && acc != null && acc < 80) {
      setStreak(0);
      setLetterProgress(prev => {
        const current = prev[letter] || makeLetterState();
        const nextLetter = {
          ...current, cleanStreak: 0,
          mistakes: current.mistakes + 1,
          totalAttempts: current.totalAttempts + 1,
          repairReps: Math.min(MAX_REPAIR_REPS, current.repairReps + 1),
        };
        const next = { ...prev, [letter]: nextLetter };
        reportProgress(next, completedLetters);
        return next;
      });
      setCelebrate({ type: 'repair', letter, message: 'Almost! One more practice trace.' });
      setTimeout(() => setCelebrate(null), 1000);
      setLastAccuracy(null);
      setTraceKey(k => k + 1);
      return;
    }

    successfulTraceCountRef.current += 1;
    setStreak(s => s + 1);

    const current = progressFor(letter);
    if (current.fullyMastered) return;

    const phase = PHASES.find(p => p.key === current.phase) || PHASES[0];
    const required = phase.reps;
    const nextSuccesses = current.phaseSuccesses + 1;
    const nextClean = current.cleanStreak + 1;
    // 5 green traces masters the phase — no clean-streak gate. Yellow traces
    // don't count toward the 5 (they don't increment phaseSuccesses). A 2-clean
    // streak at completion earns bonus coins instead of being required.
    const phasePassed = nextSuccesses >= required;

    let nextLetter = {
      ...current,
      phaseSuccesses: phasePassed ? 0 : nextSuccesses,
      cleanStreak: phasePassed ? 0 : nextClean,
      totalSuccesses: current.totalSuccesses + 1,
      totalAttempts: current.totalAttempts + 1,
    };

    let nextProgress = { ...letterProgress, [letter]: nextLetter };
    let nextGlobalSize = globalSizeIndex;
    let advancedGlobal = false;
    let phaseAdvanced = false;
    let sizeAdvanced = false;
    let doneWaiting = false;
    let finalProgress = nextProgress;

    if (phasePassed) {
      if (current.phase === 'guided') {
        // Guided done → practice.
        finalProgress = { ...nextProgress, [letter]: { ...nextLetter, phase: 'practice' } };
        phaseAdvanced = true;
      } else if (current.phase === 'practice') {
        // Practice done → more.
        finalProgress = { ...nextProgress, [letter]: { ...nextLetter, phase: 'more' } };
        phaseAdvanced = true;
      } else {
        // 'more' done → doneAtSize.
        const completedSizeIdx = current.isNew ? current.sizeLevel : globalSizeIndex;
        const doneLetter = { ...nextLetter, doneAtSize: true, sizesCompleted: Math.max(current.sizesCompleted || 0, completedSizeIdx + 1) };
        finalProgress = { ...nextProgress, [letter]: doneLetter };

        if (doneLetter.isNew) {
          // New letter: advance independently through sizes until it catches up.
          const nextSize = doneLetter.sizeLevel + 1;
          if (nextSize > SIZES.length - 1) {
            finalProgress = { ...finalProgress, [letter]: { ...doneLetter, fullyMastered: true, sizesCompleted: SIZES.length } };
          } else if (nextSize >= globalSizeIndex) {
            // Caught up to the cohort — join it at the new size.
            finalProgress = { ...finalProgress, [letter]: { ...doneLetter, sizeLevel: nextSize, phase: 'guided', phaseSuccesses: 0, cleanStreak: 0, repairReps: 0, doneAtSize: false, isNew: false } };
          } else {
            finalProgress = { ...finalProgress, [letter]: { ...doneLetter, sizeLevel: nextSize, phase: 'guided', phaseSuccesses: 0, cleanStreak: 0, repairReps: 0, doneAtSize: false } };
          }
          sizeAdvanced = true;
        } else {
          // Cohort letter: check if ALL non-new letters are doneAtSize.
          const allCohortDone = LETTERS.every(l => {
            const lp = finalProgress[l] || makeLetterState();
            return lp.isNew || lp.doneAtSize || lp.fullyMastered;
          });
          if (allCohortDone) {
            if (globalSizeIndex < SIZES.length - 1) {
              // Advance the cohort to the next size. Non-new letters reset to
              // guided; new letters keep their own independent state.
              nextGlobalSize = globalSizeIndex + 1;
              advancedGlobal = true;
              finalProgress = {};
              for (const l of LETTERS) {
                const lp = nextProgress[l] || makeLetterState();
                if (lp.isNew) finalProgress[l] = lp;
                else finalProgress[l] = { ...lp, phase: 'guided', phaseSuccesses: 0, cleanStreak: 0, repairReps: 0, doneAtSize: false, sizesCompleted: Math.max(lp.sizesCompleted || 0, globalSizeIndex + 1) };
              }
            } else {
              // Final size done for the cohort — mark non-new as fullyMastered.
              finalProgress = {};
              for (const l of LETTERS) {
                const lp = nextProgress[l] || makeLetterState();
                if (lp.isNew) finalProgress[l] = lp;
                else finalProgress[l] = { ...lp, fullyMastered: true, sizesCompleted: SIZES.length };
              }
            }
          } else {
            doneWaiting = true;
          }
        }
      }
    }

    const allMastered = LETTERS.every(l => finalProgress[l]?.fullyMastered);
    const cohortMastered = LETTERS.every(l => {
      const lp = finalProgress[l] || makeLetterState();
      return lp.isNew || lp.fullyMastered;
    });

    setLetterProgress(finalProgress);
    setGlobalSizeIndex(nextGlobalSize);

    const nextCompleted = new Set(completedLetters);
    for (const l of LETTERS) {
      if (finalProgress[l]?.fullyMastered) nextCompleted.add(l);
    }
    setCompletedLetters(nextCompleted);

    reportProgress(finalProgress, nextCompleted, nextGlobalSize);

    if (phasePassed && (current.repairReps || 0) === 0) awardCoins(2);
    // Bonus coins for ending the phase on a 2-clean streak (both the last
    // trace and the one before were green). Not required to advance — just
    // rewards clean handwriting.
    if (phasePassed && nextClean >= REQUIRED_CLEAN_STREAK) awardCoins(3);

    // ── Per-set-per-size spin ──
    // When both letters in a set (e.g. 'a' + 'A') finish the same size,
    // the student earns a wheel roll. One roll per set per size.
    if (freeSpinEnabled && phasePassed && current.phase === 'more') {
      const lower = letter.toLowerCase();
      const setLetters = LETTERS.filter(l => l.toLowerCase() === lower);
      if (setLetters.length >= 2) {
        for (let si = 0; si < SIZES.length; si++) {
          const spinKey = `${lower}:${si}`;
          if (setSizeSpinAwardedRef.current.has(spinKey)) continue;
          const allDone = setLetters.every(l => {
            const p = finalProgress[l] || makeLetterState();
            return (p.sizesCompleted || 0) > si || p.fullyMastered;
          });
          if (allDone) {
            setSizeSpinAwardedRef.current.add(spinKey);
            spinEarnedRef.current = true;
            setCelebrate({ type: 'mastered', letter, message: `${SIZES[si].label} ${lower.toUpperCase()}${lower} complete!` });
            confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
            setTimeout(() => { setCelebrate(null); setShowWheel(true); setCurrentLetter(null); setLastAccuracy(null); }, 1500);
            return;
          }
        }
      }
    }

    // Celebrate.
    if (allMastered) {
      setCelebrate({ type: 'mastered', letter, message: 'All letters mastered!' });
      confetti({ particleCount: 100, spread: 75, origin: { y: 0.6 } });
      const setKey = letter.toLowerCase();
      const setTargets = LETTERS.filter(l => l.toLowerCase() === setKey);
      const setComplete = setTargets.length > 0 && setTargets.every(l => nextCompleted.has(l) || l === letter);
      if (setComplete && freeSpinEnabled && !setSpinAwardedRef.current.has(setKey)) {
        setSpinAwardedRef.current.add(setKey);
        spinEarnedRef.current = true;
        setFreeSpinReady(true);
        setTimeout(() => { setCelebrate(null); setShowWheel(true); setCurrentLetter(null); setLastAccuracy(null); }, 1500);
        return;
      }
      setTimeout(() => { setCelebrate(null); setCurrentLetter(null); setLastAccuracy(null); }, 1500);
      return;
    }

    if (cohortMastered && !allMastered) {
      setCelebrate({ type: 'mastered', letter, message: 'All letters mastered!' });
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
      setTimeout(() => { setCelebrate(null); setCurrentLetter(null); setLastAccuracy(null); }, 1500);
      return;
    }

    if (advancedGlobal) {
      const nextSize = SIZES[nextGlobalSize];
      setCelebrate({ type: 'stage', letter, message: `${nextSize.label} — guided!` });
      confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 } });
      setTimeout(() => { setCelebrate(null); setLastAccuracy(null); setCurrentLetter(null); }, 1200);
      return;
    }

    if (sizeAdvanced) {
      const newSize = SIZES[finalProgress[letter].sizeLevel];
      setCelebrate({ type: 'stage', letter, message: newSize ? `${newSize.label} — guided!` : 'Mastered!' });
      setTimeout(() => { setCelebrate(null); setLastAccuracy(null); setTraceKey(k => k + 1); }, 1000);
      return;
    }

    if (phaseAdvanced) {
      const msg = current.phase === 'guided' ? 'Practice — trace & dot!' : 'More — trace & freehand!';
      setCelebrate({ type: 'stage', letter, message: msg });
      setTimeout(() => { setCelebrate(null); setLastAccuracy(null); setTraceKey(k => k + 1); }, 1000);
      return;
    }

    if (doneWaiting) {
      setCelebrate({ type: 'stage', letter, message: `${letter} done at ${SIZES[globalSizeIndex].label}!` });
      setTimeout(() => { setCelebrate(null); setLastAccuracy(null); setCurrentLetter(null); }, 1000);
      return;
    }

    // Same phase, next copy.
    setTimeout(() => { setLastAccuracy(null); setTraceKey(k => k + 1); }, 450);
  };

  // ---------------------------------------------------------------------------
  // WHEEL CLAIM
  // ---------------------------------------------------------------------------
  const handleClaimPrize = (prize) => {
    setShowWheel(false);
    setFreeSpinReady(false);
    spinEarnedRef.current = false;
    if (prize?.oneTime && !redeemedPrizes.includes(prize.id)) {
      const updated = [...redeemedPrizes, prize.id];
      setRedeemedPrizes(updated);
      if (studentData?.id) {
        base44.entities.Student.update(studentData.id, { redeemed_prizes: updated }).catch(() => {});
      }
    }
  };

  const handleCloseWheel = () => {
    setShowWheel(false);
    setFreeSpinReady(false);
    // The free spin was earned but not claimed — bank it so the student
    // can claim it later from the home screen.
    if (spinEarnedRef.current && studentData?.id) {
      const banked = (studentData.banked_spins || 0) + 1;
      onStudentPatch?.({ banked_spins: banked });
    }
    spinEarnedRef.current = false;
  };

  if (!LETTERS.length) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-2">✏️</div>
          <p className="text-slate-500">No tracing letters are available yet.</p>
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
        {forcedSize != null && (
          <div className="bg-amber-100 border border-amber-300 rounded-full px-4 py-1 text-amber-800 font-bold text-sm">
            🔍 Preview size: {SIZES[forcedSize].label} (traceSize={forcedSize})
          </div>
        )}
        <div className="text-center">
          <div className="text-4xl mb-1">✏️</div>
          <h1 className="text-2xl font-bold text-slate-800">Letter Tracing</h1>
          <p className="text-slate-500 text-sm mt-1">Master every letter at each size, then shrink together.</p>
        </div>

        <div className="w-full max-w-md bg-white rounded-2xl border-2 border-violet-200 shadow-sm px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black uppercase tracking-wide text-violet-700">✏️ Tracing Mission</span>
            <span className="text-xs font-black text-violet-700">🎡 {sectionProgress}%</span>
          </div>
          <div className="w-full h-4 rounded-full bg-violet-100 overflow-hidden border border-violet-200">
            <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${sectionProgress}%` }} />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[11px] font-bold text-slate-400">{masteredCount}/{LETTERS.length} letters mastered</span>
            <span className="text-[11px] font-bold text-violet-500">{sectionProgress >= 100 ? '🎉 All letters mastered!' : 'Earn a roll for each letter set!'}</span>
          </div>
        </div>

        {streak > 0 && (
          <div className="bg-amber-100 border border-amber-300 rounded-full px-4 py-1 text-amber-800 font-bold text-sm">
            🔥 {streak} clean in a row!
          </div>
        )}

        <div className="grid grid-cols-5 gap-2 w-full max-w-md">
          {paged.map(letter => {
            const p = progressFor(letter);
            const done = completedLetters.has(letter) || p.fullyMastered;
            const doneAtSize = !done && p.doneAtSize;
            const started = hasStarted(letter);
            const phase = currentPhaseInfo(letter);
            const required = getRequired(letter);
            const sizeLabel = SIZES[effectiveSize(letter)]?.label || 'Huge';
            return (
              <div key={letter} className="relative">
              <button
                onClick={() => {
                  if (forcedSize != null) {
                    setRedoMode(false);
                    setCurrentLetter(letter);
                    setLastAccuracy(null);
                    setTraceKey(k => k + 1);
                    return;
                  }
                  if (done || doneAtSize) {
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
                className={`h-16 w-full rounded-xl font-bold shadow-sm transition-transform active:scale-95 flex flex-col items-center justify-center border ${
                  done
                    ? 'bg-green-500 border-green-600 text-white'
                    : doneAtSize
                      ? 'bg-sky-100 border-sky-300 text-sky-900 hover:bg-sky-200'
                      : started
                        ? 'bg-yellow-100 border-yellow-400 text-yellow-900 hover:bg-yellow-200'
                        : 'bg-white text-indigo-700 border-indigo-100 hover:bg-indigo-50'
                }`}
              >
                <span className="text-xl">{letter}</span>
                {done ? (
                  <span className="text-[9px] font-black">✓ REDO</span>
                ) : doneAtSize ? (
                  <span className="text-[9px] font-black">✓ Done</span>
                ) : started ? (
                  <span className="text-[9px] font-black">
                    {sizeLabel} {phase.label} {Math.min(p.phaseSuccesses, required)}/{required}
                  </span>
                ) : (
                  <span className="text-[9px] font-bold opacity-60">NOT STARTED</span>
                )}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setReplayLetter(letter); }}
                className="absolute top-0.5 right-0.5 text-[9px] text-slate-400 hover:text-indigo-600 bg-white/80 rounded-full w-4 h-4 flex items-center justify-center leading-none z-10"
                title="Replay freehand"
              >▶</button>
              </div>
            );
          })}
        </div>

        {pageCount > 1 && (
          <div className="flex items-center gap-3">
            <button disabled={safePage === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="px-3 py-1 rounded-lg bg-white border disabled:opacity-40 text-sm font-bold text-slate-600">← Prev</button>
            <span className="text-xs text-slate-400 font-bold">{safePage + 1}/{pageCount}</span>
            <button disabled={safePage >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} className="px-3 py-1 rounded-lg bg-white border disabled:opacity-40 text-sm font-bold text-slate-600">Next →</button>
          </div>
        )}

        <p className="text-slate-400 text-xs">Yellow = practicing · Green = mastered</p>

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

        {replayLetter && (
          <FreehandReplayModal
            studentNumber={studentData?.student_number}
            className={studentData?.class_name}
            letter={replayLetter}
            onClose={() => setReplayLetter(null)}
          />
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // ACTIVE LETTER
  // ---------------------------------------------------------------------------
  const letterData = waypoints[currentLetter];

  if (!letterData?.strokes?.length) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <div className="text-4xl">✏️</div>
        <p className="text-slate-500">No tracing path is available for {currentLetter}.</p>
        <button onClick={() => setCurrentLetter(null)} className="px-4 py-2 bg-indigo-500 text-white rounded-xl font-bold">← Back</button>
      </div>
    );
  }

  const currentProgress = progressFor(currentLetter);
  const letterMastered = completedLetters.has(currentLetter) || currentProgress.fullyMastered;
  const redoing = redoMode && (letterMastered || currentProgress.doneAtSize) && forcedSize == null;

  const currentSizeLevel = forcedSize != null
    ? forcedSize
    : redoing && letterMastered
      ? SIZES.length - 1  // Paper redo size for mastered letters
      : effectiveSize(currentLetter);

  const currentPhase = forcedSize != null
    ? PHASES[0]
    : redoing
      ? { key: 'redo', label: letterMastered ? 'Redo — Small' : 'Practice', reps: 1, showGuide: false }
      : currentPhaseInfo(currentLetter);

  // Sub-mode within alternating phases: 'practice' alternates trace → dot-only,
  // 'more' alternates trace → freehand. Even phaseSuccesses = trace, odd = scaffold.
  const subMode = (redoing || forcedSize != null)
    ? 'trace'
    : (currentProgress.phase === 'practice' && currentProgress.phaseSuccesses % 2 === 1)
      ? 'dot_only'
      : (currentProgress.phase === 'more' && currentProgress.phaseSuccesses % 2 === 1)
        ? 'freehand'
        : 'trace';
  const isFreehand = subMode === 'dot_only' || subMode === 'freehand';
  const isDotOnly = subMode === 'dot_only';
  const isAlternatingPhase = !redoing && forcedSize == null && (currentProgress.phase === 'practice' || currentProgress.phase === 'more');

  const currentRequired = (redoing || forcedSize != null) ? 1 : getRequired(currentLetter);
  const practiceCopies = (redoing || forcedSize != null || isAlternatingPhase) ? 1 : currentRequired;
  const activeCopy = (redoing || forcedSize != null || isAlternatingPhase) ? 0 : Math.min(currentProgress.phaseSuccesses, Math.max(0, practiceCopies - 1));
  const sizeLabel = SIZE_LEVELS[currentSizeLevel]?.label || currentPhase.label;
  const sizeScale = SIZE_SCALES[currentSizeLevel] ?? 1;
  const showGuide = forcedSize != null ? true : isFreehand ? false : currentPhase.showGuide;

  // Save freehand strokes (dot-only / freehand) for teacher replay.
  const saveFreehandStrokes = (rawStrokes) => {
    if (!studentData?.student_number || !studentData?.class_name || !currentLetter) return;
    const normalized = rawStrokes.map(stroke =>
      stroke.map(p => ({ x: p.x / 300, y: p.y / 375 }))
    );
    base44.entities.TracingSample.create({
      student_number: studentData.student_number,
      class_name: studentData.class_name,
      school_year: studentData.school_year || '',
      letter: currentLetter,
      phase: currentProgress.phase,
      mode: isDotOnly ? 'dot_only' : 'freehand',
      strokes_data: JSON.stringify(normalized),
      size_label: SIZE_LEVELS[currentSizeLevel]?.label || '',
    }).catch(() => {});
  };
  const stageLabel = forcedSize != null
    ? `Preview — ${SIZES[forcedSize].label}`
    : redoing
      ? currentPhase.label
      : `${SIZES[effectiveSize(currentLetter)]?.label || 'Huge'} ${currentPhase.label}`;

  return (
    <div className="h-full bg-slate-50 flex flex-col items-center py-1.5 px-3 gap-1">
      <div className="flex items-center justify-between w-full max-w-3xl gap-2 shrink-0">
        <button
          onClick={() => { setRedoMode(false); setCurrentLetter(null); }}
          className="text-slate-500 hover:text-slate-800 text-xs font-bold whitespace-nowrap"
        >
          ← All letters
        </button>
        <div className="flex items-center gap-2">
          <div className="text-slate-800 font-black text-xl leading-none">{currentLetter}</div>
          <div className="text-[11px] text-slate-400 font-bold leading-none">{stageLabel}</div>
          <div className={`text-[11px] font-bold rounded-full px-2 py-0.5 border ${isFreehand ? (isDotOnly ? 'text-violet-700 bg-violet-50 border-violet-200' : 'text-pink-700 bg-pink-50 border-pink-200') : showGuide ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-indigo-700 bg-indigo-50 border-indigo-100'}`}>
            {isFreehand ? (isDotOnly ? '● Dot only' : '✍️ Freehand') : showGuide ? '● Guided' : '✍️ Your turn'}
          </div>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-20 h-2.5 rounded-full bg-violet-100 overflow-hidden border border-violet-200">
            <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${sectionProgress}%` }} />
          </div>
          <span className="text-[11px] font-black text-violet-600 whitespace-nowrap">{sectionProgress}%</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap justify-center shrink-0">
        <div className="bg-white border border-slate-200 rounded-full px-2 py-0.5 text-[11px] font-bold text-slate-600">{sizeLabel}</div>
        {redoing || forcedSize != null ? (
          <div className="bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5 text-[11px] font-bold text-violet-700">
            {forcedSize != null ? '🔍 Preview' : '↻ Redo'}
          </div>
        ) : (
          <>
            <div className="bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5 text-[11px] font-bold text-indigo-700">
              {isFreehand ? 'Write' : 'Trace'} {Math.min(currentProgress.phaseSuccesses + 1, currentRequired)}/{currentRequired}
            </div>
            <div className={`rounded-full px-2 py-0.5 text-[11px] font-bold border ${currentProgress.cleanStreak >= REQUIRED_CLEAN_STREAK ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
              Streak {Math.min(currentProgress.cleanStreak, REQUIRED_CLEAN_STREAK)}/{REQUIRED_CLEAN_STREAK}
            </div>
            {currentProgress.repairReps > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 text-[11px] font-bold text-amber-700">+{currentProgress.repairReps} repair</div>
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
          key={`${traceKey}-${currentLetter}-${currentSizeLevel}-${activeCopy}-${practiceCopies}-${redoing}-${forcedSize ?? ''}-${subMode}`}
          letter={currentLetter}
          lang={lang}
          strokes={letterData.strokes}
          renderWidth={renderWidthFor(currentSizeLevel)}
          practiceCopies={practiceCopies}
          activeCopy={activeCopy}
          showGuide={showGuide}
          freehandMode={isFreehand}
          dotOnly={isDotOnly}
          onFreehandStrokes={saveFreehandStrokes}
          silent={silent}
          fillHeight
          sizeScale={sizeScale}
          onMistake={() => handleMistake(currentLetter)}
          onComplete={() => handleComplete(currentLetter)}
          onAccuracy={handleAccuracy}
          onReset={() => {}}
        />
      </div>

      {celebrate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className={`rounded-3xl shadow-2xl px-8 py-6 flex flex-col items-center gap-2 ${celebrate.type === 'repair' ? 'bg-amber-50 border-4 border-amber-300' : 'bg-white'}`}>
            {celebrate.type === 'repair' ? <div className="text-4xl">✏️</div> : <Sparkles className="w-10 h-10 text-amber-400" />}
            <div className="text-2xl font-black text-slate-800">
              {celebrate.type === 'mastered' ? `${celebrate.letter} mastered!` : celebrate.type === 'stage' ? 'Level Up!' : 'Keep practicing!'}
            </div>
            <div className="text-slate-500 text-sm font-bold">{celebrate.message}</div>
          </div>
        </div>
      )}

      {showWheel && (
        <div className="fixed inset-0 z-[150]">
          <div className="absolute top-4 inset-x-0 z-[151] flex justify-center pointer-events-none">
            <div className="bg-violet-600 text-white rounded-full px-6 py-2 font-black shadow-xl">🎉 Letter set complete — FREE ROLL! 🎡</div>
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
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-violet-600 text-white rounded-full px-5 py-2 font-black shadow-xl z-40">🎡 Free roll earned!</div>
      )}
    </div>
  );
}