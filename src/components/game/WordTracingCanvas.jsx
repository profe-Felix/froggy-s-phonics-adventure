import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  dist, buildDensePath, strokeAccuracy, coverageComplete,
  computeWordLayout,
  HIT_RADIUS, WOBBLE_RADIUS, OFF_TRAVEL_BUDGET, FWD_RETRACE_RADIUS,
  MIN_MOVE, DIR_REJECT_DOT, COVERAGE_RADIUS, MIN_COVER_FRAC,
  MAX_GAP, START_TOL, END_TOL, GUIDE_COLORS, fonemaUrl,
  isDotStroke, DOT_HIT_RADIUS,
} from '@/lib/tracingCore';
import { getSilenceStartSync, preloadSilenceStart } from '@/lib/audio';

const X_SCALE = 600;
const CANVAS_H = 750;
const LETTER_GAP = 20;
const PADDING = 30; // left/right edge padding so ink doesn't touch the canvas border
const REPETITIONS = 3; // trace the word 3 times with spaces between
const WORD_GAP = 80; // px space between word repetitions (like a real word space)
const FONEMA_INTERVAL_MS = 2000;

// Renders a whole word on one canvas — letters laid out side by side so the
// word reads as a connected unit. Students trace one letter at a time (same
// validation as LetterTracingCanvas), then get an overall word-accuracy score.
export default function WordTracingCanvas({ word, waypoints, lang = 'es', renderWidth = 400, repetitions: repCount, onComplete, onAccuracy, onProgress }) {
  const REPS = repCount && repCount > 0 ? repCount : REPETITIONS;
  const layoutResult = useMemo(
    () => computeWordLayout(word, waypoints, X_SCALE, LETTER_GAP, PADDING, REPS, WORD_GAP),
    [word, waypoints, REPS]
  );
  const { letters: wordLetters, layout: letterLayout, totalW, wordLength, repetitions } = layoutResult;

  const [letterIndex, setLetterIndex] = useState(0);
  const [strokeIndex, setStrokeIndex] = useState(0);
  const [waypointIndex, setWaypointIndex] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [drawnPathsByLetter, setDrawnPathsByLetter] = useState({});
  const [currentPath, setCurrentPath] = useState([]);
  const currentPathRef = useRef([]);
  const pendingCompleteRef = useRef(false);
  const pathProgressRef = useRef(0);
  const visitedRef = useRef(new Set());
  const offTravelRef = useRef(0);
  const postCompleteTravelRef = useRef(0);
  const [status, setStatus] = useState('idle');
  const [errorFlash, setErrorFlash] = useState(false);
  const [awaitingLift, setAwaitingLift] = useState(false);
  const [guideFlash, setGuideFlash] = useState(false);
  const svgRef = useRef(null);
  const [accuracy, setAccuracy] = useState(null);
  const strokeAccuraciesRef = useRef([]);
  const fonemaAudioRef = useRef(null);
  const fonemaIntervalRef = useRef(null);

  const currentLetter = wordLetters[letterIndex];
  const rawStrokes = currentLetter ? (waypoints[currentLetter]?.strokes || []) : [];
  const strokes = rawStrokes;

  // Scale a normalized point into this letter's cell within the word canvas.
  // Scale a normalized point into the current letter's position within the
  // word canvas, shifted so the letter's leftmost ink point sits at its offset.
  const scaleWord = useCallback((pt) => {
    const lay = letterLayout[letterIndex];
    const baseX = lay ? lay.offset : 0;
    const minX = lay ? lay.minX : 0;
    return {
      x: baseX + (pt.x - minX) * X_SCALE,
      y: pt.y * CANVAS_H,
    };
  }, [letterIndex, letterLayout]);

  // Scale for any letter (used for guide-path rendering across all letters).
  const scaleForLetter = useCallback((pt, li) => {
    const lay = letterLayout[li];
    const baseX = lay ? lay.offset : 0;
    const minX = lay ? lay.minX : 0;
    return {
      x: baseX + (pt.x - minX) * X_SCALE,
      y: pt.y * CANVAS_H,
    };
  }, [letterLayout]);

  const stopFonema = useCallback(() => {
    if (fonemaIntervalRef.current) { clearInterval(fonemaIntervalRef.current); fonemaIntervalRef.current = null; }
    if (fonemaAudioRef.current) { try { fonemaAudioRef.current.pause(); } catch {} fonemaAudioRef.current = null; }
    try { window.speechSynthesis?.cancel(); } catch {}
  }, []);

  const playFonema = useCallback(() => {
    stopFonema();
    if (!currentLetter) return;
    try {
      const url = fonemaUrl(currentLetter, lang);
      const playOnce = () => {
        const a = new Audio(url);
        const trim = getSilenceStartSync(url);
        if (trim > 0) a.addEventListener('loadedmetadata', () => { a.currentTime = trim; }, { once: true });
        a.play().catch(() => {});
        fonemaAudioRef.current = a;
      };
      playOnce();
      fonemaIntervalRef.current = setInterval(playOnce, FONEMA_INTERVAL_MS);
      // Briefly highlight the current letter's guide pathway so attention goes
      // to the correct path, not the student's old messy drawn strokes.
      setGuideFlash(true);
      setTimeout(() => setGuideFlash(false), 800);
    } catch {}
  }, [currentLetter, lang, stopFonema]);

  const densePath = useMemo(() => {
    const wp = strokes[strokeIndex];
    const clean = Array.isArray(wp) ? wp.filter(p => p && p.x != null && p.y != null) : [];
    return clean.length ? buildDensePath(clean, scaleWord) : [];
  }, [strokes, strokeIndex, scaleWord]);

  // Dot strokes (the tittle on i/j) are a tap, not a drag — handled with a
  // forgiving press-and-lift instead of the strict drag/coverage gates.
  const isDot = useMemo(() => isDotStroke(densePath), [densePath]);

  // Auto-advance ~1.5s after the word is complete so the student sees their
  // score, then the parent moves to the next word/round.
  useEffect(() => {
    if (status === 'success' && accuracy != null) {
      onAccuracy?.(accuracy);
      const timer = setTimeout(() => onComplete?.(accuracy), 1500);
      return () => clearTimeout(timer);
    }
  }, [status, accuracy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Report current repetition to parent for the progress dots.
  useEffect(() => {
    if (onProgress && wordLength > 0) {
      onProgress({ currentRep: Math.floor(letterIndex / wordLength) + 1, totalReps: repetitions, letterIndex });
    }
  }, [letterIndex, wordLength, repetitions]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { stopFonema(); }, [stopFonema]);

  // Preload fonema audio and detect silence start for instant playback.
  useEffect(() => {
    if (currentLetter) preloadSilenceStart(fonemaUrl(currentLetter, lang));
  }, [currentLetter, lang]);

  const getPos = (e) => {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const scaleX = totalW / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const flashError = () => {
    setErrorFlash(true);
    setTimeout(() => setErrorFlash(false), 600);
  };

  const restartStroke = () => {
    currentPathRef.current = [];
    setCurrentPath([]);
    setWaypointIndex(0);
    setDrawing(false);
    setStatus('idle');
    setAwaitingLift(false);
    pendingCompleteRef.current = false;
    pathProgressRef.current = 0;
    visitedRef.current = new Set();
    offTravelRef.current = 0;
    postCompleteTravelRef.current = 0;
  };

  const commitStroke = () => {
    const completedPath = [...currentPathRef.current];
    currentPathRef.current = [];
    setDrawnPathsByLetter(prev => {
      const next = { ...prev };
      if (!next[letterIndex]) next[letterIndex] = [];
      next[letterIndex] = [...next[letterIndex], completedPath];
      return next;
    });
    setCurrentPath([]);
    // A dot stroke has no shape to grade — any gesture that started on the
    // tittle and lifted is a correct dot, so score it perfect. Otherwise the
    // length/penalty math flags a short down-stroke as "rough" (amber <80%),
    // breaking the clean streak needed to finish the word.
    strokeAccuraciesRef.current.push(isDot ? 100 : strokeAccuracy(completedPath, densePath));
    pathProgressRef.current = 0;
    offTravelRef.current = 0;
    postCompleteTravelRef.current = 0;
    pendingCompleteRef.current = false;
    setAwaitingLift(false);
    visitedRef.current = new Set();

    const newStrokeIdx = strokeIndex + 1;
    if (newStrokeIdx >= strokes.length) {
      const newLetterIdx = letterIndex + 1;
      if (newLetterIdx >= wordLetters.length) {
        setStatus('success');
        const accs = strokeAccuraciesRef.current;
        const avg = accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : 100;
        setAccuracy(avg);
      } else {
        setStatus('idle');
        setLetterIndex(newLetterIdx);
        setStrokeIndex(0);
        setWaypointIndex(0);
      }
    } else {
      setStatus('idle');
      setStrokeIndex(newStrokeIdx);
      setWaypointIndex(0);
    }
  };

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    if (e.button != null && e.button !== 0) return;
    if (status === 'success') return;
    try { svgRef.current.setPointerCapture(e.pointerId); } catch {}
    const pos = getPos(e);
    const currentStrokes = strokes[strokeIndex];
    if (!Array.isArray(currentStrokes) || !currentStrokes.length) return;
    const firstWp = scaleWord(currentStrokes[0]);
    // Dot strokes (the tittle on i/j) are tiny — use a wider, forgiving hit
    // radius so a tap anywhere on the dot counts.
    const startTol = isDot ? DOT_HIT_RADIUS : HIT_RADIUS * 1.8;
    if (waypointIndex === 0 && dist(pos, firstWp) > startTol) {
      flashError();
      return;
    }
    pathProgressRef.current = 0;
    visitedRef.current = new Set();
    offTravelRef.current = 0;
    postCompleteTravelRef.current = 0;
    pendingCompleteRef.current = false;
    setDrawing(true);
    setStatus('tracing');
    currentPathRef.current = [pos];
    setCurrentPath([pos]);
    playFonema();

    // Dot strokes: a tap is the whole stroke. Pre-mark full coverage and set
    // pending-complete so a simple press-and-lift commits the dot — no drag,
    // direction, or coverage scan required (those unfairly reject a tap).
    if (isDot) {
      for (let k = 0; k < densePath.length; k++) visitedRef.current.add(k);
      pathProgressRef.current = densePath.length - 1;
      pendingCompleteRef.current = true;
      postCompleteTravelRef.current = 0;
      setAwaitingLift(true);
      setWaypointIndex(currentStrokes.length);
    }
  }, [status, strokeIndex, waypointIndex, strokes, isDot, densePath, scaleWord, playFonema]);

  const handlePointerMove = useCallback((e) => {
    e.preventDefault();
    if (!drawing || status !== 'tracing') return;
    const pos = getPos(e);
    if (pendingCompleteRef.current) {
      // After reaching the end, only a small natural overshoot is allowed.
      // Track total travel distance after completion — circling back to close
      // an 'e' into an 'o', or going too far down past the baseline on a
      // non-descending letter like 'l', exceeds the budget and restarts.
      // Dot strokes (the tittle on i/j) are exempt: a tap, short stroke, or
      // little circle are all valid ways to make the dot, so any movement
      // that started on the dot is accepted and commits on lift.
      const prevP = currentPathRef.current[currentPathRef.current.length - 1];
      if (prevP && !isDot) {
        postCompleteTravelRef.current += dist(pos, prevP);
        if (postCompleteTravelRef.current > 70) {
          flashError();
          restartStroke();
          return;
        }
      }
      currentPathRef.current = [...currentPathRef.current, pos];
      setCurrentPath(currentPathRef.current);
      return;
    }
    const prev = currentPathRef.current[currentPathRef.current.length - 1];
    const currentStrokes = strokes[strokeIndex];
    if (!currentStrokes) return;
    const moveDist = prev ? dist(pos, prev) : 0;

    if (densePath.length) {
      let minD = Infinity;
      let nearestIdx = Math.max(0, Math.min(densePath.length - 1, pathProgressRef.current));
      const scanLo = Math.max(0, pathProgressRef.current - 3);
      const scanHi = Math.min(densePath.length - 1, pathProgressRef.current + 8);
      for (let i = scanLo; i <= scanHi; i++) {
        const d = dist(pos, densePath[i]);
        if (d < minD) { minD = d; nearestIdx = i; }
      }
      let retraceForward = false;
      if (nearestIdx < pathProgressRef.current) {
        let fwdD = Infinity, fwdIdx = -1;
        const fwdLimit = Math.min(densePath.length - 1, pathProgressRef.current + 6);
        for (let i = pathProgressRef.current; i <= fwdLimit; i++) {
          const d = dist(pos, densePath[i]);
          if (d < fwdD) { fwdD = d; fwdIdx = i; }
        }
        if (fwdIdx >= 0 && fwdD <= FWD_RETRACE_RADIUS) {
          nearestIdx = fwdIdx;
          minD = fwdD;
          retraceForward = true;
        }
      }
      if (minD > WOBBLE_RADIUS) {
        if (retraceForward) {
          offTravelRef.current = 0;
        } else {
          offTravelRef.current += moveDist;
          if (minD > WOBBLE_RADIUS * 2 || offTravelRef.current > OFF_TRAVEL_BUDGET) {
            flashError();
            restartStroke();
            return;
          }
        }
      } else {
        offTravelRef.current = 0;
      }
      if (prev && moveDist >= MIN_MOVE) {
        const dx = (pos.x - prev.x) / moveDist;
        const dy = (pos.y - prev.y) / moveDist;
        const a = Math.min(nearestIdx, densePath.length - 1);
        const b = Math.min(nearestIdx + 2, densePath.length - 1);
        const iLen = Math.hypot(densePath[b].x - densePath[a].x, densePath[b].y - densePath[a].y) || 1;
        const ix = (densePath[b].x - densePath[a].x) / iLen;
        const iy = (densePath[b].y - densePath[a].y) / iLen;
        if (dx * ix + dy * iy < DIR_REJECT_DOT) {
          const ai = Math.max(0, nearestIdx - 2);
          const aLen = Math.hypot(densePath[nearestIdx].x - densePath[ai].x, densePath[nearestIdx].y - densePath[ai].y) || 1;
          const arrX = (densePath[nearestIdx].x - densePath[ai].x) / aLen;
          const arrY = (densePath[nearestIdx].y - densePath[ai].y) / aLen;
          if (dx * arrX + dy * arrY >= 0) {
            // turn arrival — legitimate
          } else {
            let saved = false;
            for (let f = nearestIdx + 1; f <= Math.min(nearestIdx + 6, densePath.length - 1); f++) {
              if (dist(pos, densePath[f]) > FWD_RETRACE_RADIUS) continue;
              const fa = f, fb = Math.min(f + 2, densePath.length - 1);
              const fLen = Math.hypot(densePath[fb].x - densePath[fa].x, densePath[fb].y - densePath[fa].y) || 1;
              const fx = (densePath[fb].x - densePath[fa].x) / fLen;
              const fy = (densePath[fb].y - densePath[fa].y) / fLen;
              if (dx * fx + dy * fy >= 0) {
                nearestIdx = f;
                minD = dist(pos, densePath[f]);
                retraceForward = true;
                saved = true;
                break;
              }
            }
            if (!saved) {
              flashError();
              restartStroke();
              return;
            }
          }
        }
      }
      const covFrom = Math.max(0, pathProgressRef.current - 2);
      const covTo = Math.min(densePath.length, pathProgressRef.current + 8);
      const covSteps = Math.max(1, Math.ceil(moveDist / (COVERAGE_RADIUS * 0.6)));
      for (let s = 0; s <= covSteps; s++) {
        const t = s / covSteps;
        const sx = prev ? prev.x + (pos.x - prev.x) * t : pos.x;
        const sy = prev ? prev.y + (pos.y - prev.y) * t : pos.y;
        for (let k = covFrom; k < covTo; k++) {
          if (Math.hypot(sx - densePath[k].x, sy - densePath[k].y) <= COVERAGE_RADIUS) {
            visitedRef.current.add(k);
          }
        }
      }
      pathProgressRef.current = Math.max(pathProgressRef.current, nearestIdx);
      if (coverageComplete(visitedRef.current, densePath.length) && pathProgressRef.current >= densePath.length - END_TOL) {
        pendingCompleteRef.current = true;
        postCompleteTravelRef.current = 0;
        setAwaitingLift(true);
        setWaypointIndex(currentStrokes.length);
      }
    }

    currentPathRef.current = [...currentPathRef.current, pos];
    setCurrentPath(currentPathRef.current);

    if (!pendingCompleteRef.current) {
      const nextPt = currentStrokes[waypointIndex];
      if (nextPt) {
        const nextWp = scaleWord(nextPt);
        if (dist(pos, nextWp) < HIT_RADIUS) {
          setWaypointIndex(Math.min(waypointIndex + 1, currentStrokes.length));
        }
      }
    }
  }, [drawing, status, strokeIndex, waypointIndex, strokes, densePath, scaleWord, isDot]);

  const handlePointerUp = useCallback((e) => {
    e.preventDefault();
    try { svgRef.current.releasePointerCapture(e.pointerId); } catch {}
    if (!drawing) return;
    setDrawing(false);
    stopFonema();
    const reachedEnd = densePath.length > 1
      ? coverageComplete(visitedRef.current, densePath.length) && pathProgressRef.current >= densePath.length - END_TOL
      : true;
    if (reachedEnd) {
      commitStroke();
    } else {
      flashError();
      restartStroke();
    }
  }, [drawing, densePath, strokeIndex, strokes]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    setLetterIndex(0);
    setStrokeIndex(0);
    setWaypointIndex(0);
    setDrawing(false);
    setDrawnPathsByLetter({});
    currentPathRef.current = [];
    setCurrentPath([]);
    setStatus('idle');
    setErrorFlash(false);
    setAwaitingLift(false);
    setAccuracy(null);
    strokeAccuraciesRef.current = [];
    pathProgressRef.current = 0;
    visitedRef.current = new Set();
    offTravelRef.current = 0;
    postCompleteTravelRef.current = 0;
    pendingCompleteRef.current = false;
  };

  const pathD = (pts) => pts.length < 2 ? '' :
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

const isSuccess = status === 'success';
const isAmber = isSuccess && accuracy != null && accuracy < 80;

// Moving "Pac-Man pellet" guide dots.
// Shows only a few points ahead of the student's current tracing position.
// Because these use densePath, they follow the exact taught direction,
// including curves, turns, and retraces.
const guideDots = useMemo(() => {
  if (!drawing || awaitingLift || isSuccess || !densePath.length) return [];

  const progress = Math.max(
    0,
    Math.min(densePath.length - 1, pathProgressRef.current)
  );

  const offsets = [5, 11, 18, 26];
  const seen = new Set();

  return offsets
    .map((offset, i) => {
      const idx = Math.min(
        densePath.length - 1,
        progress + offset
      );

      // Near the end, several offsets may land on the same final point.
      if (seen.has(idx)) return null;
      seen.add(idx);

      return {
        ...densePath[idx],
        index: idx,
        radius: [5.5, 4.8, 4.1, 3.5][i],
        opacity: [1, 0.95, 0.85, 0.75][i],
      };
    })
    .filter(Boolean);
}, [drawing, awaitingLift, isSuccess, densePath, currentPath]);

// Direction arrow just beyond the breadcrumb dots.
// Uses two nearby points on densePath to determine the direction
// the student should continue moving.
const guideArrow = useMemo(() => {
  if (!drawing || awaitingLift || isSuccess || !densePath.length) return null;

  const progress = Math.max(
    0,
    Math.min(densePath.length - 1, pathProgressRef.current)
  );

  const arrowIndex = Math.min(densePath.length - 1, progress + 30);
  const directionIndex = Math.min(densePath.length - 1, arrowIndex + 4);

  // Don't show an arrow if there isn't enough path left to establish direction.
  if (directionIndex === arrowIndex) return null;

  const p1 = densePath[arrowIndex];
  const p2 = densePath[directionIndex];

  const angle =
    Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;

  return {
    x: p1.x,
    y: p1.y,
    angle,
  };
}, [drawing, awaitingLift, isSuccess, densePath, currentPath]);

const currentStrokeWaypoints = strokes[strokeIndex] || [];
  const nextWp = waypointIndex < currentStrokeWaypoints.length
    ? scaleWord(currentStrokeWaypoints[waypointIndex]) : null;

  if (!wordLetters.length) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        No traceable letters in this word.
      </div>
    );
  }

  // Compute explicit pixel dimensions so the SVG's rendered aspect ratio
  // always matches the viewBox — fixes ink/guide misalignment caused by
  // `height:auto` + a purged dynamic `aspect-[...]` Tailwind class.
  const _vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const _maxByHeight = Math.max(200, (_vh - 30) * (totalW / CANVAS_H));
  const effectiveWidth = Math.min(renderWidth, _maxByHeight);
  const renderH = effectiveWidth * (CANVAS_H / totalW);

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      {/* Status prompt */}
      <div className="h-8 flex items-center justify-center">
        {awaitingLift && (
          <div className="bg-yellow-100 border border-yellow-400 rounded-full px-4 py-1 text-yellow-800 font-bold text-sm animate-bounce">
            ✋ Lift your finger!
          </div>
        )}
        {isSuccess && (
          <div className="flex items-center gap-3">
            <div className={`rounded-full border px-4 py-1 font-bold text-sm ${
              isAmber ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-green-100 border-green-400 text-green-800'
            }`}>
              {isAmber ? '✏️ Good try!' : '🎉 Great job!'}
            </div>
            {accuracy != null && (
              <div className={`rounded-full border px-4 py-1 font-bold text-sm ${
                isAmber ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-indigo-100 border-indigo-300 text-indigo-800'
              }`}>
                🎯 {accuracy}%
              </div>
            )}
          </div>
        )}
        {status === 'idle' && waypointIndex === 0 && !drawing && (
          <div className="text-slate-400 text-sm">
            Start at the ● dot · Word {Math.floor(letterIndex / wordLength) + 1} of {repetitions}: <span className="font-bold text-indigo-500">{currentLetter?.toUpperCase()}</span>
          </div>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${totalW} ${CANVAS_H}`}
        className={`rounded-2xl border-4 touch-none ${
          errorFlash ? 'border-red-400 bg-red-50' :
          isSuccess ? (isAmber ? 'border-amber-400 bg-amber-50' : 'border-green-400 bg-green-50') :
          'border-slate-200 bg-white'
        }`}
        style={{
          display: 'block',
          width: `${effectiveWidth}px`,
          height: `${renderH}px`,
          cursor: 'crosshair',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none'
        }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Writing lines — span the full word width */}
        <line x1="0" y1={0.10 * CANVAS_H} x2={totalW} y2={0.10 * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={0.367 * CANVAS_H} x2={totalW} y2={0.367 * CANVAS_H} stroke="#93c5fd" strokeWidth="1" strokeDasharray="8 6" opacity="0.7" />
        <line x1="0" y1={0.633 * CANVAS_H} x2={totalW} y2={0.633 * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={0.90 * CANVAS_H} x2={totalW} y2={0.90 * CANVAS_H} stroke="#fca5a5" strokeWidth="1.5" strokeDasharray="6 6" opacity="0.85" />

        {/* Guide paths for ALL letters — completed = green, current = colored, upcoming = grey */}
        {wordLetters.map((ch, li) => {
          const letterStrokes = waypoints[ch]?.strokes || [];
          return letterStrokes.map((stroke, si) => {
            const isCompleted = li < letterIndex;
            const isCurrent = li === letterIndex;
            const color = isCompleted ? '#22c55e' :
                          isCurrent ? GUIDE_COLORS[si % GUIDE_COLORS.length] :
                          '#cbd5e1';
            const opacity = isCompleted ? 0.4 : isCurrent ? (guideFlash ? 0.95 : 0.6) : 0.35;
            return (
              <polyline
                key={`${li}-${si}`}
                points={stroke.map(p => { const s = scaleForLetter(p, li); return `${s.x},${s.y}`; }).join(' ')}
                fill="none"
                stroke={color}
                strokeWidth={isCurrent && guideFlash ? 10 : 6}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={opacity}
              />
            );
          });
        })}

        {/* Drawn paths — all letters' completed strokes */}
        {Object.entries(drawnPathsByLetter).map(([li, paths]) =>
          paths.map((pts, i) => (
            <path key={`d${li}-${i}`} d={pathD(pts)} fill="none" stroke="#6366f1" strokeWidth="12"
              strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
          ))
        )}

        {/* Current drawing path */}
        {currentPath.length > 1 && (
          <path d={pathD(currentPath)} fill="none" stroke="#6366f1" strokeWidth="12"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        )}

        {/* Moving direction guide — "Pac-Man pellets" that stay just ahead
            of the student's finger along the taught stroke path. */}
        {guideDots.map((dot, i) => {
          const guideColor = '#FACC15';

          return (
            <circle
              key={`guide-dot-${dot.index}-${i}`}
              cx={dot.x}
              cy={dot.y}
              r={dot.radius}
              fill={guideColor}
              stroke="#854D0E"
              strokeWidth="1.5"
              opacity={dot.opacity}
              pointerEvents="none"
            />
          );
        })}

        {/* Direction arrow at the front of the Pac-Man trail */}
        {guideArrow && (
          <g
            transform={`translate(${guideArrow.x} ${guideArrow.y}) rotate(${guideArrow.angle})`}
            pointerEvents="none"
          >
            <path
              d="M -8 -7 L 8 0 L -8 7 Z"
              fill="#FACC15"
              stroke="#854D0E"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </g>
        )}

        {/* Start dot — at the current stroke's first waypoint */}
        {nextWp && !isSuccess && waypointIndex === 0 && !drawing && (
          (() => { const dc = GUIDE_COLORS[strokeIndex % GUIDE_COLORS.length]; return (
            <>
              <circle cx={nextWp.x} cy={nextWp.y} r="18" fill={dc} opacity="0.15">
                <animate attributeName="r" values="14;22;14" dur="1s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.2;0.05;0.2" dur="1s" repeatCount="indefinite" />
              </circle>
              <circle cx={nextWp.x} cy={nextWp.y} r="8" fill={dc} />
              <text x={nextWp.x} y={nextWp.y + 4} textAnchor="middle" fontSize="9"
                fill="white" fontWeight="bold">{strokeIndex + 1}</text>
            </>
          ); })()
        )}
      </svg>

      <div className="flex items-center gap-4">
        <button
          onClick={reset}
          className="text-slate-400 hover:text-slate-700 text-sm underline"
        >
          Start over
        </button>
      </div>
    </div>
  );
}