import { useRef, useState, useEffect, useCallback } from 'react';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';
import LinedPaper from './LinedPaper';
import { base44 } from '@/api/base44Client';

// Per-line dictado canvas driven by the teacher's live broadcast.
// Each line has TWO stacked ink layers so the dark attempt can be locked
// independently from the red correction ink:
//
//   attempt    (dark)  — the student's first try. Editable only on the
//                        current line BEFORE reveal. Locked everywhere else.
//   correction (red)   — teacher-led fixes. Editable on the current line
//                        AFTER reveal, and on any PAST line (so a student
//                        can tape a red fix onto an earlier line without
//                        ever being able to delete the original dark ink).
//
// Teacher controls (DictadoLivePanel) drive this via `currentLine` + `revealed`:
//   • Reveal → current line: attempt locks, correction opens in red.
//   • Next   → new current line: fresh dark attempt; previous lines keep
//             their dark locked + red still editable.
//   • Prev   → move the active line back.
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
  const attemptRefs = useRef([]);
  const correctionRefs = useRef([]);
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

  // Load existing submission (per-line attempt + correction strokes)
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
              const i = parseInt(idx);
              const aRef = attemptRefs.current[i];
              const cRef = correctionRefs.current[i];
              if (aRef && ld?.attempt) aRef.loadStrokes(ld.attempt);
              if (cRef && ld?.correction) cRef.loadStrokes(ld.correction);
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
      const aRef = attemptRefs.current[i];
      const cRef = correctionRefs.current[i];
      const attempt = aRef ? aRef.getStrokes() : { strokes: [] };
      const correction = cRef ? cRef.getStrokes() : { strokes: [] };
      linesData[i] = { attempt, correction };
      count += (attempt.strokes || []).length + (correction.strokes || []).length;
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

  // Per-layer editability for line i, given teacher's currentLine + revealed.
  // attempt: editable only on current line before reveal.
  // correction: editable on current line after reveal, and on any past line.
  const layerState = (i) => {
    const isCurrent = i === currentLine;
    const isPast = i < currentLine;
    const isFuture = i > currentLine;
    return {
      attemptEditable: isCurrent && !revealed,
      correctionEditable: (isCurrent && revealed) || isPast,
      isCurrent,
      isPast,
      isFuture,
    };
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
              const st = layerState(i);
              const active = st.attemptEditable || st.correctionEditable;
              return (
                <div
                  key={i}
                  className={`absolute left-0 ${active ? 'ring-4 ring-indigo-400/70 ring-inset' : ''}`}
                  style={{ top: i * lineHeight, width: pageWidth, height: lineHeight, borderRadius: 8 }}
                >
                  {/* Dark attempt layer (bottom) */}
                  <div className="absolute inset-0">
                    <AnnotationCanvas
                      ref={(el) => { attemptRefs.current[i] = el; }}
                      width={pageWidth}
                      height={lineHeight}
                      color={DARK}
                      size={5}
                      tool="pen"
                      mode={st.attemptEditable ? 'draw' : 'view'}
                      onStrokeEnd={handleStrokeEnd}
                    />
                  </div>
                  {/* Red correction layer (top) — only captures input when editable */}
                  <div className="absolute inset-0">
                    <AnnotationCanvas
                      ref={(el) => { correctionRefs.current[i] = el; }}
                      width={pageWidth}
                      height={lineHeight}
                      color={RED}
                      size={5}
                      tool="pen"
                      mode={st.correctionEditable ? 'draw' : 'view'}
                      onStrokeEnd={handleStrokeEnd}
                    />
                  </div>
                  {st.isPast && (
                    <span className="absolute right-2 top-1 text-[10px] font-bold text-red-500/70 pointer-events-none">
                      ✎ red
                    </span>
                  )}
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