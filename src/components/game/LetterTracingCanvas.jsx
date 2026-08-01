import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { AUDIO_BASE } from '@/lib/audio';

const CANVAS_W = 300;
const CANVAS_H = 375; // matches calibration 400×500 (4:5) aspect ratio
const HIT_RADIUS = 14; // pixels to count as hitting a waypoint
const WOBBLE_RADIUS = 62; // px — pen is "on the path corridor" within this; momentary excursions past it are tolerated (see OFF_TRAVEL_BUDGET). Widened (was 50) so real handwriting veer — especially on retraced d/b/p stems — stays inside the corridor instead of restarting.
const OFF_TRAVEL_BUDGET = 140; // px — accumulated pen travel WHILE off the corridor before we restart; a momentary wobble that comes back costs nothing, a sustained drift (excessive wobble) exceeds it. Raised (was 90) to give retraced stems more room before a restart.
const FWD_RETRACE_RADIUS = 70; // px — tolerates veering while retracing (d/b/p stems double back). The +6-index CLAMP on the forward search is what stops a partial from leaping to the end, so this radius can stay generous for wobble without re-introducing that jump.
const MIN_MOVE = 5; // px — ignore direction checks for sub-noise movements
const DIR_REJECT_DOT = -0.78; // drawn-vs-ideal direction dot below this = reverse direction → restart. Loosened (was -0.6) so genuine veering (which isn't a reversal) doesn't trip it; only a clear backtrack does. A backtrack that then recovers and completes is allowed — partial detection is handled by the sequential end-gate, not this.
const COVERAGE_RADIUS = 16; // px — the pen's actual ink half-width: a dense path point counts as traced only when the pen passes within this. Kept tight (was 46, which blanketed both stems and bowls from a single press and let partials pass) so coverage reflects where the ink really overlaps the guide path. Hand wobble that brings the pen back near the path still marks it; a sustained drift that never overlaps does not — but it won't RESTART (see WOBBLE_RADIUS), it just won't count as covered.
const MIN_COVER_FRAC = 0.95; // fraction of the ideal path the pen must actually cover. At 95% a two-thirds trace of a tight curve (c, d, o) that the 30px thick pen would otherwise mark as ~85% covered is rejected; only a near-complete, deliberate trace reaches it.
const MAX_GAP = 10; // dense points — the largest run of UNCOVERED path the pen may leave. A shortcut skips a curved section, leaving a gap bigger than this → restart. A complete trace leaves no gaps (the pen passes every segment).
const START_TOL = 6; // dense points — the pen must reach the path's start within this many points (slight start variation allowed).
const END_TOL = 5; // dense points — the pen must reach the path's end within this many points (slight end variation allowed, but the student must actually finish the stroke).
// Per-stroke guide colors — match the teacher authoring canvas (StrokeAuthoringCanvas)
// so the faint guide path is clearly visible instead of a low-contrast gray dashed line.
const GUIDE_COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6'];

// Multisensory fonema audio played while the pen is down. Files live in the
// Supabase "audio" bucket under {lang}/letters/fonemas/, named per case:
// A_mayu_fonema.mp3 (uppercase) / a_minu_fonema.mp3 (lowercase).
function fonemaUrl(letter, lang = 'es') {
  const isUpper = letter && letter.length === 1 && letter === letter.toUpperCase() && letter !== letter.toLowerCase();
  const name = isUpper ? `${letter}_mayu_fonema` : `${letter.toLowerCase()}_minu_fonema`;
  return `${AUDIO_BASE}/${lang}/letters/fonemas/${name}.mp3`;
}

function scale(pt) {
  if (!pt || pt.x == null || pt.y == null) return { x: 0, y: 0 };
  return { x: pt.x * CANVAS_W, y: pt.y * CANVAS_H };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Densely sample the ideal path for a stroke by interpolating between its
// waypoints at a fixed pixel step. Used for wobble detection (distance from
// each drawn point to the nearest ideal point) and for the replay hint.
function buildDensePath(waypoints, step = 3) {
  const pts = waypoints.map(scale);
  if (pts.length === 1) return [pts[0]];
  const dense = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const segLen = dist(a, b);
    const n = Math.max(1, Math.round(segLen / step));
    for (let j = 0; j < n; j++) {
      const t = j / n;
      dense.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  dense.push(pts[pts.length - 1]);
  return dense;
}

// Score a finished stroke 0–100: each drawn point's closeness to the nearest
// ideal point is averaged. A point on the ideal path scores 100; one `penalty`
// px away scores 0.
function strokeAccuracy(drawnPts, idealDense, penalty = 30) {
  if (!drawnPts.length || !idealDense.length) return 100;
  let sum = 0;
  for (const p of drawnPts) {
    let minD = Infinity;
    for (const q of idealDense) {
      const d = dist(p, q);
      if (d < minD) minD = d;
    }
    sum += Math.max(0, 100 * (1 - minD / penalty));
  }
  return Math.round(sum / drawnPts.length);
}

// Decide whether the pen has traced enough of the ideal path to count the
// stroke complete. We treat the ideal path as a road and the pen as a thick
// disk: a dense point is "covered" when the pen passed within COVERAGE_RADIUS.
// Completion needs (1) most of the path covered, (2) no large uncovered gap —
// a shortcut cuts across a curve, leaving the curved section untouched, which
// is a big gap, and (3) the pen actually reached both the start and the end of
// the path (slight variation allowed). This catches shortcuts (s, o) and
// partial loops (c, o) that the old "fraction + endpoint" check let through,
// because for nearly-closed letters the start and end sit close together so
// reaching "the end" was trivial, and the generous radius marked enough points
// even when cutting across.
function coverageComplete(visited, denseLen) {
  if (denseLen <= 1) return true;
  const sorted = [...visited].sort((a, b) => a - b);
  if (!sorted.length) return false;
  let maxGap = sorted[0]; // gap before the first covered point
  for (let i = 1; i < sorted.length; i++) {
    maxGap = Math.max(maxGap, sorted[i] - sorted[i - 1] - 1);
  }
  maxGap = Math.max(maxGap, denseLen - 1 - sorted[sorted.length - 1]); // gap after the last covered point
  const frac = sorted.length / denseLen;
  const startCovered = sorted[0] <= START_TOL;
  const endCovered = denseLen - 1 - sorted[sorted.length - 1] <= END_TOL;
  return frac >= MIN_COVER_FRAC && maxGap <= MAX_GAP && startCovered && endCovered;
}

export default function LetterTracingCanvas({ letter, strokes, onComplete, onReset, onAccuracy, debugCoverage, renderWidth = 256, lang = 'es' }) {
  const [strokeIndex, setStrokeIndex] = useState(0);
  const [waypointIndex, setWaypointIndex] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [drawnPaths, setDrawnPaths] = useState([]); // completed stroke paths
  const [currentPath, setCurrentPath] = useState([]);
  const currentPathRef = useRef([]); // always-current ref to avoid stale closure
  const pendingCompleteRef = useRef(false); // last waypoint hit, waiting for pointerUp
  const pathProgressRef = useRef(0); // furthest dense-path index reached this stroke
  const visitedRef = useRef(new Set()); // dense-path indices the stroke actually passed near (coverage)
  const offTravelRef = useRef(0); // accumulated px traveled while off the path corridor — sustained drift restarts (overlap-based wobble)
  const [status, setStatus] = useState('idle'); // idle | tracing | lift | success | error
  const [errorFlash, setErrorFlash] = useState(false);
  const [awaitingLift, setAwaitingLift] = useState(false); // true once the last waypoint is hit, while still holding
  const svgRef = useRef(null);
  const [accuracy, setAccuracy] = useState(null); // overall letter accuracy 0–100
  const [coverageStats, setCoverageStats] = useState(null); // debug: covered/total/progress for the thick-pen visualization
  const strokeAccuraciesRef = useRef([]); // per-stroke scores, averaged on completion
  const [replaying, setReplaying] = useState(false);
  const [replayPts, setReplayPts] = useState([]);
  const replayRafRef = useRef(null);
  const fonemaAudioRef = useRef(null);

  const stopFonema = useCallback(() => {
    if (fonemaAudioRef.current) {
      try { fonemaAudioRef.current.pause(); } catch {}
      fonemaAudioRef.current = null;
    }
  }, []);

  // Loop the letter's fonema while the pen is down so tracing is multisensory —
  // students hear and say the sound as they write. Stops on lift / letter change.
  const playFonema = useCallback(() => {
    stopFonema();
    try {
      const a = new Audio(fonemaUrl(letter, lang));
      a.loop = true;
      a.play().catch(() => {});
      fonemaAudioRef.current = a;
    } catch {}
  }, [letter, lang, stopFonema]);

  const densePath = useMemo(() => {
    const wp = strokes[strokeIndex];
    const clean = Array.isArray(wp) ? wp.filter(p => p && p.x != null && p.y != null) : [];
    return clean.length ? buildDensePath(clean) : [];
  }, [strokes, strokeIndex]);

  // Cancel any in-flight replay animation when the component unmounts.
  useEffect(() => () => {
    if (replayRafRef.current) cancelAnimationFrame(replayRafRef.current);
    stopFonema();
  }, []);

  // Reset when letter changes
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
    if (replayRafRef.current) { cancelAnimationFrame(replayRafRef.current); replayRafRef.current = null; }
    setReplaying(false);
    setReplayPts([]);
    setAccuracy(null);
    setCoverageStats(null);
    strokeAccuraciesRef.current = [];
  }, [letter]);

  const getPos = (e) => {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    if (e.button != null && e.button !== 0) return; // left mouse / touch / pen only
    if (status === 'success') return;
    // Pointer Events unify mouse, touch, and pen. setPointerCapture keeps events
    // flowing to the canvas even if the pen/finger/cursor leaves it mid-stroke —
    // the same model the authoring canvas uses, so graphics-tablet pens
    // (Wacom/Promethean) and iPad/PC/touch all draw reliably here.
    try { svgRef.current.setPointerCapture(e.pointerId); } catch {}
    const pos = getPos(e);
    const currentStrokes = strokes[strokeIndex];
    if (!Array.isArray(currentStrokes) || !currentStrokes.length) return;
    const firstWp = scale(currentStrokes[0]);
    // Must start near the first waypoint of current stroke
    if (waypointIndex === 0 && dist(pos, firstWp) > HIT_RADIUS * 1.8) {
      flashError();
      return;
    }
    if (replayRafRef.current) { cancelAnimationFrame(replayRafRef.current); replayRafRef.current = null; }
    setReplaying(false);
    setReplayPts([]);
    pathProgressRef.current = 0;
    visitedRef.current = new Set();

    offTravelRef.current = 0;
    pendingCompleteRef.current = false;
    setDrawing(true);
    setStatus('tracing');
    currentPathRef.current = [pos];
    setCurrentPath([pos]);
    playFonema();
  }, [status, strokeIndex, waypointIndex, strokes, playFonema]);

  const flashError = () => {
    setErrorFlash(true);
    setTimeout(() => setErrorFlash(false), 600);
  };

  // Reset the current (in-progress) stroke without touching completed ones.
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
  };

  // Finalise the current stroke as completed and advance to the next one.
  const commitStroke = () => {
    const completedPath = [...currentPathRef.current];
    currentPathRef.current = [];
    setDrawnPaths(prev => [...prev, completedPath]);
    setCurrentPath([]);
    strokeAccuraciesRef.current.push(strokeAccuracy(completedPath, densePath));
    pathProgressRef.current = 0;
    offTravelRef.current = 0;

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

  const handlePointerMove = useCallback((e) => {
    e.preventDefault();
    if (!drawing || status !== 'tracing') return;
    const pos = getPos(e);
    // Once the end of the ideal path is reached, just track the finger until
    // lift — don't penalise the natural loop-back/overshoot at a stroke's end.
    if (pendingCompleteRef.current) {
      currentPathRef.current = [...currentPathRef.current, pos];
      setCurrentPath(currentPathRef.current);
      return;
    }
    const prev = currentPathRef.current[currentPathRef.current.length - 1];
    const currentStrokes = strokes[strokeIndex];
    if (!currentStrokes) return;
    const moveDist = prev ? dist(pos, prev) : 0;

    if (densePath.length) {
      // Nearest point on the densely-sampled ideal path. For retraced letters
      // (b, d, h, m, n, q, g…) the same geometry appears twice in the dense path
      // — the b stem is traversed down then back up, the a stem retraces the
      // bowl's right edge. A plain nearest-point search snaps to the lower-index
      // copy, so the retrace copy is never reached and coverage stalls; worse,
      // the snapped copy can point the WRONG way (the bowl edge runs up while the
      // a stem runs down), tripping the direction gate. Once the stroke has
      // advanced past a region (pathProgress), prefer the FORWARD copy when the
      // pen is still within wobble of it — that is the taught continuation.
      // Windowed nearest-point search: only look at dense points within a few
      // indices of the current progress. A full scan snaps ACROSS a nearly-closed
      // shape (the b bowl's top sits near its bottom, an a's stem near its bowl)
      // and leaps pathProgress from 30% to 90% in one step — which then jumps
      // covFrom and stops coverage marking for everything the pen hasn't drawn
      // yet. The window follows the pen, so the nearest point can only be one
      // the pen is actually approaching, never a far copy across the letter.
      let minD = Infinity;
      let nearestIdx = Math.max(0, Math.min(densePath.length - 1, pathProgressRef.current));
      const scanLo = Math.max(0, pathProgressRef.current - 3);
      const scanHi = Math.min(densePath.length - 1, pathProgressRef.current + 8);
      for (let i = scanLo; i <= scanHi; i++) {
        const d = dist(pos, densePath[i]);
        if (d < minD) { minD = d; nearestIdx = i; }
      }
      // Retrace preference: when the nearest ideal point is in ALREADY-COVERED
      // territory (the pen has doubled back over a region it already drew — the
      // b/a/d/h/r stem retraced, or a minor backtrack), the "nearest" copy points
      // the WRONG way and a correct retrace trips the direction gate. Prefer the
      // FORWARD copy (the taught continuation, correct direction) when the pen
      // is still reasonably near it. The retrace tolerance is WIDER than the
      // normal wobble corridor because the doubled-back copies sit close
      // together and a small wobble flips the snap; a genuinely-lost pen (beyond
      // this radius) still fails the wobble budget below.
      let retraceForward = false;
      if (nearestIdx < pathProgressRef.current) {
        // Clamp the forward search to a small index window above the current
        // progress. A real retrace snaps to the forward copy AT the pen's
        // current spot (index ~ pathProgress), so a +6 window is plenty.
        // Without the clamp the search could leap to a forward point far ahead
        // — the end of a closed 'o'/'a' sitting near its start, or the 'b'
        // bowl's bottom near an 'h' arch — and JUMP pathProgress from a 70%
        // partial straight to the end, letting an incomplete trace count as
        // complete. The clamp forces the marker to advance one step at a time,
        // so a partial that stops short can no longer fake reaching the end.
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

      // Wobble (overlap-based): the drawn ink is WIDER than the thin ideal line,
      // so a pen that wobbles a little still lays ink that OVERLAPS the path —
      // "fairly on the path." We do NOT restart on a single stray point. Instead
      // we accumulate how far the pen has traveled WHILE off the corridor
      // (minD > WOBBLE_RADIUS); a momentary wobble that comes right back costs
      // nothing, but a SUSTAINED drift (excessive wobble → wide ink that no
      // longer overlaps the path) exceeds the budget and restarts the stroke.
      // A genuinely-lost huge jump still restarts immediately.
      if (minD > WOBBLE_RADIUS) {
        if (retraceForward) {
          // The pen is retracing taught geometry but wider than the thin ideal
          // line — still "on the path," just wider ink. Don't accumulate drift
          // (that would punish the retrace itself); reset the budget instead.
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

      // Direction: the drawn movement must align with the ideal path's local
      // direction. Reverse-direction scribbling or "coloring in" the letter
      // without following the stroke order is rejected and restarts the stroke.
      if (prev && moveDist >= MIN_MOVE) {
        const dx = (pos.x - prev.x) / moveDist;
        const dy = (pos.y - prev.y) / moveDist;
        const a = Math.min(nearestIdx, densePath.length - 1);
        const b = Math.min(nearestIdx + 2, densePath.length - 1);
        const iLen = Math.hypot(densePath[b].x - densePath[a].x, densePath[b].y - densePath[a].y) || 1;
        const ix = (densePath[b].x - densePath[a].x) / iLen;
        const iy = (densePath[b].y - densePath[a].y) / iLen;
        if (dx * ix + dy * iy < DIR_REJECT_DOT) {
          // Before restarting, check for a retrace TURN. At a doubled-back
          // point (b stem bottom, a stem top, h arch valley) the taught path's
          // LEAVING direction flips while the pen is still ARRIVING in the
          // original direction — so a correct arrival reads as "reversed".
          // Two signals of a legitimate turn:
          //   (1) TURN ARRIVAL: the pen still matches the direction the path
          //       was TRAVERSED to reach this point (arrival direction). Allow
          //       it; the next move snaps to the forward (retraced) copy.
          //   (2) TURN LEAVE: a nearby FORWARD ideal point already points the
          //       new drawn direction — the retrace has begun. Advance there.
          // If neither, it's genuine reverse scribbling → restart.
          const ai = Math.max(0, nearestIdx - 2);
          const aLen = Math.hypot(densePath[nearestIdx].x - densePath[ai].x, densePath[nearestIdx].y - densePath[ai].y) || 1;
          const arrX = (densePath[nearestIdx].x - densePath[ai].x) / aLen;
          const arrY = (densePath[nearestIdx].y - densePath[ai].y) / aLen;
          if (dx * arrX + dy * arrY >= 0) {
            // turn arrival — legitimate, allow without restarting
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

      // Forward-only coverage. A single press must NOT blanket the whole
      // letter — it only marks dense points the pen is actually near (within
      // the tight COVERAGE_RADIUS, ≈ the ink width) AND that lie AHEAD of the
      // current progress (the direction of travel). This is what stops the
      // bowl of a 'b' from "covering" the stem it never drew: the stem sits at
      // lower indices, behind progress, so it is never marked. Sub-stepping
      // along the pen move means a fast but on-path stroke still fills every
      // dense point (no gaps), while a shortcut drawn across a curve misses
      // the curve's extremes and stays below the completion threshold.
      const covFrom = Math.max(0, pathProgressRef.current - 2);
      // Cap the forward scan to a small window ahead of progress — same window
      // the nearest-point search uses. Scanning all the way to the end lets a
      // nearly-closed letter mark a LATER part of the path that happens to sit
      // near the pen (the 'a' stem-top is spatially above its bowl, so a pen on
      // the bowl covers the stem it hasn't drawn yet), which is the coverage
      // "traveling past where it was supposed to." The window follows the pen,
      // so only points the pen is actually reaching get marked.
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

      // Completion also requires the pen to have ADVANCED sequentially to the
      // path's end (pathProgress), not just sat near points that happen to be
      // near the end — otherwise a self-adjacent letter (u's right-down sits
      // beside its right-up and its curve) passes, because the thick pen marks
      // the end region from neighboring strokes the pen never actually drew.
      if (coverageComplete(visitedRef.current, densePath.length) && pathProgressRef.current >= densePath.length - END_TOL) {
        pendingCompleteRef.current = true;
        setAwaitingLift(true);
        setWaypointIndex(currentStrokes.length);
      }
      if (debugCoverage) setCoverageStats({ covered: visitedRef.current.size, total: densePath.length, progress: pathProgressRef.current });
    }

    currentPathRef.current = [...currentPathRef.current, pos];
    setCurrentPath(currentPathRef.current);

    // Visual waypoint advancement (start/progress dots) — completion is
    // governed by pathProgress above, not by these dots.
    if (!pendingCompleteRef.current) {
      const nextWp = scale(currentStrokes[waypointIndex]);
      if (dist(pos, nextWp) < HIT_RADIUS) {
        setWaypointIndex(Math.min(waypointIndex + 1, currentStrokes.length));
      }
    }
  }, [drawing, status, strokeIndex, waypointIndex, strokes, densePath, debugCoverage]);

  const handlePointerUp = useCallback((e) => {
    e.preventDefault();
    try { svgRef.current.releasePointerCapture(e.pointerId); } catch {}
    if (!drawing) return;
    setDrawing(false);
    stopFonema();
    if (replayRafRef.current) { cancelAnimationFrame(replayRafRef.current); replayRafRef.current = null; }
    setReplaying(false);
    setReplayPts([]);

    // A stroke is valid only if the pen covered almost all of the ideal path
    // with no large skipped gap and actually reached both the start and the
    // end (coverageComplete). Lifting early, shortcutting across a curve, or
    // stopping short of the end is rejected and the stroke restarts. There is
    // no "almost done" forgiveness: students must actually complete each
    // stroke.
    const reachedEnd = densePath.length > 1
      ? coverageComplete(visitedRef.current, densePath.length) && pathProgressRef.current >= densePath.length - END_TOL
      : true;
    if (reachedEnd) {
      commitStroke();
    } else {
      flashError();
      restartStroke();
    }
  }, [drawing, densePath, strokeIndex, strokes, onComplete, onAccuracy]);

  const stopReplay = () => {
    if (replayRafRef.current) { cancelAnimationFrame(replayRafRef.current); replayRafRef.current = null; }
    setReplaying(false);
    setReplayPts([]);
  };

  const startReplay = () => {
    if (drawing || status === 'success') return;
    const wp = strokes[strokeIndex];
    if (!wp || wp.length < 2) return;
    const refPath = buildDensePath(wp);
    if (replayRafRef.current) cancelAnimationFrame(replayRafRef.current);
    setReplaying(true);
    setReplayPts([]);
    const duration = 700 + refPath.length * 5; // ms — longer paths take a touch longer
    const startTs = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - startTs) / duration);
      const count = Math.max(1, Math.ceil(t * refPath.length));
      setReplayPts(refPath.slice(0, count));
      if (t < 1) {
        replayRafRef.current = requestAnimationFrame(tick);
      } else {
        replayRafRef.current = null;
        setReplaying(false);
      }
    };
    replayRafRef.current = requestAnimationFrame(tick);
  };

  const reset = () => {
    stopReplay();
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
    setCoverageStats(null);
    strokeAccuraciesRef.current = [];
    pathProgressRef.current = 0;
    visitedRef.current = new Set();

    offTravelRef.current = 0;
    onReset?.();
  };

  const currentStrokeWaypoints = strokes[strokeIndex] || [];
  const nextWp = waypointIndex < currentStrokeWaypoints.length
    ? scale(currentStrokeWaypoints[waypointIndex]) : null;

  const pathD = (pts) => pts.length < 2 ? '' :
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const isSuccess = status === 'success';
  // green = clean correct pathway; amber = completed but rough/weirdly formed
  // (partial credit) — the game already enforces the correct pathway, so every
  // completion followed it; accuracy measures how cleanly.
  const isAmber = isSuccess && accuracy != null && accuracy < 80;

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      {/* Status prompt */}
      <div className="h-8 flex items-center justify-center">
        {awaitingLift && (
          <div className="bg-yellow-100 border border-yellow-400 rounded-full px-4 py-1 text-yellow-800 font-bold text-sm animate-bounce">
            ✋ Lift your finger!
          </div>
        )}
        {status === 'success' && (
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
            <button
              onClick={() => onComplete?.()}
              className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-sm px-4 py-1 rounded-full"
            >
              Next →
            </button>
          </div>
        )}
        {status === 'idle' && strokeIndex === 0 && waypointIndex === 0 && (
          <div className="text-slate-400 text-sm">Start at the ● dot</div>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        className={`rounded-2xl border-4 touch-none aspect-[4/5] ${
          errorFlash ? 'border-red-400 bg-red-50' :
          isSuccess ? (isAmber ? 'border-amber-400 bg-amber-50' : 'border-green-400 bg-green-50') :
          'border-slate-200 bg-white'
        }`}
        style={{ width: renderWidth, maxWidth: '92vw', cursor: 'crosshair', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Guide letter removed until suitable font is found */}

        {/* Primary writing lines — equal-zone spacing (matches authoring) */}
        <line x1="0" y1={0.10 * CANVAS_H} x2={CANVAS_W} y2={0.10 * CANVAS_H}
          stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={0.367 * CANVAS_H} x2={CANVAS_W} y2={0.367 * CANVAS_H}
          stroke="#93c5fd" strokeWidth="1" strokeDasharray="8 6" opacity="0.7" />
        <line x1="0" y1={0.633 * CANVAS_H} x2={CANVAS_W} y2={0.633 * CANVAS_H}
          stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={0.90 * CANVAS_H} x2={CANVAS_W} y2={0.90 * CANVAS_H}
          stroke="#fca5a5" strokeWidth="1.5" strokeDasharray="6 6" opacity="0.85" />

        {/* Waypoint guide path — vibrant per-stroke colors matching the teacher
            authoring canvas, solid and visible so the student can see what to trace. */}
        {strokes.map((stroke, si) => {
          const color = si < strokeIndex ? '#22c55e' : GUIDE_COLORS[si % GUIDE_COLORS.length];
          return (
            <polyline
              key={si}
              points={stroke.map(p => `${scale(p).x},${scale(p).y}`).join(' ')}
              fill="none"
              stroke={color}
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={si < strokeIndex ? 0.5 : 0.6}
            />
          );
        })}

        {/* Drawn paths (completed strokes) */}
        {drawnPaths.map((pts, i) => (
          <path key={i} d={pathD(pts)} fill="none" stroke="#6366f1" strokeWidth="12"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        ))}

        {/* Current drawing path */}
        {currentPath.length > 1 && (
          <path d={pathD(currentPath)} fill="none" stroke="#6366f1" strokeWidth="12"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        )}

        {/* Replay hint — animated demo of the current stroke's ideal path */}
        {replayPts.length > 1 && (
          <>
            <path d={pathD(replayPts)} fill="none" stroke="#f59e0b" strokeWidth="10"
              strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
            <circle cx={replayPts[replayPts.length - 1].x}
              cy={replayPts[replayPts.length - 1].y} r="7" fill="#f59e0b" />
          </>
        )}

        {/* Debug: thick-pen coverage visualization — green dots = dense path
            points the pen has passed within COVERAGE_RADIUS of; gray dots =
            not-yet-covered. Amber ring = the pen tip's coverage radius. */}
        {debugCoverage && densePath.map((p, i) => {
          const cov = visitedRef.current.has(i);
          return <circle key={'dcov' + i} cx={p.x} cy={p.y}
            r={cov ? 3 : 1.6} fill={cov ? '#22c55e' : '#94a3b8'}
            opacity={cov ? 0.85 : 0.5} />;
        })}
        {debugCoverage && currentPath.length > 0 && (
          <circle cx={currentPath[currentPath.length - 1].x}
            cy={currentPath[currentPath.length - 1].y}
            r={COVERAGE_RADIUS} fill="none" stroke="#f59e0b"
            strokeWidth="1.5" opacity="0.7" />
        )}

        {/* Start dot — color matches the current stroke's guide (teacher authoring palette) */}
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

      {debugCoverage && coverageStats && (
        <div className="text-xs font-mono leading-tight text-center">
          <div className="text-amber-200">
            covered {coverageStats.covered}/{coverageStats.total} ({Math.round(coverageStats.covered / Math.max(1, coverageStats.total) * 100)}%) ·
            reached end {coverageStats.progress >= coverageStats.total - 5 ? 'yes' : 'no'}
          </div>
          <div className="text-amber-300/70">green dots = inside thick pen · amber ring = pen tip</div>
        </div>
      )}

      <div className="flex items-center gap-4">
        {!isSuccess && (
          <button
            onClick={startReplay}
            disabled={drawing || replaying || !strokes[strokeIndex]}
            className="text-amber-600 hover:text-amber-700 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ▶ Show me
          </button>
        )}
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