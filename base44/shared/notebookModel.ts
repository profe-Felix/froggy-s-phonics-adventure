export function visibleStrokes(history) {
  const visible = new Map();
  for (const s of history) {
    if (s.tool === 'clear_page') visible.clear();
    else if (s.tool === 'eraser_object') (s.erasedStrokeIds || []).forEach(id => visible.delete(id));
    else if (s.tool === 'eraser_pixel') {
      (s.removedStrokes || []).forEach(item => visible.delete(item.id));
      (s.resultStrokes || []).forEach(item => visible.set(item.id, item));
    } else visible.set(s.id, s);
  }
  return [...visible.values()];
}
export function legacyPage(source, page, sessionId) {
  const data = typeof source === 'string' ? JSON.parse(source) : (source || {});
  const raw = data.history || data.events || data.strokes || (Array.isArray(data) ? data : []);
  const sample = raw[0]?.pts?.[0];
  const normalized = data.normalized || !sample || (sample.x <= 1.5 && sample.y <= 1.5);
  const normalize = (s, index) => ({ ...s, id: s.id || `legacy-${sessionId}-${page}-${index}`, pts: (s.pts || []).map(p => ({...p, x: normalized ? p.x : p.x / (data.canvasWidth || 1), y: normalized ? p.y : p.y / (data.canvasHeight || 1)})) });
  const events = raw.map((s, i) => ({ stroke: normalize(s, i), active: true, writer: 0, role: 'student', seq: i }));
  return { events, notes: [], revision: 0 };
}
export function snapshot(page) {
  const history = page.events.filter(e => e.active).sort((a,b) => a.seq - b.seq).map(e => ({...e.stroke, writerId:e.writer, authorRole:e.role}));
  return { strokes: visibleStrokes(history), history, historyVersion:2, normalized:true, canvasWidth:1200, canvasHeight:1500, notes:page.notes, sharedEvents:page.events, sharedRevision:page.revision };
}
export function validateStroke(input) {
  if (!input || typeof input.id !== 'string' || input.id.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(input.id)) throw new Error('Invalid stroke identity');
  if (!['pen','highlighter','eraser_object','eraser_pixel'].includes(input.tool)) throw new Error('Invalid drawing tool');
  if (!Array.isArray(input.pts) || !input.pts.length || input.pts.length > 12000) throw new Error('Invalid stroke points');
  const points = input.pts.map(p => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 5 || Math.abs(p.y) > 5) throw new Error('Invalid drawing coordinates');
    return {x:p.x,y:p.y,t:Number(p.t)||0};
  });
  const stroke = {id:input.id,tool:input.tool,pts:points,color:/^#[a-fA-F0-9]{6}$/.test(input.color) ? input.color : '#000000',size:Math.max(1,Math.min(40,Number(input.size)||4))};
  if (typeof input.originalId === 'string') stroke.originalId = input.originalId;
  if (input.tool === 'eraser_object') stroke.erasedStrokeIds = [...new Set(input.erasedStrokeIds || [])].filter(id => typeof id === 'string').slice(0,20000);
  if (input.tool === 'eraser_pixel') {
    stroke.removedStrokes = (input.removedStrokes || []).map(s => ({id:String(s.id)}));
    stroke.resultStrokes = (input.resultStrokes || []).map(validateStroke);
  }
  return stroke;
}
export function applyOperation(page, op, writer, role) {
  const next = structuredClone(page);
  const canErase = id => {
    const event = next.events.find(e => e.stroke.id === id || (e.stroke.resultStrokes || []).some(s => s.id === id));
    return event && (role === 'teacher' ? event.role === 'teacher' : event.role !== 'teacher');
  };
  if (op.kind === 'add') {
    if (next.events.some(e => e.stroke.id === op.stroke.id)) return next;
    const stroke = validateStroke(op.stroke);
    if (stroke.erasedStrokeIds) stroke.erasedStrokeIds = stroke.erasedStrokeIds.filter(canErase);
    if (stroke.removedStrokes) {
      const permitted = new Set(stroke.removedStrokes.filter(s => canErase(s.id)).map(s => s.id));
      stroke.removedStrokes = stroke.removedStrokes.filter(s => permitted.has(s.id));
      stroke.resultStrokes = stroke.resultStrokes.filter(s => permitted.has(s.originalId || s.id));
    }
    next.events.push({stroke,writer,role,active:true,seq:next.events.length});
  } else if (op.kind === 'toggle') {
    const event = next.events.find(e => e.stroke.id === op.stroke_id);
    if (!event || event.writer !== writer) throw new Error('Undo only changes your own marks');
    event.active = op.active === true;
  } else if (op.kind === 'note') {
    if (role !== 'teacher') throw new Error('Teacher access is required for feedback');
    if (!next.notes.some(n => n.id === op.note.id)) next.notes.push({id:op.note.id,text:String(op.note.text||'').trim().slice(0,1000),x:Math.max(0,Math.min(1,Number(op.note.x)||0)),y:Math.max(0,Math.min(1,Number(op.note.y)||0)),writer});
  } else if (op.kind === 'remove_note') {
    if (role !== 'teacher') throw new Error('Teacher access is required for feedback');
    next.notes = next.notes.filter(n => n.id !== op.note_id);
  } else throw new Error('Unknown notebook change');
  next.revision += 1;
  return next;
}