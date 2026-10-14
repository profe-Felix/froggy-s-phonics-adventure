import { useState } from 'react';
import { MessageSquare, Trash2 } from 'lucide-react';
export default function NotebookFeedback({notes=[],teacherMode,onAdd,onRemove,placing,onToggle}) {
  const [text,setText]=useState('');
  return <div className="shrink-0 border-t border-border bg-card text-card-foreground px-3 py-2 flex flex-wrap items-center gap-2" data-testid="notebook-feedback">
    {teacherMode&&<form className="flex flex-wrap items-center gap-2" onSubmit={e=>{e.preventDefault();if(text.trim()){onAdd(text.trim());setText('');}}}>
      <MessageSquare className="h-4 w-4"/><input aria-label="Teacher feedback" placeholder="Check this word…" value={text} onChange={e=>setText(e.target.value)} maxLength={1000} className="rounded-lg border border-input bg-background px-2 py-1 text-sm"/>
      <button type="submit" disabled={!text.trim()} className="rounded-lg bg-primary text-primary-foreground px-3 py-1 text-sm disabled:opacity-40">Add feedback</button>
      <button type="button" onClick={() => onToggle(text.trim())} aria-pressed={placing} className="rounded-lg border border-input px-3 py-1 text-sm">{placing?'Tap the page to place feedback':'Place on page'}</button>
    </form>}
    {notes.map(note=><div key={note.id} className="rounded-lg bg-muted text-foreground px-2 py-1 inline-flex items-center gap-2 text-sm"><span>Teacher: {note.text}</span>{teacherMode&&<button type="button" aria-label={`Remove feedback: ${note.text}`} onClick={()=>onRemove(note.id)}><Trash2 className="w-4 h-4"/></button>}</div>)}
    {!teacherMode&&notes.length===0&&<span className="text-muted-foreground text-xs">Teacher feedback will appear here.</span>}
  </div>;
}