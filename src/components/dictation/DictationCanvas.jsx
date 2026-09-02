import { useRef, useState, useEffect, useCallback } from 'react';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';
import LinedPaper from './LinedPaper';
import { base44 } from '@/api/base44Client';

const LINE_HEIGHT = 140;
const LINE_COUNT = 6;
const MAX_PAGE_WIDTH = 740;

export default function DictationCanvas({
  assignmentId,
  studentNumber,
  className,
  schoolYear,
  promptText,
}) {
  const canvasRef = useRef(null);
  const scrollRef = useRef(null);
  const [tool, setTool] = useState('pen');
  const [pageWidth, setPageWidth] = useState(MAX_PAGE_WIDTH);
  const [saved, setSaved] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef(null);
  const submissionId = useRef(null);

  const pageHeight = LINE_HEIGHT * LINE_COUNT;

  // Fit page width to viewport on smaller screens
  useEffect(() => {
    const update = () => setPageWidth(Math.min(MAX_PAGE_WIDTH, window.innerWidth - 32));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
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
    <div className="flex flex-col items-center gap-3 py-4 px-2">
      {promptText && (
        <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl px-5 py-2.5 text-indigo-800 font-bold text-lg text-center">
          ✏️ Write: {promptText}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap justify-center">
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
        ref={scrollRef}
        className="overflow-auto rounded-xl shadow-lg bg-white"
        style={{ maxHeight: '70vh', width: pageWidth, height: Math.min(pageHeight, window.innerHeight * 0.7) }}
      >
        <div className="relative" style={{ width: pageWidth, height: pageHeight }}>
          <LinedPaper width={pageWidth} height={pageHeight} lineCount={LINE_COUNT} />
          <AnnotationCanvas
            ref={canvasRef}
            width={pageWidth}
            height={pageHeight}
            color="#1e293b"
            size={5}
            tool={tool}
            mode="draw"
            onStrokeEnd={handleStrokeEnd}
            scrollContainerRef={scrollRef}
          />
        </div>
      </div>

      <div className="text-xs font-bold text-slate-400">
        {!loaded ? 'Loading…' : saved ? '✓ Saved' : 'Saving…'}
      </div>
    </div>
  );
}