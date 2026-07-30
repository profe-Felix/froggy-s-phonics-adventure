// Vectorize a 1px skeleton mask (e.g. the output of Zhang-Suen thinning) into
// polylines. Walking the skeleton as a graph (endpoints + junctions = nodes,
// degree-2 pixels = path segments) and rendering the resulting polylines as
// <path> strokes gives a clean centerline: junctions are single shared points
// (no overlapping-dot "bulge"), round caps collapse to a single tip vertex
// (no blunt blob), and sharp corners (an A's apex) survive as crisp vertices.

const NB8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

function dpSimplify(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const sq = eps * eps;
  const out = [0];
  const stack = [[0, pts.length - 1]];
  const marked = new Set([0, pts.length - 1]);
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxd = 0, idx = -1;
    const A = pts[s], B = pts[e];
    const dx = B.x - A.x, dy = B.y - A.y;
    const len = dx * dx + dy * dy || 1;
    for (let i = s + 1; i < e; i++) {
      const p = pts[i];
      const t = ((p.x - A.x) * dx + (p.y - A.y) * dy) / len;
      const px = A.x + t * dx, py = A.y + t * dy;
      const d = (p.x - px) * (p.x - px) + (p.y - py) * (p.y - py);
      if (d > maxd) { maxd = d; idx = i; }
    }
    if (maxd > sq) {
      stack.push([s, idx]);
      stack.push([idx, e]);
      marked.add(idx);
    } else {
      out.push(e);
    }
  }
  out.sort((a, b) => a - b);
  return out.map((i) => pts[i]);
}

export function skeletonToPolylines(mask, W, H, pxScale = 1) {
  const idx = (x, y) => y * W + x;
  const is = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[idx(x, y)];
  const neigh = (x, y) => {
    const r = [];
    for (const [dx, dy] of NB8) { if (is(x + dx, y + dy)) r.push([x + dx, y + dy]); }
    return r;
  };
  const deg = new Map();
  const nodePts = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!mask[idx(x, y)]) continue;
      const d = neigh(x, y).length;
      deg.set(idx(x, y), d);
      if (d === 1 || d >= 3) nodePts.push({ x, y, deg: d });
    }
  }
  const nodeAt = (k) => {
    const d = deg.get(k);
    return d === 1 || d >= 3;
  };

  // Walk a chain from a node through degree-2 path pixels until the next node.
  const consumed = new Set(); // degree-2 pixels already part of a chain
  const walkFrom = (sx, sy) => {
    const chain = [{ x: sx, y: sy }];
    let cx = sx, cy = sy, px = -1, py = -1;
    let guard = 0;
    while (guard++ < W * H) {
      const ns = neigh(cx, cy).filter(([nx, ny]) => !(nx === px && ny === py));
      let nxt = ns.find(([nx, ny]) => { const k = idx(nx, ny); return !consumed.has(k) && deg.get(k) === 2; });
      if (!nxt) nxt = ns[0];
      if (!nxt) break;
      const [nx, ny] = nxt;
      chain.push({ x: nx, y: ny });
      if (nodeAt(idx(nx, ny))) break; // reached another node
      consumed.add(idx(nx, ny));
      px = cx; py = cy; cx = nx; cy = ny;
    }
    return chain;
  };

  const chains = [];
  // Chains starting at nodes (endpoints + junctions), one per unconsumed path edge.
  for (const n of nodePts) {
    for (const [nx, ny] of neigh(n.x, n.y)) {
      const k = idx(nx, ny);
      if (nodeAt(k)) { chains.push([{ x: n.x, y: n.y }, { x: nx, y: ny }]); continue; }
      if (consumed.has(k)) continue;
      consumed.add(k);
      const ch = [{ x: n.x, y: n.y }, { x: nx, y: ny }];
      // continue the walk from (nx,ny)
      let cx = nx, cy = ny, px = n.x, py = n.y, guard = 0;
      while (guard++ < W * H) {
        const ns = neigh(cx, cy).filter(([ax, ay]) => !(ax === px && ay === py));
        let nxt = ns.find(([ax, ay]) => { const ak = idx(ax, ay); return !consumed.has(ak) && deg.get(ak) === 2; });
        if (!nxt) nxt = ns[0];
        if (!nxt) break;
        const [ax, ay] = nxt;
        ch.push({ x: ax, y: ay });
        if (nodeAt(idx(ax, ay))) break;
        consumed.add(idx(ax, ay));
        px = cx; py = cy; cx = ax; cy = ay;
      }
      chains.push(ch);
    }
  }
  // Closed loops with no nodes (e.g. an 'o'): walk from any unconsumed pixel.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = idx(x, y);
      if (mask[k] && deg.get(k) === 2 && !consumed.has(k)) {
        const ch = [{ x, y }];
        consumed.add(k);
        let cx = x, cy = y, px = -1, py = -1, guard = 0;
        while (guard++ < W * H) {
          const ns = neigh(cx, cy).filter(([ax, ay]) => !(ax === px && ay === py) && !consumed.has(idx(ax, ay)));
          if (!ns.length) break;
          const [ax, ay] = ns[0];
          if (ax === x && ay === y) break; // closed back to start
          ch.push({ x: ax, y: ay });
          consumed.add(idx(ax, ay));
          px = cx; py = cy; cx = ax; cy = ay;
        }
        if (ch.length > 2) chains.push(ch);
      }
    }
  }

  // Cluster nearby nodes (within ~6px) so overlapping strokes (a crossbar
  // meeting a leg, or two round caps touching at an A's apex) snap to ONE
  // shared point — no bulge, no blunt gap.
  const used = new Set();
  const clusters = [];
  const R2 = (14 * pxScale) * (14 * pxScale);
  for (let i = 0; i < nodePts.length; i++) {
    if (used.has(i)) continue;
    const cl = [nodePts[i]];
    used.add(i);
    for (let j = i + 1; j < nodePts.length; j++) {
      if (used.has(j)) continue;
      if ((nodePts[j].x - nodePts[i].x) ** 2 + (nodePts[j].y - nodePts[i].y) ** 2 <= R2) {
        cl.push(nodePts[j]);
        used.add(j);
      }
    }
    let sx = 0, sy = 0;
    for (const c of cl) { sx += c.x; sy += c.y; }
    // A junction cluster contains a degree>=3 node (a real branch point); a
    // cluster of only degree-1 tips (two round caps touching at an A's apex) is
    // NOT a junction — its tips just merge to one sharp point.
    const isJunction = cl.some((c) => c.deg >= 3);
    clusters.push({ cx: sx / cl.length, cy: sy / cl.length, isJunction });
  }
  const snap2 = (p) => {
    let best = null, bd = R2 * 4;
    for (const cl of clusters) {
      const d = (p.x - cl.cx) ** 2 + (p.y - cl.cy) ** 2;
      if (d < bd) { bd = d; best = cl; }
    }
    return best ? { x: best.cx, y: best.cy, isJunction: best.isJunction } : { x: p.x, y: p.y, isJunction: false };
  };

  const pathLen = (pts) => {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return L;
  };
  // Simplify, then snap endpoints to their junction/tip cluster centroid.
  const polys = chains
    .filter((ch) => ch.length >= 2 && pathLen(ch) >= 3)
    .map((ch) => {
      const s = dpSimplify(ch, 2.0 * pxScale);
      const a = snap2(s[0]);
      const b = snap2(s[s.length - 1]);
      s[0] = { x: a.x, y: a.y };
      s[s.length - 1] = { x: b.x, y: b.y };
      return { pts: s, startJ: a.isJunction, endJ: b.isJunction };
    });
  // At a junction, project the terminating polyline's endpoint onto the nearest
  // crossing polyline segment so it lands EXACTLY on that stroke's centerline —
  // this kills the cap protrusion / step where a crossbar meets a leg. Free
  // tips (an A's apex) are left alone so they stay sharp.
  const projR = 12 * pxScale;
  const project = (p, self) => {
    let best = null, bd = projR * projR;
    for (const q of polys) {
      if (q === self) continue;
      for (let i = 1; i < q.pts.length; i++) {
        const a = q.pts[i - 1], b = q.pts[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len2 = dx * dx + dy * dy || 1;
        let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = a.x + t * dx, py = a.y + t * dy;
        const d = (p.x - px) ** 2 + (p.y - py) ** 2;
        if (d < bd) { bd = d; best = { x: px, y: py }; }
      }
    }
    return best;
  };
  for (const p of polys) {
    if (p.startJ) { const pr = project(p.pts[0], p); if (pr) p.pts[0] = pr; }
    if (p.endJ) { const pr = project(p.pts[p.pts.length - 1], p); if (pr) p.pts[p.pts.length - 1] = pr; }
  }

  // Reconnect fragments: a noisy skeleton splits one stroke into many short
  // chains (looks "dashed"). Merge consecutive fragments whose endpoints meet
  // and are collinear (a leg split by junction noise) back into single strokes.
  // Then merge free-tip pairs that meet at a corner (an A apex) so the corner
  // becomes an internal vertex and renders as a sharp miter, not two round caps.
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const norm = (v) => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
  const dotp = (a, b) => a.x * b.x + a.y * b.y;
  const dirEnd = (pts) => norm(sub(pts[pts.length - 1], pts[pts.length - 2] || pts[0]));
  const dirStart = (pts) => norm(sub(pts[1] || pts[0], pts[0]));
  const angDeg = (a, b) => Math.acos(Math.max(-1, Math.min(1, dotp(a, b)))) * 180 / Math.PI;
  const reverse = (p) => ({ pts: p.pts.slice().reverse(), startJ: p.endJ, endJ: p.startJ });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const tryMerge = (opts) => {
    const { gap, maxAng, requireFreeTips } = opts;
    for (let i = 0; i < polys.length; i++) {
      for (let j = i + 1; j < polys.length; j++) {
        const A = polys[i], B = polys[j];
        const ae = A.pts[A.pts.length - 1], be = B.pts[B.pts.length - 1], bs = B.pts[0], as = A.pts[0];
        // All 4 orientations so two free tips that meet at a corner (an A apex,
        // where both chains START at the shared tip) always join regardless of
        // which direction each chain was walked.
        const variants = [
          { P: A, Q: B, pe: ae, qs: bs, aFree: !A.endJ, bFree: !B.startJ },
          { P: A, Q: reverse(B), pe: ae, qs: be, aFree: !A.endJ, bFree: !B.endJ },
          { P: reverse(A), Q: B, pe: as, qs: bs, aFree: !A.startJ, bFree: !B.startJ },
          { P: reverse(A), Q: reverse(B), pe: as, qs: be, aFree: !A.startJ, bFree: !B.endJ },
        ];
        for (const v of variants) {
          if (dist(v.pe, v.qs) > gap) continue;
          if (requireFreeTips && !(v.aFree && v.bFree)) continue;
          if (angDeg(dirEnd(v.P.pts), dirStart(v.Q.pts)) > maxAng) continue;
          polys[i] = { pts: v.P.pts.concat(v.Q.pts.slice(1)), startJ: v.P.startJ, endJ: v.Q.endJ };
          polys.splice(j, 1);
          return true;
        }
      }
    }
    return false;
  };
  while (tryMerge({ gap: 14 * pxScale, maxAng: 22, requireFreeTips: false })) {}
  while (tryMerge({ gap: 10 * pxScale, maxAng: 150, requireFreeTips: true })) {}
  const MIN = 5 * pxScale;
  const final = polys
    .filter((p) => pathLen(p.pts) >= MIN)
    .map((p) => ({ ...p, pts: dpSimplify(p.pts, 2.0 * pxScale) }));
  return final;
}