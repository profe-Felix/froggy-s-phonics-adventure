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
import MissingLetterStep from '@/components/lesson/modes/MissingLetterStep';
import DictationStep from '@/components/lesson/modes/DictationStep';
export default function LessonConfiguredActivity({step,onComplete,selectedStudent,studentData,activityStudentData,onStudentPatch,studentNumber,className,wrappedBack,embeddedMode,stepperMode,registerActivitySave,wrappedUpdateProgress,handleBookRecordingSaved,setCatalogRecordingPages,comp,getActivityState,saveActivityState,stepIndex}) {
  const config=step?.config||{};
  const student={studentNumber,className};
  const curriculum={presetId:config.preset,curriculumPosition:config.curriculumPosition};
  switch(step.mode) {
    case 'book_reading': return <BookReadingStep stepConfig={config} {...student} onBack={wrappedBack} onRecordingSaved={handleBookRecordingSaved} onRequiredPagesLoaded={setCatalogRecordingPages} embedded={embeddedMode||stepperMode}/>;
    case 'letter_sort': return <LetterSortStep onComplete={onComplete} {...curriculum} curriculumPositionOverride={config.curriculumPositionOverride} {...student}/>;
    case 'powerful_word': return <PowerfulWordStep onComplete={onComplete} presetId={config.preset}/>;
    case 'syllable_train': return <SyllableTrainStep onComplete={onComplete}/>;
    case 'syllable_blender': return <SyllableBlenderStep onComplete={onComplete} curriculumPosition={config.curriculumPosition} curriculumPositionOverride={config.curriculumPositionOverride}/>;
    case 'activities': return <ActivitiesStep onComplete={onComplete} studentName={selectedStudent?.name||`Estudiante ${studentNumber||''}`} stepConfig={config} completion={comp} activityState={getActivityState?.(stepIndex)} onActivityState={state=>saveActivityState?.(stepIndex,state)}/>;
    case 'word_builder': return <WordBuilderStep onComplete={onComplete} {...student} studentData={activityStudentData} onStudentPatch={onStudentPatch} {...curriculum}/>;
    case 'fluency': return <FluencyPracticeStep onComplete={onComplete} {...curriculum} curriculumPositionOverride={config.curriculumPositionOverride} curriculumContentType={config.curriculumContentType} {...student}/>;
    case 'video': return <VideoStep onComplete={onComplete} videoUrl={config.videoUrl} title={step.title}/>;
    case 'soundwall': return <SoundWallStep onComplete={onComplete} stepConfig={{...config,curriculumKey:config.curriculumKey||''}}/>;
    case 'google_slides': return <GoogleSlidesStep onComplete={onComplete} stepConfig={config} title={step.title}/>;
    case 'digital_notebook': return <DigitalNotebookStep onComplete={onComplete} registerSave={registerActivitySave} stepConfig={config} studentNumber={selectedStudent?.number||studentData?.number} className={selectedStudent?.class_name||studentData?.class_name}/>;
    case 'missing_letter': return <MissingLetterStep presetId={config.preset} studentData={activityStudentData} onUpdateProgress={wrappedUpdateProgress} onStudentPatch={onStudentPatch} onComplete={onComplete}/>;
    case 'dictation': return <DictationStep stepConfig={config} studentNumber={selectedStudent?.number||studentData?.number} className={selectedStudent?.class_name||studentData?.class_name} onComplete={onComplete}/>;
    default:return null;
  }
}