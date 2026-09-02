import { useRef, useState, useEffect, useCallback } from 'react';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';
import LinedPaper from './LinedPaper';
import { base44 } from '@/api/base44Client';

// Target line height matches the letter-tracing "Big" feel — big enough for
// comfortable kindergarten handwriting. We stack only as many lines as fit.
const TARGET_LINE_HEIGHT = 150;
const MAX_PAGE_WIDTH = 740;

export default function DictationCanvas({
  assignmentId,
  studentNumber,
  className,
  schoolYear,
  promptText,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [tool, setTool] = useState('pen');
  const [pageWidth, setPageWidth] = useState(MAX_PAGE_WIDTH);
  const [pageHeight, setPageHeight] = useState(600);
  const [saved, setSaved] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef(null);
  const submissionId = useRef(null);

  // Measure the container and fit the sheet to fill it — no scrolling.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.min(MAX_PAGE_WIDTH, Math.max(280, r.width - 24));
      const availH = Math.max(200, r.height - 24);
      const count = Math.max(1, Math.floor(availH / TARGET_LINE_HEIGHT));
      const h = count * TARGET_LINE_HEIGHT;
      setPageWidth(w);
      setPageHeight(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Load existing submission
  useEffect(() => {
    if (!assignmentId || !studentNumber || !className) return;
    let cancelled = false;
    setLoaded(false);
    (async () => {
      try {
        const existing = await base44.entities.DictationSubmission.filter({
          assignment_id: assignmentId,
          student_number: studentNumber,
          class_name: className,
          school_year: schoolYear || '',
        });
        if (cancelled) return;
        if (existing.length > 0 && existing[0].strokes_data) {
          submissionId.current = existing[0].id;
          const data = JSON.parse(existing[0].strokes_data);
          if (canvasRef.current && data) {
            canvasRef.current.loadStrokes(data);
          }
        }
      } catch {}
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [assignmentId, studentNumber, className, schoolYear]);

  const handleStrokeEnd = useCallback(() => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!canvasRef.current) return;
      const strokes = canvasRef.current.getStrokes();
      const data = {
        ...strokes,
        canvasWidth: pageWidth,
        canvasHeight: pageHeight,
        normalized: true,
      };
      const dataStr = JSON.stringify(data);
      const count = (strokes.strokes || []).length;
      try {
        if (submissionId.current) {
          await base44.entities.DictationSubmission.update(submissionId.current, {
            strokes_data: dataStr,
            stroke_count: count,
          });
        } else {
          const rec = await base44.entities.DictationSubmission.create({
            assignment_id: assignmentId,
            student_number: studentNumber,
            class_name: className,
            school_year: schoolYear || '',
            strokes_data: dataStr,
            stroke_count: count,
          });
          submissionId.current = rec.id;
        }
        setSaved(true);
      } catch {}
    }, 800);
  }, [assignmentId, studentNumber, className, schoolYear, pageWidth, pageHeight]);

  const toolBtn = (active, onClick, icon, label) => (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-1.5 ${
        active
          ? 'bg-indigo-600 text-white shadow'
          : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300'
      }`}
    >
      <span className="text-base">{icon}</span>
      {label}
    </button>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {promptText && (
        <div className="shrink-0 px-4 pt-3">
          <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl px-5 py-2.5 text-indigo-800 font-bold text-lg text-center">
            ✏️ Write: {promptText}
          </div>
        </div>
      )}

      <div className="shrink-0 flex items-center gap-2 flex-wrap justify-center px-4 py-3">
        {toolBtn(tool === 'pen', () => setTool('pen'), '✏️', 'Pen')}
        {toolBtn(tool === 'eraser_object', () => setTool('eraser_object'), '🧹', 'Erase')}
        {toolBtn(false, () => canvasRef.current?.undo(), '↩️', 'Undo')}
        {toolBtn(
          false,
          () => {
            if (confirm('Clear everything?')) {
              canvasRef.current?.clearStrokes();
              handleStrokeEnd();
            }
          },
          '🗑️',
          'Clear'
        )}
      </div>

      <div
        ref={containerRef}
        className="flex-1 min-h-0 flex items-center justify-center overflow-hidden px-2 pb-2"
      >
        <div className="relative rounded-xl shadow-lg bg-white" style={{ width: pageWidth, height: pageHeight }}>
          <LinedPaper width={pageWidth} height={pageHeight} lineCount={Math.max(1, Math.round(pageHeight / TARGET_LINE_HEIGHT))} />
          <AnnotationCanvas
            ref={canvasRef}
            width={pageWidth}
            height={pageHeight}
            color="#1e293b"
            size={5}
            tool={tool}
            mode="draw"
            onStrokeEnd={handleStrokeEnd}
          />
        </div>
      </div>

      <div className="shrink-0 text-center text-xs font-bold text-slate-400 pb-2">
        {!loaded ? 'Loading…' : saved ? '✓ Saved' : 'Saving…'}
      </div>
    </div>
  );
}