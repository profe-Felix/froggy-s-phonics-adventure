import BookReadingStep from '@/components/lesson/modes/BookReadingStep';
import LetterSortStep from '@/components/lesson/modes/LetterSortStep';
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
import DigitalNotebook2Step from '@/components/lesson/modes/DigitalNotebook2Step';
import MissingLetterStep from '@/components/lesson/modes/MissingLetterStep';
import DictationStep from '@/components/lesson/modes/DictationStep';
import ExternalNotebookSlot from '@/components/external-notebook/ExternalNotebookSlot';
import NotebookAssignmentEntry from '@/components/external-notebook/NotebookAssignmentEntry';
import { FluencyLessonStudent } from '@/components/live/FluencyLessonTable';

// Build a lesson context for the external notebook from the actual live session.
// Independent (non-live) lessons have no authorized live source → null context →
// ExternalNotebookSlot renders the legacy DigitalNotebookStep unchanged.
function lessonNotebookContext({ liveSession, stepIndex, step, selectedStudent, studentData }) {
  if (!liveSession?.id || !studentData?.id) return null;

  const config = step?.config || {};
  const sNum = Number(studentData.student_number ?? studentData.number ?? selectedStudent?.number);
  const sClass = studentData.class_name;
  const sYear = studentData.school_year;

  if (!Number.isInteger(sNum) || sNum < 1 || sNum > 100 || !sClass || !sYear) return null;
  if (selectedStudent?.number != null && Number(selectedStudent.number) !== sNum) return null;
  if (selectedStudent?.class_name && selectedStudent.class_name !== sClass) return null;
  if (liveSession.class_name !== sClass || liveSession.school_year !== sYear) return null;
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || !config.assignmentId) return null;

  const teacherStep = liveSession.current_step ?? 0;
  const releaseMode = liveSession.release_mode || 'stay';
  const phase = liveSession.phase || 'watch';
  if (releaseMode === 'lesson' ? stepIndex < teacherStep : stepIndex !== teacherStep) return null;

  const rawPageCount = Number(config.assignmentPageCount);
  const maxPage = Number.isInteger(rawPageCount) && rawPageCount > 0 ? rawPageCount : 1;
  const clampPage = value => Math.min(maxPage, Math.max(1, Math.trunc(Number(value) || 1)));
  const selection = config.pageSelection || 'single';
  const first = clampPage(config.pageStart);
  const last = Math.max(first, clampPage(config.pageEnd || first));
  const customRanges = String(config.customPages || '').split(',').map(part => {
    const values = part.trim().split('-').map(Number);
    if (values.length > 2 || !values.every(Number.isInteger)) return null;
    return [Math.min(...values), Math.max(...values)];
  }).filter(Boolean);

  let pages = Array.from({ length: maxPage }, (_, index) => index + 1).filter(page => {
    if (selection === 'all') return true;
    if (selection === 'range') return page >= first && page <= last;
    if (selection === 'custom') return customRanges.some(([start, end]) => page >= start && page <= end);
    return page === first;
  });
  if (!pages.length) pages = [1];

  return {
    kind: 'lesson', role: 'student', blocked: false,
    active: liveSession.active === true,
    sourceId: liveSession.id,
    stepId: String(stepIndex),
    assignmentId: config.assignmentId,
    className: sClass, schoolYear: sYear,
    student: { id: studentData.id, number: sNum, className: sClass, schoolYear: sYear },
    targetStudents: liveSession.target_students,
    phase,
    releaseMode,
    paused: releaseMode !== 'lesson' && phase !== 'try',
    page: pages[0],
    allowedPages: selection === 'all' ? null : pages,
  };
}

export default function LessonConfiguredActivity({step,onComplete,selectedStudent,studentData,activityStudentData,onStudentPatch,studentNumber,className,wrappedBack,embeddedMode,stepperMode,registerActivitySave,wrappedUpdateProgress,handleBookRecordingSaved,setCatalogRecordingPages,comp,getActivityState,saveActivityState,stepIndex,liveSessionId,liveSession}) {
  const config=step?.config||{};
  const student={studentNumber,className};
  const curriculum={presetId:config.preset,curriculumPosition:config.curriculumPosition};
  switch(step.mode) {
    case 'book_reading': return <BookReadingStep stepConfig={config} {...student} onBack={wrappedBack} onRecordingSaved={handleBookRecordingSaved} onRequiredPagesLoaded={setCatalogRecordingPages} embedded={embeddedMode||stepperMode}/>;
    case 'letter_sort': return <LetterSortStep onComplete={onComplete} {...curriculum} curriculumPositionOverride={config.curriculumPositionOverride} {...student}/>;
    case 'powerful_word': return <PowerfulWordStep onComplete={onComplete} presetId={config.preset}/>;
    case 'syllable_train': return <SyllableTrainStep onComplete={onComplete}/>;
    case 'syllable_blender': return <SyllableBlenderStep onComplete={onComplete} targets={config.targets} curriculumPosition={config.curriculumPosition} curriculumPositionOverride={config.curriculumPositionOverride}/>;
    case 'activities': return <ActivitiesStep onComplete={onComplete} studentName={selectedStudent?.name||`Estudiante ${studentNumber||''}`} stepConfig={config} completion={comp} activityState={getActivityState?.(stepIndex)} onActivityState={state=>saveActivityState?.(stepIndex,state)}/>;
    case 'word_builder': return <WordBuilderStep onComplete={onComplete} {...student} studentData={activityStudentData} onStudentPatch={onStudentPatch} {...curriculum}/>;
    case 'fluency': return liveSession?.active && stepIndex === (liveSession.current_step ?? 0)
      ? <FluencyLessonStudent step={step} stepIndex={stepIndex} liveSession={liveSession} />
      : <FluencyPracticeStep onComplete={onComplete} {...curriculum} curriculumPositionOverride={config.curriculumPositionOverride} curriculumContentType={config.curriculumContentType} {...student}/>;
    case 'video': return <VideoStep onComplete={onComplete} videoUrl={config.videoUrl} title={step.title}/>;
    case 'soundwall': return <SoundWallStep onComplete={onComplete} stepConfig={{...config,curriculumKey:config.curriculumKey||''}}/>;
    case 'google_slides': return <GoogleSlidesStep onComplete={onComplete} stepConfig={config} title={step.title}/>;
    case 'digital_notebook2':
    case 'digital_notebook3':
      return <DigitalNotebook2Step variant={step.mode === 'digital_notebook3' ? 3 : 2} stepConfig={config} onComplete={onComplete} registerSave={registerActivitySave}
        schoolYear={studentData?.school_year} liveSession={liveSession} stepIndex={stepIndex}
        studentNumber={selectedStudent?.number || studentData?.student_number || studentData?.number || studentNumber}
        className={selectedStudent?.class_name || studentData?.class_name || className} />;
    case 'digital_notebook': {
      const notebookStep = <DigitalNotebookStep onComplete={onComplete} registerSave={registerActivitySave} stepConfig={config} studentNumber={selectedStudent?.number||studentData?.number} className={selectedStudent?.class_name||studentData?.class_name}/>;
      const lessonCtx = lessonNotebookContext({ liveSession, stepIndex, step, selectedStudent, studentData });
      if (!liveSession?.id) return <NotebookAssignmentEntry LegacyView={DigitalNotebookStep}
        directAssignmentId={config.assignmentId} directAssignmentName={config.assignmentTitle} stepConfig={config}
        onComplete={onComplete} registerSave={registerActivitySave}
        studentNumber={selectedStudent?.number || studentData?.number || studentData?.student_number || studentNumber}
        className={selectedStudent?.class_name || studentData?.class_name || className} />;
      if (!lessonCtx) return <div role="status" className="p-6">Opening the lesson notebook…</div>;
      return <ExternalNotebookSlot context={lessonCtx} registerSave={registerActivitySave} onComplete={onComplete}>{notebookStep}</ExternalNotebookSlot>;
    }
    case 'missing_letter': return <MissingLetterStep presetId={config.preset} studentData={activityStudentData} onUpdateProgress={wrappedUpdateProgress} onStudentPatch={onStudentPatch} onComplete={onComplete}/>;
    case 'dictation': return <DictationStep stepConfig={config} studentNumber={selectedStudent?.number||studentData?.number} className={selectedStudent?.class_name||studentData?.class_name} onComplete={onComplete}/>;
    default:return null;
  }
}