import { useRef, useState, useEffect, useCallback } from 'react';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';
import LinedPaper from './LinedPaper';
import DictadoModelGuide from './DictadoModelGuide';
import { useMergedWaypoints } from '@/hooks/useMergedWaypoints';
import { base44 } from '@/api/base44Client';
import { playTts } from '@/lib/audio';
import { Volume2, Play, RotateCcw } from 'lucide-react';

// Per-line dictado canvas driven by the teacher's live broadcast.
//
// Each word gets an attempt row (dark, freehand, FULL line width) and, once
// revealed, a trace row appears DIRECTLY UNDERNEATH it. The trace row shows the
// faint letter model (DictadoModelGuide) as a formation guide, with a freehand
// RED AnnotationCanvas on top so the student can write corrections — and undo /
// erase / clear them just like the attempt.
//
// The correction (red ink + model) starts AFTER the left guide area (fence +
// sky/grass/dirt backgrounds) so red ink never lands on the figures.
//
// A current-line dot sits in a strip OUTSIDE the canvas (to its left) so it
// never overlaps the walking figures. Its color matches the ink as a reminder:
// black for solo attempts, red for corrections.
//
// A scrubber slider (revealed mode only) replays the model letter formation
// stroke-by-stroke so the student can follow along and trace properly.

const MAX_LINE_HEIGHT = 115;
const MAX_PAGE_WIDTH = 1100;
const DARK = '#1e293b';
const RED = '#dc2626';
const DOT_STRIP_W = 28; // left strip outside the canvas for the current-line dot

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
  // Left guide area (fence + sky/grass/dirt backgrounds) — corrections start
  // after this so red ink never lands on the fence/figures.
  const GUIDE_W = Math.max(80, lineHeight * 0.62);
  // Row index of the active line (attempt when not revealed, trace when revealed)
  const currentRowIdx = rows.findIndex(
    (r) => r.wordIdx === currentLine && r.type === (revealed ? 'trace' : 'attempt')
  );
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(true);
  const submissionId = useRef(null);
  const saveTimer = useRef(null);

  const [tool, setTool] = useState('pen');
  const [scrubProgress, setScrubProgress] = useState(1);
  const scrubAnimRef = useRef(null);
  const lastActiveWord = useRef(0);
  // Merged waypoints (built-in + DB overrides) shared by every trace row so
  // the model guide matches the tracing authoring tool — corners stay sharp.
  const waypoints = useMergedWaypoints();

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
      const w = Math.min(MAX_PAGE_WIDTH, Math.max(320, r.width - 24 - DOT_STRIP_W));
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

  // Scrubber: replay the model letter formation stroke-by-stroke so the student
  // can follow along and trace properly. Drag the slider to scrub manually.
  const playScrub = useCallback(() => {
    if (scrubAnimRef.current) cancelAnimationFrame(scrubAnimRef.current);
    setScrubProgress(0);
    const start = performance.now();
    const dur = 2400;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      setScrubProgress(p);
      if (p < 1) scrubAnimRef.current = requestAnimationFrame(tick);
    };
    scrubAnimRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => () => {
    if (scrubAnimRef.current) cancelAnimationFrame(scrubAnimRef.current);
  }, []);

  // Reset scrubber when the current line changes or reveal toggles.
  useEffect(() => { setScrubProgress(1); }, [currentLine, revealed]);

  // Current-line indicator dot: matches the ink color as a reminder of what
  // to do on this line — black for solo attempts, red for corrections.
  const dotColor = revealed ? RED : DARK;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex-1 flex min-h-0 justify-center overflow-y-auto overflow-x-hidden p-2">
        <div ref={containerRef} className="flex-1 min-h-0 flex justify-center">
          <div className="flex items-start">
            {/* Current-line dot — in a strip OUTSIDE the canvas so it never
                sits over the walking figures / fence. */}
            <div className="relative shrink-0" style={{ width: DOT_STRIP_W, height: pageHeight }}>
              {currentRowIdx >= 0 && (
                <span
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    left: 4,
                    top: currentRowIdx * lineHeight + lineHeight / 2 - 7,
                    width: 14, height: 14, background: dotColor,
                    boxShadow: '0 0 0 2px white', zIndex: 5,
                  }}
                />
              )}
            </div>
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
                      <div className="absolute inset-0">
                        <AnnotationCanvas
                          ref={(el) => { attemptRefs.current[w] = el; }}
                          width={pageWidth}
                          height={lineHeight}
                          color={DARK}
                          size={3}
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
                // The correction area starts AFTER the left guide (fence +
                // backgrounds) so red ink never lands on the figures.
                const tEditable = w === currentLine && revealed;
                const isCurrentTrace = w === currentLine && revealed;
                return (
                  <div
                    key={`t-${w}`}
                    className={`absolute left-0 ${tEditable ? 'ring-4 ring-red-300/70 ring-inset' : ''}`}
                    style={{ top, width: pageWidth, height: lineHeight, borderRadius: 8 }}
                  >
                    {loaded && word && (
                      <DictadoModelGuide
                        word={word}
                        width={pageWidth}
                        height={lineHeight}
                        startX={GUIDE_W}
                        progress={isCurrentTrace ? scrubProgress : 1}
                        waypoints={waypoints}
                      />
                    )}
                    <div
                      className="absolute"
                      style={{ left: GUIDE_W, top: 0, width: pageWidth - GUIDE_W, height: lineHeight, zIndex: 3 }}
                    >
                      <AnnotationCanvas
                        ref={(el) => { traceRefs.current[w] = el; }}
                        width={pageWidth - GUIDE_W}
                        height={lineHeight}
                        color={RED}
                        size={3}
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
      </div>

      {/* Pen / eraser / undo / clear toolbar — stays available in both attempt
          and correction (reveal) modes. Undo + clear target whichever canvas is
          active for the current line. In reveal mode a scrubber replays the
          model letter formation so the student can follow along and trace. */}
      {loaded && (
        <div className="shrink-0 flex flex-col items-center gap-2 pb-2">
          <div className="flex items-center justify-center gap-2">
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
          {revealed && (
            <div className="flex items-center gap-2 bg-slate-100 rounded-full px-3 py-1.5 shadow-sm">
              <button
                onClick={playScrub}
                title="Replay letter formation"
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow"
              >
                <Play className="w-3.5 h-3.5" /> Replay
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={scrubProgress}
                onChange={(e) => {
                  if (scrubAnimRef.current) cancelAnimationFrame(scrubAnimRef.current);
                  setScrubProgress(parseFloat(e.target.value));
                }}
                className="w-40 accent-red-600"
                title="Scrub the letter formation"
              />
              <button
                onClick={() => setScrubProgress(1)}
                title="Show full model"
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Full
              </button>
            </div>
          )}
        </div>
      )}

      <div className="shrink-0 text-center text-xs font-bold text-slate-400 pb-2">
        {!loaded ? 'Loading…' : saved ? '✓ Saved' : 'Saving…'}
      </div>
    </div>
  );
}