import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Check, RotateCcw } from 'lucide-react';
import { useLessonProgress } from '@/hooks/useLessonProgress';
import { base44 } from '@/api/base44Client';

import LetterSoundsMode from '@/components/game/modes/LetterSoundsMode';
import SightWordsEasyMode from '@/components/game/modes/SightWordsEasyMode';
import SightWordsSpellingMode from '@/components/game/modes/SightWordsSpellingMode';
import SpellingMode from '@/components/game/modes/SpellingMode';
import CaseMatchingMode from '@/components/game/modes/CaseMatchingMode';
import LetterTracingMode from '@/components/game/modes/LetterTracingMode';
import NumberHearingMode from '@/components/game/modes/NumberHearingMode';
import PhonicsMode from '@/components/game/modes/PhonicsMode';
import SentencesMode from '@/components/game/modes/SentencesMode';
import SpanishReadingGame from '@/components/game/spanishReading/SpanishReadingGame';
import StoryBuilder from '@/pages/StoryBuilder';
import CreandoOracionesMode from '@/components/sentence/CreandoOraciones';
import BookReadingStep from '@/components/lesson/modes/BookReadingStep';
import LetterSortStep from '@/components/lesson/modes/LetterSortStep';
import LetterRecognitionStep from '@/components/lesson/modes/LetterRecognitionStep';
import PowerfulWordStep from '@/components/lesson/modes/PowerfulWordStep';
import SyllableTrainStep from '@/components/lesson/modes/SyllableTrainStep';
import SyllableBlenderStep from '@/components/lesson/modes/SyllableBlenderStep';
import ActivitiesStep from '@/components/lesson/modes/ActivitiesStep';
import WordBuilderStep from '@/components/lesson/modes/WordBuilderStep';
import FluencyPracticeStep from '@/components/lesson/modes/FluencyPracticeStep';
import VideoStep from '@/components/lesson/modes/VideoStep';
import SoundWallStep from '@/components/lesson/modes/SoundWallStep';
import GoogleSlidesStep from '@/components/lesson/modes/GoogleSlidesStep';
import DigitalNotebookStep from '@/components/lesson/modes/DigitalNotebookStep';
import WordTracingMode from '@/components/game/modes/WordTracingMode';
import MissingLetterStep from '@/components/lesson/modes/MissingLetterStep';
import DictationStep from '@/components/lesson/modes/DictationStep';
import { buildBlendingSubstepsForWords } from '@/lib/blendingLetters';

// Renders the existing activity component for one lesson step, wraps the
// mode's progress/back callbacks to detect step completion per the lesson's
// completion rule, and gates the student behind a "Step complete" overlay.
export default function LessonModeRouter({
  step,
  stepIndex,
  lessonId,
  totalSteps,
  studentData,
  selectedStudent,
  onUpdateProgress,
  onStudentPatch,
  onBack,
  stepperMode = false,
  onNext,
  isLast = false,
  liveMode = false,
  teacherMode = false,
  embeddedMode = false,
}) {
  const { progress, markStepComplete, saveActivityState, getActivityState } = useLessonProgress(
    selectedStudent?.number,
    selectedStudent?.class_name,
    lessonId
  );

  const alreadyDone = (progress?.completed_steps || []).includes(stepIndex);

  const [done, setDone] = useState(alreadyDone);

  const [
    catalogRecordingPages,
    setCatalogRecordingPages,
  ] = useState([]);

  useEffect(() => {
    setCatalogRecordingPages([]);
  }, [step?.config?.bookId]);

  // For letter_sort: first-try correct + total from the student's best round,
  // used to compute the coin reward: Math.round((firstTryCorrect / total) * 10).
  const [letterSortMistakes, setLetterSortMistakes] = useState(0);
  const [letterSortFirstTry, setLetterSortFirstTry] = useState({ correct: 0, total: 0 });

  // Remount the actual activity whenever the student deliberately starts
  // another run. This clears local game/tracing state without changing the
  // student's permanent lesson-completion record.
  const [runKey, setRunKey] = useState(0);

  // True only while completing a deliberate replay of an already-finished step.
  const [isReplayRun, setIsReplayRun] = useState(false);

  // Mastery replays use temporary fresh progress rather than lifetime mastery.
  // This prevents an already-mastered activity from instantly paying replay
  // coins when it opens.
  const [replayProgress, setReplayProgress] = useState(null);

  // Prevent the same run from completing multiple times.
  const completedOnceRef = useRef(alreadyDone);

  // Prevent duplicate reward writes.
  const rewardInFlightRef = useRef(false);
  const rewardedThisRunRef = useRef(false);

  // Local immediate balance so a second reward cannot calculate from stale
  // studentData while React/Base44 is still updating.
  const coinBalanceRef = useRef(
    Number(studentData?.coins || 0)
  );

  // Keep an immediate reward-history copy for the same reason.
  const rewardHistoryRef = useRef(
    Array.isArray(studentData?.reward_history)
      ? studentData.reward_history
      : []
  );

  const comp = step?.completion || {
    type: 'view',
    target: 1,
  };

  const usesCatalogRecordingPages =
    step?.mode === 'book_reading' &&
    step?.config?.bookCompletion ===
      'catalog_recordings';

  const usesCustomRecordingRange =
    step?.mode === 'book_reading' &&
    step?.config?.bookCompletion ===
      'recordings';

  const requiresBookRecordings =
    usesCatalogRecordingPages ||
    usesCustomRecordingRange;

  const recordingStartPage =
    Number(
      step?.config?.recordingStartPage
    ) || 2;

  const recordingEndPage = Math.max(
    recordingStartPage,
    Number(
      step?.config?.recordingEndPage
    ) || 7
  );

  const customRequiredBookPages =
    usesCustomRecordingRange
      ? Array.from(
          {
            length:
              recordingEndPage -
              recordingStartPage +
              1,
          },
          (_, index) =>
            recordingStartPage + index
        )
      : [];

  const requiredBookPages =
    usesCatalogRecordingPages
      ? Array.from(
          new Set(
            catalogRecordingPages
              .map(Number)
              .filter(
                page =>
                  Number.isInteger(page) &&
                  page > 0
              )
          )
        ).sort((a, b) => a - b)
      : customRequiredBookPages;

  const savedBookActivityState =
    getActivityState?.(stepIndex) || {};

  const recordedBookPages = Array.isArray(
    savedBookActivityState.recordedPages
  )
    ? savedBookActivityState.recordedPages
    : [];

  const recordedRequiredPageCount =
    requiredBookPages.filter((page) =>
      recordedBookPages.includes(page)
    ).length;

  const isLetterTracing =
    step?.mode === 'letter_tracing';

  const isWordTracing =
    step?.mode === 'word_tracing';

  const isTracingMode =
    isLetterTracing || isWordTracing;

  const isMastery =
    comp.type === 'mastery' &&
    !isTracingMode;

  useEffect(() => {
    coinBalanceRef.current =
      Number(studentData?.coins || 0);
  }, [studentData?.coins]);

  useEffect(() => {
    rewardHistoryRef.current =
      Array.isArray(studentData?.reward_history)
        ? studentData.reward_history
        : [];
  }, [studentData?.reward_history]);

  // LessonProgress may load after this component first renders.
  // If the backend says this step was previously completed, show the
  // completion state unless the student is actively replaying it.
  useEffect(() => {
    if (!alreadyDone || isReplayRun) return;

    completedOnceRef.current = true;
    setDone(true);
  }, [alreadyDone, isReplayRun]);

  const awardStepCoins = useCallback(
    async (amount, reason) => {
      if (
        !studentData?.id ||
        amount <= 0 ||
        rewardInFlightRef.current ||
        rewardedThisRunRef.current
      ) {
        return;
      }

      rewardInFlightRef.current = true;
      rewardedThisRunRef.current = true;

      const previousCoins =
        coinBalanceRef.current;

      const previousHistory =
        rewardHistoryRef.current;

      try {
        const newCoins =
          previousCoins + amount;

        const rewardEntry = {
          type: 'lesson_reward',
          amount,
          reason,
          lesson_id: lessonId,
          step_index: stepIndex,
          mode: step?.mode,
          awarded_at: new Date().toISOString(),
        };

        const newRewardHistory = [
          ...previousHistory,
          rewardEntry,
        ];

        // Update refs immediately so another completion cannot calculate
        // against old values.
        coinBalanceRef.current =
          newCoins;

        rewardHistoryRef.current =
          newRewardHistory;

        const patch = {
          coins: newCoins,
          reward_history: newRewardHistory,
        };

        // Prefer the parent persistence callback when available.
        // LetterGame passes handlePersistPatch here, which updates both
        // local state and Base44. Falling back to Base44 directly keeps
        // this router safe if it is ever rendered without onStudentPatch.
        if (onStudentPatch) {
          await onStudentPatch(patch);
        } else {
          await base44.entities.Student.update(
            studentData.id,
            patch
          );
        }
      } catch (err) {
        coinBalanceRef.current =
          previousCoins;

        rewardHistoryRef.current =
          previousHistory;

        // If the write failed, allow another genuine completion attempt
        // to try the reward again.
        rewardedThisRunRef.current =
          false;

        console.error(
          `Could not award ${reason} coins:`,
          err
        );
      } finally {
        rewardInFlightRef.current =
          false;
      }
    },
    [
      studentData?.id,
      onStudentPatch,
      lessonId,
      stepIndex,
      step?.mode,
    ]
  );

  // Build completely fresh progress for a mastery replay.
  //
  // If the lesson explicitly names target items, those become the replay
  // learning pool. Otherwise use the items already encountered in this mode.
  const makeFreshReplayProgress =
    useCallback(() => {
      const oldProgress =
        studentData?.mode_progress?.[
          step?.mode
        ] || {};

      const configuredTargets =
        step?.config?.targets ||
        step?.config?.targetLetters ||
        [];

      const fallbackItems =
        Array.from(
          new Set([
            ...(oldProgress?.learning_items || []),
            ...(oldProgress?.mastered_items || []),
          ])
        );

      const learningItems =
        Array.isArray(configuredTargets) &&
        configuredTargets.length > 0
          ? configuredTargets
          : fallbackItems;

      return {
        mastered_items: [],
        learning_items: learningItems,
        item_attempts: {},
        total_correct: 0,
        total_attempts: 0,
        unlocked: true,
      };
    }, [
      studentData?.mode_progress,
      step?.mode,
      step?.config?.targets,
      step?.config?.targetLetters,
    ]);

  const finishFirstRun =
    useCallback((meta) => {
      if (completedOnceRef.current) {
        return;
      }

      // Mastery steps require the threshold to be met before the step (and
      // thus the lesson) can be marked complete. No mastery → no completion,
      // no coins. The student stays in the activity until they reach the
      // threshold.
      if (
        comp.type === 'mastery' &&
        !isTracingMode &&
        step?.mode !== 'letter_sort'
      ) {
        const target = comp.target || 1;
        const threshold = comp.threshold || 1;
        const correctCount =
          meta?.correctCount ?? meta?.masteredCount ?? 0;
        const totalItems = meta?.totalItems ?? target;
        const metThreshold =
          correctCount >= totalItems ||
          (threshold < 1 &&
            correctCount >=
              Math.ceil(totalItems * threshold));

        if (!metThreshold) return;
      }

      completedOnceRef.current =
        true;

      setDone(true);

      markStepComplete(
        stepIndex,
        totalSteps
      );

      // Coins are no longer awarded after lesson steps. Tracing free spins
      // are still handled inside LetterTracingMode / WordTracingMode.
    }, [
      stepIndex,
      totalSteps,
      markStepComplete,
    ]);

  const finishReplayRun =
    useCallback((meta) => {
      if (completedOnceRef.current) {
        return;
      }

      // Mastery replays must also meet the threshold before awarding coins.
      // Without this, a student with saved progress (e.g. 1/8) could press
      // Done on a replay and collect +5 coins without doing any new work.
      if (
        comp.type === 'mastery' &&
        !isTracingMode &&
        step?.mode !== 'letter_sort'
      ) {
        const target = comp.target || 1;
        const threshold = comp.threshold || 1;
        const correctCount =
          meta?.correctCount ?? meta?.masteredCount ?? 0;
        const totalItems = meta?.totalItems ?? target;
        const metThreshold =
          correctCount >= totalItems ||
          (threshold < 1 &&
            correctCount >=
              Math.ceil(totalItems * threshold));

        if (!metThreshold) return;
      }

      completedOnceRef.current =
        true;

      setDone(true);

      // No coins awarded on replay either. LessonProgress is intentionally
      // NOT changed again.
    }, [
      comp.type,
      comp.threshold,
      comp.target,
      step?.mode,
      isTracingMode,
    ]);

  const maybeComplete =
    useCallback(
      (progressData) => {
        if (completedOnceRef.current) {
          return;
        }

        // Teacher controls advancement in live mode.
        // Do not auto-complete or award lesson-step rewards here.
        if (liveMode) {
          return;
        }

        // missing_letter calls onComplete directly when ALL words are traced.
        // Do not auto-complete from per-word progress updates — that would
        // end the step after the default target (5) instead of all items.
        if (step?.mode === 'missing_letter') {
          return;
        }

        let isDone = false;

        if (isTracingMode) {
          // LetterTracingMode reports fully mastered target letters through
          // total_attempts. The need is capped at the actual number of
          // traceable letters (mastered + learning) so that a lesson with
          // fewer targets — or a teacher who sets target=6 but only
          // configures 4 letters — can still complete when all are green.
          const totalLetters =
            (progressData?.mastered_items?.length || 0) +
            (progressData?.learning_items?.length || 0);

          const configuredNeed =
            comp.target &&
            comp.target > 1
              ? comp.target
              : 5;

          const need =
            totalLetters > 0
              ? Math.min(configuredNeed, totalLetters)
              : configuredNeed;

          isDone =
            (
              progressData?.total_attempts ||
              0
            ) >= need;
        } else if (
          comp.type === 'mastery'
        ) {
          // During replay this comes from fresh temporary mastery state, so
          // lifetime mastery cannot instantly satisfy the requirement.
          isDone =
            (
              progressData
                ?.mastered_items
                ?.length ||
              0
            ) >=
            (comp.target || 1);
        } else {
          // View/completion activities require a meaningful amount of
          // participation unless the lesson explicitly provides a target.
          const need =
            comp.target &&
            comp.target > 1
              ? comp.target
              : 5;

          isDone =
            (
              progressData?.total_attempts ||
              0
            ) >= need;
        }

        if (!isDone) return;

        const masteryMeta = comp.type === 'mastery' && !isTracingMode
          ? {
              correctCount: progressData?.mastered_items?.length || 0,
              totalItems: comp.target || 1,
            }
          : undefined;

        if (isReplayRun) {
          finishReplayRun(masteryMeta);
        } else {
          finishFirstRun(masteryMeta);
        }
      },
      [
        comp,
        isTracingMode,
        liveMode,
        isReplayRun,
        finishReplayRun,
        finishFirstRun,
      ]
    );

  // FIRST completion only:
  // If the student already satisfied this mastery requirement elsewhere,
  // allow that existing mastery to satisfy the lesson step.
  //
  // Never do this during replay. Replay mastery must be fresh work.
  useEffect(() => {
    if (isReplayRun) return;

    if (completedOnceRef.current) {
      return;
    }

    if (isTracingMode) {
      // For tracing, check if all target letters are already mastered
      // from a previous session. total_attempts = mastered count,
      // need = mastered + learning (total traceable letters).
      const mp =
        studentData?.mode_progress?.[
          step.mode
        ];

      const mastered =
        mp?.mastered_items?.length || 0;

      const learning =
        mp?.learning_items?.length || 0;

      const total = mastered + learning;

      if (total > 0 && mastered >= total) {
        maybeComplete({
          mastered_items:
            mp?.mastered_items || [],
          learning_items:
            mp?.learning_items || [],
          total_attempts: mastered,
        });
      }

      return;
    }

    if (comp.type !== 'mastery') {
      return;
    }

    const mp =
      studentData?.mode_progress?.[
        step.mode
      ];

    const masteredCount =
      mp?.mastered_items?.length ||
      0;

    if (
      masteredCount >=
      (comp.target || 1)
    ) {
      maybeComplete({
        mastered_items:
          mp?.mastered_items ||
          [],
      });
    }
  }, [
    studentData,
    step.mode,
    comp.type,
    comp.target,
    isTracingMode,
    isReplayRun,
    maybeComplete,
  ]);

  // Progress wrapper.
  //
  // Normal run:
  //   persist progress through the existing parent callback.
  //
  // Mastery replay:
  //   keep progress local so previously mastered lifetime data does not count
  //   and temporary replay state does not overwrite permanent mastery.
  const wrappedUpdateProgress =
    useCallback(
      (mode, progressData) => {
        if (
          isReplayRun &&
          comp.type === 'mastery' &&
          !isTracingMode
        ) {
          setReplayProgress(
            progressData
          );
        } else if (
          onUpdateProgress
        ) {
          onUpdateProgress(
            mode,
            progressData
          );
        }

        maybeComplete(
          progressData
        );
      },
      [
        isReplayRun,
        comp.type,
        isTracingMode,
        onUpdateProgress,
        maybeComplete,
      ]
    );

  // A view-style step may complete when the student finishes and returns.
  const wrappedBack =
    useCallback(() => {
      if (
        !completedOnceRef.current &&
        comp.type === 'view' &&
        !liveMode &&
        !requiresBookRecordings
      ) {
        if (isReplayRun) {
          finishReplayRun();
        } else {
          finishFirstRun();
        }
      }

      onBack?.();
    }, [
      comp.type,
      liveMode,
      requiresBookRecordings,
      isReplayRun,
      finishReplayRun,
      finishFirstRun,
      onBack,
    ]);

  // Open-ended activities call this directly when finished.
  const completeStep =
    useCallback((meta) => {
      if (
        completedOnceRef.current ||
        liveMode
      ) {
        return;
      }

      if (step?.mode === 'letter_sort') {
        if (meta?.mistakes != null) setLetterSortMistakes(meta.mistakes);
        if (meta?.total) setLetterSortFirstTry({ correct: meta.firstTryCorrect ?? 0, total: meta.total });
      }

      // Counting / phoneme activities: don't complete or award coins when the
      // student hasn't answered any item correctly (prevents 0/N farming).
      if (step?.mode === 'activities' && meta?.totalItems > 0 && (meta?.correctCount ?? 0) === 0) {
        return;
      }

      if (isReplayRun) {
        // Completion activities can be repeated for practice, but repeats
        // intentionally award zero coins.
        finishReplayRun(meta);
      } else {
        finishFirstRun(meta);
      }
    }, [
      liveMode,
      isReplayRun,
      step?.mode,
      finishReplayRun,
      finishFirstRun,
    ]);

  const handleBookRecordingSaved =
    useCallback(
      async (newPages) => {
        if (
          !requiresBookRecordings ||
          !Array.isArray(newPages)
        ) {
          return;
        }

        const previousState =
          getActivityState?.(stepIndex) || {};

        const previousPages = Array.isArray(
          previousState.recordedPages
        )
          ? previousState.recordedPages
          : [];

        const recordedPages = Array.from(
          new Set([
            ...previousPages,
            ...newPages.map(Number),
          ])
        ).sort((a, b) => a - b);

        await saveActivityState?.(stepIndex, {
          ...previousState,
          recordedPages,
        });

        const allRequiredPagesRecorded =
          requiredBookPages.length > 0 &&
          requiredBookPages.every((page) =>
            recordedPages.includes(page)
          );

        if (allRequiredPagesRecorded) {
          completeStep({
            correctCount: requiredBookPages.length,
            totalItems: requiredBookPages.length,
            recordedPages,
          });
        }
      },
      [
        requiresBookRecordings,
        getActivityState,
        saveActivityState,
        stepIndex,
        requiredBookPages,
        completeStep,
      ]
    );

  // Begin a genuine fresh replay.
  const startReplay =
    useCallback(() => {
      rewardedThisRunRef.current =
        false;

      rewardInFlightRef.current =
        false;

      completedOnceRef.current =
        false;

      setDone(false);
      setIsReplayRun(true);

      if (
        comp.type === 'mastery' &&
        !isTracingMode
      ) {
        setReplayProgress(
          makeFreshReplayProgress()
        );
      } else {
        setReplayProgress(null);
      }

      // Remount the child activity so its internal score/current item/tracing
      // state starts clean as well.
      setRunKey(
        key => key + 1
      );
    }, [
      comp.type,
      isTracingMode,
      makeFreshReplayProgress,
    ]);

  const studentNumber =
    selectedStudent?.number;

  const className =
    selectedStudent?.class_name;

  // During a mastery replay, give the activity clean temporary mode_progress
  // for this mode while preserving all other student fields.
  const activityStudentData =
    isReplayRun &&
    comp.type === 'mastery' &&
    !isTracingMode &&
    replayProgress
      ? {
          ...studentData,
          mode_progress: {
            ...(studentData?.mode_progress || {}),
            [step.mode]:
              replayProgress,
          },
        }
      : studentData;

  const modeProgress =
    isReplayRun &&
    comp.type === 'mastery' &&
    !isTracingMode
      ? replayProgress
      : studentData?.mode_progress?.[
          step.mode
        ];

  const masteredCount =
    modeProgress
      ?.mastered_items
      ?.length ||
    0;

  // For tracing, cap the target at the actual number of traceable letters
  // (from progress data or config) so the goal text and completion check
  // never ask for more letters than exist.
  const tracingTotal =
    (modeProgress?.mastered_items?.length || 0) +
    (modeProgress?.learning_items?.length || 0);

  const tracingConfigTargets =
    step?.config?.targets ||
    step?.config?.targetLetters;

  const tracingMax =
    Math.max(
      tracingTotal,
      Array.isArray(tracingConfigTargets)
        ? tracingConfigTargets.length
        : 0
    );

  const configuredTarget =
    comp.target && comp.target > 1
      ? comp.target
      : 5;

  const attemptTarget =
    isTracingMode && tracingMax > 0
      ? Math.min(configuredTarget, tracingMax)
      : configuredTarget;

  const isLetterSort = step?.mode === 'letter_sort';
  const letterSortAmount = isLetterSort
    ? Math.max(1, Math.round(
        (letterSortFirstTry.correct / (letterSortFirstTry.total || 1)) * 10
      ))
    : 0;

  const bookRecordingGoalText =
    usesCatalogRecordingPages
      ? requiredBookPages.length > 0
        ? `🎙️ Record pages ${requiredBookPages.join(', ')} — ${recordedRequiredPageCount}/${requiredBookPages.length}`
        : '🎙️ No recording pages are enabled for this book'
      : `🎙️ Record pages ${recordingStartPage}–${recordingEndPage} — ${recordedRequiredPageCount}/${requiredBookPages.length}`;

  const goalText =
    requiresBookRecordings
      ? bookRecordingGoalText
      : isTracingMode
        ? isReplayRun
        ? `✍️ Practice again — ${attemptTarget} to finish`
        : `✍️ Trace ${attemptTarget} to finish`
      : isMastery
        ? isReplayRun
          ? `🎯 Master again — ${Math.min(
              masteredCount,
              comp.target || 1
            )}/${comp.target || 1}`
          : `🎯 Master ${
              comp.target || 1
            } — ${Math.min(
              masteredCount,
              comp.target || 1
            )}/${comp.target || 1}`
        : isReplayRun
          ? '★ Practice again'
          : '★ Play once to finish';

  const goalDone = done;

  function renderMode() {
    switch (step.mode) {
      case 'letter_sounds':
        return (
          <LetterSoundsMode
            studentData={
              activityStudentData
            }
            onUpdateProgress={
              wrappedUpdateProgress
            }
            onStudentPatch={
              onStudentPatch
            }
            targets={
              step?.config?.targets
            }
          />
        );

      case 'sight_words_easy':
        return (
          <SightWordsEasyMode
            studentData={
              activityStudentData
            }
            onUpdateProgress={
              wrappedUpdateProgress
            }
            targets={
              step?.config?.targets
            }
          />
        );

      case 'sight_words_spelling':
        return (
          <SightWordsSpellingMode
            studentData={
              activityStudentData
            }
            onUpdateProgress={
              wrappedUpdateProgress
            }
            onBack={
              wrappedBack
            }
          />
        );

      case 'spelling':
        return (
          <SpellingMode
            studentData={
              activityStudentData
            }
            onUpdateProgress={
              wrappedUpdateProgress
            }
            onBack={
              wrappedBack
            }
          />
        );

      case 'case_matching':
        return (
          <CaseMatchingMode
            studentData={
              activityStudentData
            }
            onUpdateProgress={
              wrappedUpdateProgress
            }
            targets={
              step?.config?.targets ||
              step?.config?.targetLetters
            }
          />
        );

      case 'letter_tracing':
        return (
          <LetterTracingMode
            studentData={
              studentData
            }
            onUpdateProgress={
              wrappedUpdateProgress
            }
            onStudentPatch={
              onStudentPatch
            }
            targets={
              step?.config?.targets ||
              step?.config?.targetLetters
            }
            freeSpinEnabled={
              !isReplayRun
            }
          />
        );

      case 'number_hearing':
        return (
          <NumberHearingMode
            studentData={
              activityStudentData
            }
            onUpdateProgress={
              wrappedUpdateProgress
            }
          />
        );

      case 'phonics':
        return (
          <PhonicsMode
            studentData={
              studentData
            }
            onBack={
              wrappedBack
            }
            onStudentPatch={
              onStudentPatch
            }
          />
        );

      case 'sentences':
        return (
          <SentencesMode
            studentData={
              studentData
            }
            onBack={
              wrappedBack
            }
            onStudentPatch={
              onStudentPatch
            }
          />
        );

      case 'spanish_reading':
        return (
          <SpanishReadingGame
            studentNumber={
              studentNumber
            }
            className={
              className
            }
            onBack={
              wrappedBack
            }
            presetId={
              step?.config?.preset
            }
            inlineItemsText={
              step?.config?.itemsText
            }
            inlineSection={
              step?.config?.section
            }
            substeps={
              step?.config?.substeps
            }
            curriculumPosition={
              step?.config
                ?.curriculumPosition
            }
            onComplete={
              completeStep
            }
          />
        );

      case 'blending_letters':
        return (
          <SpanishReadingGame
            studentNumber={
              studentNumber
            }
            className={
              className
            }
            onBack={
              wrappedBack
            }
            substeps={
              buildBlendingSubstepsForWords(step?.config?.itemsText, step?.config?.hint, step?.config?.demos)
            }
            onComplete={
              completeStep
            }
            teacherMode={
              teacherMode
            }
            lessonId={
              lessonId
            }
            stepIndex={
              stepIndex
            }
          />
        );

      case 'storybuilder':
        return (
          <StoryBuilder
            studentNumber={
              studentNumber
            }
            className={
              className
            }
            onBack={
              wrappedBack
            }
          />
        );

      case 'sentence_builder':
        return (
          <CreandoOracionesMode
            studentData={studentData}
            onBack={wrappedBack}
          />
        );

      case 'book_reading':
        return (
          <BookReadingStep
            stepConfig={
              step?.config
            }
            studentNumber={
              studentNumber
            }
            className={
              className
            }
            onBack={
              wrappedBack
            }
            onRecordingSaved={
              handleBookRecordingSaved
            }
            onRequiredPagesLoaded={
              setCatalogRecordingPages
            }
            embedded={
              embeddedMode ||
              stepperMode
            }
          />
        );

      case 'letter_sort':
        return (
          <LetterSortStep
            onComplete={
              completeStep
            }
            presetId={
              step?.config?.preset
            }
            curriculumPosition={
              step?.config
                ?.curriculumPosition
            }
            curriculumPositionOverride={
              step?.config
                ?.curriculumPositionOverride
            }
            studentNumber={
              studentNumber
            }
            studentClass={
              className
            }
          />
        );

      case 'letter_recognition':
        return (
          <LetterRecognitionStep
            onComplete={
              completeStep
            }
            targets={
              step?.config?.targets
            }
          />
        );

      case 'powerful_word':
        return (
          <PowerfulWordStep
            onComplete={
              completeStep
            }
            presetId={
              step?.config?.preset
            }
          />
        );

      case 'syllable_train':
        return (
          <SyllableTrainStep
            onComplete={
              completeStep
            }
          />
        );

      case 'syllable_blender':
        return (
          <SyllableBlenderStep
            onComplete={
              completeStep
            }
            curriculumPosition={
              step?.config
                ?.curriculumPosition
            }
            curriculumPositionOverride={
              step?.config
                ?.curriculumPositionOverride
            }
          />
        );

      case 'activities':
        return (
          <ActivitiesStep
            onComplete={
              completeStep
            }
            studentName={
              selectedStudent?.name ||
              `Estudiante ${
                studentNumber ||
                ''
              }`
            }
            stepConfig={
              step?.config
            }
            completion={comp}
            activityState={getActivityState?.(stepIndex)}
            onActivityState={(state) => saveActivityState?.(stepIndex, state)}
          />
        );

      case 'word_builder':
        return (
          <WordBuilderStep
            onComplete={
              completeStep
            }
            studentNumber={
              studentNumber
            }
            className={
              className
            }
            studentData={
              activityStudentData
            }
            onStudentPatch={
              onStudentPatch
            }
            presetId={
              step?.config?.preset
            }
            curriculumPosition={
              step?.config
                ?.curriculumPosition
            }
          />
        );

      case 'fluency':
        return (
          <FluencyPracticeStep
            onComplete={
              completeStep
            }
            presetId={
              step?.config?.preset
            }
            curriculumPosition={
              step?.config
                ?.curriculumPosition
            }
            curriculumPositionOverride={
              step?.config
                ?.curriculumPositionOverride
            }
            curriculumContentType={
              step?.config
                ?.curriculumContentType
            }
            studentNumber={
              studentNumber
            }
            className={
              className
            }
          />
        );

      case 'video':
        return (
          <VideoStep
            onComplete={
              completeStep
            }
            videoUrl={
              step?.config?.videoUrl
            }
            title={
              step.title
            }
          />
        );

      case 'soundwall':
        return (
          <SoundWallStep
            onComplete={
              completeStep
            }
            stepConfig={{
              ...step?.config,
              curriculumKey:
                step?.config
                  ?.curriculumKey ||
                '',
            }}
          />
        );

      case 'google_slides':
        return (
          <GoogleSlidesStep
            onComplete={
              completeStep
            }
            stepConfig={
              step?.config
            }
            title={
              step.title
            }
          />
        );

      case 'digital_notebook':
        return (
          <DigitalNotebookStep
            stepConfig={
              step?.config
            }
            studentNumber={
              selectedStudent?.number ||
              studentData?.number
            }
            className={
              selectedStudent?.class_name ||
              studentData?.class_name
            }
            onComplete={
              completeStep
            }
          />
        );

      case 'word_tracing':
        return (
          <WordTracingMode
            studentData={
              studentData
            }
            onUpdateProgress={
              wrappedUpdateProgress
            }
            onStudentPatch={
              onStudentPatch
            }
            targets={
              step?.config?.targets
            }
            freeSpinEnabled={
              !isReplayRun
            }
          />
        );

      case 'missing_letter':
        return (
          <MissingLetterStep
            presetId={
              step?.config?.preset
            }
            studentData={
              activityStudentData
            }
            onUpdateProgress={
              wrappedUpdateProgress
            }
            onStudentPatch={
              onStudentPatch
            }
            onComplete={
              completeStep
            }
          />
        );

      case 'dictation':
        return (
          <DictationStep
            stepConfig={step?.config}
            studentNumber={selectedStudent?.number || studentData?.number}
            className={selectedStudent?.class_name || studentData?.class_name}
            onComplete={completeStep}
          />
        );

      default:
        return (
          <div className="p-10 text-center text-gray-400">
            Unknown step type.
          </div>
        );
    }
  }

  return (
    <div
      className={`relative flex flex-col ${
        stepperMode || liveMode
          ? 'h-full min-h-0 overflow-hidden'
          : 'h-screen'
      }`}
      /* NOTE: do NOT apply `transform` or `contain` here — both create a
         containing block for position:fixed descendants, which breaks
         @hello-pangea/dnd's drag clone (the dragged card is offset from the
         cursor by the container's page position). */
    >
      {/* A new runKey gives Play Again a genuinely fresh child component. */}
      <React.Fragment
        key={runKey}
      >
        {renderMode()}
      </React.Fragment>

      {/* Floating back-to-lesson button — hidden in stepper/live modes,
          and for spanish_reading (the game has its own header/back nav). */}
      {!stepperMode &&
        !liveMode &&
        step?.mode !== 'spanish_reading' && (
          <Button
            onClick={wrappedBack}
            className="absolute top-4 left-4 bg-white/90 hover:bg-white text-gray-800 shadow-lg z-50"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Lesson
          </Button>
        )}

      {/* Goal / progress chip — hidden for spanish_reading (game has its own header). */}
      {step?.mode !== 'spanish_reading' && (
        <div
          className={`absolute top-4 right-4 z-50 px-3 py-1.5 rounded-full text-xs font-black shadow-lg ${
            goalDone
              ? 'bg-green-100 text-green-700'
              : isReplayRun
                ? 'bg-amber-100 text-amber-700'
                : 'bg-white/90 text-gray-700'
          }`}
        >
          {goalText}
        </div>
      )}

      {/* Completion overlay — hidden in live mode because teacher drives pacing.
          Tap anywhere to dismiss; the dot turns green and students navigate
          with the dots/arrows. */}
      {done &&
        !liveMode && (
          <div
            onClick={() => setDone(false)}
            className="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-6 cursor-pointer"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center flex flex-col items-center gap-4 cursor-default"
            >
              <span className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <Check
                  className="w-9 h-9 text-green-600"
                  strokeWidth={3}
                />
              </span>

              <div>
                <h2 className="text-2xl font-black text-gray-800">
                  {isReplayRun
                    ? 'Practice Complete!'
                    : 'Step Complete!'}
                </h2>

                <p className="text-gray-500 text-sm mt-1">
                  Great job on “{step.title}”.
                </p>

                {!isReplayRun &&
                  isTracingMode && (
                    <p className="text-violet-600 text-sm font-black mt-2">
                      🎡 Free spin earned!
                    </p>
                  )}
              </div>

              <p className="text-xs text-gray-400 font-medium">
                Tap anywhere to continue
              </p>
            </div>
          </div>
        )}
    </div>
  );
}