import { useRef, useState, useEffect, useCallback } from 'react';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';
import LinedPaper from './LinedPaper';
import { base44 } from '@/api/base44Client';

// Per-line dictado canvas driven by the teacher's live broadcast.
// Each line is its own AnnotationCanvas so ink can be locked per line:
//   - attempt  (current line, not revealed): dark ink, editable
//   - correct  (current line, revealed):     red ink, editable — dark attempt locked
//   - locked   (past line):                   read-only
//   - pending  (future line):                read-only, empty
const MAX_LINE_HEIGHT = 150;
const MAX_PAGE_WIDTH = 740;
const DARK = '#1e293b';
const RED = '#dc2626';

export default function DictadoLinesCanvas({
  lines,
  currentLine,
  revealed,
  assignmentId,
  studentNumber,
  className,
  schoolYear,
}) {
  const lineCount = Math.min(Math.max(lines?.length || 1, 1), 6);
  const containerRef = useRef(null);
  const lineRefs = useRef([]);
  const [pageWidth, setPageWidth] = useState(MAX_PAGE_WIDTH);
  const [pageHeight, setPageHeight] = useState(MAX_LINE_HEIGHT * lineCount);
  const lineHeight = pageHeight / lineCount;
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(true);
  const submissionId = useRef(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.min(MAX_PAGE_WIDTH, Math.max(280, r.width - 24));
      setPageWidth(w);
      setPageHeight(MAX_LINE_HEIGHT * lineCount);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [lineCount]);

  // Load existing submission (per-line strokes)
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
          if (data?.lines) {
            for (const [idx, ld] of Object.entries(data.lines)) {
              const ref = lineRefs.current[parseInt(idx)];
              if (ref) ref.loadStrokes(ld);
            }
          }
        }
      } catch {}
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [assignmentId, studentNumber, className, schoolYear]);

  const save = useCallback(() => {
    if (!assignmentId || !studentNumber || !className) return;
    const linesData = {};
    let count = 0;
    for (let i = 0; i < lineCount; i++) {
      const ref = lineRefs.current[i];
      if (ref) {
        const s = ref.getStrokes();
        linesData[i] = s;
        count += (s.strokes || []).length;
      }
    }
    const data = {
      lines: linesData,
      canvasWidth: pageWidth,
      canvasHeight: lineHeight,
      normalized: true,
    };
    const dataStr = JSON.stringify(data);
    (async () => {
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
    })();
  }, [assignmentId, studentNumber, className, schoolYear, pageWidth, lineHeight, lineCount]);

  const handleStrokeEnd = useCallback(() => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 800);
  }, [save]);

  const lineState = (i) => {
    if (i < currentLine) return 'locked';
    if (i === currentLine && !revealed) return 'attempt';
    if (i === currentLine && revealed) return 'correct';
    return 'pending';
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex-1 flex min-h-0 justify-center overflow-y-auto overflow-x-hidden p-2">
        <div ref={containerRef} className="flex-1 min-h-0 flex justify-center">
          <div
            className="relative rounded-xl shadow-lg bg-white"
            style={{ width: pageWidth, height: pageHeight }}
          >
            <LinedPaper width={pageWidth} height={pageHeight} lineCount={lineCount} />
            {Array.from({ length: lineCount }).map((_, i) => {
              const st = lineState(i);
              const isActive = st === 'attempt' || st === 'correct';
              const color = st === 'correct' ? RED : DARK;
              return (
                <div
                  key={i}
                  className={`absolute left-0 ${isActive ? 'ring-4 ring-indigo-400/70 ring-inset' : ''}`}
                  style={{ top: i * lineHeight, width: pageWidth, height: lineHeight, borderRadius: 8 }}
                >
                  <AnnotationCanvas
                    ref={(el) => { lineRefs.current[i] = el; }}
                    width={pageWidth}
                    height={lineHeight}
                    color={color}
                    size={5}
                    tool="pen"
                    mode={isActive ? 'draw' : 'view'}
                    onStrokeEnd={handleStrokeEnd}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="shrink-0 text-center text-xs font-bold text-slate-400 pb-2">
        {!loaded ? 'Loading…' : saved ? '✓ Saved' : 'Saving…'}
      </div>
    </div>
  );
}