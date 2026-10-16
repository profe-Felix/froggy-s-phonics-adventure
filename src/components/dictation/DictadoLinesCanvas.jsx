import { useRef, useState, useEffect, useCallback } from 'react';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';
import LinedPaper from './LinedPaper';
import DictadoModelGuide from './DictadoModelGuide';
import { base44 } from '@/api/base44Client';
import { playTts } from '@/lib/audio';
import { Volume2 } from 'lucide-react';

// Per-line dictado canvas driven by the teacher's live broadcast.
//
// Each word gets an attempt row (dark, freehand, FULL line width) and, once
// revealed, a trace row appears DIRECTLY UNDERNEATH it. The trace row shows the
// faint letter model (DictadoModelGuide) as a formation guide, with a freehand
// RED AnnotationCanvas on top so the student can write corrections — and undo /
// erase / clear them just like the attempt.
//
// Teacher controls (DictadoLivePanel) drive this via `currentLine` + `revealed`.
// A colored dot on the left edge marks the line students should be on right now:
// red dot when the ink is dark (attempt), black dot when the ink is red (reveal).

const MAX_LINE_HEIGHT = 115;
const MAX_PAGE_WIDTH = 1100;
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
  const words = lines || [];
  const wordCount = Math.min(Math.max(words.length || 1, 1), 6);

  // A trace row is shown for the current word once revealed, and for every
  // past word (so finished corrections stay visible).
  const showTraceFor = (w) => (w === currentLine && revealed) || w < currentLine;

  const rows = [];
  for (let w = 0; w < wordCount; w++) {
    rows.push({ wordIdx: w, type: 'attempt' });
    if (showTraceFor(w)) rows.push({ wordIdx: w, type: 'trace' });
  }
  const lineCount = rows.length;

  const containerRef = useRef(null);
  const attemptRefs = useRef([]);
  const traceRefs = useRef([]);
  const [pageWidth, setPageWidth] = useState(MAX_PAGE_WIDTH);
  const [pageHeight, setPageHeight] = useState(MAX_LINE_HEIGHT * lineCount);
  const lineHeight = pageHeight / lineCount;
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(true);
  const submissionId = useRef(null);
  const saveTimer = useRef(null);

  const [tool, setTool] = useState('pen');
  const lastActiveWord = useRef(0);

  // Live values in refs so callbacks stay identity-stable across re-renders.
  const dimsRef = useRef({ pageWidth, lineHeight, wordCount });
  dimsRef.current = { pageWidth, lineHeight, wordCount };
  const ctxRef = useRef({ assignmentId, studentNumber, className, schoolYear });
  ctxRef.current = { assignmentId, studentNumber, className, schoolYear };
  const submissionIdRef = useRef(null);
  submissionIdRef.current = submissionId.current;
  const revealedRef = useRef(revealed);
  revealedRef.current = revealed;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.min(MAX_PAGE_WIDTH, Math.max(320, r.width - 24));
      setPageWidth(w);
      setPageHeight(MAX_LINE_HEIGHT * lineCount);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [lineCount]);

  // Load existing submission. Attempt + trace are both AnnotationCanvas stroke
  // data. Legacy trace data (DictadoTraceCanvas {paths, accuracies}) is skipped —
  // it can't be replayed as freehand ink, so the trace row just starts empty.
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
          submissionIdRef.current = existing[0].id;
          const data = JSON.parse(existing[0].strokes_data);
          if (data?.lines) {
            for (const [idx, ld] of Object.entries(data.lines)) {
              const w = parseInt(idx);
              if (ld?.attempt) attemptRefs.current[w]?.loadStrokes?.(ld.attempt);
              if (ld?.trace && ld.trace.strokes) traceRefs.current[w]?.loadStrokes?.(ld.trace);
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
    const { pageWidth: pw, lineHeight: lh, wordCount: wc } = dimsRef.current;
    const { assignmentId: aid, studentNumber: sn, className: cn, schoolYear: sy } = ctxRef.current;
    if (!aid || !sn || !cn) return;
    const linesData = {};
    let count = 0;
    for (let w = 0; w < wc; w++) {
      const aRef = attemptRefs.current[w];
      const tRef = traceRefs.current[w];
      const attempt = aRef ? aRef.getStrokes() : { strokes: [] };
      const trace = tRef ? tRef.getStrokes() : { strokes: [] };
      linesData[w] = { attempt, trace };
      count += (attempt.strokes || []).length + (trace.strokes || []).length;
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

  const scheduleSave = useCallback(() => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 800);
  }, [save]);

  const attemptEndCache = useRef([]);
  if (attemptEndCache.current.length !== wordCount) {
    attemptEndCache.current = Array.from({ length: wordCount }, (_, w) => () => {
      lastActiveWord.current = w;
      scheduleSave();
    });
  }
  const traceEndCache = useRef([]);
  if (traceEndCache.current.length !== wordCount) {
    traceEndCache.current = Array.from({ length: wordCount }, (_, w) => () => {
      lastActiveWord.current = w;
      scheduleSave();
    });
  }

  // Undo / clear target the active canvas: the trace (red) canvas when revealed,
  // the attempt (dark) canvas otherwise.
  const handleUndo = useCallback(() => {
    const w = lastActiveWord.current;
    if (revealedRef.current) traceRefs.current[w]?.undo?.();
    else attemptRefs.current[w]?.undo?.();
    scheduleSave();
  }, [scheduleSave]);

  const handleClear = useCallback(() => {
    if (!confirm('Clear this line?')) return;
    const w = lastActiveWord.current;
    if (revealedRef.current) traceRefs.current[w]?.clearStrokes?.();
    else attemptRefs.current[w]?.clearStrokes?.();
    scheduleSave();
  }, [scheduleSave]);

  // Current-line indicator dot: contrasts with the ink so it's always visible.
  // Dark ink (attempt) → red dot; red ink (trace) → black dot.
  const dotColor = revealed ? '#000000' : '#ef4444';

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex-1 flex min-h-0 justify-center overflow-y-auto overflow-x-hidden p-2">
        <div ref={containerRef} className="flex-1 min-h-0 flex justify-center">
          <div
            className="relative rounded-xl shadow-lg bg-white"
            style={{ width: pageWidth, height: pageHeight }}
          >
            <LinedPaper width={pageWidth} height={pageHeight} lineCount={lineCount} />
            {rows.map((row, rowIdx) => {
              const { wordIdx: w, type } = row;
              const top = rowIdx * lineHeight;
              const word = words[w] || '';

              if (type === 'attempt') {
                const editable = w === currentLine && !revealed;
                return (
                  <div
                    key={`a-${w}`}
                    className={`absolute left-0 ${editable ? 'ring-4 ring-indigo-400/70 ring-inset' : ''}`}
                    style={{ top, width: pageWidth, height: lineHeight, borderRadius: 8 }}
                  >
                    {editable && (
                      <span
                        className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full pointer-events-none"
                        style={{ width: 14, height: 14, background: dotColor, boxShadow: '0 0 0 2px white', zIndex: 5 }}
                      />
                    )}
                    <div className="absolute inset-0">
                      <AnnotationCanvas
                        ref={(el) => { attemptRefs.current[w] = el; }}
                        width={pageWidth}
                        height={lineHeight}
                        color={DARK}
                        size={5}
                        tool={editable ? tool : 'pen'}
                        mode={editable ? 'draw' : 'view'}
                        onStrokeEnd={attemptEndCache.current[w]}
                      />
                    </div>
                    {/* Word label on locked past lines so the student can see
                        which word each row was. */}
                    {!editable && (w < currentLine || (w === currentLine && revealed)) && (
                      <span className="absolute left-2 top-1 text-[11px] font-bold text-slate-300 pointer-events-none">
                        {w + 1}.
                      </span>
                    )}
                  </div>
                );
              }

              // Trace row — faint model guide + freehand red correction canvas.
              const tEditable = w === currentLine && revealed;
              return (
                <div
                  key={`t-${w}`}
                  className={`absolute left-0 ${tEditable ? 'ring-4 ring-red-300/70 ring-inset' : ''}`}
                  style={{ top, width: pageWidth, height: lineHeight, borderRadius: 8 }}
                >
                  {tEditable && (
                    <span
                      className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full pointer-events-none"
                      style={{ width: 14, height: 14, background: dotColor, boxShadow: '0 0 0 2px white', zIndex: 5 }}
                    />
                  )}
                  {loaded && word && (
                    <DictadoModelGuide word={word} width={pageWidth} height={lineHeight} />
                  )}
                  <div className="absolute inset-0" style={{ zIndex: 3 }}>
                    <AnnotationCanvas
                      ref={(el) => { traceRefs.current[w] = el; }}
                      width={pageWidth}
                      height={lineHeight}
                      color={RED}
                      size={5}
                      tool={tEditable ? tool : 'pen'}
                      mode={tEditable ? 'draw' : 'view'}
                      onStrokeEnd={traceEndCache.current[w]}
                    />
                  </div>
                  <span className="absolute right-2 top-1 text-[10px] font-bold text-red-500/70 pointer-events-none">
                    ✎ model
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pen / eraser / undo / clear toolbar — stays available in both attempt
          and correction (reveal) modes. Undo + clear target whichever canvas is
          active for the current line. */}
      {loaded && (
        <div className="shrink-0 flex items-center justify-center gap-2 pb-2">
          <button
            onClick={() => playTts(lines[currentLine] || '', 'es')}
            disabled={!lines[currentLine]}
            title="Listen again"
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-sm shadow-lg"
          >
            <Volume2 className="w-5 h-5" /> Listen
          </button>
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