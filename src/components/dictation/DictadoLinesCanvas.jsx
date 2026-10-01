import { useRef, useState, useEffect, useCallback } from 'react';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';
import LinedPaper from './LinedPaper';
import { base44 } from '@/api/base44Client';

// Traceable word model font — ZBK arrow-dot shows stroke direction so students
// learn correct letter formation as they trace over it in red after reveal.
const TRACE_FONT = "'ZBKidLettersArrowDot', 'Andika', sans-serif";

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

  // Active drawing tool (pen / eraser) shared by whichever layer is editable.
  const [tool, setTool] = useState('pen');
  // Tracks the last line/layer the student drew on so Undo targets it.
  const lastActive = useRef({ line: 0, layer: 'attempt' });

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

  const handleStrokeEnd = useCallback((line, layer) => {
    lastActive.current = { line, layer };
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 800);
  }, [save]);

  const handleUndo = useCallback(() => {
    const { line, layer } = lastActive.current;
    const ref = layer === 'correction'
      ? correctionRefs.current[line]
      : attemptRefs.current[line];
    ref?.undo?.();
    handleStrokeEnd(line, layer);
  }, [handleStrokeEnd]);

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
              const showModel = (st.isCurrent && revealed) || st.isPast;
              const word = lines?.[i] || '';
              return (
                <div
                  key={i}
                  className={`absolute left-0 ${active ? 'ring-4 ring-indigo-400/70 ring-inset' : ''}`}
                  style={{ top: i * lineHeight, width: pageWidth, height: lineHeight, borderRadius: 8 }}
                >
                  {/* Traceable word model — shown once the teacher reveals this
                      line. Faint arrow-dot letters sit on the baseline so the
                      student can trace over them in red to practice correct
                      letter formation. */}
                  {showModel && word && (
                    <span
                      className="absolute pointer-events-none select-none"
                      style={{
                        left: 88,
                        top: lineHeight * 0.633,
                        transform: 'translateY(-0.78em)',
                        fontSize: lineHeight * 0.5,
                        lineHeight: 1,
                        fontFamily: TRACE_FONT,
                        color: 'rgba(30, 41, 59, 0.22)',
                        whiteSpace: 'nowrap',
                        zIndex: 2,
                      }}
                    >
                      {word}
                    </span>
                  )}
                  {/* Dark attempt layer (bottom) */}
                  <div className="absolute inset-0">
                    <AnnotationCanvas
                      ref={(el) => { attemptRefs.current[i] = el; }}
                      width={pageWidth}
                      height={lineHeight}
                      color={DARK}
                      size={5}
                      tool={st.attemptEditable ? tool : 'pen'}
                      mode={st.attemptEditable ? 'draw' : 'view'}
                      onStrokeEnd={() => handleStrokeEnd(i, 'attempt')}
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
                      tool={st.correctionEditable ? tool : 'pen'}
                      mode={st.correctionEditable ? 'draw' : 'view'}
                      onStrokeEnd={() => handleStrokeEnd(i, 'correction')}
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

      {/* Pen / eraser / undo toolbar — available while a layer is editable so
          students can erase their own mistakes and fix them before reveal. */}
      {loaded && (
        <div className="shrink-0 flex items-center justify-center gap-2 pb-2">
          <div className="flex items-center gap-1 bg-slate-900 rounded-full px-2 py-1 shadow-lg">
            <button
              onClick={() => setTool('pen')}
              title="Pencil"
              className={`w-10 h-10 rounded-full text-xl flex items-center justify-center transition ${
                tool === 'pen' ? 'bg-indigo-600 scale-110' : 'hover:bg-indigo-900'
              }`}
            >✏️</button>
            <button
              onClick={() => setTool('eraser_object')}
              title="Eraser (tap a stroke to remove it)"
              className={`w-10 h-10 rounded-full text-xl flex items-center justify-center transition ${
                tool === 'eraser_object' ? 'bg-indigo-600 scale-110' : 'hover:bg-indigo-900'
              }`}
            >🧹</button>
            <button
              onClick={handleUndo}
              title="Undo"
              className="w-10 h-10 rounded-full text-xl flex items-center justify-center hover:bg-indigo-900"
            >↩️</button>
          </div>
        </div>
      )}

      <div className="shrink-0 text-center text-xs font-bold text-slate-400 pb-2">
        {!loaded ? 'Loading…' : saved ? '✓ Saved' : 'Saving…'}
      </div>
    </div>
  );
}