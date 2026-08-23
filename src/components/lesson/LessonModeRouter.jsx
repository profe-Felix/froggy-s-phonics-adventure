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
import BookReading from '@/pages/BookReading';
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
import WordTracingMode from '@/components/game/modes/WordTracingMode';

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
}) {
  const { progress, markStepComplete } = useLessonProgress(
    selectedStudent?.number,
    selectedStudent?.class_name,
    lessonId
  );

  const alreadyDone = (progress?.completed_steps || []).includes(stepIndex);

  const [done, setDone] = useState(alreadyDone);

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
    useCallback(() => {
      if (completedOnceRef.current) {
        return;
      }

      completedOnceRef.current =
        true;

      setDone(true);

      markStepComplete(
        stepIndex,
        totalSteps
      );

      // ---------------------------------------------------------------
      // FIRST-TIME REWARD ECONOMY
      //
      // Completion / participation:
      //   +4 coins
      //
      // Mastery:
      //   +8 coins
      //
      // Letter tracing:
      //   FREE SPIN handled inside LetterTracingMode
      //   instead of coins.
      //
      // Word tracing remains on the normal lesson reward path until its
      // reward UI is converted to the same tracing-free-spin behavior.
      // ---------------------------------------------------------------

      if (isLetterTracing) {
        return;
      }

      if (comp.type === 'mastery') {
        awardStepCoins(
          8,
          'first_mastery'
        );

        return;
      }

      awardStepCoins(
        4,
        'first_completion'
      );
    }, [
      stepIndex,
      totalSteps,
      markStepComplete,
      isLetterTracing,
      comp.type,
      awardStepCoins,
    ]);

  const finishReplayRun =
    useCallback(() => {
      if (completedOnceRef.current) {
        return;
      }

      completedOnceRef.current =
        true;

      setDone(true);

      // ---------------------------------------------------------------
      // REPLAY REWARD ECONOMY
      //
      // Ordinary completion:
      //   0 coins
      //
      // Mastery:
      //   +4 coins
      //
      // Tracing:
      //   +8 coins
      //
      // LessonProgress is intentionally NOT changed again.
      // ---------------------------------------------------------------

      if (isTracingMode) {
        awardStepCoins(
          8,
          'tracing_replay'
        );

        return;
      }

      if (comp.type === 'mastery') {
        awardStepCoins(
          4,
          'mastery_replay'
        );
      }
    }, [
      isTracingMode,
      comp.type,
      awardStepCoins,
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

        let isDone = false;

        if (isTracingMode) {
          // LetterTracingMode now reports fully mastered target letters through
          // total_attempts. WordTracingMode also reports its completion count
          // through total_attempts.
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

        if (isReplayRun) {
          finishReplayRun();
        } else {
          finishFirstRun();
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

    if (
      comp.type !== 'mastery' ||
      isTracingMode
    ) {
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
        !liveMode
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
      isReplayRun,
      finishReplayRun,
      finishFirstRun,
      onBack,
    ]);

  // Open-ended activities call this directly when finished.
  const completeStep =
    useCallback(() => {
      if (
        completedOnceRef.current ||
        liveMode
      ) {
        return;
      }

      if (isReplayRun) {
        // Completion activities can be repeated for practice, but repeats
        // intentionally award zero coins.
        finishReplayRun();
      } else {
        finishFirstRun();
      }
    }, [
      liveMode,
      isReplayRun,
      finishReplayRun,
      finishFirstRun,
    ]);

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

  const attemptTarget =
    comp.target &&
    comp.target > 1
      ? comp.target
      : 5;

  const goalText =
    isTracingMode
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

      case 'book_reading':
        return (
          <BookReading
            prefillClass={
              className
            }
            prefillNumber={
              studentNumber
            }
            onBack={
              wrappedBack
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
            presetId={
              step?.config?.preset
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
            stepConfig={
              step?.config
            }
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

      case 'word_tracing':
        return (
          <WordTracingMode
            studentData={
              studentData
            }
            onUpdateProgress={
              wrappedUpdateProgress
            }
            targets={
              step?.config?.targets
            }
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
        stepperMode
          ? 'h-full'
          : 'h-screen'
      }`}
    >
      {/* A new runKey gives Play Again a genuinely fresh child component. */}
      <React.Fragment
        key={runKey}
      >
        {renderMode()}
      </React.Fragment>

      {/* Floating back-to-lesson button — hidden in stepper/live modes. */}
      {!stepperMode &&
        !liveMode && (
          <Button
            onClick={
              wrappedBack
            }
            className="absolute top-4 left-4 bg-white/90 hover:bg-white text-gray-800 shadow-lg z-50"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Lesson
          </Button>
        )}

      {/* Goal / progress chip */}
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

      {/* Completion overlay — hidden in live mode because teacher drives pacing. */}
      {done &&
        !liveMode && (
          <div className="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-6">
            <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center flex flex-col items-center gap-4">
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
                  isLetterTracing && (
                    <p className="text-violet-600 text-sm font-black mt-2">
                      🎡 Free spin earned!
                    </p>
                  )}

                {!isReplayRun &&
                  !isLetterTracing &&
                  comp.type ===
                    'mastery' && (
                    <p className="text-amber-600 text-sm font-black mt-2">
                      🪙 +8 coins
                    </p>
                  )}

                {!isReplayRun &&
                  !isLetterTracing &&
                  comp.type !==
                    'mastery' && (
                    <p className="text-amber-600 text-sm font-black mt-2">
                      🪙 +4 coins
                    </p>
                  )}

                {isReplayRun &&
                  isTracingMode && (
                    <p className="text-amber-600 text-sm font-black mt-2">
                      🪙 +8 replay coins
                    </p>
                  )}

                {isReplayRun &&
                  !isTracingMode &&
                  comp.type ===
                    'mastery' && (
                    <p className="text-amber-600 text-sm font-black mt-2">
                      🪙 +4 replay coins
                    </p>
                  )}

                {isReplayRun &&
                  !isTracingMode &&
                  comp.type !==
                    'mastery' && (
                    <p className="text-gray-400 text-xs font-bold mt-2">
                      Practice replay — no additional coins
                    </p>
                  )}
              </div>

              <div className="flex flex-col gap-2 w-full">
                <Button
                  onClick={
                    startReplay
                  }
                  className="bg-indigo-500 hover:bg-indigo-600 text-white font-black text-lg px-8 py-3"
                >
                  <RotateCcw className="w-5 h-5 mr-2" />
                  Play Again
                </Button>

                <Button
                  onClick={
                    stepperMode
                      ? onNext
                      : wrappedBack
                  }
                  className="bg-green-500 hover:bg-green-600 text-white font-bold text-base px-8 py-2.5"
                >
                  <ArrowLeft className="w-5 h-5 mr-2" />

                  {stepperMode
                    ? isLast
                      ? 'Finish'
                      : 'Next Step'
                    : 'Return to Lesson'}
                </Button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}