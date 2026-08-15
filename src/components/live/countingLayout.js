// Shared layout + draw helpers for the Elkonin counting model/mirror canvases.
// Kept in one place so the teacher's model canvas and the student's mirror canvas
// render identical geometry.
export const BOX_COUNT = 8;
export const ASPECT = '3.5 / 1';

export const colX = (i) => (i + 0.5) / BOX_COUNT;

export function layoutFor(w, h) {
  const s = w / BOX_COUNT;
  const pad = s * 0.10;
  const boxY0 = pad;
  const boxY1 = boxY0 + s;
  const boxCenterY = boxY0 + s / 2;
  const chipR = s * 0.34;
  const homeY = boxY1 + s * 0.30 + chipR;
  return {
    s, pad, boxY0, boxY1, boxCenterY, chipR, homeY,
    boxCenterYNorm: boxCenterY / h,
    homeYNorm: homeY / h,
  };
}

export function drawChip(ctx, x, y, r) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#4DA6FF'; ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.14); ctx.strokeStyle = '#000'; ctx.stroke();
}

export function drawScene(ctx, w, h, L, placed, drag) {
  ctx.lineWidth = Math.max(2, L.s * 0.05);
  ctx.strokeStyle = '#000';
  ctx.strokeRect(0, L.boxY0, L.s * BOX_COUNT, L.s);
  for (let i = 1; i < BOX_COUNT; i++) {
    const lx = i * L.s;
    ctx.beginPath(); ctx.moveTo(lx, L.boxY0); ctx.lineTo(lx, L.boxY1); ctx.stroke();
  }
  for (let i = 0; i < BOX_COUNT; i++) {
    let cx, cy;
    if (drag && drag.chip === i) {
      cx = drag.x * w; cy = drag.y * h;
    } else {
      cx = colX(i) * w; cy = (placed[i] ? L.boxCenterY : L.homeY);
    }
    drawChip(ctx, cx, cy, L.chipR);
  }
}