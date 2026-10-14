import { useRef, useState } from 'react';
import StudentNotebookView from '@/components/notebook/StudentNotebookView';
export default function NotebookFeedbackModal({session,assignment,page,onClose}) {
  const saver=useRef(null); const [closing,setClosing]=useState(false);
  return <div role="dialog" aria-label="Student notebook feedback" className="fixed inset-0 z-[250] bg-background flex flex-col">
    <div className="flex items-center justify-between px-4 py-2 bg-card text-card-foreground border-b border-border"><span className="font-bold">Feedback · Student #{session.student_number}</span><button type="button" disabled={closing} className="rounded-lg bg-primary text-primary-foreground px-4 py-2" onClick={async()=>{setClosing(true);const ok=await saver.current?.();setClosing(false);if(ok===true)onClose();}}>{closing?'Saving feedback…':'Close feedback'}</button></div>
    <div className="flex-1 min-h-0"><StudentNotebookView teacherMode embedded assignmentOverride={assignment} studentNumber={session.student_number} className={session.class_name} directPage={page||session.current_page||1} registerSave={save=>{saver.current=save;}} onBack={onClose}/></div>
  </div>;
}