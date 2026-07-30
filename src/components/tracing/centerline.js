// Centerline extraction for the Trace-thin mode.
// Zhang-Suen thinning produces a 1px skeleton with two kinds of artifact:
//   - spurs at sharp corners (an "A" apex: a short tail where two strokes
//     converge toward a point)
//   - 1px jogs at junctions (a diagonal leg crossing a horizontal crossbar)
// We vectorize the skeleton pixel graph into chains between junctions and
// endpoints, drop short spur chains, and Laplacian-smooth the rest so the
// rendered centerline is a clean, smooth, single line.

const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function arcLen(chain) {
  let L = 0;
  for (let i = 1; i < chain.length; i++) {
    L += Math.hypot(chain[i].x - chain[i - 1].x, chain[i].y - chain[i - 1].y);
  }
  return L;
}

// Laplacian smooth of a chain's interior points (endpoints kept fixed so
// chains still meet at shared junction nodes).
export function smoothChain(chain, iters = 2) {
  if (chain.length < 3) return chain.map((p) => ({ x: p.x, y: p.y }));
  let pts = chain.map((p) => ({ x: p.x, y: p.y }));
  for (let it = 0; it < iters; it++) {
    const np = pts.map((p) => ({ x: p.x, y: p.y }));
    for (let i = 1; i < pts.length - 1; i++) {
      np[i].x = (pts[i - 1].x + pts[i].x + pts[i + 1].x) / 3;
      np[i].y = (pts[i - 1].y + pts[i].y + pts[i + 1].y) / 3;
    }
    pts = np;
  }
  return pts;
}

// Turn the 1px skeleton bitmap into ordered polylines (chains). A "node" is an
// endpoint (1 neighbor) or junction (≥3 neighbors); chains run node-to-node
// through regular (2-neighbor) pixels. Closed rings with no node are walked as
// loops so letters like "o" still produce a centerline.
export function extractCenterlines(m, W, H) {
  const idx = (x, y) => y * W + x;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : m[idx(x, y)];
  const ncount = (x, y) => { let c = 0; for (const [dx, dy] of NB) if (at(x + dx, y + dy) === 1) c++; return c; };
  const nbrs = (x, y) => { const r = []; for (const [dx, dy] of NB) { const xx = x + dx, yy = y + dy; if (at(xx, yy) === 1) r.push([xx, yy]); } return r; };
  const isNode = (x, y) => ncount(x, y) !== 2;

  const regVisited = new Uint8Array(W * H);
  const nodeEdgeSeen = new Set();
  const ek = (a, b) => { const ka = a[0] + ',' + a[1], kb = b[0] + ',' + b[1]; return ka < kb ? ka + '|' + kb : kb + '|' + ka; };
  const chains = [];

  const nodes = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[idx(x, y)] === 1 && isNode(x, y)) nodes.push([x, y]);

  for (const [sx, sy] of nodes) {
    for (const [nx, ny] of nbrs(sx, sy)) {
      if (isNode(nx, ny)) {
        const k = ek([sx, sy], [nx, ny]);
        if (nodeEdgeSeen.has(k)) continue;
        nodeEdgeSeen.add(k);
        chains.push([{ x: sx, y: sy }, { x: nx, y: ny }]);
      } else {
        if (regVisited[idx(nx, ny)]) continue;
        const chain = [{ x: sx, y: sy }, { x: nx, y: ny }];
        regVisited[idx(nx, ny)] = 1;
        let px = sx, py = sy, cx = nx, cy = ny;
        while (!isNode(cx, cy)) {
          let next = null;
          for (const [ax, ay] of nbrs(cx, cy)) { if (ax === px && ay === py) continue; next = [ax, ay]; break; }
          if (!next) break;
          const [n2x, n2y] = next;
          chain.push({ x: n2x, y: n2y });
          if (isNode(n2x, n2y)) break;
          if (regVisited[idx(n2x, n2y)]) break;
          regVisited[idx(n2x, n2y)] = 1;
          px = cx; py = cy; cx = n2x; cy = n2y;
        }
        chains.push(chain);
      }
    }
  }

  // Closed loops with no junction/endpoint (e.g. an "o" ring).
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (m[idx(x, y)] !== 1 || isNode(x, y) || regVisited[idx(x, y)]) continue;
    const chain = [{ x, y }];
    regVisited[idx(x, y)] = 1;
    let px = -1, py = -1, cx = x, cy = y;
    while (true) {
      let next = null;
      for (const [ax, ay] of nbrs(cx, cy)) { if (ax === px && ay === py) continue; next = [ax, ay]; break; }
      if (!next) break;
      const [n2x, n2y] = next;
      chain.push({ x: n2x, y: n2y });
      if ((n2x === x && n2y === y) || isNode(n2x, n2y) || regVisited[idx(n2x, n2y)]) break;
      regVisited[idx(n2x, n2y)] = 1;
      px = cx; py = cy; cx = n2x; cy = n2y;
    }
    chains.push(chain);
  }

  return chains;
}