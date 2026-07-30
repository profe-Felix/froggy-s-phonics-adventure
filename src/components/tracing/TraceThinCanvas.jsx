import { useRef, useState, useEffect } from 'react';
import { Undo2, Trash2, Image as ImageIcon, Move, X, PenLine } from 'lucide-react';
import { CANVAS_W, CANVAS_H, smoothPoints, pointAtLength } from './strokeMath';


// "Trace thin" authoring mode — image-based.
// You load a black-letter trace image. The thick black ink is SKELETONIZED
// (Zhang-Suen thinning erodes the ink evenly from its outer and inner walls
// down to a 1px-wide centerline) and that thin line is drawn over the letter.
// You then trace over it; your pen is magnetically held to the nearest skeleton
// point, so you only steer the direction. The colored trace (with direction
// arrows + stroke numbers) becomes the saved waypoints.
const STROKE_COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6'];
const SNAP_CORRIDOR = 36; // px — pen is held to the thin line within this distance

const pathD = (pts) =>
  pts.length < 2 ? '' : pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

function Arrow({ pos, color }) {
  const size = 7;
  const a1 = pos.angle + Math.PI - 0.45;
  const a2 = pos.angle + Math.PI + 0.45;
  const p1 = `${(pos.x + size * Math.cos(a1)).toFixed(1)},${(pos.y + size * Math.sin(a1)).toFixed(1)}`;
  const p2 = `${(pos.x + size * Math.cos(a2)).toFixed(1)},${(pos.y + size * Math.sin(a2)).toFixed(1)}`;
  return <polygon points={`${pos.x.toFixed(1)},${pos.y.toFixed(1)} ${p1} ${p2}`} fill={color} />;
  }

  // Zhang-Suen thinning: peel boundary pixels of the black-ink mask until a 1px
  // centerline remains. Unlike cross-section centroids it follows the ink all the
  // way to stroke tips (no splits) and never flares at round caps.
  function zhangSuen(mask, W, H) {
  const m = mask.slice();
  const nb = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      const rm = [];
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const idx = y * W + x;
          if (m[idx] !== 1) continue;
          const p = nb.map(([dx, dy]) => m[(y + dy) * W + (x + dx)]);
          let A = 0;
          for (let i = 0; i < 8; i++) if (p[i] === 0 && p[(i + 1) % 8] === 1) A++;
          let B = 0;
          for (let i = 0; i < 8; i++) B += p[i];
          if (B < 2 || B > 6) continue;
          if (A !== 1) continue;
          if (pass === 0) {
            if (p[0] && p[2] && p[4]) continue;
            if (p[2] && p[4] && p[6]) continue;
          } else {
            if (p[0] && p[2] && p[6]) continue;
            if (p[0] && p[4] && p[6]) continue;
          }
          rm.push(idx);
        }
      }
      if (rm.length) {
        for (const idx of rm) m[idx] = 0;
        changed = true;
      }
    }
  }
  return m;
  }

  const NB8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

  // Remove dead-end spurs shorter than maxLen. Zhang-Suen leaves these at sharp
  // convex corners (an A apex) — pruning yields a clean vertex.
  function pruneSpurs(m, W, H, maxLen) {
  const ncount = (x, y) => {
    let n = 0;
    for (const [dx, dy] of NB8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (m[ny * W + nx]) n++;
    }
    return n;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!m[y * W + x] || ncount(x, y) !== 1) continue;
        const branch = [{ x, y }];
        let cxp = x, cyp = y, px = -1, py = -1;
        let hitJunction = false;
        for (let step = 0; step < maxLen; step++) {
          let nx = -1, ny = -1;
          for (const [dx, dy] of NB8) {
            const tx = cxp + dx, ty = cyp + dy;
            if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
            if (tx === px && ty === py) continue;
            if (m[ty * W + tx]) { nx = tx; ny = ty; break; }
          }
          if (nx < 0) break;
          px = cxp; py = cyp; cxp = nx; cyp = ny;
          branch.push({ x: cxp, y: cyp });
          const nc = ncount(cxp, cyp);
          if (nc >= 3) { hitJunction = true; break; }
          if (nc === 1) break;
        }
        if (hitJunction) {
          for (let k = 0; k < branch.length - 1; k++) m[branch[k].y * W + branch[k].x] = 0;
          changed = true;
        }
      }
    }
  }
  }

  // Bridge pairs of free-tip endpoints (degree-1 skeleton pixels) that lie
  // within maxGap of each other. Zhang-Suen occasionally leaves a 1-2px gap at a
  // sharp corner (an A apex) where two strokes should meet; without bridging,
  // the two legs vectorize as separate chains and the apex renders as a flat
  // notch. Drawing a 1px line between close tips connects them first, so the
  // apex becomes one sharp vertex regardless of sub-pixel image position.
  function bridgeCloseTips(m, W, H, maxGap) {
  const isOn = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x];
  const endpoints = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!m[y * W + x]) continue;
    let n = 0;
    for (const [dx, dy] of NB8) if (isOn(x + dx, y + dy)) n++;
    if (n === 1) endpoints.push({ x, y });
  }
  const sq = maxGap * maxGap;
  const used = new Set();
  for (let i = 0; i < endpoints.length; i++) {
    if (used.has(i)) continue;
    let best = -1, bd = sq;
    for (let j = 0; j < endpoints.length; j++) {
    if (i === j || used.has(j)) continue;
    const d = (endpoints[i].x - endpoints[j].x) ** 2 + (endpoints[i].y - endpoints[j].y) ** 2;
    if (d < bd) { bd = d; best = j; }
    }
    if (best >= 0) {
    const a = endpoints[i], b = endpoints[best];
    let x0 = a.x | 0, y0 = a.y | 0, x1 = b.x | 0, y1 = b.y | 0;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
    m[y0 * W + x0] = 1;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
    }
    used.add(i); used.add(best);
    }
  }
  }

  function collectPts(m, W, H) {
  const pts = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) pts.push({ x, y });
  return pts;
  }

  // Erode the foreground by r pixels (8-connected: a pixel survives only if
  // ALL 8 neighbors are foreground). Used to thin thick letter ink down to a
  // narrow stroke BEFORE Zhang-Suen, which otherwise leaves 2px-wide diagonals
  // that register as hundreds of spurious junctions and shatter the trace.
  function erode(mask, W, H, r) {
  let m = mask.slice();
  for (let iter = 0; iter < r; iter++) {
    const out = m.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!m[y * W + x]) continue;
    for (const [dx, dy] of NB8) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H || !m[ny * W + nx]) { out[y * W + x] = 0; break; }
    }
    }
    m = out;
  }
  return m;
  }

  // Median horizontal black-run length — a robust estimate of stroke width.
  function strokeWidth(mask, W, H) {
  const runs = [];
  for (let y = 0; y < H; y++) {
    let run = 0;
    for (let x = 0; x < W; x++) {
    if (mask[y * W + x]) run++;
    else { if (run > 0) runs.push(run); run = 0; }
    }
    if (run > 0) runs.push(run);
  }
  if (!runs.length) return 1;
  runs.sort((a, b) => a - b);
  return runs[Math.floor(runs.length / 2)];
  }

  // Keep every ink blob of meaningful size — drops only specks/stray marks.
  // (Keeping ONLY the largest blob would erase separate strokes of a letter
  // whose ink doesn't fully connect — e.g. a crossbar with a tiny gap to the
  // legs — which is what made A's lose their crossbar and a leg.)
  function keepSignificantComponents(mask, W, H, minSize) {
  const seen = new Uint8Array(W * H);
  const out = new Uint8Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || seen[s]) continue;
    const comp = [];
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
    const p = stack.pop();
    comp.push(p);
    const x = p % W, y = (p / W) | 0;
    for (const [dx, dy] of NB8) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const k = ny * W + nx;
    if (mask[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
    }
    }
    if (comp.length >= minSize) for (const k of comp) out[k] = 1;
  }
  return out;
  }

  // Fill only SMALL interior holes (anti-aliasing pinholes inside strokes)
  // so the skeleton doesn't sprout noise branches — but leave LARGE enclosed
  // counters open. Filling the counter of an A (the triangle between the legs
  // and crossbar) or the bowl of an O/P/B/D turns the letter into a solid blob
  // whose skeleton is a Y-shaped medial axis, not the letter.
  function fillSmallHoles(mask, W, H, maxHoleArea) {
  const bg = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) {
    if (!mask[x]) { bg[x] = 1; stack.push(x); }
    const b = (H - 1) * W + x;
    if (!mask[b]) { bg[b] = 1; stack.push(b); }
  }
  for (let y = 0; y < H; y++) {
    if (!mask[y * W]) { bg[y * W] = 1; stack.push(y * W); }
    const r = y * W + (W - 1);
    if (!mask[r]) { bg[r] = 1; stack.push(r); }
  }
  while (stack.length) {
    const p = stack.pop();
    const x = p % W, y = (p / W) | 0;
    for (const [dx, dy] of NB8) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const k = ny * W + nx;
    if (!mask[k] && !bg[k]) { bg[k] = 1; stack.push(k); }
    }
  }
  const out = mask.slice();
  const visited = new Uint8Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (mask[s] || bg[s] || visited[s]) continue;
    const comp = [];
    const st = [s];
    visited[s] = 1;
    while (st.length) {
    const p = st.pop();
    comp.push(p);
    const x = p % W, y = (p / W) | 0;
    for (const [dx, dy] of NB8) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const k = ny * W + nx;
    if (!mask[k] && !bg[k] && !visited[k]) { visited[k] = 1; st.push(k); }
    }
    }
    if (comp.length <= maxHoleArea) for (const k of comp) out[k] = 1;
  }
  return out;
  }

  // Grow the mask outward by r pixels (3x3 dilation, r iterations).
  function dilate(mask, W, H, r) {
  let m = mask.slice();
  for (let iter = 0; iter < r; iter++) {
    const out = m.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (m[y * W + x]) continue;
    for (const [dx, dy] of NB8) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    if (m[ny * W + nx]) { out[y * W + x] = 1; break; }
    }
    }
    m = out;
  }
  return m;
  }



  export default function TraceThinCanvas({ rawStrokes, setRawStrokes, bg, bgScale, bgX, bgY, setBgScale, setBgX, setBgY, setBg, loadImage }) {
  // Committed strokes are owned by the parent (rawStrokes); only the in-progress
  // stroke is local. Using the parent state directly avoids the two-way sync
  // loop (the old traced↔rawStrokes effects) that flickered while drawing.
  const traced = rawStrokes;
  const setTraced = setRawStrokes;
  const [current, setCurrent] = useState([]);

  // Image display opacity + drag mode are local UI state (the image itself and
  // its transform live in the parent so they persist across the Snap↔Thin toggle).
  const [bgOpacity, setBgOpacity] = useState(0.35);
  const [moveMode, setMoveMode] = useState(false);
  // Trace view: hide the photo and show ONLY the thinned centerline for the
  // current letter (computed on demand, not in the background).
  const [traceView, setTraceView] = useState(false);
  const moveStartRef = useRef(null);
  const fileRef = useRef(null);

  const svgRef = useRef(null);
  const currentRef = useRef([]);
  const drawingRef = useRef(false);

  // "Bigger bone": the thick letter ink eroded to a ~5px-wide centerline band.
  // Smooth, solid through junctions/apexes, and stable under sub-pixel shifts
  // (no fragile 1px skeleton that dashes or flattens). The pen snaps to the
  // centroid of nearby bone pixels — center-on-ink.
  const skeletonRef = useRef(null);
  const [boneUrl, setBoneUrl] = useState(null);

  // Rasterize the trace image and erode the black ink down to a ~5px-wide
  // centerline band ("bigger bone"). A several-px-wide band is smooth, solid
  // through junctions and sharp apexes, and stable when the image is nudged —
  // no fragile 1px skeleton that dashes or shifts. Only runs in Trace view.
  useEffect(() => {
    if (!traceView || !bg?.img) { skeletonRef.current = null; setBoneUrl(null); return; }
    const W = Math.round(CANVAS_W), H = Math.round(CANVAS_H);
    const dh = CANVAS_H * bgScale;
    const dw = dh * (bg.aspect || 1);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const cx = c.getContext('2d');
    cx.fillStyle = '#ffffff';
    cx.fillRect(0, 0, W, H);
    cx.drawImage(bg.img, bgX, bgY, dw, dh);
    let imgData;
    try { imgData = cx.getImageData(0, 0, W, H); } catch { return; }
    const src = imgData.data;
    // Detect the black letter, PLUS magenta stroke-order overlays where they
    // sit on top of the black ink (practice sheets draw pink arrows/numerals on
    // the letter; they punched holes through every stroke). Fill them back in
    // by including magenta pixels within a few px of real black ink — overlays
    // on the letter are kept, magenta guide lines on white are not.
    const blackMask = new Uint8Array(W * H);
    const magMask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const o = i * 4;
      const r = src[o], g = src[o + 1], b = src[o + 2];
      // Catch the letter ink — practice-sheet letters are often thin GREY
      // (#8c8c8c ≈ 140), not pure black, so a strict <120 threshold misses
      // them and the bone comes up empty. Accept dark-ish neutral pixels,
      // excluding the colored guide lines (light blue / pink).
      const isGrey = Math.abs(r - g) < 30 && Math.abs(g - b) < 30;
      if (r < 175 && g < 175 && b < 175 && isGrey) blackMask[i] = 1;
      else if (r > 140 && g < 140 && b > 60 && b < 200 && r > b) magMask[i] = 1;
    }
    const nearBlack = dilate(blackMask, W, H, 3);
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) mask[i] = blackMask[i] || (magMask[i] && nearBlack[i]) ? 1 : 0;
    const cleaned = fillSmallHoles(keepSignificantComponents(mask, W, H, 25), W, H, 64);
    // Normalize to a ~7px band centered on the letter's centerline. Thick
    // letters are eroded DOWN; THIN letters (1-2px grey practice sheets) are
    // DILATED UP — without thickening, a thin letter yields a spotty, broken
    // band the pen can't follow, and eroding already-thin ink erases it.
    const TARGET_W = 7;
    const sw = strokeWidth(cleaned, W, H);
    let bone;
    if (sw > TARGET_W + 2) {
      const erodeR = Math.min(60, Math.floor((sw - TARGET_W) / 2));
      bone = keepSignificantComponents(erode(cleaned, W, H, erodeR), W, H, 8);
    } else if (sw < TARGET_W - 2) {
      const dilateR = Math.ceil((TARGET_W - sw) / 2);
      bone = dilate(cleaned, W, H, dilateR);
    } else {
      bone = cleaned;
    }
    // Snap target: the bone band as a pixel grid, queried by a perpendicular
    // slice during drawing (see snapToSkeleton).
    skeletonRef.current = { mask: bone, W, H };
    // Render the bone as a faint dark line via an offscreen canvas -> dataURL.
    const oc = document.createElement('canvas');
    oc.width = W; oc.height = H;
    const ox = oc.getContext('2d');
    const id2 = ox.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const v = bone[i] ? 30 : 255;
      id2.data[i * 4] = v; id2.data[i * 4 + 1] = v; id2.data[i * 4 + 2] = v; id2.data[i * 4 + 3] = 255;
    }
    ox.putImageData(id2, 0, 0);
    setBoneUrl(oc.toDataURL());
  }, [bg, bgScale, bgX, bgY, traceView]);

  const lineTop = 0.10, lineMid = 0.367, lineBase = 0.633, lineDesc = 0.90;

  const getPos = (e) => {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * CANVAS_W) / rect.width,
      y: ((e.clientY - rect.top) * CANVAS_H) / rect.height,
    };
  };

  // Hold the pen to the bone CENTERLINE: take a slice PERPENDICULAR to the
  // direction of travel and find the bone's centroid along it (Gaussian-
  // weighted so the ink right under the pen dominates). This is the same
  // approach that works in "Snap to ink" mode — it rides the center of the
  // stroke you're drawing and ignores a crossing stroke or a junction bulge a
  // few widths away, so the crossbar of an A stays on the crossbar through the
  // leg junction instead of dipping toward the leg/bulge. No ink on the slice
  // → draw freely (lift / start a fresh stroke elsewhere).
  const snapToSkeleton = (pos, prev) => {
    const s = skeletonRef.current;
    if (!s || !s.mask) return pos;
    const { mask, W, H } = s;
    const inkW = (x, y) => {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0;
      return mask[yi * W + xi] ? 1 : 0;
    };
    const SIG = 6; // ~bone half-width: the band is sampled, a crossing stroke is not
    const g = (t) => Math.exp(-(t * t) / (2 * SIG * SIG));
    const MAX_PULL = 22;
    // perpendicular to recent travel; first point of a stroke has none yet
    let nx, ny;
    if (prev) {
      const dx = pos.x - prev.x, dy = pos.y - prev.y;
      const dl = Math.hypot(dx, dy);
      if (dl > 1e-3) { nx = -dy / dl; ny = dx / dl; }
    }
    if (nx === undefined) {
      // first point: Gaussian-weighted centroid over a local disc — centers on
      // the band under the cursor, ignoring a neighboring stroke
      const R = 22, xi = Math.round(pos.x), yi = Math.round(pos.y);
      const x0 = Math.max(0, xi - R), x1 = Math.min(W - 1, xi + R);
      const y0 = Math.max(0, yi - R), y1 = Math.min(H - 1, yi + R);
      let sw = 0, sx = 0, sy = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (!mask[y * W + x]) continue;
        const gw = g(Math.hypot(x - xi, y - yi));
        sw += gw; sx += x * gw; sy += y * gw;
      }
      return sw === 0 ? pos : { x: sx / sw, y: sy / sw };
    }
    // perpendicular slice, Gaussian-weighted centroid
    const L = 24;
    let sw = 0, st = 0;
    for (let t = -L; t <= L; t++) {
      const w = inkW(pos.x + t * nx, pos.y + t * ny);
      if (!w) continue;
      const gw = w * g(t);
      sw += gw; st += t * gw;
    }
    if (sw === 0) return pos;
    const off = Math.max(-MAX_PULL, Math.min(MAX_PULL, st / sw));
    return { x: pos.x + off * nx, y: pos.y + off * ny };
  };

  const down = (e) => {
    e.preventDefault();
    if (e.button != null && e.button !== 0) return;
    try { svgRef.current.setPointerCapture(e.pointerId); } catch {}
    const pos = getPos(e);
    if (moveMode && bg) {
      moveStartRef.current = { x: pos.x, y: pos.y, bgX, bgY };
      return;
    }
    const start = snapToSkeleton(pos);
    currentRef.current = [start];
    setCurrent([start]);
    drawingRef.current = true;
  };

  const move = (e) => {
    if (moveMode && moveStartRef.current) {
      e.preventDefault();
      const pos = getPos(e);
      const s = moveStartRef.current;
      setBgX(s.bgX + (pos.x - s.x));
      setBgY(s.bgY + (pos.y - s.y));
      return;
    }
    if (!drawingRef.current) return;
    e.preventDefault();
    const raw = getPos(e);
    const last = currentRef.current[currentRef.current.length - 1];
    const pos = snapToSkeleton(raw, last);
    if (last && Math.hypot(pos.x - last.x, pos.y - last.y) < 2) return;
    currentRef.current = [...currentRef.current, pos];
    setCurrent(currentRef.current);
  };

  const up = (e) => {
    e.preventDefault();
    try { svgRef.current.releasePointerCapture(e.pointerId); } catch {}
    moveStartRef.current = null;
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (currentRef.current.length > 1) {
      const stroke = currentRef.current.slice();
      setTraced((t) => [...t, stroke]);
    }
    currentRef.current = [];
    setCurrent([]);
  };

  const onPickImage = (e) => { loadImage(e.target.files?.[0]); e.target.value = ''; };
  const onDrop = (e) => { e.preventDefault(); loadImage(e.dataTransfer.files?.[0]); };

  const undo = () => setTraced((t) => t.slice(0, -1));
  const clear = () => setTraced([]);

  const dispH = CANVAS_H * bgScale;
  const dispW = dispH * (bg?.aspect || 1);

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        className="w-72 max-w-full rounded-2xl border-4 border-indigo-300 bg-white touch-none aspect-[4/5] shadow-sm"
        style={{ cursor: moveMode && bg ? 'move' : 'crosshair', touchAction: 'none' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {/* Trace image (faint) — hidden once you enter Trace view so only the
            thin centerline shows (no faded photo bleeding through as a "double"). */}
        {bg && !traceView && (
          <image href={bg.url} x={bgX} y={bgY} width={dispW} height={dispH} opacity={bgOpacity} />
        )}

        {/* Writing guide lines */}
        <line x1="0" y1={lineTop * CANVAS_H} x2={CANVAS_W} y2={lineTop * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={lineMid * CANVAS_H} x2={CANVAS_W} y2={lineMid * CANVAS_H} stroke="#93c5fd" strokeWidth="1" strokeDasharray="8 6" opacity="0.7" />
        <line x1="0" y1={lineBase * CANVAS_H} x2={CANVAS_W} y2={lineBase * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={lineDesc * CANVAS_H} x2={CANVAS_W} y2={lineDesc * CANVAS_H} stroke="#fca5a5" strokeWidth="1.5" strokeDasharray="6 6" opacity="0.85" />

        {/* Centerline "bone" — a faint band eroded from the letter ink. The pen
            snaps to the centroid of nearby bone pixels, so you steer the middle. */}
        {boneUrl && (
          <image href={boneUrl} x={0} y={0} width={CANVAS_W} height={CANVAS_H} opacity="0.5" />
        )}

        {/* Traced strokes — clean, directed waypoints */}
        {traced.map((s, i) => {
          const sm = smoothPoints(s, 3);
          const color = STROKE_COLORS[i % STROKE_COLORS.length];
          return (
            <g key={'t' + i}>
              <path d={pathD(sm)} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
              <Arrow pos={pointAtLength(sm, 0.4)} color={color} />
              <Arrow pos={pointAtLength(sm, 0.75)} color={color} />
              <circle cx={sm[0].x} cy={sm[0].y} r="10" fill={color} />
              <text x={sm[0].x} y={sm[0].y + 4} textAnchor="middle" fontSize="11" fill="white" fontWeight="bold">{i + 1}</text>
            </g>
          );
        })}

        {/* Current in-progress stroke */}
        {current.length > 1 && (
          <path d={pathD(smoothPoints(current, 3))} fill="none" stroke={STROKE_COLORS[traced.length % STROKE_COLORS.length]} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        )}
      </svg>

      {/* Image toolbar */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
      <div className="flex flex-wrap items-center gap-2 justify-center">
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100"
        >
          <ImageIcon className="w-4 h-4" /> {bg ? 'Change image' : 'Add letter image'}
        </button>
        {bg && (
          <>
            <button
              onClick={() => setTraceView((t) => !t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border ${traceView ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'}`}
            >
              <PenLine className="w-4 h-4" /> {traceView ? 'Show image' : 'Trace'}
            </button>
            <button
              onClick={() => setMoveMode((m) => !m)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border ${moveMode ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-violet-700 border-violet-200 hover:bg-violet-50'}`}
            >
              <Move className="w-4 h-4" /> {moveMode ? 'Dragging image' : 'Move image'}
            </button>
            <button
              onClick={() => {           setBg(null); setMoveMode(false); setBoneUrl(null); skeletonRef.current = null; }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
            >
              <X className="w-4 h-4" /> Remove
            </button>
          </>
        )}
      </div>

      {bg && (
        <div className="flex flex-col gap-2 w-full max-w-xs px-2">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span className="w-14 shrink-0">Scale</span>
            <input
              type="range" min="0.2" max="40" step="0.1" value={bgScale}
              onChange={(e) => {
                const ns = parseFloat(e.target.value);
                const dh = CANVAS_H * ns;
                const dw = dh * (bg?.aspect || 1);
                setBgScale(ns);
                setBgX((CANVAS_W - dw) / 2);
                setBgY((CANVAS_H - dh) / 2);
              }}
              className="flex-1"
            />
            <span className="w-8 text-right tabular-nums">{bgScale.toFixed(2)}×</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span className="w-14 shrink-0">Photo</span>
            <input type="range" min="0" max="1" step="0.05" value={bgOpacity} onChange={(e) => setBgOpacity(parseFloat(e.target.value))} className="flex-1" />
            <span className="w-8 text-right tabular-nums">{Math.round(bgOpacity * 100)}%</span>
          </label>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={undo}
          disabled={!traced.length}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Undo2 className="w-4 h-4" /> Undo stroke
        </button>
        <button
          onClick={clear}
          disabled={!traced.length}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" /> Clear traced
        </button>
      </div>

      <p className="text-xs text-gray-500 text-center max-w-xs">
        {bg
          ? (traceView
            ? 'Centerline band only — trace over it; your pen is held to the middle of the ink, so just steer the direction. The colored trace is what gets saved.'
            : 'Move/scale the image to align it to the guide lines, then press Trace to erode the black letter into a centerline band you can follow.')
          : 'Add a black-letter image, then press Trace to turn its black ink into a centerline band you can trace.'}
      </p>
    </div>
  );
}