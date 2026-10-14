import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
export default function NotebookNotePins({notes=[],width,height}) {
  const [open,setOpen]=useState(null);
  return <div className="absolute inset-0 z-30 pointer-events-none" style={{width,height}}>{notes.map(note=><div key={note.id} className="absolute pointer-events-auto" style={{left:`${note.x*100}%`,top:`${note.y*100}%`}}>
    <button type="button" aria-label={`Teacher note: ${note.text}`} onClick={()=>setOpen(open===note.id?null:note.id)} className="rounded-full border border-border bg-card text-foreground p-1.5 shadow-md"><MessageSquare className="h-4 w-4"/></button>
    {open===note.id&&<div className="mt-1 max-w-48 rounded-lg border border-border bg-card text-card-foreground p-2 shadow-lg text-sm break-words">{note.text}</div>}
  </div>)}</div>;
}