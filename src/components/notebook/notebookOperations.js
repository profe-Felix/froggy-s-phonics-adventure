export function projectPage(data, operations, writer, teacher) {
  const events = (data?.sharedEvents || []).map(e => ({...e,stroke:{...e.stroke}}));
  let notes = [...(data?.notes || [])];
  for (const item of operations) {
    const op=item.change;
    if (op.kind==='add' && !events.some(e=>e.stroke.id===op.stroke.id)) events.push({stroke:op.stroke,active:true,writer,role:teacher?'teacher':'student',seq:events.length});
    if (op.kind==='toggle') { const e=events.find(e=>e.stroke.id===op.stroke_id); if(e) e.active=op.active; }
    if (op.kind==='note' && !notes.some(n=>n.id===op.note.id)) notes.push(op.note);
    if (op.kind==='remove_note') notes=notes.filter(n=>n.id!==op.note_id);
  }
  const history=events.filter(e=>e.active).sort((a,b)=>a.seq-b.seq).map(e=>({...e.stroke,writerId:e.writer,authorRole:e.role}));
  return {...data,history,notes,normalized:true,sharedEvents:events};
}
export function recoverLegacy(data, saved) {
  const draft=typeof saved==='string'?JSON.parse(saved):saved;
  const known=new Set((data?.sharedEvents||[]).map(e=>e.stroke.id));
  const signatures=new Set((data?.history||[]).map(s=>JSON.stringify([s.pts,s.tool,s.color,s.size])));
  return (draft.history||draft.strokes||[]).filter(s=>!known.has(s.id)&&!signatures.has(JSON.stringify([s.pts,s.tool,s.color,s.size]))).map(s=>{
    const point=s.pts?.[0]; const normalized=draft.normalized||(point&&point.x<=1.5&&point.y<=1.5);
    const stroke={...s,id:s.id||crypto.randomUUID(),pts:(s.pts||[]).map(p=>({...p,x:normalized?p.x:p.x/(draft.canvasWidth||1),y:normalized?p.y:p.y/(draft.canvasHeight||1)}))};
    if(stroke.tool==='clear_page') return {kind:'add',stroke:{...stroke,tool:'eraser_object',erasedStrokeIds:(stroke.removedStrokes||[]).map(s=>s.id)}};
    return {kind:'add',stroke};
  });
}