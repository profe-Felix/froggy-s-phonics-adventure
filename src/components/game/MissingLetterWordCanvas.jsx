import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  dist, buildDensePath, strokeAccuracy, coverageComplete,
  HIT_RADIUS, WOBBLE_RADIUS, OFF_TRAVEL_BUDGET, FWD_RETRACE_RADIUS,
  MIN_MOVE, DIR_REJECT_DOT, COVERAGE_RADIUS,
  END_TOL, GUIDE_COLORS, fonemaUrl,
  isDotStroke, DOT_HIT_RADIUS,
} from '@/lib/tracingCore';
import { getSilenceStartSync, preloadSilenceStart } from '@/lib/audio';
import { splinePathD } from '@/components/tracing/strokeMath';

const X_SCALE = 600;
const CANVAS_H = 750;
const LETTER_GAP = 40;
const PADDING = 30;
const TEXT_FONT_SIZE = 520;
const TEXT_LETTER_WIDTH = 300;
const FONEMA_INTERVAL_MS = 2000;

// Renders the whole word on one canvas so it reads as a cohesive unit (no
// awkward gaps between the traced letter and the rest). Only the target letter
// is traceable; all other letters are pre-filled — green strokes if they have
// authored waypoints, green text otherwise. Uses the same stroke validation as
// LetterTracingCanvas / WordTracingCanvas.
export default function MissingLetterWordCanvas({
  word, targetIndex, waypoints, lang = 'es', renderWidth = 500,
  onComplete, onAccuracy, silent = false,
}) {
  // ---- layout: position each letter by its real ink bounds ----
  const { layout, totalW, targetLayoutIdx } = useMemo(() => {
    const letters = word.split('');
    const layout = [];
    let cursor = PADDING;
    let targetLayoutIdx = -1;
    for (let i = 0; i < letters.length; i++) {
      const ch = letters[i];
      const wp = waypoints[ch];
      const hasWp = wp && Array.isArray(wp.strokes) && wp.strokes.length > 0;
      let minX = Infinity, maxX = -Infinity;
      if (hasWp) {
        // Only use points at or above the baseline (y <= 0.633) for horizontal
        // bounds, so descender tails (j curving left, q curving right) don't
        // create gaps — they naturally extend under adjacent letters.
        for (const stroke of wp.strokes) {
          if (!Array.isArray(stroke)) continue;
          for (const p of stroke) {
            if (p && p.x != null && p.y <= 0.633) {
              if (p.x < minX) minX = p.x;
              if (p.x > maxX) maxX = p.x;
            }
          }
        }
        if (!isFinite(minX)) { minX = 0; maxX = 1; }
      }
      const width = hasWp ? (maxX - minX) * X_SCALE : TEXT_LETTER_WIDTH;
      const offset = cursor;
      const isTarget = i === targetIndex;
      if (isTarget) targetLayoutIdx = layout.length;
      layout.push({ ch, hasWp, minX, maxX, width, offset, isTarget });
      cursor += width + LETTER_GAP;
    }
    const totalW = Math.max(X_SCALE, cursor + PADDING);
    return { layout, totalW, targetLayoutIdx };
  }, [word, waypoints, targetIndex]);

  const targetLetter = word[targetIndex];
  const targetWp = waypoints[targetLetter];
  const strokes = (targetWp && Array.isArray(targetWp.strokes)) ? targetWp.strokes : [];

  // Scale a normalized point for the target letter into canvas coordinates.
  const scaleTarget = useCallback((pt) => {
    if (!pt || pt.x == null || pt.y == null) return { x: 0, y: 0 };
    const lay = layout[targetLayoutIdx];
    if (!lay) return { x: 0, y: 0 };
    return {
      x: lay.offset + (pt.x - lay.minX) * X_SCALE,
      y: pt.y * CANVAS_H,
      ...(pt?.corner ? { corner: true } : {}),
    };
  }, [layout, targetLayoutIdx]);

  // Scale for any letter slot (for rendering non-target guide paths).
  const scaleForLetter = useCallback((pt, lay) => {
    if (!pt || pt.x == null || pt.y == null || !lay) return { x: 0, y: 0 };
    return {
      x: lay.offset + (pt.x - lay.minX) * X_SCALE,
      y: pt.y * CANVAS_H,
      ...(pt?.corner ? { corner: true } : {}),
    };
  }, []);

  // ---- tracing state (target letter only) ----
  const [strokeIndex, setStrokeIndex] = useState(0);
  const [waypointIndex, setWaypointIndex] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [drawnPaths, setDrawnPaths] = useState([]);
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
  const svgRef = useRef(null);
  const [accuracy, setAccuracy] = useState(null);
  const strokeAccuraciesRef = useRef([]);
  const fonemaAudioRef = useRef(null);
  const fonemaIntervalRef = useRef(null);
  const successTimerRef = useRef(null);
  const completedFiredRef = useRef(false);

  const stopFonema = useCallback(() => {
    if (fonemaIntervalRef.current) { clearInterval(fonemaIntervalRef.current); fonemaIntervalRef.current = null; }
    if (fonemaAudioRef.current) { try { fonemaAudioRef.current.pause(); } catch {} fonemaAudioRef.current = null; }
  }, []);

  const playFonema = useCallback(() => {
    if (silent) return;
    stopFonema();
    try {
      const url = fonemaUrl(targetLetter, lang);
      const playOnce = () => {
        const a = new Audio(url);
        const trim = getSilenceStartSync(url);
        if (trim > 0) a.addEventListener('loadedmetadata', () => { a.currentTime = trim; }, { once: true });
        a.play().catch(() => {});
        fonemaAudioRef.current = a;
      };
      playOnce();
      fonemaIntervalRef.current = setInterval(playOnce, FONEMA_INTERVAL_MS);
    } catch {}
  }, [targetLetter, lang, stopFonema, silent]);

  const densePath = useMemo(() => {
    const wp = strokes[strokeIndex];
    const clean = Array.isArray(wp) ? wp.filter(p => p && p.x != null && p.y != null) : [];
    return clean.length ? buildDensePath(clean, scaleTarget) : [];
  }, [strokes, strokeIndex, scaleTarget]);

  const isDot = useMemo(() => isDotStroke(densePath), [densePath]);

  // Reset on word / target change.
  useEffect(() => {
    stopFonema();
    setStrokeIndex(0);
    setWaypointIndex(0);
    setDrawing(false);
    setDrawnPaths([]);
    setCurrentPath([]);
    setStatus('idle');
    setErrorFlash(false);
    setAwaitingLift(false);
    pendingCompleteRef.current = false;
    pathProgressRef.current = 0;
    visitedRef.current = new Set();
    offTravelRef.current = 0;
    postCompleteTravelRef.current = 0;
    setAccuracy(null);
    strokeAccuraciesRef.current = [];
    completedFiredRef.current = false;
    if (successTimerRef.current) { clearTimeout(successTimerRef.current); successTimerRef.current = null; }
  }, [word, targetIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    stopFonema();
  }, [stopFonema]);

  useEffect(() => {
    if (targetLetter && !silent) preloadSilenceStart(fonemaUrl(targetLetter, lang));
  }, [targetLetter, lang, silent]);

  // Auto-advance after success so the next word starts without a tap.
  useEffect(() => {
    if (status !== 'success' || completedFiredRef.current) return;
    successTimerRef.current = setTimeout(() => {
      completedFiredRef.current = true;
      successTimerRef.current = null;
      onComplete?.();
    }, 800);
    return () => { if (successTimerRef.current) { clearTimeout(successTimerRef.current); successTimerRef.current = null; } };
  }, [status, onComplete]);

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

  const flashError = useCallback(() => {
    setErrorFlash(true);
    setTimeout(() => setErrorFlash(false), 600);
  }, []);

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
    stopFonema();
  };

  const commitStroke = () => {
    const completedPath = [...currentPathRef.current];
    currentPathRef.current = [];
    setDrawnPaths(prev => [...prev, completedPath]);
    setCurrentPath([]);
    strokeAccuraciesRef.current.push(isDot ? 100 : strokeAccuracy(completedPath, densePath));
    pathProgressRef.current = 0;
    offTravelRef.current = 0;
    postCompleteTravelRef.current = 0;
    pendingCompleteRef.current = false;
    setAwaitingLift(false);
    const newStrokeIdx = strokeIndex + 1;
    if (newStrokeIdx >= strokes.length) {
      setStatus('success');
      const accs = strokeAccuraciesRef.current;
      const avg = accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : 100;
      setAccuracy(avg);
      onAccuracy?.(avg);
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
    const firstWp = scaleTarget(currentStrokes[0]);
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
    if (isDot) {
      for (let k = 0; k < densePath.length; k++) visitedRef.current.add(k);
      pathProgressRef.current = densePath.length - 1;
      pendingCompleteRef.current = true;
      postCompleteTravelRef.current = 0;
      setAwaitingLift(true);
      setWaypointIndex(currentStrokes.length);
    }
  }, [status, strokeIndex, waypointIndex, strokes, isDot, densePath, scaleTarget, playFonema, flashError]);

  const handlePointerMove = useCallback((e) => {
    e.preventDefault();
    if (!drawing || status !== 'tracing') return;
    const pos = getPos(e);
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
      const nextWp = scaleTarget(currentStrokes[waypointIndex]);
      if (dist(pos, nextWp) < HIT_RADIUS) {
        setWaypointIndex(Math.min(waypointIndex + 1, currentStrokes.length));
      }
    }
  }, [drawing, status, strokeIndex, waypointIndex, strokes, densePath, scaleTarget, flashError, isDot]);

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
  }, [drawing, densePath, strokeIndex, strokes, flashError, stopFonema]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    stopFonema();
    setStrokeIndex(0);
    setWaypointIndex(0);
    setDrawing(false);
    setDrawnPaths([]);
    currentPathRef.current = [];
    pendingCompleteRef.current = false;
    setAwaitingLift(false);
    setCurrentPath([]);
    setStatus('idle');
    setErrorFlash(false);
    setAccuracy(null);
    strokeAccuraciesRef.current = [];
    pathProgressRef.current = 0;
    visitedRef.current = new Set();
    offTravelRef.current = 0;
    postCompleteTravelRef.current = 0;
    completedFiredRef.current = false;
    if (successTimerRef.current) { clearTimeout(successTimerRef.current); successTimerRef.current = null; }
  };

  const pathD = (pts) => pts.length < 2 ? '' :
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const isSuccess = status === 'success';
  const isAmber = isSuccess && accuracy != null && accuracy < 80;

  const currentStrokeWaypoints = strokes[strokeIndex] || [];
  const nextWp = waypointIndex < currentStrokeWaypoints.length
    ? scaleTarget(currentStrokeWaypoints[waypointIndex]) : null;

  // Pac-Man pellet guide dots — same as LetterTracingCanvas.
  const guideDots = useMemo(() => {
    if (!drawing || awaitingLift || isSuccess || !densePath.length) return [];
    const progress = Math.max(0, Math.min(densePath.length - 1, pathProgressRef.current));
    const offsets = [5, 11, 18, 26];
    const seen = new Set();
    return offsets.map((offset, i) => {
      const idx = Math.min(densePath.length - 1, progress + offset);
      if (seen.has(idx)) return null;
      seen.add(idx);
      return { ...densePath[idx], index: idx, radius: [5.5, 4.8, 4.1, 3.5][i], opacity: [1, 0.95, 0.85, 0.75][i] };
    }).filter(Boolean);
  }, [drawing, awaitingLift, isSuccess, densePath, currentPath]);

  const guideArrow = useMemo(() => {
    if (!drawing || awaitingLift || isSuccess || !densePath.length) return null;
    const progress = Math.max(0, Math.min(densePath.length - 1, pathProgressRef.current));
    const arrowIndex = Math.min(densePath.length - 1, progress + 30);
    const directionIndex = Math.min(densePath.length - 1, arrowIndex + 4);
    if (directionIndex === arrowIndex) return null;
    const p1 = densePath[arrowIndex];
    const p2 = densePath[directionIndex];
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
    return { x: p1.x, y: p1.y, angle };
  }, [drawing, awaitingLift, isSuccess, densePath, currentPath]);

  if (!strokes.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <p className="text-sm text-gray-500">No tracing path found for “{targetLetter}”.</p>
        <button onClick={onComplete} className="bg-indigo-500 text-white font-bold px-5 py-2 rounded-full">Skip →</button>
      </div>
    );
  }

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
            <button
              onClick={() => {
                if (completedFiredRef.current) return;
                completedFiredRef.current = true;
                if (successTimerRef.current) { clearTimeout(successTimerRef.current); successTimerRef.current = null; }
                onComplete?.();
              }}
              className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-sm px-4 py-1 rounded-full"
            >
              Next →
            </button>
          </div>
        )}
        {status === 'idle' && strokeIndex === 0 && waypointIndex === 0 && !drawing && (
          <div className="text-slate-400 text-sm">Start at the ● dot</div>
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
          WebkitTouchCallout: 'none',
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

        {/* Pre-filled non-target letters — green strokes or green text */}
        {layout.map((lay, li) => {
          if (lay.isTarget) return null;
          if (lay.hasWp) {
            const letterStrokes = waypoints[lay.ch]?.strokes || [];
            return letterStrokes.map((stroke, si) => {
              const scaled = stroke.map(p => scaleForLetter(p, lay));
              if (scaled.length === 1) {
                return <circle key={`pre-${li}-${si}`} cx={scaled[0].x} cy={scaled[0].y} r="6" fill="#22c55e" opacity="0.55" pointerEvents="none" />;
              }
              return (
                <path key={`pre-${li}-${si}`} d={splinePathD(scaled)} fill="none" stroke="#22c55e"
                  strokeWidth="16" strokeLinecap="round" strokeLinejoin="miter" opacity="0.75" pointerEvents="none" />
              );
            });
          }
          // No waypoints — render as green text on the baseline.
          return (
            <text key={`pre-${li}`} x={lay.offset + lay.width / 2} y={0.633 * CANVAS_H}
              textAnchor="middle" dominantBaseline="alphabetic"
              fontSize={TEXT_FONT_SIZE} fill="#22c55e" opacity="0.75"
              fontFamily="'Edu NSW ACT Foundation', 'Andika', sans-serif"
              pointerEvents="none">{lay.ch}</text>
          );
        })}

        {/* Target letter guide paths (colored, traceable) */}
        {strokes.map((stroke, si) => {
          const scaled = stroke.map(scaleTarget);
          const color = GUIDE_COLORS[si % GUIDE_COLORS.length];
          if (scaled.length === 1) {
            return <circle key={`g-${si}`} cx={scaled[0].x} cy={scaled[0].y} r="6" fill={color} opacity="0.6" pointerEvents="none" />;
          }
          return (
            <path key={`g-${si}`} d={splinePathD(scaled)} fill="none" stroke={color}
              strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" pointerEvents="none" />
          );
        })}

        {/* Drawn paths (completed strokes for the target letter) */}
        {drawnPaths.map((pts, i) => (
          <path key={i} d={pathD(pts)} fill="none" stroke="#6366f1" strokeWidth="16"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        ))}

        {/* Current drawing path */}
        {currentPath.length > 1 && (
          <path d={pathD(currentPath)} fill="none" stroke="#6366f1" strokeWidth="16"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        )}

        {/* Pac-Man pellet guide dots */}
        {guideDots.map((dot, i) => (
          <circle key={`guide-dot-${dot.index}-${i}`} cx={dot.x} cy={dot.y} r={dot.radius}
            fill="#FACC15" stroke="#854D0E" strokeWidth="1.5" opacity={dot.opacity} pointerEvents="none" />
        ))}

        {/* Direction arrow */}
        {guideArrow && (
          <g transform={`translate(${guideArrow.x} ${guideArrow.y}) rotate(${guideArrow.angle})`} pointerEvents="none">
            <path d="M -8 -7 L 8 0 L -8 7 Z" fill="#FACC15" stroke="#854D0E" strokeWidth="1.5" strokeLinejoin="round" />
          </g>
        )}

        {/* Start dot */}
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

      <button onClick={reset} className="text-slate-400 hover:text-slate-700 text-sm underline">
        Start over
      </button>
    </div>
  );
}