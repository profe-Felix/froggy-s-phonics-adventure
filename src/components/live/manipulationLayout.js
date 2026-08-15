// Shared layout + draw helpers for the phoneme-manipulation model/mirror
// canvases. One place so the teacher's model canvas and the student's mirror
// render identical geometry (N sound boxes + a colored chip tray below).
export const MIN_BOXES = 2;
export const MAX_BOXES = 8;

export const colX = (i, n) => (i + 0.5) / n;
export const trayXNorm = (c, n) => (c + 1) / (n + 1);

export function layoutFor(w, h, n) {
  const s = w / n;
  const pad = s * 0.10;
  const boxY0 = pad;
  const boxY1 = pad + s;
  const boxCenterY = pad + s / 2;
  const chipR = s * 0.34;
  const trayY = boxY1 + s * 0.30 + chipR;
  const thresholdY = boxY1 + (trayY - boxY1) * 0.5; // above -> box drop; below -> tray
  return {
    s, boxY0, boxY1, boxCenterY, chipR, trayY, thresholdY,
    boxCenterYNorm: boxCenterY / h, trayYNorm: trayY / h, n,
  };
}

export function drawChip(ctx, x, y, r, fill) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.14); ctx.strokeStyle = '#000'; ctx.stroke();
}

export function drawScene(ctx, w, h, L, placed, drag, palette) {
  const n = L.n;
  ctx.lineWidth = Math.max(2, L.s * 0.05);
  ctx.strokeStyle = '#000';
  ctx.strokeRect(0, L.boxY0, L.s * n, L.s);
  for (let i = 1; i < n; i++) {
    const lx = i * L.s;
    ctx.beginPath(); ctx.moveTo(lx, L.boxY0); ctx.lineTo(lx, L.boxY1); ctx.stroke();
  }
  // tray palette (cloning sources)
  for (let c = 0; c < palette.length; c++) {
    drawChip(ctx, trayXNorm(c, palette.length) * w, L.trayY, L.chipR, palette[c]);
  }
  // placed counters
  for (let i = 0; i < n; i++) {
    if (placed[i] != null) drawChip(ctx, colX(i, n) * w, L.boxCenterY, L.chipR, palette[placed[i]]);
  }
  // moving counter on top
  if (drag) {
    drawChip(ctx, drag.x * w, drag.y * h, L.chipR, palette[drag.color]);
  }
}