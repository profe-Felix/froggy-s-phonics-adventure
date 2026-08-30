import MissingLetterMode from '@/components/game/modes/MissingLetterMode';

// Thin lesson-step wrapper: passes the step's preset id + student context to
// the shared game component, and reports completion through `onComplete` so
// LessonModeRouter can award coins / mark the step done.
export default function MissingLetterStep({ onComplete, presetId, studentData, onUpdateProgress, onStudentPatch }) {
  return (
    <MissingLetterMode
      presetId={presetId}
      studentData={studentData}
      onUpdateProgress={onUpdateProgress}
      onStudentPatch={onStudentPatch}
      onComplete={onComplete}
    />
  );
}