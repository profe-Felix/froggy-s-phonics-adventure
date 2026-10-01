import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  dist, buildDensePath, strokeAccuracy, coverageComplete,
  HIT_RADIUS, WOBBLE_RADIUS, OFF_TRAVEL_BUDGET, FWD_RETRACE_RADIUS,
  MIN_MOVE, DIR_REJECT_DOT, COVERAGE_RADIUS, START_TOL, END_TOL,
  DOT_HIT_RADIUS,
} from '@/lib/tracingCore';
import { splinePathD } from '@/components/tracing/strokeMath';
import { LETTER_WAYPOINTS } from '@/components/data/letterWaypoints';

// Compact waypoint-tracing canvas for the Dictado reveal phase.
// Reuses the SAME validation gates as WordTracingCanvas (start-point hit,
// forward-only coverage, wobble corridor, direction reject, coverage
// completion) so the strictness is identical — just laid out to fit a single
// dictado line and rendered in red ink instead of green.
//
// The letter pathways (the "model") are drawn faintly so the student sees the
// correct formation, then traces over them stroke-by-stroke with validation.

const RED = '#dc2626';
const MODEL = '#1e293b';

function letterBounds(strokes) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity;
  for (const s of strokes) {
    if (!Array.isArray(s)) continue;
    for (const p of s) {
      if (p && p.x != null) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y != null && p.y < minY) minY = p.y;
      }
    }
  }
  if (!isFinite(minX)) { minX = 0; maxX = 0.5; }
  if (!isFinite(minY)) minY = 0;
  return { minX, maxX, minY, inkW: maxX - minX };
}

// Accented character → { base, accent } decomposition. The base letter is
// traced with its normal waypoints; the accent is appended as extra strokes
// positioned above the letter body (negative y in the letter's 0-1 space).
const ACCENT_MAP = {
  'á': { base: 'a', accent: 'acute' },
  'é': { base: 'e', accent: 'acute' },
  'í': { base: 'i', accent: 'acute' },
  'ó': { base: 'o', accent: 'acute' },
  'ú': { base: 'u', accent: 'acute' },
  'Á': { base: 'A', accent: 'acute' },
  'É': { base: 'E', accent: 'acute' },
  'Í': { base: 'I', accent: 'acute' },
  'Ó': { base: 'O', accent: 'acute' },
  'Ú': { base: 'U', accent: 'acute' },
  'ñ': { base: 'n', accent: 'tilde' },
  'Ñ': { base: 'N', accent: 'tilde' },
  'ü': { base: 'u', accent: 'diaeresis' },
  'Ü': { base: 'U', accent: 'diaeresis' },
};

// Build accent stroke waypoints positioned just above the letter body's
// actual top edge (minY). This keeps the letter body at the same vertical
// position as non-accented words (aligned with the writing guidelines),
// and the accent sits naturally above the letter — not in a huge reserved
// space that pushes the word down.
function buildAccentStrokes(type, { minX, maxX, minY }) {
  const cx = (minX + maxX) / 2;
  const w = maxX - minX;
  const top = minY;          // topmost ink point of the letter body
  const gap = 0.04;           // small gap between letter top and accent
  const accentH = 0.10;       // accent height in normalized units
  const baseY = top - gap;
  if (type === 'acute') {
    return [[
      { x: cx - w * 0.08, y: baseY - accentH * 0.25 },
      { x: cx + w * 0.08, y: baseY - accentH },
    ]];
  }
  if (type === 'tilde') {
    return [[
      { x: cx - w * 0.18, y: baseY - accentH * 0.2 },
      { x: cx - w * 0.06, y: baseY - accentH * 0.8 },
      { x: cx + w * 0.06, y: baseY - accentH * 0.15 },
      { x: cx + w * 0.18, y: baseY - accentH * 0.7 },
    ]];
  }
  if (type === 'diaeresis') {
    return [
      [{ x: cx - w * 0.12, y: baseY - accentH * 0.5 }],
      [{ x: cx + w * 0.12, y: baseY - accentH * 0.5 }],
    ];
  }
  return [];
}

export default function DictadoTraceCanvas({
  word,
  width,
  height,
  onComplete,
  onProgress,
  minimumStrokeAccuracy = 0,
  initialTrace = null,
  onTraceChange,
}) {
  const svgRef = useRef(null);
  const initialTraceRef = useRef(initialTrace);
  const drawnRef = useRef({});

  // Layout: letters left-to-right, scaled to fit the available width.
  const { letters, layout, xScale } = useMemo(() => {
    const rawChars = (word || '').split('');
    const chars = rawChars.map(ch => {
      const acc = ACCENT_MAP[ch];
      if (acc && LETTER_WAYPOINTS[acc.base]) {
        const baseStrokes = LETTER_WAYPOINTS[acc.base].strokes || [];
        const b = letterBounds(baseStrokes);
        const accentStrokes = buildAccentStrokes(acc.accent, b);
        return { ch, base: acc.base, strokes: [...baseStrokes, ...accentStrokes] };
      }
      if (LETTER_WAYPOINTS[ch]) {
        return { ch, base: ch, strokes: LETTER_WAYPOINTS[ch].strokes || [] };
      }
      return null;
    }).filter(Boolean);
    const bounds = chars.map(c => {
      const baseStrokes = LETTER_WAYPOINTS[c.base]?.strokes || [];
      return { ...c, ...letterBounds(baseStrokes) };
    });
    const yFit = height;
    const gapPx = height * 0.08;
    const padPx = height * 0.08;
    const sumInk = bounds.reduce((s, b) => s + b.inkW, 0) || 0.001;
    const fitX = (width - 2 * padPx - Math.max(0, bounds.length - 1) * gapPx) / sumInk;
    const xs = Math.min(yFit, Math.max(yFit * 0.35, fitX));
    let cursor = padPx;
    const lay = bounds.map(b => {
      const offset = cursor;
      const inkW = b.inkW * xs;
      cursor += inkW + gapPx;
      return { ...b, offset, yScale: 1.0, yOffset: 0.0 };
    });
    return { letters: chars, layout: lay, xScale: xs };
  }, [word, width, height]);

  // Scale validation constants to the canvas height. The shared constants in
  // tracingCore were designed for WordTracingCanvas (CANVAS_H=750). This canvas
  // is ~150px tall, so WOBBLE_RADIUS=85 would be 57% of the height (vs 11% on
  // 750px) — letting the pen veer way off. Scale everything by height/750.
  const S = height / 750;
  const HIT_R = HIT_RADIUS * S;
  const WOBBLE_R = WOBBLE_RADIUS * S;
  const OFF_BUDGET = OFF_TRAVEL_BUDGET * S;
  const FWD_R = FWD_RETRACE_RADIUS * S;
  const COVERAGE_R = COVERAGE_RADIUS * S;
  const DOT_HIT_R = DOT_HIT_RADIUS * S;
  const MIN_M = MIN_MOVE * S;
  const POST_BUDGET = 70 * S;
  const STEP = 3 * S;
  const ACC_PENALTY = 30 * S;
  const DOT_PIXEL_LIM = 14 * S;
  const STROKE_W = Math.max(3, height * 0.028);
  const MODEL_W = Math.max(2, height * 0.016);
  const MODEL_FLASH_W = Math.max(3, height * 0.028);

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

  // Reset when the word changes.
  useEffect(() => {
    setLetterIndex(0); setStrokeIndex(0); setWaypointIndex(0);
    setDrawing(false); setDrawnPathsByLetter({}); currentPathRef.current = [];
    setCurrentPath([]); setStatus('idle'); setErrorFlash(false);
    setAwaitingLift(false); setAccuracy(null);
    strokeAccuraciesRef.current = []; pathProgressRef.current = 0;
    visitedRef.current = new Set(); offTravelRef.current = 0;
    postCompleteTravelRef.current = 0; pendingCompleteRef.current = false;
    drawnRef.current = {};

    // Restore previously saved tracing (stored normalized 0-1).
    const t = initialTraceRef.current;
    if (t?.paths && letters.length) {
      const restored = {};
      for (const [li, arr] of Object.entries(t.paths)) {
        restored[li] = arr.map(pts => pts.map(p => ({ x: p.x * width, y: p.y * height })));
      }
      drawnRef.current = restored;
      setDrawnPathsByLetter(restored);
      strokeAccuraciesRef.current = [...(t.accuracies || [])];
      if (t.done) {
        const last = letters.length - 1;
        setLetterIndex(last);
        setStrokeIndex(letters[last].strokes.length);
        setAccuracy(t.accuracy ?? null);
        setStatus('success');
      } else {
        let li = 0;
        while (li < letters.length - 1 && (restored[li]?.length || 0) >= letters[li].strokes.length) li++;
        setLetterIndex(li);
        setStrokeIndex(restored[li]?.length || 0);
      }
    }
  }, [word]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentLetter = letters[letterIndex];
  const rawStrokes = currentLetter?.strokes || [];

  const scaleWord = useCallback((pt) => {
    const lay = layout[letterIndex];
    if (!lay) return { x: 0, y: 0 };
    return {
      x: lay.offset + (pt.x - lay.minX) * xScale,
      y: (lay.yOffset + pt.y * lay.yScale) * height,
    };
  }, [letterIndex, layout, xScale, height]);

  const scaleForLetter = useCallback((pt, li) => {
    const lay = layout[li];
    if (!lay) return { x: 0, y: 0 };
    return {
      x: lay.offset + (pt.x - lay.minX) * xScale,
      y: (lay.yOffset + pt.y * lay.yScale) * height,
      ...(pt.corner ? { corner: true } : {}),
    };
  }, [layout, xScale, height]);

  const densePath = useMemo(() => {
    const wp = rawStrokes[strokeIndex];
    const clean = Array.isArray(wp) ? wp.filter(p => p && p.x != null && p.y != null) : [];
    return clean.length ? buildDensePath(clean, scaleWord, STEP) : [];
  }, [rawStrokes, strokeIndex, scaleWord, STEP]);

  // Local isDot with scaled pixel threshold (the imported isDotStroke uses a
  // fixed 14px threshold designed for the 750px canvas).
  const isDot = useMemo(() => {
    if (!densePath || !densePath.length) return false;
    if (densePath.length === 1) return true;
    let len = 0;
    for (let i = 1; i < densePath.length; i++) len += dist(densePath[i], densePath[i - 1]);
    return len < DOT_PIXEL_LIM;
  }, [densePath, DOT_PIXEL_LIM]);

  useEffect(() => {
    if (status === 'success' && accuracy != null) {
      onProgress?.(accuracy);
      const t = setTimeout(() => onComplete?.(accuracy), 900);
      return () => clearTimeout(t);
    }
  }, [status, accuracy]); // eslint-disable-line react-hooks/exhaustive-deps

  const getPos = (e) => {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (width / rect.width),
      y: (e.clientY - rect.top) * (height / rect.height),
    };
  };

  const flashError = () => { setErrorFlash(true); setTimeout(() => setErrorFlash(false), 600); };

  const restartStroke = () => {
    currentPathRef.current = []; setCurrentPath([]);
    setWaypointIndex(0); setDrawing(false); setStatus('idle');
    setAwaitingLift(false); pendingCompleteRef.current = false;
    pathProgressRef.current = 0; visitedRef.current = new Set();
    offTravelRef.current = 0; postCompleteTravelRef.current = 0;
  };

  const commitStroke = () => {
    const completedPath = [...currentPathRef.current];
    const strokeScore = isDot ? 100 : strokeAccuracy(completedPath, densePath, ACC_PENALTY);
    if (!isDot && minimumStrokeAccuracy > 0 && strokeScore < minimumStrokeAccuracy) {
      flashError(); restartStroke(); return;
    }
    currentPathRef.current = [];
    const nextDrawn = {
      ...drawnRef.current,
      [letterIndex]: [...(drawnRef.current[letterIndex] || []), completedPath],
    };
    drawnRef.current = nextDrawn;
    setDrawnPathsByLetter(nextDrawn);
    setCurrentPath([]);
    strokeAccuraciesRef.current.push(strokeScore);
    const emitTrace = (done, acc) => onTraceChange?.({
      paths: Object.fromEntries(Object.entries(drawnRef.current).map(([li, arr]) => [
        li,
        arr.map(pts => pts.map(p => ({ x: +(p.x / width).toFixed(4), y: +(p.y / height).toFixed(4) }))),
      ])),
      accuracies: [...strokeAccuraciesRef.current],
      done,
      accuracy: acc,
    });
    pathProgressRef.current = 0; offTravelRef.current = 0;
    postCompleteTravelRef.current = 0; pendingCompleteRef.current = false;
    setAwaitingLift(false); visitedRef.current = new Set();

    const newStrokeIdx = strokeIndex + 1;
    if (newStrokeIdx >= rawStrokes.length) {
      const newLetterIdx = letterIndex + 1;
      if (newLetterIdx >= letters.length) {
        setStatus('success');
        const accs = strokeAccuraciesRef.current;
        const avg = accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : 100;
        setAccuracy(avg);
        emitTrace(true, avg);
      } else {
        setStatus('idle'); setLetterIndex(newLetterIdx);
        setStrokeIndex(0); setWaypointIndex(0);
        emitTrace(false, null);
      }
    } else {
      setStatus('idle'); setStrokeIndex(newStrokeIdx); setWaypointIndex(0);
      emitTrace(false, null);
    }
  };

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    if (e.button != null && e.button !== 0) return;
    if (status === 'success') return;
    try { svgRef.current.setPointerCapture(e.pointerId); } catch {}
    const pos = getPos(e);
    const currentStrokes = rawStrokes[strokeIndex];
    if (!Array.isArray(currentStrokes) || !currentStrokes.length) return;
    const firstWp = scaleWord(currentStrokes[0]);
    const startTol = isDot ? DOT_HIT_R : HIT_R * 1.8;
    if (waypointIndex === 0 && dist(pos, firstWp) > startTol) { flashError(); return; }
    pathProgressRef.current = 0; visitedRef.current = new Set();
    offTravelRef.current = 0; postCompleteTravelRef.current = 0;
    pendingCompleteRef.current = false;
    setDrawing(true); setStatus('tracing');
    currentPathRef.current = [pos]; setCurrentPath([pos]);
    setGuideFlash(true); setTimeout(() => setGuideFlash(false), 700);
    if (isDot) {
      for (let k = 0; k < densePath.length; k++) visitedRef.current.add(k);
      pathProgressRef.current = densePath.length - 1;
      pendingCompleteRef.current = true; postCompleteTravelRef.current = 0;
      setAwaitingLift(true); setWaypointIndex(currentStrokes.length);
    }
  }, [status, strokeIndex, waypointIndex, rawStrokes, isDot, densePath, scaleWord, DOT_HIT_R, HIT_R, POST_BUDGET, WOBBLE_R, OFF_BUDGET, FWD_R, MIN_M, COVERAGE_R]);

  const handlePointerMove = useCallback((e) => {
    e.preventDefault();
    if (!drawing || status !== 'tracing') return;
    const pos = getPos(e);
    if (pendingCompleteRef.current) {
      const prevP = currentPathRef.current[currentPathRef.current.length - 1];
      if (prevP && !isDot) {
        postCompleteTravelRef.current += dist(pos, prevP);
        if (postCompleteTravelRef.current > POST_BUDGET) { flashError(); restartStroke(); return; }
      }
      currentPathRef.current = [...currentPathRef.current, pos];
      setCurrentPath(currentPathRef.current);
      return;
    }
    const prev = currentPathRef.current[currentPathRef.current.length - 1];
    const currentStrokes = rawStrokes[strokeIndex];
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
        if (fwdIdx >= 0 && fwdD <= FWD_R) {
          nearestIdx = fwdIdx; minD = fwdD; retraceForward = true;
        }
      }
      if (minD > WOBBLE_R) {
        if (retraceForward) { offTravelRef.current = 0; }
        else {
          offTravelRef.current += moveDist;
          if (minD > WOBBLE_R * 2 || offTravelRef.current > OFF_BUDGET) {
            flashError(); restartStroke(); return;
          }
        }
      } else { offTravelRef.current = 0; }
      if (prev && moveDist >= MIN_M) {
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
            // legitimate turn arrival
          } else {
            let saved = false;
            for (let f = nearestIdx + 1; f <= Math.min(nearestIdx + 6, densePath.length - 1); f++) {
              if (dist(pos, densePath[f]) > FWD_R) continue;
              const fa = f, fb = Math.min(f + 2, densePath.length - 1);
              const fLen = Math.hypot(densePath[fb].x - densePath[fa].x, densePath[fb].y - densePath[fa].y) || 1;
              const fx = (densePath[fb].x - densePath[fa].x) / fLen;
              const fy = (densePath[fb].y - densePath[fa].y) / fLen;
              if (dx * fx + dy * fy >= 0) {
                nearestIdx = f; minD = dist(pos, densePath[f]);
                retraceForward = true; saved = true; break;
              }
            }
            if (!saved) { flashError(); restartStroke(); return; }
          }
        }
      }
      const covFrom = Math.max(0, pathProgressRef.current - 2);
      const covTo = Math.min(densePath.length, pathProgressRef.current + 8);
      const covSteps = Math.max(1, Math.ceil(moveDist / (COVERAGE_R * 0.6)));
      for (let s = 0; s <= covSteps; s++) {
        const t = s / covSteps;
        const sx = prev ? prev.x + (pos.x - prev.x) * t : pos.x;
        const sy = prev ? prev.y + (pos.y - prev.y) * t : pos.y;
        for (let k = covFrom; k < covTo; k++) {
          if (Math.hypot(sx - densePath[k].x, sy - densePath[k].y) <= COVERAGE_R) {
            visitedRef.current.add(k);
          }
        }
      }
      pathProgressRef.current = Math.max(pathProgressRef.current, nearestIdx);
      if (coverageComplete(visitedRef.current, densePath.length) && pathProgressRef.current >= densePath.length - END_TOL) {
        pendingCompleteRef.current = true; postCompleteTravelRef.current = 0;
        setAwaitingLift(true); setWaypointIndex(currentStrokes.length);
      }
    }
    currentPathRef.current = [...currentPathRef.current, pos];
    setCurrentPath(currentPathRef.current);
    if (!pendingCompleteRef.current) {
      const nextPt = currentStrokes[waypointIndex];
      if (nextPt) {
        const nextWp = scaleWord(nextPt);
        if (dist(pos, nextWp) < HIT_R) {
          setWaypointIndex(Math.min(waypointIndex + 1, currentStrokes.length));
        }
      }
    }
  }, [drawing, status, strokeIndex, waypointIndex, rawStrokes, densePath, scaleWord, isDot, WOBBLE_R, OFF_BUDGET, FWD_R, MIN_M, COVERAGE_R, HIT_R]);

  const handlePointerUp = useCallback((e) => {
    e.preventDefault();
    try { svgRef.current.releasePointerCapture(e.pointerId); } catch {}
    if (!drawing) return;
    setDrawing(false);
    const reachedEnd = isDot || (densePath.length > 1
      ? coverageComplete(visitedRef.current, densePath.length) && pathProgressRef.current >= densePath.length - END_TOL
      : true);
    if (reachedEnd) commitStroke();
    else { flashError(); restartStroke(); }
  }, [drawing, densePath, isDot]); // eslint-disable-line react-hooks/exhaustive-deps

  const pathD = (pts) => pts.length < 2 ? '' :
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const isSuccess = status === 'success';

  const guideDots = useMemo(() => {
    if (!drawing || awaitingLift || isSuccess || !densePath.length) return [];
    const progress = Math.max(0, Math.min(densePath.length - 1, pathProgressRef.current));
    const offsets = [5, 11, 18, 26];
    const seen = new Set();
    return offsets.map((offset, i) => {
      const idx = Math.min(densePath.length - 1, progress + offset);
      if (seen.has(idx)) return null; seen.add(idx);
      return { ...densePath[idx], index: idx, radius: [5.5, 4.8, 4.1, 3.5][i] * S, opacity: [1, 0.95, 0.85, 0.75][i] };
    }).filter(Boolean);
  }, [drawing, awaitingLift, isSuccess, densePath, currentPath, S]);

  const guideArrow = useMemo(() => {
    if (!drawing || awaitingLift || isSuccess || !densePath.length) return null;
    const progress = Math.max(0, Math.min(densePath.length - 1, pathProgressRef.current));
    const arrowIndex = Math.min(densePath.length - 1, progress + 30);
    const directionIndex = Math.min(densePath.length - 1, arrowIndex + 4);
    if (directionIndex === arrowIndex) return null;
    const p1 = densePath[arrowIndex], p2 = densePath[directionIndex];
    return { x: p1.x, y: p1.y, angle: Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI };
  }, [drawing, awaitingLift, isSuccess, densePath, currentPath, S]);

  const currentStrokeWaypoints = rawStrokes[strokeIndex] || [];
  const nextWp = waypointIndex < currentStrokeWaypoints.length
    ? scaleWord(currentStrokeWaypoints[waypointIndex]) : null;

  if (!letters.length) return null;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className="absolute"
      style={{
        left: 0, top: 0, width: `${width}px`, height: `${height}px`,
        overflow: 'visible',
        touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
        cursor: 'crosshair',
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Faint model pathways — the formation the student traces over */}
      {letters.map((l, li) => {
        const letterStrokes = l.strokes || [];
        return letterStrokes.map((stroke, si) => {
          const isCompleted = li < letterIndex;
          const isCurrent = li === letterIndex;
          const color = isCompleted ? RED : isCurrent ? '#A78BFA' : MODEL;
          const opacity = isCompleted ? 0.5 : isCurrent ? (guideFlash ? 0.85 : 0.6) : 0.28;
          return (
            <path
              key={`m-${li}-${si}`}
              d={splinePathD(stroke.map(p => scaleForLetter(p, li)))}
              fill="none" stroke={color}
              strokeWidth={isCurrent && guideFlash ? MODEL_FLASH_W : MODEL_W}
              strokeLinecap="round" strokeLinejoin="round" opacity={opacity}
            />
          );
        });
      })}

      {/* Completed drawn strokes (red) */}
      {Object.entries(drawnPathsByLetter).map(([li, paths]) =>
        paths.map((pts, i) => (
          <path key={`d-${li}-${i}`} d={pathD(pts)} fill="none" stroke={RED} strokeWidth={STROKE_W}
            strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        ))
      )}

      {/* Current drawing path */}
      {currentPath.length > 1 && (
        <path d={pathD(currentPath)} fill="none" stroke={RED} strokeWidth={STROKE_W}
          strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      )}

      {/* Guide dots + arrow */}
      {guideDots.map((dot, i) => (
        <circle key={`gd-${dot.index}-${i}`} cx={dot.x} cy={dot.y} r={dot.radius}
          fill="#FACC15" stroke="#854D0E" strokeWidth="1.5" opacity={dot.opacity} pointerEvents="none" />
      ))}
      {guideArrow && (
        <g transform={`translate(${guideArrow.x} ${guideArrow.y}) rotate(${guideArrow.angle})`} pointerEvents="none">
          <path d="M -8 -7 L 8 0 L -8 7 Z" fill="#FACC25" stroke="#854D0E" strokeWidth="1.5" strokeLinejoin="round" />
        </g>
      )}

      {/* Start dot */}
      {nextWp && !isSuccess && waypointIndex === 0 && !drawing && (
        <>
          <circle cx={nextWp.x} cy={nextWp.y} r={16 * S} fill="#A78BFA" opacity="0.18">
            <animate attributeName="r" values={`${12 * S};${20 * S};${12 * S}`} dur="1s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.22;0.06;0.22" dur="1s" repeatCount="indefinite" />
          </circle>
          <circle cx={nextWp.x} cy={nextWp.y} r={7 * S} fill="#A78BFA" />
          <text x={nextWp.x} y={nextWp.y + 3.5 * S} textAnchor="middle" fontSize={8 * S} fill="white" fontWeight="bold">
            {strokeIndex + 1}
          </text>
        </>
      )}

      {isSuccess && (
        <g pointerEvents="none">
          <circle cx={width / 2} cy={height / 2} r={Math.min(height, width) * 0.18} fill="#16a34a" opacity="0.18" />
          <text x={width / 2} y={height / 2 + 6} textAnchor="middle" fontSize={Math.min(height * 0.3, 28)} fill="#16a34a" fontWeight="bold">✓</text>
        </g>
      )}
    </svg>
  );
}