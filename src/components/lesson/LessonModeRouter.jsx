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
    selectedStudent?.number, selectedStudent?.class_name, lessonId
  );
  const alreadyDone = (progress?.completed_steps || []).includes(stepIndex);
  const [done, setDone] = useState(alreadyDone);
  // Once a step is complete (from a prior session or this one), replays no longer
  // persist progress/points — students can keep playing just for fun.
  const noPointsRef = useRef(alreadyDone);
  // Suppresses the completion overlay from re-firing on "Play Again" so a replay
  // doesn't instantly re-master after a single attempt.
  const completedOnceRef = useRef(alreadyDone);
  const comp = step?.completion || { type: 'view', target: 1 };
  // Tracing modes report completed traces through total_attempts, not
  // mastered_items. Some lesson records were saved with completion.type =
  // 'mastery', which made those steps impossible to finish (e.g. Master 8
  // stayed at 0/8 even after 9 successful traces). Treat the target as the
  // required number of completed traces for these modes.
  const isTracingMode = step?.mode === 'letter_tracing' || step?.mode === 'word_tracing';

  const rewardInFlightRef = useRef(false);

  const awardStepCoins = useCallback(async (amount, reason) => {
    if (!studentData?.id || amount <= 0 || rewardInFlightRef.current) return;

    rewardInFlightRef.current = true;

    try {
      const currentCoins = Number(studentData?.coins || 0);
      const newCoins = currentCoins + amount;

      const rewardEntry = {
        type: 'lesson_reward',
        amount,
        reason,
        lesson_id: lessonId,
        step_index: stepIndex,
        mode: step?.mode,
        awarded_at: new Date().toISOString(),
      };

      const patch = {
        coins: newCoins,
        reward_history: [
          ...(studentData?.reward_history || []),
          rewardEntry,
        ],
      };

      onStudentPatch?.(patch);

      await base44.entities.Student.update(
        studentData.id,
        patch
      );
    } catch (err) {
      console.error('Could not award lesson coins:', err);
    } finally {
      rewardInFlightRef.current = false;
    }
  }, [
    studentData,
    onStudentPatch,
    lessonId,
    stepIndex,
    step?.mode,
  ]);

  const maybeComplete = useCallback((progressData) => {
    if (completedOnceRef.current) return;
    // In live mode the teacher controls advancement — don't auto-complete or
    // trap the student behind the "Step Complete" overlay.
    if (liveMode) return;
    let isDone = false;
    if (isTracingMode) {
      const need = comp.target && comp.target > 1 ? comp.target : 5;
      isDone = (progressData?.total_attempts || 0) >= need;
    } else if (comp.type === 'mastery') {
      isDone = (progressData?.mastered_items?.length || 0) >= (comp.target || 1);
    } else {
      // view = a full round of participation (not a single tap), so kids play
      // several letters before the step completes. Teachers can override via the
      // step's completion.target (any value > 1 is honored).
      const need = comp.target && comp.target > 1 ? comp.target : 5;
      isDone = (progressData?.total_attempts || 0) >= need;
    }
    if (isDone) {
      completedOnceRef.current = true;
      noPointsRef.current = true;
      setDone(true);
      markStepComplete(stepIndex, totalSteps);

      // Reward economy:
      //
      // Completion/view:
      //   first completion = 4 coins
      //
      // Mastery:
      //   first mastery = 8 coins
      //
      // Letter tracing:
      //   first mastery = FREE SPIN handled inside LetterTracingMode,
      //   so no coins are awarded here.
      //
      // Word tracing follows the normal mastery reward for now.
      if (step?.mode === 'letter_tracing') {
        // Free spin is awarded by LetterTracingMode.
      } else if (comp.type === 'mastery') {
        awardStepCoins(
          8,
          'first_mastery'
        );
      } else {
        awardStepCoins(
          4,
          'first_completion'
        );
      }
    }
  }, [
    comp,
    isTracingMode,
    stepIndex,
    totalSteps,
    markStepComplete,
    step?.mode,
    awardStepCoins,
  ]);

  // Auto-complete mastery steps the student already satisfied in a prior session
  // so they don't have to re-answer questions just to unlock the next step.
  useEffect(() => {
    if (completedOnceRef.current) return;
    if (comp.type !== 'mastery' || isTracingMode) return;
    const mp = studentData?.mode_progress?.[step.mode];
    const masteredCount = mp?.mastered_items?.length || 0;
    if (masteredCount >= (comp.target || 1)) {
      maybeComplete({ mastered_items: mp?.mastered_items || [] });
    }
  }, [studentData, step.mode, comp.type, comp.target, isTracingMode, maybeComplete]);

  // progress-aware wrapper (also persists via the parent's onUpdateProgress).
  // Suppressed once the step is complete so replays don't re-award points.
  const wrappedUpdateProgress = useCallback((mode, progressData) => {
    if (!noPointsRef.current && onUpdateProgress) onUpdateProgress(mode, progressData);
    maybeComplete(progressData);
  }, [onUpdateProgress, maybeComplete]);

  // back wrapper: 'view' steps complete when the student finishes and returns
  const wrappedBack = useCallback(() => {
    if (!completedOnceRef.current && comp.type === 'view') {
      completedOnceRef.current = true;
      noPointsRef.current = true;
      setDone(true);
      markStepComplete(stepIndex, totalSteps);
    }
    onBack?.();
  }, [comp, stepIndex, totalSteps, markStepComplete, onBack]);

  // Manual completion for open-ended activities that don't report progress.
  const completeStep = useCallback(() => {
    if (completedOnceRef.current) return;

    completedOnceRef.current = true;
    noPointsRef.current = true;
    setDone(true);

    markStepComplete(
      stepIndex,
      totalSteps
    );

    awardStepCoins(
      4,
      'first_completion'
    );
  }, [
    stepIndex,
    totalSteps,
    markStepComplete,
    awardStepCoins,
  ]);

  const studentNumber = selectedStudent?.number;
  const className = selectedStudent?.class_name;

  // Build a goal/progress label so the student knows what "done" means.
  const isMastery = comp.type === 'mastery' && !isTracingMode;
  const modeProgress = studentData?.mode_progress?.[step.mode];
  const masteredCount = modeProgress?.mastered_items?.length || 0;
  const attemptTarget = comp.target && comp.target > 1 ? comp.target : 5;
  const attemptCount = modeProgress?.total_attempts || 0;
  const goalText = isTracingMode
    ? `✍️ Trace ${attemptTarget} times`
    : isMastery
      ? `🎯 Master ${comp.target} — ${Math.min(masteredCount, comp.target)}/${comp.target}`
      : '★ Play once to finish';
  const goalDone = isTracingMode ? done : (isMastery ? masteredCount >= comp.target : false);

  function renderMode() {
    switch (step.mode) {
      case 'letter_sounds':
        return <LetterSoundsMode studentData={studentData} onUpdateProgress={wrappedUpdateProgress} targets={step?.config?.targets} />;
      case 'sight_words_easy':
        return <SightWordsEasyMode studentData={studentData} onUpdateProgress={wrappedUpdateProgress} targets={step?.config?.targets} />;
      case 'sight_words_spelling':
        return <SightWordsSpellingMode studentData={studentData} onUpdateProgress={wrappedUpdateProgress} onBack={wrappedBack} />;
      case 'spelling':
        return <SpellingMode studentData={studentData} onUpdateProgress={wrappedUpdateProgress} onBack={wrappedBack} />;
      case 'case_matching':
        return <CaseMatchingMode studentData={studentData} onUpdateProgress={wrappedUpdateProgress} targets={step?.config?.targets || step?.config?.targetLetters} />;
      case 'letter_tracing':
        return (
          <LetterTracingMode
            studentData={studentData}
            onUpdateProgress={wrappedUpdateProgress}
            onStudentPatch={onStudentPatch}
            targets={step?.config?.targets || step?.config?.targetLetters}
          />
        );
      case 'number_hearing':
        return <NumberHearingMode studentData={studentData} onUpdateProgress={wrappedUpdateProgress} />;
      case 'phonics':
        return <PhonicsMode studentData={studentData} onBack={wrappedBack} onStudentPatch={onStudentPatch} />;
      case 'sentences':
        return <SentencesMode studentData={studentData} onBack={wrappedBack} onStudentPatch={onStudentPatch} />;
      case 'spanish_reading':
        return <SpanishReadingGame studentNumber={studentNumber} className={className} onBack={wrappedBack} />;
      case 'storybuilder':
        return <StoryBuilder studentNumber={studentNumber} className={className} onBack={wrappedBack} />;
      case 'book_reading':
        return <BookReading prefillClass={className} prefillNumber={studentNumber} onBack={wrappedBack} />;
      case 'letter_sort':
        return <LetterSortStep onComplete={completeStep} presetId={step?.config?.preset} />;
      case 'letter_recognition':
        return <LetterRecognitionStep onComplete={completeStep} targets={step?.config?.targets} />;
      case 'powerful_word':
        return <PowerfulWordStep onComplete={completeStep} presetId={step?.config?.preset} />;
      case 'syllable_train':
        return <SyllableTrainStep onComplete={completeStep} />;
      case 'syllable_blender':
        return <SyllableBlenderStep onComplete={completeStep} />;
      case 'activities':
        return <ActivitiesStep onComplete={completeStep} studentName={selectedStudent?.name || `Estudiante ${studentNumber || ''}`} stepConfig={step?.config} />;
      case 'word_builder':
        return <WordBuilderStep onComplete={completeStep} studentNumber={studentNumber} className={className} presetId={step?.config?.preset} />;
      case 'fluency':
        return <FluencyPracticeStep onComplete={completeStep} presetId={step?.config?.preset} studentNumber={studentNumber} className={className} />;
      case 'video':
        return <VideoStep onComplete={completeStep} videoUrl={step?.config?.videoUrl} title={step.title} />;
      case 'soundwall':
        return <SoundWallStep onComplete={completeStep} stepConfig={step?.config} />;
      case 'google_slides':
        return <GoogleSlidesStep onComplete={completeStep} stepConfig={step?.config} title={step.title} />;
      case 'word_tracing':
        return <WordTracingMode studentData={studentData} onUpdateProgress={wrappedUpdateProgress} targets={step?.config?.targets} />;
      default:
        return <div className="p-10 text-center text-gray-400">Unknown step type.</div>;
    }
  }

  return (
    <div className={`relative flex flex-col ${stepperMode ? 'h-full' : 'h-screen'}`}>
      {renderMode()}

      {/* Floating back-to-lesson button (hidden in stepper/live mode) */}
      {!stepperMode && !liveMode && (
        <Button
          onClick={wrappedBack}
          className="absolute top-4 left-4 bg-white/90 hover:bg-white text-gray-800 shadow-lg z-50"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Lesson
        </Button>
      )}

      {/* Goal / progress chip */}
      <div className={`absolute top-4 right-4 z-50 px-3 py-1.5 rounded-full text-xs font-black shadow-lg ${
        goalDone ? 'bg-green-100 text-green-700' : 'bg-white/90 text-gray-700'
      }`}>
        {goalText}
      </div>

      {/* Completion overlay (hidden in live mode — teacher drives advancement) */}
      {done && !liveMode && (
        <div className="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center flex flex-col items-center gap-4">
            <span className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <Check className="w-9 h-9 text-green-600" strokeWidth={3} />
            </span>
            <div>
              <h2 className="text-2xl font-black text-gray-800">Step Complete!</h2>
              <p className="text-gray-500 text-sm mt-1">Great job on “{step.title}”.</p>
            </div>
            <div className="flex flex-col gap-2 w-full">
              <Button onClick={() => setDone(false)} className="bg-indigo-500 hover:bg-indigo-600 text-white font-black text-lg px-8 py-3">
                <RotateCcw className="w-5 h-5 mr-2" />
                Play Again
              </Button>
              <Button onClick={stepperMode ? onNext : wrappedBack} className="bg-green-500 hover:bg-green-600 text-white font-bold text-base px-8 py-2.5">
                <ArrowLeft className="w-5 h-5 mr-2" />
                {stepperMode ? (isLast ? 'Finish' : 'Next Step') : 'Return to Lesson'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}