import { useRef, useState, useEffect, useCallback } from 'react';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';
import LinedPaper from './LinedPaper';
import DictadoTraceCanvas from './DictadoTraceCanvas';
import { base44 } from '@/api/base44Client';

// Per-line dictado canvas driven by the teacher's live broadcast.
//
// Each line has:
//   attempt (dark, freehand)  — the student's first try, full line width.
//                              Editable only on the current line BEFORE reveal.
//                              Locked everywhere else.
//   trace   (red, validated)  — a waypoint model (DictadoTraceCanvas) shown on
//                              the RIGHT half of the line on/after reveal. The
//                              student traces the correct formation with the
//                              SAME strictness as WordTracing (start-point hit,
//                              forward-only coverage, wobble corridor, direction
//                              reject). Positioned after the student's ink,
//                              halfway across the line.
//
// Teacher controls (DictadoLivePanel) drive this via `currentLine` + `revealed`.

const MAX_LINE_HEIGHT = 150;
const MAX_PAGE_WIDTH = 740;
const DARK = '#1e293b';

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
  const [pageWidth, setPageWidth] = useState(MAX_PAGE_WIDTH);
  const [pageHeight, setPageHeight] = useState(MAX_LINE_HEIGHT * lineCount);
  const lineHeight = pageHeight / lineCount;
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(true);
  const submissionId = useRef(null);
  const saveTimer = useRef(null);
  // Saved trace progress per line index: { paths, accuracies, done, accuracy }
  const traceRef = useRef({});

  // Active drawing tool for the freehand attempt layer (pen / eraser).
  const [tool, setTool] = useState('pen');
  // Tracks the last line the student drew on so Undo targets it.
  const lastActiveLine = useRef(0);

  // Live values kept in refs so the save / stroke-end callbacks stay stable
  // (identity-stable) across re-renders. The DictationStudent page polls the
  // live session every second, which re-renders this component; if the
  // onStrokeEnd props passed to AnnotationCanvas changed identity each render,
  // AnnotationCanvas's effect would re-run mid-stroke and COMMIT the in-progress
  // stroke — visibly "interrupting" the student's drawing. Refs avoid that.
  const dimsRef = useRef({ pageWidth, lineHeight, lineCount });
  dimsRef.current = { pageWidth, lineHeight, lineCount };
  const ctxRef = useRef({ assignmentId, studentNumber, className, schoolYear });
  ctxRef.current = { assignmentId, studentNumber, className, schoolYear };
  const submissionIdRef = useRef(null);
  submissionIdRef.current = submissionId.current;

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

  // Load existing submission (per-line attempt strokes; trace is re-traced
  // fresh each reveal so it isn't persisted as freehand ink).
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
              if (aRef && ld?.attempt) aRef.loadStrokes(ld.attempt);
              if (ld?.trace) traceRef.current[i] = ld.trace;
            }
          }
        }
      } catch {}
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [assignmentId, studentNumber, className, schoolYear]);

  // Stable save: reads latest dims/ctx from refs so its identity never changes.
  const save = useCallback(() => {
    const { pageWidth: pw, lineHeight: lh, lineCount: lc } = dimsRef.current;
    const { assignmentId: aid, studentNumber: sn, className: cn, schoolYear: sy } = ctxRef.current;
    if (!aid || !sn || !cn) return;
    const linesData = {};
    let count = 0;
    for (let i = 0; i < lc; i++) {
      const aRef = attemptRefs.current[i];
      const attempt = aRef ? aRef.getStrokes() : { strokes: [] };
      linesData[i] = { attempt };
      if (traceRef.current[i]) linesData[i].trace = traceRef.current[i];
      count += (attempt.strokes || []).length;
    }
    const data = { lines: linesData, canvasWidth: pw, canvasHeight: lh, normalized: true };
    const dataStr = JSON.stringify(data);
    (async () => {
      try {
        if (submissionIdRef.current) {
          await base44.entities.DictationSubmission.update(submissionIdRef.current, {
            strokes_data: dataStr, stroke_count: count,
          });
        } else {
          const rec = await base44.entities.DictationSubmission.create({
            assignment_id: aid, student_number: sn, class_name: cn,
            school_year: sy || '', strokes_data: dataStr, stroke_count: count,
          });
          submissionId.current = rec.id;
          submissionIdRef.current = rec.id;
        }
        setSaved(true);
      } catch {}
    })();
  }, []);

  // Stable stroke-end handler. `line` is baked in via a cached callback per
  // line so the prop passed to each AnnotationCanvas never changes identity.
  const scheduleSave = useCallback(() => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 800);
  }, [save]);

  const attemptEndCache = useRef([]);
  if (attemptEndCache.current.length !== lineCount) {
    attemptEndCache.current = Array.from({ length: lineCount }, (_, i) => () => {
      lastActiveLine.current = i;
      scheduleSave();
    });
  }

  const traceEndCache = useRef([]);
  if (traceEndCache.current.length !== lineCount) {
    traceEndCache.current = Array.from({ length: lineCount }, (_, i) => (trace) => {
      traceRef.current[i] = trace;
      scheduleSave();
    });
  }

  const handleUndo = useCallback(() => {
    const i = lastActiveLine.current;
    attemptRefs.current[i]?.undo?.();
    scheduleSave();
  }, [scheduleSave]);

  const handleClear = useCallback(() => {
    if (!confirm('Clear this line?')) return;
    const i = lastActiveLine.current;
    attemptRefs.current[i]?.clearStrokes?.();
    scheduleSave();
  }, [scheduleSave]);

  // Per-line editability for the attempt layer.
  const attemptEditable = (i) => i === currentLine && !revealed;
  const showTrace = (i) => (i === currentLine && revealed) || i < currentLine;
  const traceWord = (i) => lines?.[i] || '';

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
              const editable = attemptEditable(i);
              const traced = showTrace(i);
              const word = traceWord(i);
              return (
                <div
                  key={i}
                  className={`absolute left-0 ${editable ? 'ring-4 ring-indigo-400/70 ring-inset' : ''}`}
                  style={{ top: i * lineHeight, width: pageWidth, height: lineHeight, borderRadius: 8 }}
                >
                  {/* Dark attempt layer — full line width, freehand */}
                  <div className="absolute inset-0">
                    <AnnotationCanvas
                      ref={(el) => { attemptRefs.current[i] = el; }}
                      width={pageWidth}
                      height={lineHeight}
                      color={DARK}
                      size={5}
                      tool={editable ? tool : 'pen'}
                      mode={editable ? 'draw' : 'view'}
                      onStrokeEnd={attemptEndCache.current[i]}
                    />
                  </div>
                  {/* Waypoint trace model — right half of the line, on/after reveal.
                      Positioned after the student's ink, halfway across the line. */}
                  {traced && word && loaded && (
                    <div className="absolute" style={{ left: pageWidth / 2, top: 0, width: pageWidth / 2, height: lineHeight, zIndex: 15, overflow: 'visible' }}>
                      <DictadoTraceCanvas
                        key={`${i}-${word}`}
                        word={word}
                        width={pageWidth / 2}
                        height={lineHeight}
                        initialTrace={traceRef.current[i]}
                        onTraceChange={traceEndCache.current[i]}
                      />
                    </div>
                  )}
                  {traced && (
                    <span className="absolute right-2 top-1 text-[10px] font-bold text-red-500/70 pointer-events-none">
                      ✎ trace
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pen / eraser / undo toolbar — only while the attempt is editable
          (before reveal). After reveal the trace canvas guides the writing. */}
      {loaded && !revealed && (
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
            <button
              onClick={handleClear}
              title="Clear this line"
              className="w-10 h-10 rounded-full text-xl flex items-center justify-center hover:bg-indigo-900"
            >🗑️</button>
          </div>
        </div>
      )}

      <div className="shrink-0 text-center text-xs font-bold text-slate-400 pb-2">
        {!loaded ? 'Loading…' : saved ? '✓ Saved' : 'Saving…'}
      </div>
    </div>
  );
}