import { useRef, useState, useEffect, useCallback } from 'react';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';
import LinedPaper from './LinedPaper';
import AnnotationToolbar from '@/components/notebook/AnnotationToolbar';
import { base44 } from '@/api/base44Client';

// Fixed line count — same on every device so the student page always matches
// the dashboard thumbnails. Line height shrinks to fit shorter screens (iPad)
// but never exceeds the comfortable 150px "Big" feel on taller screens.
const FIXED_LINE_COUNT = 4;
const MAX_LINE_HEIGHT = 180;
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
  const [color, setColor] = useState('#1e293b');
  const [size, setSize] = useState(5);
  const [side, setSide] = useState('left');
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
      const h = MAX_LINE_HEIGHT * FIXED_LINE_COUNT;
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

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {promptText && (
        <div className="shrink-0 px-4 pt-3">
          <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl px-5 py-2.5 text-indigo-800 font-bold text-lg text-center">
            ✏️ Write: {promptText}
          </div>
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {side === 'left' && (
          <div className="p-1.5 shrink-0 sticky top-0 self-start" style={{ background: '#1a1a2e' }}>
            <AnnotationToolbar
              tool={tool} setTool={setTool}
              color={color} setColor={setColor}
              size={size} setSize={setSize}
              onUndo={() => canvasRef.current?.undo()}
              onClear={() => { if (confirm('Clear everything?')) { canvasRef.current?.clearStrokes(); handleStrokeEnd(); } }}
              side={side} onSwapSide={() => setSide(s => s === 'left' ? 'right' : 'left')}
            />
          </div>
        )}

        <div
          ref={containerRef}
          className="flex-1 min-h-0 flex justify-center overflow-y-auto overflow-x-hidden p-2"
        >
          <div className="relative rounded-xl shadow-lg bg-white" style={{ width: pageWidth, height: pageHeight }}>
            <LinedPaper width={pageWidth} height={pageHeight} lineCount={FIXED_LINE_COUNT} />
            <AnnotationCanvas
              ref={canvasRef}
              width={pageWidth}
              height={pageHeight}
              color={color}
              size={size}
              tool={tool}
              mode="draw"
              onStrokeEnd={handleStrokeEnd}
            />
          </div>
        </div>

        {side === 'right' && (
          <div className="p-1.5 shrink-0 sticky top-0 self-start" style={{ background: '#1a1a2e' }}>
            <AnnotationToolbar
              tool={tool} setTool={setTool}
              color={color} setColor={setColor}
              size={size} setSize={setSize}
              onUndo={() => canvasRef.current?.undo()}
              onClear={() => { if (confirm('Clear everything?')) { canvasRef.current?.clearStrokes(); handleStrokeEnd(); } }}
              side={side} onSwapSide={() => setSide(s => s === 'left' ? 'right' : 'left')}
            />
          </div>
        )}
      </div>

      <div className="shrink-0 text-center text-xs font-bold text-slate-400 pb-2">
        {!loaded ? 'Loading…' : saved ? '✓ Saved' : 'Saving…'}
      </div>
    </div>
  );
}