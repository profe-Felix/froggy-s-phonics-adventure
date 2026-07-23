import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Check, Sparkles } from 'lucide-react';
import { useLessonProgress } from '@/hooks/useLessonProgress';

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
}) {
  const { progress, markStepComplete } = useLessonProgress(
    selectedStudent?.number, selectedStudent?.class_name, lessonId
  );
  const alreadyDone = (progress?.completed_steps || []).includes(stepIndex);
  const [done, setDone] = useState(alreadyDone);
  const comp = step?.completion || { type: 'view', target: 1 };

  const maybeComplete = useCallback((progressData) => {
    if (done) return;
    let isDone = false;
    if (comp.type === 'mastery') {
      isDone = (progressData?.mastered_items?.length || 0) >= (comp.target || 1);
    } else {
      // view = at least one real attempt recorded by the activity
      isDone = (progressData?.total_attempts || 0) >= 1;
    }
    if (isDone) {
      setDone(true);
      markStepComplete(stepIndex, totalSteps);
    }
  }, [done, comp, stepIndex, totalSteps, markStepComplete]);

  // progress-aware wrapper (also persists via the parent's onUpdateProgress)
  const wrappedUpdateProgress = useCallback((mode, progressData) => {
    if (onUpdateProgress) onUpdateProgress(mode, progressData);
    maybeComplete(progressData);
  }, [onUpdateProgress, maybeComplete]);

  // back wrapper: 'view' steps complete when the student finishes and returns
  const wrappedBack = useCallback(() => {
    if (!done && comp.type === 'view') {
      setDone(true);
      markStepComplete(stepIndex, totalSteps);
    }
    onBack?.();
  }, [done, comp, stepIndex, totalSteps, markStepComplete, onBack]);

  const studentNumber = selectedStudent?.number;
  const className = selectedStudent?.class_name;

  // Build a goal/progress label so the student knows what "done" means.
  const isMastery = comp.type === 'mastery';
  const modeProgress = studentData?.mode_progress?.[step.mode];
  const masteredCount = modeProgress?.mastered_items?.length || 0;
  const goalText = isMastery
    ? `🎯 Master ${comp.target} — ${Math.min(masteredCount, comp.target)}/${comp.target}`
    : '★ Play once to finish';
  const goalDone = isMastery ? masteredCount >= comp.target : false;

  function renderMode() {
    switch (step.mode) {
      case 'letter_sounds':
        return <LetterSoundsMode studentData={studentData} onUpdateProgress={wrappedUpdateProgress} />;
      case 'sight_words_easy':
        return <SightWordsEasyMode studentData={studentData} onUpdateProgress={wrappedUpdateProgress} />;
      case 'sight_words_spelling':
        return <SightWordsSpellingMode studentData={studentData} onUpdateProgress={wrappedUpdateProgress} onBack={wrappedBack} />;
      case 'spelling':
        return <SpellingMode studentData={studentData} onUpdateProgress={wrappedUpdateProgress} onBack={wrappedBack} />;
      case 'case_matching':
        return <CaseMatchingMode studentData={studentData} onUpdateProgress={wrappedUpdateProgress} />;
      case 'letter_tracing':
        return <LetterTracingMode studentData={studentData} onUpdateProgress={wrappedUpdateProgress} />;
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
      default:
        return <div className="p-10 text-center text-gray-400">Unknown step type.</div>;
    }
  }

  return (
    <div className="relative h-screen flex flex-col">
      {renderMode()}

      {/* Floating back-to-lesson button (always available) */}
      <Button
        onClick={wrappedBack}
        className="absolute top-4 left-4 bg-white/90 hover:bg-white text-gray-800 shadow-lg z-50"
      >
        <ArrowLeft className="w-5 h-5 mr-2" />
        Back to Lesson
      </Button>

      {/* Goal / progress chip */}
      <div className={`absolute top-4 right-4 z-50 px-3 py-1.5 rounded-full text-xs font-black shadow-lg ${
        goalDone ? 'bg-green-100 text-green-700' : 'bg-white/90 text-gray-700'
      }`}>
        {goalText}
      </div>

      {/* Completion overlay */}
      {done && (
        <div className="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center flex flex-col items-center gap-4">
            <span className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <Check className="w-9 h-9 text-green-600" strokeWidth={3} />
            </span>
            <div>
              <h2 className="text-2xl font-black text-gray-800">Step Complete!</h2>
              <p className="text-gray-500 text-sm mt-1">Great job on “{step.title}”.</p>
            </div>
            <Button onClick={wrappedBack} className="bg-green-500 hover:bg-green-600 text-white font-black text-lg px-8 py-3">
              <Sparkles className="w-5 h-5 mr-2" />
              Continue
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}