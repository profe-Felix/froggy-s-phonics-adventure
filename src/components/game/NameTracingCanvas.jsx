import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  dist, buildDensePath, strokeAccuracy, coverageComplete,
  computeWordLayout,
  HIT_RADIUS, WOBBLE_RADIUS, OFF_TRAVEL_BUDGET, FWD_RETRACE_RADIUS,
  MIN_MOVE, DIR_REJECT_DOT, COVERAGE_RADIUS,
  MAX_GAP, START_TOL, END_TOL, GUIDE_COLORS,
  isDotStroke, DOT_HIT_RADIUS,
} from '@/lib/tracingCore';
import { splinePathD } from '@/components/tracing/strokeMath';

// One row of a name — letters laid out horizontally using the same waypoint
// system and per-stroke validation as WordTracingCanvas. Two modes:
//   guided   — per-stroke sequencing: start dot → trace → lift pen → next stroke
//   dot_only — just the start dots for each stroke, freehand drawing, ink threshold
// No sound. Calls onComplete(strokes?) when the row is finished.
// For dot_only, passes normalized strokes (0-1) for teacher review/saving.

const X_SCALE = 300;
const CANVAS_H = 375;
const LETTER_GAP = 35; // generous gap so letters don't crowd — scales with letter size
const PADDING = 30;
const MIN_INK_PX = 120;
// Match Letter Tracing's starting size (Medium = sizeLevel 2, scale 0.55).
// Each letter in the name renders at the same physical size as a Medium
// letter in Letter Tracing, so kids practice writing at the size they're
// used to — not oversized.
const SIZE_SCALE = 0.55;
const RENDER_H = CANVAS_H * SIZE_SCALE; // ~206px — same as Letter Tracing Medium

export default function NameTracingCanvas({
  name,
  waypoints,
  mode = 'guided',
  renderWidth = 320,
  onComplete,
}) {
  const isDotOnly = mode === 'dot_only';
  const isGuided = mode === 'guided';

  // Layout: one repetition of the name (only traceable letters).
  const { layout, totalW } = useMemo(
    () => computeWordLayout(name, waypoints, X_SCALE, LETTER_GAP, PADDING, 1, 0),
    [name, waypoints]
  );

  // Flatten all strokes across all letters for guide rendering + dot_only.
  const allStrokes = useMemo(() => {
    const out = [];
    layout.forEach((lay, li) => {
      const strokes = waypoints[lay.ch]?.strokes || [];
      const scaleFn = (pt) => ({
        x: lay.offset + (pt.x - lay.minX) * X_SCALE,
        y: pt.y * CANVAS_H,
        ...(pt.corner ? { corner: true } : {}),
      });
      strokes.forEach((stroke, si) => {
        const clean = Array.isArray(stroke)
          ? stroke.filter((p) => p && p.x != null && p.y != null)
          : [];
        const scaledPts = clean.map(scaleFn);
        const dense = clean.length ? buildDensePath(clean, scaleFn, 3) : [];
        out.push({ letterIndex: li, strokeIndex: si, dense, scaledPts, scaleFn });
      });
    });
    return out;
  }, [layout, waypoints]);

  const wordLetters = useMemo(() => layout.map((l) => l.ch), [layout]);

  // --- Guided mode: per-stroke state (same as WordTracingCanvas) ---
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
  const [accuracy, setAccuracy] = useState(null);
  const strokeAccuraciesRef = useRef([]);

  // --- Dot-only mode: freehand state ---
  const [dotDrawnPaths, setDotDrawnPaths] = useState([]);
  const [dotCurrentPath, setDotCurrentPath] = useState([]);
  const dotCurrentRef = useRef([]);
  const [dotCompleted, setDotCompleted] = useState(false);
  const [enoughInk, setEnoughInk] = useState(false);

  const svgRef = useRef(null);

  useEffect(() => {
    // Reset all state when name or mode changes
    setLetterIndex(0);
    setStrokeIndex(0);
    setWaypointIndex(0);
    setDrawing(false);
    setDrawnPathsByLetter({});
    setCurrentPath([]);
    currentPathRef.current = [];
    pendingCompleteRef.current = false;
    pathProgressRef.current = 0;
    visitedRef.current = new Set();
    offTravelRef.current = 0;
    postCompleteTravelRef.current = 0;
    setStatus('idle');
    setErrorFlash(false);
    setAwaitingLift(false);
    setGuideFlash(false);
    setDotDrawnPaths([]);
    setDotCurrentPath([]);
    dotCurrentRef.current = [];
    setDotCompleted(false);
    setEnoughInk(false);
  }, [name, mode]);

  // Fixed height matching Letter Tracing's Medium size. Width is proportional
  // to the name length so each letter is the same physical size as in Letter
  // Tracing. If the name is too wide for the viewport, the container scrolls.
  const renderH = RENDER_H;
  const renderW = totalW > 0 ? RENDER_H * (totalW / CANVAS_H) : renderWidth;

  const toSvg = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const inv = ctm.inverse();
    const p = pt.matrixTransform(inv);
    return { x: p.x, y: p.y };
  }, []);

  // Scale a normalized point into the current letter's position (guided mode)
  const scaleWord = useCallback((pt) => {
    const lay = layout[letterIndex];
    const baseX = lay ? lay.offset : 0;
    const minX = lay ? lay.minX : 0;
    return {
      x: baseX + (pt.x - minX) * X_SCALE,
      y: pt.y * CANVAS_H,
    };
  }, [letterIndex, layout]);

  // Scale for any letter (guide rendering)
  const scaleForLetter = useCallback((pt, li) => {
    const lay = layout[li];
    const baseX = lay ? lay.offset : 0;
    const minX = lay ? lay.minX : 0;
    return {
      x: baseX + (pt.x - minX) * X_SCALE,
      y: pt.y * CANVAS_H,
      ...(pt.corner ? { corner: true } : {}),
    };
  }, [layout]);

  const currentLetter = wordLetters[letterIndex];
  const rawStrokes = currentLetter ? (waypoints[currentLetter]?.strokes || []) : [];
  const strokes = rawStrokes;

  const densePath = useMemo(() => {
    const wp = strokes[strokeIndex];
    const clean = Array.isArray(wp) ? wp.filter(p => p && p.x != null && p.y != null) : [];
    return clean.length ? buildDensePath(clean, scaleWord) : [];
  }, [strokes, strokeIndex, scaleWord]);

  const isDot = useMemo(() => isDotStroke(densePath), [densePath]);

  // Check if all strokes are done (guided mode)
  const totalStrokeCount = allStrokes.length;
  const isAllDone = isGuided && status === 'success';

  // Fire onComplete when guided mode succeeds — slight delay so the student
  // sees their accuracy score before the row advances.
  useEffect(() => {
    if (status === 'success' && isGuided) {
      const timer = setTimeout(() => onComplete?.(accuracy), 1500);
      return () => clearTimeout(timer);
    }
  }, [status, isGuided, onComplete, accuracy]);

  // --- Dot-only helpers ---
  const inkLength = useCallback((paths) => {
    let len = 0;
    for (const pts of paths) {
      for (let i = 1; i < pts.length; i++) len += dist(pts[i], pts[i - 1]);
    }
    return len;
  }, []);

  const checkDotComplete = useCallback(() => {
    const allPaths = [...dotDrawnPaths];
    if (dotCurrentRef.current.length > 1) allPaths.push(dotCurrentRef.current);
    const totalInk = inkLength(allPaths);
    setEnoughInk(totalInk >= MIN_INK_PX);
  }, [dotDrawnPaths, inkLength]);

  // --- Guided mode handlers (ported from WordTracingCanvas) ---
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
    // Score the stroke accuracy (dot strokes are always perfect)
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

  const handleGuidedDown = (pos) => {
    if (status === 'success') return;
    const currentStrokes = strokes[strokeIndex];
    if (!Array.isArray(currentStrokes) || !currentStrokes.length) return;
    // Match LetterTracingCanvas: check against the first 30% of the dense
    // path with a generous tolerance (WOBBLE_RADIUS), not just the first
    // waypoint — more forgiving for touch screens and interactive boards.
    if (waypointIndex === 0) {
      const startTol = isDot ? DOT_HIT_RADIUS : WOBBLE_RADIUS;
      const checkEnd = isDot ? 1 : Math.max(8, Math.floor(densePath.length * 0.3));
      let minD = Infinity;
      for (let i = 0; i < checkEnd && i < densePath.length; i++) {
        minD = Math.min(minD, dist(pos, densePath[i]));
      }
      if (minD > startTol) {
        flashError();
        return;
      }
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
    setGuideFlash(true);
    setTimeout(() => setGuideFlash(false), 800);

    if (isDot) {
      for (let k = 0; k < densePath.length; k++) visitedRef.current.add(k);
      pathProgressRef.current = densePath.length - 1;
      pendingCompleteRef.current = true;
      postCompleteTravelRef.current = 0;
      setAwaitingLift(true);
      setWaypointIndex(currentStrokes.length);
    }
  };

  const handleGuidedMove = (pos) => {
    if (!drawing || status !== 'tracing') return;
    if (pendingCompleteRef.current) {
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
  };

  const handleGuidedUp = () => {
    if (!drawing) return;
    setDrawing(false);
    const reachedEnd = densePath.length > 1
      ? coverageComplete(visitedRef.current, densePath.length) && pathProgressRef.current >= densePath.length - END_TOL
      : true;
    if (!reachedEnd) {
      flashError();
      restartStroke();
      return;
    }
    // Accuracy gate: reject strokes that deviate too far from the guide.
    // Dot strokes are always perfect. This prevents wildly inaccurate
    // strokes from being accepted as "correct."
    if (!isDot) {
      const acc = strokeAccuracy(currentPathRef.current, densePath);
      if (acc < 45) {
        flashError();
        restartStroke();
        return;
      }
    }
    commitStroke();
  };

  // --- Dot-only handlers ---
  const handleDotDown = (p) => {
    if (dotCompleted) return;
    setDrawing(true);
    dotCurrentRef.current = [p];
    setDotCurrentPath([p]);
  };

  const handleDotMove = (p) => {
    if (!drawing || dotCompleted) return;
    const last = dotCurrentRef.current[dotCurrentRef.current.length - 1];
    if (last && dist(p, last) < 2) return;
    dotCurrentRef.current = [...dotCurrentRef.current, p];
    setDotCurrentPath(dotCurrentRef.current);
    checkDotComplete();
  };

  const handleDotUp = () => {
    if (!drawing) return;
    setDrawing(false);
    if (dotCurrentRef.current.length > 1) {
      setDotDrawnPaths((prev) => [...prev, dotCurrentRef.current]);
    }
    dotCurrentRef.current = [];
    setDotCurrentPath([]);
    checkDotComplete();
  };

  // --- Unified pointer handlers ---
  const usingPointerRef = useRef(false);
  const usingTouchRef = useRef(false);

  const onPointerDown = (e) => {
    if (usingTouchRef.current) return;
    usingPointerRef.current = true;
    try { svgRef.current?.setPointerCapture(e.pointerId); } catch {}
    const p = toSvg(e.clientX, e.clientY);
    if (!p) return;
    if (isGuided) handleGuidedDown(p);
    else handleDotDown(p);
  };
  const onPointerMove = (e) => {
    if (!usingPointerRef.current) return;
    const p = toSvg(e.clientX, e.clientY);
    if (!p) return;
    if (isGuided) handleGuidedMove(p);
    else handleDotMove(p);
  };
  const onPointerUp = (e) => {
    if (!usingPointerRef.current) return;
    usingPointerRef.current = false;
    try { svgRef.current?.releasePointerCapture(e.pointerId); } catch {}
    if (isGuided) handleGuidedUp();
    else handleDotUp();
  };
  const onTouchStart = (e) => {
    if (usingPointerRef.current) return;
    usingTouchRef.current = true;
    const t = e.touches[0];
    if (!t) return;
    const p = toSvg(t.clientX, t.clientY);
    if (!p) return;
    if (isGuided) handleGuidedDown(p);
    else handleDotDown(p);
  };
  const onTouchMove = (e) => {
    if (!usingTouchRef.current) return;
    e.preventDefault();
    const t = e.touches[0];
    if (!t) return;
    const p = toSvg(t.clientX, t.clientY);
    if (!p) return;
    if (isGuided) handleGuidedMove(p);
    else handleDotMove(p);
  };
  const onTouchEnd = () => {
    if (!usingTouchRef.current) return;
    usingTouchRef.current = false;
    if (isGuided) handleGuidedUp();
    else handleDotUp();
  };

  const pathD = (pts) => pts.length < 2 ? '' :
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Normalize strokes to 0-1 for saving (dot-only mode)
  const normalizeStrokes = useCallback(() => {
    return dotDrawnPaths.map((stroke) =>
      stroke.map((p) => ({ x: p.x / totalW, y: p.y / CANVAS_H }))
    );
  }, [dotDrawnPaths, totalW]);

  const handleDone = () => {
    setDotCompleted(true);
    onComplete?.(normalizeStrokes());
  };

  // Guide dots (Pac-Man pellets) for guided mode
  const guideDots = useMemo(() => {
    if (!drawing || awaitingLift || isAllDone || !densePath.length) return [];
    const progress = Math.max(0, Math.min(densePath.length - 1, pathProgressRef.current));
    const offsets = [5, 11, 18, 26];
    const seen = new Set();
    return offsets.map((offset, i) => {
      const idx = Math.min(densePath.length - 1, progress + offset);
      if (seen.has(idx)) return null;
      seen.add(idx);
      return { ...densePath[idx], index: idx, radius: [5.5, 4.8, 4.1, 3.5][i], opacity: [1, 0.95, 0.85, 0.75][i] };
    }).filter(Boolean);
  }, [drawing, awaitingLift, isAllDone, densePath, currentPath]);

  const guideArrow = useMemo(() => {
    if (!drawing || awaitingLift || isAllDone || !densePath.length) return null;
    const progress = Math.max(0, Math.min(densePath.length - 1, pathProgressRef.current));
    const arrowIndex = Math.min(densePath.length - 1, progress + 30);
    const directionIndex = Math.min(densePath.length - 1, arrowIndex + 4);
    if (directionIndex === arrowIndex) return null;
    const p1 = densePath[arrowIndex];
    const p2 = densePath[directionIndex];
    return { x: p1.x, y: p1.y, angle: Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI };
  }, [drawing, awaitingLift, isAllDone, densePath, currentPath]);

  const currentStrokeWaypoints = strokes[strokeIndex] || [];
  const nextWp = waypointIndex < currentStrokeWaypoints.length
    ? scaleWord(currentStrokeWaypoints[waypointIndex]) : null;

  if (!wordLetters.length) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        No traceable letters in this name.
      </div>
    );
  }

  const isSuccess = status === 'success';
  const isAmber = isSuccess && accuracy != null && accuracy < 80;

  return (
    <div className="flex flex-col items-center select-none" style={{ width: renderW, maxWidth: '100%' }}>
      {/* Status prompt */}
      <div className="h-8 shrink-0 flex items-center justify-center">
        {isGuided && awaitingLift && (
          <div className="bg-yellow-100 border border-yellow-400 rounded-full px-4 py-1 text-yellow-800 font-bold text-sm animate-bounce">
            ✋ Lift your finger!
          </div>
        )}
        {isGuided && isSuccess && (
          <div className="flex items-center gap-3">
            <div className={`rounded-full border px-4 py-1 font-bold text-sm ${
              isAmber
                ? 'bg-amber-100 border-amber-400 text-amber-800'
                : 'bg-green-100 border-green-400 text-green-800'
            }`}>
              {isAmber ? '✏️ Good try!' : '🎉 Great job!'}
            </div>
            {accuracy != null && (
              <div className={`rounded-full border px-4 py-1 font-bold text-sm ${
                isAmber
                  ? 'bg-amber-100 border-amber-300 text-amber-800'
                  : 'bg-indigo-100 border-indigo-300 text-indigo-800'
              }`}>
                🎯 {accuracy}%
              </div>
            )}
          </div>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${totalW} ${CANVAS_H}`}
        preserveAspectRatio="xMidYMid meet"
        className={`rounded-2xl border-4 shrink-0 ${
          errorFlash ? 'border-red-400 bg-red-50' :
          isSuccess ? (isAmber ? 'border-amber-400 bg-amber-50' : 'border-green-400 bg-green-50') :
          dotCompleted ? 'border-green-400 bg-green-50' :
          'border-slate-200 bg-white'
        }`}
        style={{
          display: 'block',
          width: renderW,
          height: renderH,
          cursor: 'crosshair',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {/* Guide lines */}
        <line x1="0" y1={0.10 * CANVAS_H} x2={totalW} y2={0.10 * CANVAS_H} stroke="#93c5fd" strokeWidth="2.5" opacity="0.8" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1={0.367 * CANVAS_H} x2={totalW} y2={0.367 * CANVAS_H} stroke="#000" strokeWidth="2" strokeDasharray="8 6" opacity="0.8" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1={0.633 * CANVAS_H} x2={totalW} y2={0.633 * CANVAS_H} stroke="#16a34a" strokeWidth="2.5" opacity="0.8" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1={0.90 * CANVAS_H} x2={totalW} y2={0.90 * CANVAS_H} stroke="#fca5a5" strokeWidth="2.5" strokeDasharray="6 6" opacity="0.85" vectorEffect="non-scaling-stroke" />

        {/* Guide paths for ALL letters — completed = green, current = colored, upcoming = grey */}
        {isGuided && wordLetters.map((ch, li) => {
          const letterStrokes = waypoints[ch]?.strokes || [];
          return letterStrokes.map((stroke, si) => {
            const isCompleted = li < letterIndex;
            const isCurrent = li === letterIndex;
            const color = isCompleted ? '#22c55e' :
                          isCurrent ? '#A78BFA' :
                          '#cbd5e1';
            const opacity = isCompleted ? 0.55 : isCurrent ? (guideFlash ? 0.85 : 0.6) : 0.4;
            const scaled = stroke.map(p => scaleForLetter(p, li));
            // Dot strokes (e.g. 'i' dot, 'j' dot) are 2 points very close
            // together — render as a filled circle so the dot is visible.
            const isDotGuide = scaled.length === 2 && dist(scaled[0], scaled[1]) < 8;
            if (isDotGuide) {
              return (
                <circle
                  key={`${li}-${si}`}
                  cx={scaled[0].x}
                  cy={scaled[0].y}
                  r={isCurrent && guideFlash ? 7 : 5}
                  fill={color}
                  opacity={opacity}
                  pointerEvents="none"
                />
              );
            }
            return (
              <path
                key={`${li}-${si}`}
                d={splinePathD(scaled)}
                fill="none"
                stroke={color}
                strokeWidth={isCurrent && guideFlash ? 10 : 6}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={opacity}
                pointerEvents="none"
              />
            );
          });
        })}

        {/* Dot-only mode: show all guide paths faintly + start dots */}
        {isDotOnly && allStrokes.map((s, i) => {
          if (s.scaledPts.length < 2) {
            const p = s.scaledPts[0];
            return p ? <circle key={`dp-${i}`} cx={p.x} cy={p.y} r="5" fill="#6366f1" opacity="0.3" pointerEvents="none" /> : null;
          }
          // Dot strokes (e.g. 'i' dot) — render as a filled circle
          if (s.scaledPts.length === 2 && dist(s.scaledPts[0], s.scaledPts[1]) < 8) {
            return (
              <circle key={`dp-${i}`} cx={s.scaledPts[0].x} cy={s.scaledPts[0].y} r="5"
                fill="#A78BFA" opacity="0.3" pointerEvents="none" />
            );
          }
          return (
            <path
              key={`dp-${i}`}
              d={splinePathD(s.scaledPts)}
              fill="none"
              stroke="#A78BFA"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.3"
              pointerEvents="none"
            />
          );
        })}

        {/* Drawn paths — guided mode (all letters' completed strokes) */}
        {isGuided && Object.entries(drawnPathsByLetter).map(([li, paths]) =>
          paths.map((pts, i) => (
            <path key={`d${li}-${i}`} d={pathD(pts)} fill="none" stroke="#22c55e" strokeWidth="11"
              strokeLinecap="round" strokeLinejoin="round" opacity="0.85" pointerEvents="none" />
          ))
        )}

        {/* Current drawing path — guided mode */}
        {isGuided && currentPath.length > 1 && (
          <path d={pathD(currentPath)} fill="none" stroke="#22c55e" strokeWidth="11"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.85" pointerEvents="none" />
        )}

        {/* Drawn paths — dot-only mode */}
        {isDotOnly && dotDrawnPaths.map((pts, i) => (
          <path key={`dd-${i}`} d={pathD(pts)} fill="none" stroke="#6366f1" strokeWidth="11"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.9" pointerEvents="none" />
        ))}
        {isDotOnly && dotCurrentPath.length > 1 && (
          <path d={pathD(dotCurrentPath)} fill="none" stroke="#6366f1" strokeWidth="11"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.9" pointerEvents="none" />
        )}

        {/* Guide dots (Pac-Man pellets) — guided mode */}
        {isGuided && guideDots.map((dot, i) => (
          <circle
            key={`guide-dot-${dot.index}-${i}`}
            cx={dot.x}
            cy={dot.y}
            r={dot.radius}
            fill="#FACC15"
            stroke="#854D0E"
            strokeWidth="1.5"
            opacity={dot.opacity}
            pointerEvents="none"
          />
        ))}

        {/* Direction arrow — guided mode */}
        {isGuided && guideArrow && (
          <g transform={`translate(${guideArrow.x} ${guideArrow.y}) rotate(${guideArrow.angle})`} pointerEvents="none">
            <path d="M -8 -7 L 8 0 L -8 7 Z" fill="#FACC15" stroke="#854D0E" strokeWidth="1.5" strokeLinejoin="round" />
          </g>
        )}

        {/* Start dot — only the CURRENT stroke in guided mode */}
        {isGuided && nextWp && !isSuccess && waypointIndex === 0 && !drawing && (
          (() => { const dc = '#A78BFA'; return (
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

        {/* Start dots — dot-only mode (all strokes) */}
        {isDotOnly && !dotCompleted && allStrokes.map((s, i) => {
          const p = s.dense[0];
          if (!p) return null;
          return (
            <g key={`start-${i}`} pointerEvents="none">
              <circle cx={p.x} cy={p.y} r="6" fill="#6366f1" opacity="0.35" />
            </g>
          );
        })}

        {/* Completion check — guided */}
        {isGuided && isSuccess && (
          <g pointerEvents="none">
            <circle cx={totalW - 25} cy={25} r="14" fill="#22c55e" />
            <path d="M -6 0 L -2 4 L 6 -5" transform={`translate(${totalW - 25} 25)`} stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}
      </svg>

      {/* Dot-only: Done button */}
      {isDotOnly && (
        <div className="h-9 shrink-0 flex items-center justify-center mt-1">
          {dotCompleted ? (
            <div className="bg-green-100 border border-green-400 rounded-full px-4 py-1 text-green-800 font-bold text-sm">🎉 Done!</div>
          ) : enoughInk ? (
            <button
              onClick={handleDone}
              className="bg-green-500 hover:bg-green-600 text-white font-bold text-sm px-5 py-1.5 rounded-full shadow-md"
            >
              ✓ Done
            </button>
          ) : (
            <div className="text-amber-700 text-xs font-bold">✏️ Write your whole name…</div>
          )}
        </div>
      )}
    </div>
  );
}